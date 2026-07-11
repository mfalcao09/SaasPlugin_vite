// platform-process-post-sale-scheduled — CRON do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `process-post-sale-scheduled` (Vendus, org-scoped), DESACOPLADO
// do tenant:
//   * Fila: `post_sale_scheduled_runs` — tabela COMPARTILHADA (já tem coluna
//     `product_id` desde sempre, usada pelo `_shared/post-sale-engine.ts` org-scoped
//     quando o evento tem produto). O gate de escopo desta twin é EM CÓDIGO
//     (mesmo padrão do resto da camada platform-crm-*, doc `_shared/platform-crm-auth.ts`):
//     só processa runs com `organization_id IS NULL AND product_id IS NOT NULL`
//     — linhas puramente da plataforma (nenhuma organização dona). Runs de
//     organização (`organization_id` preenchido) são território do worker
//     org-scoped original e NUNCA são tocadas aqui — sem risco de dupla-claim
//     (claim atômico por `id` já é exclusivo, mas o filtro evita competição
//     inútil pela fila inteira a cada tick).
//   * Regra: `platform_crm_post_sale_event_actions` (rules do Hub do Produto,
//     product-scoped, SEM organization_id — F4 do D3 multiproduto).
//   * Lead: `platform_crm_leads` (product-scoped, SEM organization_id).
//   * Log de execução: `platform_crm_post_sale_event_logs` — a run.ts original
//     NÃO grava log (só atualiza status na própria fila); esta twin GRAVA
//     (requisito explícito do porte) espelhando o formato de
//     `_shared/post-sale-engine.ts` (step 8: product_id, event_type, lead_id,
//     source, action_id, executed_actions[], event_data).
//   * Mensagem inline (send_mode='message'):
//       - whatsapp → invoca `platform-evolution-send` (twin 1:1 de
//         `evolution-send`; contrato idêntico trocando organization_id por
//         product_id). Instância = `action.evolution_instance_id`, coluna que
//         já existe em `platform_crm_post_sale_event_actions` (mirror de schema
//         do F4) — NÃO simplificado para Meta Cloud API: a coluna existe
//         porque o CRM de plataforma também tem `platform_crm_evolution_instances`
//         (ver `platform-evolution-webhook`/`platform-evolution-proxy`).
//       - email → `enqueue_email` (RPC global pgmq, sem FK em lead_id/template_id
//         — reuso direto e seguro com platform_crm_leads.id).
//   * Agente IA (`action.agent_id`) → invoca `platform-manual-outreach` (twin 1:1
//     de `manual-outreach`; contrato idêntico trocando organization_id por
//     product_id).
//   * E-mail por template (`action.email_template_id`) → `platform_crm_email_templates`
//     (mesmas colunas subject/html_content da tabela org-scoped `email_templates`).
//   * Idempotência: MESMO desenho do original —
//       1. claim atômico (`update ... where status='pending'` com `.select().maybeSingle()`,
//          só processa se `claimed` não for null);
//       2. defesa de evento final: se um evento fechante (`compra_aprovada`,
//          `reembolso`, `chargeback`, `assinatura_cancelada`) já chegou DEPOIS
//          desta run ser criada, cancela em vez de disparar (mesma janela de
//          `event_type`s transitórios: `pix_gerado`/`boleto_gerado`/`checkout_abandonado`).
//   * Auth: bearer SERVICE_ROLE (cron pg_cron, MESMO padrão de
//     `platform-campaign-dispatcher`/dispatch-scheduled do webchat-inbox) OU
//     JWT super_admin via `authenticatePlatformAgent` (chamada manual/debug).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v ?? '');
  }
  return out.replace(/\{\{[^}]+\}\}/g, '');
}

