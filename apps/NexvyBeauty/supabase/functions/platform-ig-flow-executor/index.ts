// platform-ig-flow-executor — executa blocos de um instagram_flow linearmente.
//
// PORTE do org-scoped `ig-flow-executor` (V5) para o mundo PLATAFORMA (super_admin).
// Fonte: scratchpad/vendus-novo/completo-0109/guigascruz25-*/supabase/functions/ig-flow-executor/index.ts
//
// Remaps aplicados (twins VERIFICADOS via SQL no projeto fzhlbwhdejumkyqosuvq, 2026-07-12):
//   * webchat_conversations  → platform_crm_conversations   (colunas: id, lead_id, sector_id, assigned_to)
//   * leads                  → platform_crm_leads           (colunas: id, assigned_to, closer_id, sdr_id; SEM sector_id, SEM assigned_seller_id)
//   * lead_tag_assignments   → platform_crm_lead_tag_assignments (lead_id, tag_id, source; onConflict lead_id,tag_id)
//   * cadence-enroll (edge)  → platform-cadence-enroll       (exige actorUserId em chamada service-role)
//   * webchat-bot (edge)     → platform-webchat-bot          (aceita { conversation_id, message, agent_id }; devolve chunks/response)
//   * Auth                   → super_admin via JWT (authenticatePlatformAgent) OU service_role interno (webhook/sistema; actorUserId OPCIONAL)
//
// BACKING (front-4 — 2026-07-12): as dependências ANTES sinalizadas como
// inexistentes agora têm par product-scoped na plataforma:
//   * Tabelas platform_crm_instagram_flows / platform_crm_instagram_flow_runs /
//     platform_crm_instagram_comment_replies  → migration draft
//     migrations_platform_crm/20260712_platform_crm_instagram_flows.sql
//     (product_id em vez de organization_id; ⚠️ AINDA NÃO APLICADA — este edge
//     só opera após o apply).
//   * Edge de envio outbound  → platform-ig-send (criada nesta onda; substitui
//     o antigo alvo `instagram-send`, que não existia na plataforma).
//
// Blocos suportados (MVP):
//   ig_reply_comment  { text }
//   ig_private_reply  { text, quick_replies?, buttons? }
//   ig_like_comment   {}
//   ig_send_dm        { text, buttons?, quick_replies?, media? }
//   apply_tag         { tag_id }
//   wait              { seconds }
//   ai_takeover       { agent_id?, prompt? }  → chama platform-webchat-bot para responder no DM
//   condition_text    { keywords: string[], match: 'any'|'all'|'exact', true_next_block_id, false_next_block_id }
// Fluxo termina quando não houver next_block_id.
// dry_run=true → não invoca Graph nem envia nada; retorna a lista de ações que seriam executadas.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceKey);

  const ctx = await req.json().catch(() => ({}));

  // AUTH: service-role interno (webhook/sistema) OU super_admin JWT.
  //  * O disparo vem do platform-instagram-webhook (evento do Meta, SEM humano):
  //    usa a SERVICE_ROLE_KEY — segredo só de servidor (Seção 11), nunca no
  //    frontend — então NÃO exige actorUserId (automação de sistema). Se vier
  //    actorUserId/created_by no body, vira o `user` (ex.: enroll_cadence).
  //  * Chamada com JWT (ex.: teste/dry_run pelo painel) precisa ser super_admin.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const bearer = authHeader.replace('Bearer ', '').trim();
  let user: { id: string } | null = null;
  if (bearer === serviceKey) {
    const actorId = (ctx?.actorUserId ?? ctx?.created_by) as string | undefined;
    if (actorId) user = { id: String(actorId) };
  } else {
    const authRes = await authenticatePlatformAgent(req, sb, serviceKey, ctx);
    if (authRes.errorResponse) return authRes.errorResponse;
    user = authRes.user;
  }

  const { flow_id, connection_id, trigger_source, source_id, sender_ig_id, comment_id, conversation_id, trigger_text, dry_run } = ctx ?? {};

  if (!flow_id) return json({ error: 'flow_id required' }, 400);

  // platform_crm_instagram_flows: product-scoped (migration 20260712, pendente apply).
  const { data: flow } = await sb.from('platform_crm_instagram_flows').select('*').eq('id', flow_id).maybeSingle();
  if (!flow) return json({ error: 'flow not found' }, 404);
  if (!dry_run && flow.status !== 'active') return json({ ok: true, skipped: 'flow not active' });

  // Dedup por comentário (só quando NÃO é dry_run e tem comment_id)
  // platform_crm_instagram_comment_replies: connection-scoped, UNIQUE(connection_id,comment_id).
  if (!dry_run && comment_id && (connection_id ?? flow.connection_id)) {
    const connId = connection_id ?? flow.connection_id;
    const { error: dedupErr } = await sb.from('platform_crm_instagram_comment_replies')
      .insert({ connection_id: connId, comment_id, flow_id });
    if (dedupErr && (dedupErr as any).code === '23505') {
      return json({ ok: true, skipped: 'duplicate_comment' });
    }
  }

  // throttle por sender (últimas N horas)
  // platform_crm_instagram_flow_runs: product-scoped (migration 20260712, pendente apply).
  if (!dry_run && sender_ig_id && flow.throttle_per_sender_hours > 0) {
    const cutoff = new Date(Date.now() - flow.throttle_per_sender_hours * 3600 * 1000).toISOString();
    const { data: recent } = await sb.from('platform_crm_instagram_flow_runs')
      .select('id').eq('flow_id', flow_id).eq('sender_ig_id', sender_ig_id).gte('started_at', cutoff).limit(1);
    if (recent && recent.length > 0) {
      return json({ ok: true, skipped: 'throttled' });
    }
  }

  const blocks: any[] = Array.isArray(flow.flow_blocks) ? flow.flow_blocks : [];
  const startId: string | null = flow.start_block_id || blocks[0]?.id || null;
  if (!startId) return json({ ok: true, skipped: 'empty flow' });

  let runId: string | null = null;
  if (!dry_run) {
    const { data: run } = await sb.from('platform_crm_instagram_flow_runs').insert({
      product_id: flow.product_id,
      flow_id,
      connection_id: connection_id ?? flow.connection_id,
      trigger_source: trigger_source || 'manual',
      source_id: source_id ?? comment_id ?? null,
      sender_ig_id: sender_ig_id ?? null,
      conversation_id: conversation_id ?? null,
      status: 'running',
      payload: { trigger_text, ctx },
    }).select('id').single();
    runId = run?.id ?? null;
  }

  const executed: string[] = [];
  const dryPlan: Array<{ block_id: string; type: string; action: string; preview?: string }> = [];

  try {
    const byId = new Map(blocks.map(b => [b.id, b]));
    let currentId: string | null = startId;
    let safety = 50;
    while (currentId && safety-- > 0) {
      const block = byId.get(currentId);
      if (!block) break;
      executed.push(block.id);
      const nextOverride = dry_run
        ? simulateBlock(block, ctx, dryPlan)
        : await executeBlock(sb, flow, block, ctx, user);
      currentId = nextOverride ?? (block.next_block_id || block.data?.next_block_id || null);
    }
    if (dry_run) return json({ ok: true, dry_run: true, plan: dryPlan, executed });
    await sb.from('platform_crm_instagram_flow_runs').update({
      status: 'completed', finished_at: new Date().toISOString(),
      payload: { trigger_text, ctx, executed },
    }).eq('id', runId);
    return json({ ok: true, run_id: runId, executed });
  } catch (e) {
    console.error('[platform-ig-flow-executor] error', e);
    if (!dry_run) {
      await sb.from('platform_crm_instagram_flow_runs').update({
        status: 'failed', finished_at: new Date().toISOString(), error: String((e as Error).message ?? e),
        payload: { trigger_text, ctx, executed },
      }).eq('id', runId);
    }
    return json({ error: String(e) }, 500);
  }
});

