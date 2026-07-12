// platform-ig-flow-generate-ai
// Gera um instagram_flow completo a partir de descrição em linguagem natural.
//
// PORTE do org-scoped `instagram-flow-generate-ai` (V5) para o mundo PLATAFORMA
// (super_admin, product-scoped).
// Fonte: scratchpad/vendus-novo/completo-0109/guigascruz25-*/supabase/functions/instagram-flow-generate-ai/index.ts
//
// Remaps aplicados (twins VERIFICADOS via SQL no projeto fzhlbwhdejumkyqosuvq, 2026-07-12):
//   * lead_tags  → platform_crm_lead_tags   (id, name, product_id)
//   * cadences   → platform_crm_cadences    (id, name, product_id, status)
//   * sectors    → platform_crm_sectors     (id, name, product_id)
//   * IA         → aiChat({ organizationId: null }) usa a chave da PLATAFORMA
//                  (AI_API_KEY / AI_GATEWAY_URL), idêntico a platform-generate-objections.
//   * Auth       → authenticatePlatformAgent (super_admin via user_roles OU service_role + actorUserId/created_by no body).
//
// Mudanças dirigidas vs. o original (org-scoped → product-scoped):
//   * organization_id  → product_id (o CRM de plataforma é product-scoped puro, SEM organization_id).
//   * Resolução de org a partir de `profiles` → REMOVIDA. `product_id` agora é obrigatório no body.
//   * assign_lead: resolução de user_name → user_id REMOVIDA (não há tabela verificada de vendedores
//     product-scoped na plataforma). Mantém user_id_pending; sector_name segue resolvido por platform_crm_sectors.
//   * recordAIUsage (ai-router, per-org) → REMOVIDO (chamada com organizationId=null usa a chave da plataforma;
//     não há uso por-org a registrar), igual ao platform-generate-objections.
//
// ⚠️ DEPENDÊNCIA QUE **NÃO EXISTE** no schema da plataforma (verificado via SQL — RELATADO, não inventado):
//   * Tabela instagram_flows → NÃO existe (nenhum twin platform_ig_*/platform_instagram_*).
//   Mantida com o nome original (1:1) para SELECT/INSERT/UPDATE e SINALIZADA. Este edge NÃO É OPERÁVEL
//   até haver migration de backing (com colunas product-scoped).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { aiChat, describeAIError } from '../_shared/ai-call.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const BLOCK_CATALOG = `
Blocos disponíveis (types válidos):
- ig_reply_comment       { text: string }                                 → responde publicamente no comentário
- ig_private_reply       { text: string }                                 → envia DM privada ao autor do comentário (janela 7d, 1× por comentário)
- ig_like_comment        {}                                                → curte o comentário
- ig_send_dm             { text: string }                                 → envia mensagem na DM
- ai_takeover            { prompt?: string }                              → passa a conversa para o agente IA
- wait                   { seconds: number }                              → aguarda N segundos (1-30)
- apply_tag              { tag_name: string }                             → aplica etiqueta ao lead pelo NOME (o backend resolve)
- condition_text         { keywords: string[], match: 'any'|'all'|'exact' } → ramificação por texto do gatilho
- enroll_cadence         { cadence_name: string }                          → inscreve o lead numa cadência (backend resolve nome→id)
- assign_lead            { sector_name?: string, user_name?: string }      → atribui o lead a um setor ou vendedor pelo nome
`;

const TRIGGER_TYPES = ['comment_keyword','dm_keyword','story_reply','mention','manual','new_follower'];

const SYSTEM_PROMPT = `Você é um construtor de automações do Instagram estilo ManyChat.
A partir da descrição do usuário, gere UM fluxo pronto para publicar.

