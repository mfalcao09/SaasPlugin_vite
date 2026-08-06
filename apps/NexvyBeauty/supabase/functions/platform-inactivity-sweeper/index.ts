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

// ── PORTÃO DE ENVIO (06/08, Controladora GO-LIVE) ───────────────────────────
// Medido: este sweeper tinha freio por CONVERSA (4 ocorrências) e NENHUM freio
// por HORA nem por DIA. Quatro toques em 35 min é razoável para uma lead; com
// anúncio no ar e 40 conversas simultâneas são 160 mensagens sem teto agregado,
// em qualquer horário, cada uma uma chamada de LLM paga. O freio existia na
// dimensão errada: limitava o indivíduo, não a frota.
//
// É a MESMA forma do defeito que a sessão BDR achou no cold outreach (follow-up
// rodando ANTES do canSendNow). Dois motores, dois canais, o mesmo buraco: o
// follow-up foi desenhado como cortesia por conversa, nunca como volume de envio.
//
// As duas travas entram ANTES do CLAIM de propósito. Se barrassem depois, a
// ocorrência seria consumida sem mensagem sair — a lead perderia o toque E o
// contador andaria. Barrar antes significa: fica para a próxima varredura.
const WINDOW_TZ = 'America/Sao_Paulo';
const WINDOW_START_HOUR = Number(Deno.env.get('CADENCE_WINDOW_START_HOUR') ?? '9');
const WINDOW_END_HOUR = Number(Deno.env.get('CADENCE_WINDOW_END_HOUR') ?? '20');
/** Dias permitidos, 0=domingo … 6=sábado. Default seg-sáb (sem domingo). */
const WINDOW_DAYS = (Deno.env.get('CADENCE_WINDOW_DAYS') ?? '1,2,3,4,5,6')
  .split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
/** Teto de intervenções da régua no dia, somando TODAS as conversas. */
const DAILY_CAP = Number(Deno.env.get('CADENCE_DAILY_CAP') ?? '60');

/**
 * Está dentro da janela de horário, no fuso do NEGÓCIO?
 *
 * Usa Intl com timeZone explícito e NÃO `new Date().getHours()`: a edge roda em
 * UTC, então getHours() leria 3h da manhã como se fosse horário comercial. Ler
 * hora no fuso errado é defeito que já custou caro nesta frente.
 */
export function dentroDaJanela(nowMs: number): { ok: boolean; hora: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: WINDOW_TZ, hour: 'numeric', hour12: false, weekday: 'short',
  }).formatToParts(new Date(nowMs));
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '-1');
  const nomeDia = partes.find((p) => p.type === 'weekday')?.value ?? '';
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nomeDia);
  const ok = WINDOW_DAYS.includes(dia) && hora >= WINDOW_START_HOUR && hora < WINDOW_END_HOUR;
  return { ok, hora, dia };
}

/** Início do dia CORRENTE no fuso do negócio, em ISO — âncora do teto diário.
 *  Contar por dia UTC viraria a página às 21h de Brasília e daria meio teto
 *  extra toda noite. */
function inicioDoDiaLocalIso(nowMs: number): string {
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: WINDOW_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowMs)); // YYYY-MM-DD no fuso certo
  // -03:00 é o offset de Brasília (sem horário de verão desde 2019).
  return new Date(`${d}T00:00:00-03:00`).toISOString();
}

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
    // PORTÃO: contados à parte de `skipped`. Barrado por horário e barrado por
    // teto são desfechos DIFERENTES de "não havia nada a fazer" — somar tudo em
    // skipped esconderia justamente a informação de que o portão está segurando.
    blocked_by_window: 0,
    blocked_by_cap: 0,
    window_open: false,
    hora_local: -1,
    sent_today_before: 0,
    daily_cap: DAILY_CAP,
    errors: [] as string[],
  };

  try {
    // Estado do portão, calculado UMA vez por varredura.
    const janela = dentroDaJanela(nowMs);
    out.window_open = janela.ok;
    out.hora_local = janela.hora;

    // Quantas intervenções da régua já saíram HOJE, somando todas as conversas.
    // Conta pelo claim (cadence_last_intervention_at), que é o que marca "toque
    // consumido" — contar mensagens enviadas misturaria com resposta normal.
    const { count: jaHoje } = await supabase
      .from('platform_crm_conversations')
      .select('id', { count: 'exact', head: true })
      .gte('cadence_last_intervention_at', inicioDoDiaLocalIso(nowMs));
    let enviadosHoje = jaHoje ?? 0;
    out.sent_today_before = enviadosHoje;
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

    // Slug do produto por id — a régua é de VENDAS e só vale no funil B2B.
    const B2B_SALES_PRODUCT_SLUG = 'nexvybeauty';
    const slugCache = new Map<string, string>();
    const slugOf = async (productId: string): Promise<string> => {
      if (slugCache.has(productId)) return slugCache.get(productId)!;
      const { data } = await supabase
        .from('platform_crm_products')
        .select('slug')
        .eq('id', productId)
        .maybeSingle();
      const slug = (data?.slug as string) ?? '';
      slugCache.set(productId, slug);
      return slug;
    };

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

        // FORA DO FUNIL B2B a régua NÃO corre. A Mavi (Demo) é agent_type='sdr'
        // — herdou o tipo do preset — então passava no isSdrAgent e a Demo caía
        // na régua de VENDAS: quem testasse a demonstração e fechasse o WhatsApp
        // levava 4 cobranças em 35min para marcar horário num salão FICTÍCIO.
        // Ninguém decidiu isso: a régua simplesmente não excluía produto nenhum
        // (conferido 2026-08-01 — as 2 conversas da Demo qualificavam). Perseguir
        // curioso é pior que não perseguir, e cada toque é chamada de LLM paga.
        // Critério idêntico ao do brain (B2B_SALES_PRODUCT_SLUG) de propósito:
        // duas definições de "funil de verdade" divergiriam com o tempo.
        if ((await slugOf(conv.product_id)) !== B2B_SALES_PRODUCT_SLUG) { out.skipped++; continue; }

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

        // ── PORTÃO, ANTES DO CLAIM ────────────────────────────────────────
        // Barrar DEPOIS do claim consumiria a ocorrência sem mensagem sair: a
        // lead perderia o toque e o contador andaria — o pior dos dois mundos.
        // Barrado aqui = fica para a próxima varredura, intacto.
        if (!janela.ok) { out.blocked_by_window++; continue; }
        if (enviadosHoje >= DAILY_CAP) { out.blocked_by_cap++; continue; }

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
        // Ocorrência consumida: conta para o teto do dia AQUI, no claim, e não
        // depois da resposta do brain. Se o brain falhar, o toque foi gasto do
        // mesmo jeito (o claim é irreversível) — não contar seria deixar o teto
        // ser furado por cada falha.
        enviadosHoje++;

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

        // TETO vale aqui também: é envio, e teto que tem exceção não é teto.
        // JANELA DE HORÁRIO **não** vale — de propósito. Este aviso é único e
        // EXPIRA às 24h da última inbound: se a janela Meta fechar às 3h da
        // manhã, barrar por horário não adia o aviso, ELIMINA. Um "sigo à
        // disposição" fora de hora incomoda; perder o último contato possível
        // custa a lead. Escolha declarada, não esquecimento.
        if (w.action === 'notify' && enviadosHoje >= DAILY_CAP) { out.blocked_by_cap++; continue; }

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