function simulateBlock(block: any, ctx: any, plan: any[]): string | null {
  const d = block.data ?? {};
  const type = block.type;
  const preview = renderTemplate(d.text ?? d.prompt ?? '', ctx).slice(0, 200);
  switch (type) {
    case 'ig_reply_comment':
      plan.push({ block_id: block.id, type, action: 'Responder comentário publicamente', preview });
      return null;
    case 'ig_private_reply':
      plan.push({ block_id: block.id, type, action: 'Enviar DM privada ao autor do comentário', preview });
      return null;
    case 'ig_like_comment':
      plan.push({ block_id: block.id, type, action: 'Curtir comentário' });
      return null;
    case 'ig_send_dm':
    case 'message':
    case 'text':
      plan.push({ block_id: block.id, type, action: 'Enviar mensagem no DM', preview });
      return null;
    case 'wait':
      plan.push({ block_id: block.id, type, action: `Aguardar ${d.seconds ?? 1}s` });
      return null;
    case 'apply_tag':
      plan.push({ block_id: block.id, type, action: `Aplicar tag ${d.tag_name ?? d.tag_id ?? '?'}` });
      return null;
    case 'ai_takeover':
      plan.push({ block_id: block.id, type, action: 'IA assume a conversa', preview });
      return null;
    case 'enroll_cadence':
      plan.push({ block_id: block.id, type, action: `Inscrever lead na cadência ${d.cadence_name ?? d.cadence_id ?? '?'}` });
      return null;
    case 'assign_lead':
      plan.push({ block_id: block.id, type, action: `Atribuir lead ${d.user_name ? `ao vendedor ${d.user_name}` : d.sector_name ? `ao setor ${d.sector_name}` : ''}`.trim() });
      return null;
    case 'condition_text':
    case 'condition': {
      const keywords: string[] = Array.isArray(d.keywords) ? d.keywords : [];
      const match = d.match ?? 'any';
      const text = String(ctx.trigger_text ?? '').toLowerCase();
      let ok = false;
      if (keywords.length === 0) ok = true;
      else if (match === 'all') ok = keywords.every(k => text.includes(String(k).toLowerCase()));
      else if (match === 'exact') ok = keywords.some(k => text.trim() === String(k).toLowerCase().trim());
      else ok = keywords.some(k => text.includes(String(k).toLowerCase()));
      plan.push({ block_id: block.id, type, action: `Condição: ${ok ? 'verdadeiro' : 'falso'}` });
      return ok ? (d.true_next_block_id ?? null) : (d.false_next_block_id ?? null);
    }
  }
  return null;
}