function buildVars(lead: any, eventData: Record<string, any> = {}): Record<string, string> {
  const vars: Record<string, string> = {
    lead_name: lead?.name || '',
    lead_email: lead?.email || '',
    lead_phone: lead?.phone || '',
    name: lead?.name || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
  };
  for (const [k, v] of Object.entries(eventData)) {
    if (k === '__raw' || v == null) continue;
    if (typeof v === 'object') {
      try { vars[k] = JSON.stringify(v); } catch { /* skip */ }
    } else {
      vars[k] = String(v);
    }
  }
  return vars;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth: cron/interno = bearer SERVICE_ROLE key; humano/debug = JWT super_admin.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (bearer !== serviceRoleKey) {
    let bodyParsed: any = {};
    try { bodyParsed = await req.clone().json(); } catch { /* body vazio (GET/cron sem json) */ }
    const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceRoleKey, bodyParsed);
    if (errorResponse) return errorResponse;
  }

  // Gate de escopo: SÓ runs product-scoped puras (sem organização dona).
  const { data: due, error: dueErr } = await supabase
    .from('post_sale_scheduled_runs')
    .select('*')
    .eq('status', 'pending')
    .is('organization_id', null)
    .not('product_id', 'is', null)
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(50);

  if (dueErr) {
    console.error('[platform-process-post-sale-scheduled] fetch error', dueErr);
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const processed: any[] = [];

  for (const run of due ?? []) {
    // claim
    const { data: claimed } = await supabase
      .from('post_sale_scheduled_runs')
      .update({ status: 'running', attempts: (run.attempts ?? 0) + 1 })
      .eq('id', run.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    // Defesa: se um evento "final" (compra_aprovada/reembolso/chargeback/cancelamento)
    // chegou DEPOIS desta run ser criada, cancela em vez de disparar.
    if (['pix_gerado', 'boleto_gerado', 'checkout_abandonado'].includes(run.event_type)) {
      const { data: laterClose } = await supabase
        .from('post_sale_scheduled_runs')
        .select('id')
        .is('organization_id', null)
        .eq('product_id', run.product_id)
        .eq('lead_id', run.lead_id)
        .in('event_type', ['compra_aprovada', 'reembolso', 'chargeback', 'assinatura_cancelada'])
        .gt('created_at', run.created_at)
        .limit(1);
      if (laterClose && laterClose.length > 0) {
        await supabase
          .from('post_sale_scheduled_runs')
          .update({
            status: 'cancelled',
            last_error: 'cancelled_by_later_closing_event',
            executed_at: new Date().toISOString(),
          })
          .eq('id', run.id);
        processed.push({ id: run.id, status: 'cancelled', reason: 'later_closing_event' });
        continue;
      }
    }

    const errors: string[] = [];
    const executedActions: Record<string, unknown>[] = [];

    try {
      const { data: action } = await supabase
        .from('platform_crm_post_sale_event_actions')
        .select('*')
        .eq('id', run.action_id)
        .maybeSingle();

      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('id, name, email, phone')
        .eq('id', run.lead_id)
        .maybeSingle();

      if (!action || !action.is_active) {
        errors.push('action missing or inactive');
      } else if (!lead) {
        errors.push('lead not found');
      } else {
        const vars = buildVars(lead, run.event_data || {});

        // 1) Mensagem inline
        if (action.send_mode === 'message' && action.inline_message) {
          const message = replaceVars(action.inline_message, vars);
          if (action.message_channel === 'whatsapp' && lead.phone) {
            const phone = normalizePhone(lead.phone);
            const { data: sd, error: se } = await supabase.functions.invoke('platform-evolution-send', {
              body: {
                type: 'text', to: phone, payload: { text: message },
                product_id: run.product_id,
                instance_id: action.evolution_instance_id ?? undefined,
              },
            });
            if (se || (sd && sd.error)) {
              const msg = `platform-evolution-send: ${se?.message || sd?.error}`;
              errors.push(msg);
              executedActions.push({ action: 'send_inline_message', success: false, error: msg });
            } else {
              executedActions.push({ action: 'send_inline_message', success: true });
            }
          } else if (action.message_channel === 'email' && lead.email) {
            await supabase.rpc('enqueue_email', {
              queue_name: 'transactional_email',
              payload: {
                to: lead.email,
                subject: `Sobre ${run.event_data?.product_name ?? 'sua compra'}`,
                html: `<p>${message.replace(/\n/g, '<br/>')}</p>`,
                product_id: run.product_id,
                lead_id: lead.id,
              },
            });
            executedActions.push({ action: 'send_inline_message', success: true });
          }
        }

        // 2) Agente IA
        if (action.agent_id && lead.phone) {
          const { data: od, error: oe } = await supabase.functions.invoke('platform-manual-outreach', {
            body: {
              lead_ids: [lead.id],
              agent_id: action.agent_id,
              product_id: run.product_id,
              objective: action.agent_objective || `Evento ${run.event_type}`,
              extra_context: action.agent_extra_context,
              force_when_human: true,
              event_context: {
                event_type: run.event_type,
                source: run.source,
                ...(run.event_data || {}),
              },
            },
          });
          if (oe) {
            const msg = `platform-manual-outreach: ${oe.message}`;
            errors.push(msg);
            executedActions.push({ action: 'ai_agent_outreach', success: false, error: msg });
          } else {
            const r = (od as any)?.results?.[0];
            if (r?.error) {
              errors.push(`platform-manual-outreach: ${r.error}`);
              executedActions.push({ action: 'ai_agent_outreach', success: false, error: r.error });
            } else if (r?.skipped) {
              errors.push(`platform-manual-outreach skipped: ${r.reason}`);
              executedActions.push({ action: 'ai_agent_outreach', success: false, error: `skipped: ${r.reason}` });
            } else {
              executedActions.push({ action: 'ai_agent_outreach', success: true, detail: od });
            }
          }
        }

        // 3) E-mail por template
        if (action.email_template_id && lead.email) {
          const { data: tpl } = await supabase
            .from('platform_crm_email_templates')
            .select('subject, html_content')
            .eq('id', action.email_template_id)
            .maybeSingle();
          if (tpl) {
            await supabase.rpc('enqueue_email', {
              queue_name: 'transactional_email',
              payload: {
                to: lead.email,
                subject: replaceVars(tpl.subject || '', vars),
                html: replaceVars(tpl.html_content || '', vars),
                product_id: run.product_id,
                template_id: action.email_template_id,
                lead_id: lead.id,
              },
            });
            executedActions.push({ action: 'send_email', success: true });
          }
        }
      }

      const finalStatus = errors.length ? 'failed' : 'done';
      await supabase
        .from('post_sale_scheduled_runs')
        .update({
          status: finalStatus,
          executed_at: new Date().toISOString(),
          last_error: errors.length ? errors.join(' | ') : null,
        })
        .eq('id', run.id);

      // Log de execução — platform_crm_post_sale_event_logs (twin de
      // `_shared/post-sale-engine.ts` step 8; a run.ts org-scoped NÃO loga,
      // esta twin loga por requisito explícito do porte).
      try {
        await supabase.from('platform_crm_post_sale_event_logs').insert({
          product_id: run.product_id,
          event_type: run.event_type,
          lead_id: run.lead_id,
          source: run.source,
          action_id: run.action_id,
          executed_actions: executedActions,
          event_data: run.event_data || {},
        });
      } catch (logErr) {
        console.error('[platform-process-post-sale-scheduled] log insert failed (non-fatal)', run.id, logErr);
      }

      processed.push({ id: run.id, status: finalStatus, errors });
    } catch (err) {
      console.error('[platform-process-post-sale-scheduled] run failed', run.id, err);
      await supabase
        .from('post_sale_scheduled_runs')
        .update({
          status: 'failed',
          last_error: (err as Error).message,
          executed_at: new Date().toISOString(),
        })
        .eq('id', run.id);
      try {
        await supabase.from('platform_crm_post_sale_event_logs').insert({
          product_id: run.product_id,
          event_type: run.event_type,
          lead_id: run.lead_id,
          source: run.source,
          action_id: run.action_id,
          executed_actions: [{ action: 'run', success: false, error: (err as Error).message }],
          event_data: run.event_data || {},
        });
      } catch (logErr) {
        console.error('[platform-process-post-sale-scheduled] log insert failed (non-fatal)', run.id, logErr);
      }
      processed.push({ id: run.id, status: 'failed', error: (err as Error).message });
    }
  }

  return new Response(JSON.stringify({ processed: processed.length, items: processed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
