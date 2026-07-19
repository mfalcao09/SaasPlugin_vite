// platform-inactivity-sweeper — CRON-REDE da RÉGUA DE INATIVIDADE do funil.
//
// Espec Marcelo 2026-07-19: varre conversas do funil de venda com SDR ativa
// (status='bot_active' + persona SDR), calcula o silêncio DA CLIENTE desde a
// última mensagem da Duda e, cruzado o limiar da ocorrência (8/20/25/35 min),
// INVOCA o platform-sales-brain com uma instrução interna
//   { conversation_id, occurrence: N, repertoire_stage: N, deadline_context }.
// O sweeper NUNCA escreve mensagem — quem escreve é o BRAIN, adaptando o
// repertório do estágio (_shared/inactivity-cadence.ts) ao contexto real.
//
// ┌─ GATE (default OFF) ──────────────────────────────────────────────────────┐
// │ INACTIVITY_SWEEPER_ENABLED != 'true' → {skipped:'flag_off'} sem efeito.    │
// │ O pg_cron pode martelar a cada ~30s sem tocar em NADA até o Marcelo ligar. │
// └────────────────────────────────────────────────────────────────────────────┘
//
// TAMBÉM faz o AVISO DE JANELA 24h (é só mais uma condição da varredura):
// cadência 'encerrada' (despedida enviada) + 23h desde a ÚLTIMA INBOUND da
// cliente (mensagens nossas NÃO renovam a janela) + nunca avisada → invoca o
// brain com repertoire_stage='janela_24h' e marca cadence_window_notified_at
// (estado 'janela_avisada') — NUNCA repete. ≥24h sem aviso → marca expirada
// sem enviar (free-form já não entrega). Lead de CTWA tem entry-point de 72h;
// 23h da última inbound é SEMPRE seguro — mesmo mecanismo para todas (espec).
//
// IDEMPOTÊNCIA (o cron roda em DOIS jobs defasados ~30s): o claim da ocorrência
// é um UPDATE condicional (WHERE cadence_occurrence = N-1) — CAS no banco. Se o
// job irmão claimou primeiro, o UPDATE retorna 0 linhas e este pula. O claim
// acontece ANTES do brain: se o brain falhar, a ocorrência fica "gasta" (alerta
// via Telegram) — melhor perder um toque do que mandar dois.
//
// Auth: service-role (bearer/apikey) OU x-brain-secret (BRAIN_INTERNAL_SECRET) —
// mesmos autorizadores dos crons irmãos (nina-health-scan). verify_jwt=false no
// config.toml; a auth real é ESTA.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { timingSafeEqual } from '../_shared/meta-graph.ts';
import { isSdrAgent } from '../_shared/agent-routing.ts';
import { sendTelegramAlertThrottled } from '../_shared/platform-alerts.ts';
import {
  CADENCE_MAX_OCCURRENCE,
  decideCadence,
  decideWindowNotice,
} from '../_shared/inactivity-cadence.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-brain-secret',
};

// Quantas conversas por varredura (o cron volta em ~30s; não precisa esgotar).
const SWEEP_LIMIT = 25;
// Só conversas com atividade nas últimas 24h entram na régua (mais velho que
// isso a janela Meta já fechou — free-form não entrega; a régua morre junto).
const CADENCE_LOOKBACK_MS = 24 * 3_600_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Auth: service-role (bearer OU apikey) ou x-brain-secret. Timing-safe. */
function isAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apikey = req.headers.get('apikey') ?? '';
  const brainHeader = req.headers.get('x-brain-secret') ?? '';
  if (serviceKey && bearer && timingSafeEqual(bearer, serviceKey)) return true;
  if (serviceKey && apikey && timingSafeEqual(apikey, serviceKey)) return true;
  if (brainSecret && brainHeader && timingSafeEqual(brainHeader, brainSecret)) return true;
  return false;
}