async function executeBlock(sb: any, flow: any, block: any, ctx: any, actor: { id: string } | null): Promise<string | null> {
  const d = block.data ?? {};
  const type = block.type;
  const connId = ctx.connection_id ?? flow.connection_id;

  switch (type) {
    case 'ig_reply_comment': {
      if (!ctx.comment_id || !d.text) return null;
      await sb.functions.invoke('platform-ig-send', {
        body: { type: 'comment_reply', connection_id: connId, comment_id: ctx.comment_id, text: renderTemplate(d.text, ctx) },
      });
      return null;
    }
    case 'ig_private_reply': {
      if (!ctx.comment_id || !d.text) return null;
      await sb.functions.invoke('platform-ig-send', {
        body: {
          type: 'private_reply',
          connection_id: connId,
          comment_id: ctx.comment_id,
          text: renderTemplate(d.text, ctx),
          quick_replies: d.quick_replies,
          buttons: d.buttons,
        },
      });
      return null;
    }
    case 'ig_like_comment': {
      if (!ctx.comment_id) return null;
      await sb.functions.invoke('platform-ig-send', {
        body: { type: 'like_comment', connection_id: connId, comment_id: ctx.comment_id },
      });
      return null;
    }
    case 'ig_send_dm':
    case 'message':
    case 'text': {
      if (!ctx.sender_ig_id && !ctx.conversation_id) return null;
      await sb.functions.invoke('platform-ig-send', {
        body: {
          type: 'dm',
          connection_id: connId,
          conversation_id: ctx.conversation_id,
          recipient_id: ctx.sender_ig_id,
          text: renderTemplate(d.text ?? d.content ?? '', ctx),
          media: d.media,
          quick_replies: d.quick_replies,
          buttons: d.buttons,
        },
      });
      return null;
    }
    case 'wait':
    case 'delay': {
      const secs = Math.min(30, Number(d.seconds ?? d.delay_seconds ?? 1));
      await new Promise((r) => setTimeout(r, secs * 1000));
      return null;
    }
    case 'apply_tag': {
      if (!d.tag_id || !ctx.conversation_id) return null;
      const { data: conv } = await sb.from('platform_crm_conversations').select('lead_id').eq('id', ctx.conversation_id).maybeSingle();
      if (conv?.lead_id) {
        await sb.from('platform_crm_lead_tag_assignments').upsert({ lead_id: conv.lead_id, tag_id: d.tag_id, source: 'automation' }, { onConflict: 'lead_id,tag_id' });
      }
      return null;
    }
    case 'ai_takeover': {
      if (!ctx.conversation_id) return null;
      const msg = ctx.trigger_text || d.prompt || '[iniciar atendimento]';
      // webchat-bot → platform-webchat-bot. override_agent_id → agent_id (shape da plataforma).
      const { data: botRes } = await sb.functions.invoke('platform-webchat-bot', {
        body: {
          conversation_id: ctx.conversation_id,
          message: msg,
          agent_id: d.agent_id,
        },
      });
      const chunks: string[] = Array.isArray((botRes as any)?.chunks)
        ? (botRes as any).chunks
        : ((botRes as any)?.response ? [(botRes as any).response] : []);
      for (const chunk of chunks) {
        if (!chunk) continue;
        await sb.functions.invoke('platform-ig-send', {
          body: { type: 'dm', connection_id: connId, conversation_id: ctx.conversation_id, recipient_id: ctx.sender_ig_id, text: chunk },
        });
        await new Promise((r) => setTimeout(r, 800));
      }
      return null;
    }
    case 'enroll_cadence': {
      if (!d.cadence_id || !ctx.conversation_id) return null;
      const { data: conv } = await sb.from('platform_crm_conversations').select('lead_id').eq('id', ctx.conversation_id).maybeSingle();
      if (!conv?.lead_id) return null;
      // cadence-enroll → platform-cadence-enroll (exige actorUserId em chamada service-role).
      await sb.functions.invoke('platform-cadence-enroll', {
        body: {
          cadence_id: d.cadence_id,
          lead_ids: [conv.lead_id],
          source: 'instagram_flow',
          source_ref: { flow_id: flow.id },
          actorUserId: ctx.actorUserId ?? actor?.id ?? null,
        },
      });
      return null;
    }
    case 'assign_lead': {
      if (!ctx.conversation_id) return null;
      const { data: conv } = await sb.from('platform_crm_conversations').select('lead_id').eq('id', ctx.conversation_id).maybeSingle();
      if (!conv?.lead_id) return null;
      // platform_crm_leads NÃO tem `sector_id` nem `assigned_seller_id`:
      //   * sector → aplicado só em platform_crm_conversations.sector_id
      //   * user   → assigned_to + closer_id em platform_crm_leads (assigned_seller_id→assigned_to)
      const leadPatch: any = {};
      if (d.user_id) { leadPatch.assigned_to = d.user_id; leadPatch.closer_id = d.user_id; }
      if (Object.keys(leadPatch).length) {
        await sb.from('platform_crm_leads').update(leadPatch).eq('id', conv.lead_id);
      }
      if (d.sector_id) await sb.from('platform_crm_conversations').update({ sector_id: d.sector_id }).eq('id', ctx.conversation_id);
      if (d.user_id) await sb.from('platform_crm_conversations').update({ assigned_to: d.user_id }).eq('id', ctx.conversation_id);
      return null;
    }
    case 'condition_text':
    case 'condition': {
      const keywords: string[] = Array.isArray(d.keywords) ? d.keywords : [];
      const match = d.match ?? 'any';
      const text = String(ctx.trigger_text ?? '').toLowerCase();
      let ok = false;
      if (keywords.length === 0) ok = true;
      else if (match === 'all') ok = keywords.every(k => text.includes(String(k).toLowerCase()));
      else if (match === 'exact') ok = keywords.some(k => text.trim() === String(k).toLowerCase().trim());
      else ok = keywords.some(k => text.includes(String(k).toLowerCase()));
      return ok ? (d.true_next_block_id ?? null) : (d.false_next_block_id ?? null);
    }
    default:
      console.warn('[platform-ig-flow-executor] unknown block type', type);
      return null;
  }
}

function renderTemplate(t: string, ctx: any): string {
  return String(t ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    if (k === 'text' || k === 'trigger_text') return String(ctx.trigger_text ?? '');
    if (k === 'sender') return String(ctx.sender_name ?? '');
    return '';
  });
}