REGRAS:
- Responda APENAS em JSON, sem markdown, sem texto extra.
- trigger_type deve ser um destes: ${TRIGGER_TYPES.join(', ')}.
- Para "story_reply" ou "dm_keyword" ou "comment_keyword" inclua trigger_config.keywords (array) e trigger_config.match ('any'|'all'|'exact'|'regex').
- Blocos rodam LINEARMENTE (o backend faz o rewire de next_block_id). Não invente ids.
- Regras Meta: ig_private_reply só funciona se o gatilho for comment_keyword/mention (janela 7d).
- Textos em português-BR, tom da empresa, sem clichês. Máx 2 linhas por bloco de mensagem.
- Se o usuário pedir para "IA responder"/"IA conversar", use ai_takeover (com prompt curto contextualizando).
- Se precisar aguardar antes da DM (evitar flood), use wait com 2-5 segundos.
- Se algo estiver ambíguo, adicione uma string em "warnings" (ex: "Selecione o post-alvo na aba Gatilho").

${BLOCK_CATALOG}

FORMATO EXATO:
{
  "name": "string curto",
  "description": "string curta",
  "trigger_type": "comment_keyword",
  "trigger_config": { "keywords": ["..."], "match": "any" },
  "blocks": [ { "type": "ig_reply_comment", "data": { "text": "..." } }, ... ],
  "warnings": ["..."]
}`;

function newBlockId() {
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function rewireChain(blocks: any[]): any[] {
  return blocks.map((b, i) => ({ ...b, next_block_id: blocks[i + 1]?.id ?? null }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return j({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sbAdmin = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  // Gate super_admin (padrão das edges platform-*). service_role + actorUserId/created_by no body também vale.
  const { user, errorResponse } = await authenticatePlatformAgent(req, sbAdmin, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const { prompt, product_id, connection_id, existing_flow_id } = body ?? {};
  if (!prompt || typeof prompt !== 'string') return j({ error: 'prompt required' }, 400);
  // product_id substitui organization_id (plataforma é product-scoped puro).
  if (!product_id) return j({ error: 'product_id required' }, 400);

  // Se refinando fluxo existente, passa contexto atual
  // ⚠️ instagram_flows NÃO EXISTE no schema da plataforma (verificado via SQL). Mantido 1:1.
  let refineContext = '';
  if (existing_flow_id) {
    const { data: cur } = await sbAdmin.from('instagram_flows').select('name, trigger_type, trigger_config, flow_blocks').eq('id', existing_flow_id).maybeSingle();
    if (cur) refineContext = `\n\nFluxo atual (para refinar):\n${JSON.stringify(cur).slice(0, 2000)}`;
  }

  // Contexto (tags, cadências ativas, setores) para o modelo — product-scoped.
  const [{ data: tags }, { data: cads }, { data: secs }] = await Promise.all([
    sbAdmin.from('platform_crm_lead_tags').select('name').eq('product_id', product_id).limit(30),
    sbAdmin.from('platform_crm_cadences').select('name').eq('product_id', product_id).eq('status', 'active').limit(30),
    sbAdmin.from('platform_crm_sectors').select('name').eq('product_id', product_id).limit(30),
  ]);
  const tagList = (tags ?? []).map((t: any) => t.name).join(', ') || '(sem tags cadastradas)';
  const cadList = (cads ?? []).map((c: any) => c.name).join(', ') || '(sem cadências ativas)';
  const secList = (secs ?? []).map((s: any) => s.name).join(', ') || '(sem setores)';

  let response: Response, config: any;
  try {
    const r = await aiChat({
      organizationId: null,
      capability: 'content_generation',
      model: 'google/gemini-3-flash-preview',
      supabase: sbAdmin,
      label: 'platform-ig-flow-generate-ai',
      body: {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + `\n\nTags disponíveis para apply_tag: ${tagList}\nCadências ativas para enroll_cadence: ${cadList}\nSetores para assign_lead: ${secList}` + refineContext },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      },
    });
    response = r.response; config = r.config;
  } catch (e: any) {
    return j({ error: e?.message ?? String(e), code: e?.code }, 400);
  }

  if (!response.ok) {
    const msg = await describeAIError(response, config.provider);
    return j({ error: msg }, response.status);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content ?? '{}';
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch {
    return j({ error: 'Resposta da IA não é JSON válido', raw: raw.slice(0, 500) }, 502);
  }

  // Validação leve + normalização
  const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  const rewired = rewireChain(
    blocks.map((b: any) => ({
      id: newBlockId(),
      type: String(b?.type ?? 'ig_send_dm'),
      position: { x: 0, y: 0 },
      data: b?.data ?? {},
      next_block_id: null,
    })),
  );

  // Resolve apply_tag por nome → tag_id (product-scoped)
  if (rewired.some(b => b.type === 'apply_tag')) {
    const { data: allTags } = await sbAdmin.from('platform_crm_lead_tags').select('id,name').eq('product_id', product_id);
    const byName = new Map((allTags ?? []).map((t: any) => [String(t.name).toLowerCase(), t.id]));
    for (const b of rewired) {
      if (b.type !== 'apply_tag') continue;
      const wanted = String(b.data?.tag_name ?? '').toLowerCase();
      const found = byName.get(wanted);
      if (found) b.data.tag_id = found;
      else b.data.tag_id_pending = b.data.tag_name;
    }
  }

  // Resolve enroll_cadence por nome → cadence_id (product-scoped)
  if (rewired.some(b => b.type === 'enroll_cadence')) {
    const { data: cads2 } = await sbAdmin.from('platform_crm_cadences').select('id,name').eq('product_id', product_id).eq('status', 'active');
    const byName = new Map((cads2 ?? []).map((c: any) => [String(c.name).toLowerCase(), c.id]));
    for (const b of rewired) {
      if (b.type !== 'enroll_cadence') continue;
      const wanted = String(b.data?.cadence_name ?? '').toLowerCase();
      const found = byName.get(wanted);
      if (found) b.data.cadence_id = found;
      else b.data.cadence_id_pending = b.data.cadence_name;
    }
  }

  // Resolve assign_lead sector_name → sector_id (product-scoped).
  // user_name → user_id: NÃO resolvido (sem tabela verificada de vendedores product-scoped). Mantém user_id_pending.
  if (rewired.some(b => b.type === 'assign_lead')) {
    const { data: sectors } = await sbAdmin.from('platform_crm_sectors').select('id,name').eq('product_id', product_id);
    const bySector = new Map((sectors ?? []).map((s: any) => [String(s.name).toLowerCase(), s.id]));
    for (const b of rewired) {
      if (b.type !== 'assign_lead') continue;
      const sw = String(b.data?.sector_name ?? '').toLowerCase();
      const uw = String(b.data?.user_name ?? '').toLowerCase();
      if (sw) { const s = bySector.get(sw); if (s) b.data.sector_id = s; else b.data.sector_id_pending = b.data.sector_name; }
      if (uw) { b.data.user_id_pending = b.data.user_name; }
    }
  }

  const flowPayload = {
    product_id,
    created_by: user?.id ?? null,
    connection_id: connection_id ?? null,
    name: String(parsed?.name ?? 'Automação gerada por IA').slice(0, 120),
    description: String(parsed?.description ?? '').slice(0, 500) || null,
    status: 'draft' as const,
    trigger_type: TRIGGER_TYPES.includes(parsed?.trigger_type) ? parsed.trigger_type : 'comment_keyword',
    trigger_config: parsed?.trigger_config ?? {},
    flow_blocks: rewired,
    start_block_id: rewired[0]?.id ?? null,
  };

  // ⚠️ instagram_flows NÃO EXISTE no schema da plataforma. INSERT/UPDATE mantidos 1:1 (product-scoped).
  let flowId: string;
  if (existing_flow_id) {
    const { error } = await sbAdmin.from('instagram_flows').update({
      name: flowPayload.name, description: flowPayload.description,
      trigger_type: flowPayload.trigger_type, trigger_config: flowPayload.trigger_config,
      flow_blocks: rewired, start_block_id: flowPayload.start_block_id,
    }).eq('id', existing_flow_id).eq('product_id', product_id);
    if (error) return j({ error: error.message }, 500);
    flowId = existing_flow_id;
  } else {
    const { data: created, error } = await sbAdmin.from('instagram_flows').insert(flowPayload as any).select('id').single();
    if (error) return j({ error: error.message }, 500);
    flowId = created.id;
  }

  return j({
    ok: true,
    flow_id: flowId,
    name: flowPayload.name,
    trigger_type: flowPayload.trigger_type,
    blocks: rewired,
    warnings: Array.isArray(parsed?.warnings) ? parsed.warnings : [],
  });
});