const toMs = (iso: unknown): number | null => {
  if (typeof iso !== 'string' || !iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** Última msg (created_at) da conversa num dado sentido. 1 query, limit 1. */
async function lastMessageAt(
  supabase: SupabaseClient,
  conversationId: string,
  which: 'inbound' | 'bot_outbound',
): Promise<number | null> {
  let q = supabase
    .from('platform_crm_messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1);
  q = which === 'inbound'
    ? q.eq('direction', 'inbound').eq('sender_type', 'visitor')
    : q.eq('direction', 'outbound').eq('sender_type', 'bot');
  const { data } = await q.maybeSingle();
  return toMs((data as Record<string, any> | null)?.created_at);
}

/** Invoca o BRAIN server-to-server (x-brain-secret com fallback service key). */
async function invokeBrain(payload: Record<string, unknown>): Promise<{ ok: boolean; body: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/platform-sales-brain`;
  const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (brainSecret) headers['x-brain-secret'] = brainSecret;
  else headers['Authorization'] = `Bearer ${serviceKey}`;
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, body: body.slice(0, 300) };
  } catch (e) {
    return { ok: false, body: String(e).slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  // GATE: default OFF — o cron é no-op barato até o Marcelo ligar a flag.
  if ((Deno.env.get('INACTIVITY_SWEEPER_ENABLED') ?? 'false').toLowerCase() !== 'true') {
    return json({ skipped: 'flag_off' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const nowMs = Date.now();
  const out = {
    checked: 0,
    intervened: [] as Array<{ conversation_id: string; occurrence: number }>,
    resets: 0,
    window_notices: 0,
    window_expired: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // ── PARTE 1 — régua de ocorrências (conversas vivas do funil) ────────────
    const { data: convs, error: convErr } = await supabase
      .from('platform_crm_conversations')
      .select('id, product_id, current_agent_id, cadence_occurrence, cadence_status, cadence_last_intervention_at, last_message_at')
      .eq('channel', 'whatsapp')
      .eq('status', 'bot_active')
      .or('cadence_status.is.null,cadence_status.eq.ativa')
      .gte('last_message_at', new Date(nowMs - CADENCE_LOOKBACK_MS).toISOString())
      .order('last_message_at', { ascending: false })
      .limit(SWEEP_LIMIT);
    if (convErr) throw convErr;

    // Cache de agentes por produto (isSdrAgent decide se a régua corre).
    const agentCache = new Map<string, Array<Record<string, any>>>();
    const agentsOf = async (productId: string): Promise<Array<Record<string, any>>> => {
      if (agentCache.has(productId)) return agentCache.get(productId)!;
      const { data } = await supabase
        .from('platform_crm_product_agents')
        .select('id, name, agent_type, is_active, active_in_whatsapp')
        .eq('product_id', productId)
        .eq('is_active', true)
        .eq('active_in_whatsapp', true);
      const list = (data as Array<Record<string, any>>) ?? [];
      agentCache.set(productId, list);
      return list;
    };

    for (const conv of (convs as Array<Record<string, any>>) ?? []) {
      out.checked++;
      try {
        // Régua SÓ corre com persona SDR ativa na conversa (espec). Sem pin =
        // Duda nunca falou (o pin nasce na 1ª fala dela) → nada a retomar.
        if (!conv.product_id || !conv.current_agent_id) { out.skipped++; continue; }
        const agents = await agentsOf(conv.product_id);
        const current = agents.find((a) => a.id === conv.current_agent_id) ?? null;
        if (!isSdrAgent(current)) { out.skipped++; continue; }

        const [lastInboundAtMs, lastBotOutboundAtMs] = await Promise.all([
          lastMessageAt(supabase, conv.id, 'inbound'),
          lastMessageAt(supabase, conv.id, 'bot_outbound'),
        ]);

        const occurrence = Number(conv.cadence_occurrence ?? 0) || 0;
        const decision = decideCadence({
          nowMs,
          lastInboundAtMs,
          lastBotOutboundAtMs,
          occurrence,
          lastInterventionAtMs: toMs(conv.cadence_last_intervention_at),
        });

        if (decision.action === 'reset') {
          // Inbound da cliente ZERA a régua (ocorrência volta a 0; segue 'ativa').
          await supabase
            .from('platform_crm_conversations')
            .update({ cadence_occurrence: 0, cadence_status: 'ativa', cadence_outcome: 'ativo', cadence_reason: 'inbound_resetou_regua' })
            .eq('id', conv.id)
            .eq('cadence_occurrence', occurrence);
          out.resets++;
          continue;
        }
        if (decision.action !== 'intervene') { out.skipped++; continue; }

        const occ = decision.occurrence;
        const isFarewell = occ >= CADENCE_MAX_OCCURRENCE;
        // CLAIM idempotente (CAS): só um dos jobs defasados ganha a ocorrência.
        const { data: claimed, error: claimErr } = await supabase
          .from('platform_crm_conversations')
          .update({
            cadence_occurrence: occ,
            cadence_last_intervention_at: new Date(nowMs).toISOString(),
            // 4ª = despedida → cadência ENCERRADA, saída 'perdido' (base de
            // remarketing = conversas com cadence_status='encerrada'). 1ª-3ª
            // seguem 'ativa'/'ativo'.
            cadence_status: isFarewell ? 'encerrada' : 'ativa',
            cadence_outcome: isFarewell ? 'perdido' : 'ativo',
            cadence_reason: isFarewell ? 'despedida_4a_ocorrencia' : `intervencao_${occ}a_ocorrencia`,
            ...(isFarewell ? { cadence_closed_at: new Date(nowMs).toISOString() } : {}),
          })
          .eq('id', conv.id)
          .eq('cadence_occurrence', occ - 1) // CAS: perdeu a corrida → 0 linhas
          .select('id');
        if (claimErr) throw claimErr;
        if (!claimed || claimed.length === 0) { out.skipped++; continue; } // job irmão claimou

        const silenceMin = lastBotOutboundAtMs != null ? Math.round((nowMs - lastBotOutboundAtMs) / 60000) : null;
        const brain = await invokeBrain({
          conversation_id: conv.id,
          occurrence: occ,
          repertoire_stage: occ,
          deadline_context: silenceMin != null
            ? `silêncio de ~${silenceMin} min da cliente desde a sua última mensagem (${occ}ª ocorrência de inatividade)`
            : `${occ}ª ocorrência de inatividade`,
        });
        if (!brain.ok) {
          out.errors.push(`brain ${conv.id} occ ${occ}: ${brain.body}`);
          await sendTelegramAlertThrottled(
            `inactivity-brain-fail:${conv.id}`,
            `⚠️ RÉGUA DE INATIVIDADE: brain falhou na ${occ}ª ocorrência\nConversa: ${conv.id}\nResposta: ${brain.body}\nA ocorrência foi consumida (claim) — a régua segue para a próxima; verifique o platform-sales-brain.`,
          );
        } else {
          out.intervened.push({ conversation_id: conv.id, occurrence: occ });
        }
      } catch (e) {
        out.errors.push(`${conv.id}: ${String(e).slice(0, 200)}`);
      }
    }

    // ── PARTE 2 — aviso de janela 24h (cadência encerrada, nunca avisada) ────
    const { data: closed, error: closedErr } = await supabase
      .from('platform_crm_conversations')
      .select('id, cadence_window_notified_at, cadence_closed_at')
      .eq('channel', 'whatsapp')
      .eq('status', 'bot_active')
      .eq('cadence_status', 'encerrada')
      .is('cadence_window_notified_at', null)
      .limit(SWEEP_LIMIT);
    if (closedErr) throw closedErr;

    for (const conv of (closed as Array<Record<string, any>>) ?? []) {
      try {
        // Âncora CORRETA: a ÚLTIMA INBOUND da cliente (nossas msgs NÃO renovam).
        const lastInboundAtMs = await lastMessageAt(supabase, conv.id, 'inbound');
        const w = decideWindowNotice(nowMs, lastInboundAtMs, toMs(conv.cadence_window_notified_at));
        if (w.action === 'none') continue;

        // CLAIM idempotente: marca notified_at ANTES de invocar o brain — o
        // aviso é ÚNICO por conversa, nunca repete (estado 'janela_avisada').
        const { data: claimed, error: claimErr } = await supabase
          .from('platform_crm_conversations')
          .update({
            cadence_window_notified_at: new Date(nowMs).toISOString(),
            cadence_status: 'janela_avisada',
            cadence_reason: w.action === 'expired' ? 'janela_expirada_sem_aviso' : 'aviso_janela_23h',
          })
          .eq('id', conv.id)
          .is('cadence_window_notified_at', null) // CAS contra o job irmão
          .select('id');
        if (claimErr) throw claimErr;
        if (!claimed || claimed.length === 0) continue;

        if (w.action === 'expired') { out.window_expired++; continue; } // fechada — não envia

        const minutesLeft = lastInboundAtMs != null
          ? Math.max(0, Math.round((lastInboundAtMs + 24 * 3_600_000 - nowMs) / 60000))
          : null;
        const brain = await invokeBrain({
          conversation_id: conv.id,
          occurrence: CADENCE_MAX_OCCURRENCE, // a régua não avança — é cortesia única
          repertoire_stage: 'janela_24h',
          deadline_context: minutesLeft != null
            ? `restam ~${minutesLeft} min até a janela de contato fechar — aviso único de cortesia`
            : 'aviso único de cortesia antes de a janela de contato fechar',
        });
        if (!brain.ok) {
          out.errors.push(`brain janela ${conv.id}: ${brain.body}`);
          await sendTelegramAlertThrottled(
            `inactivity-window-fail:${conv.id}`,
            `⚠️ RÉGUA DE INATIVIDADE: aviso de janela 23h FALHOU\nConversa: ${conv.id}\nResposta: ${brain.body}\nO aviso foi consumido (nunca repete) — a lead NÃO recebeu a cortesia.`,
          );
        } else {
          out.window_notices++;
        }
      } catch (e) {
        out.errors.push(`janela ${conv.id}: ${String(e).slice(0, 200)}`);
      }
    }

    return json({ success: true, ...out });
  } catch (error) {
    console.error('[platform-inactivity-sweeper] error:', error);
    return json({ error: error instanceof Error ? error.message : 'Erro desconhecido', ...out }, 500);
  }
});
