// tmp-eval-agents — EF DESCARTÁVEL do braço EVALS-V1 (5.6).
//
// A régua binária do "95/100": dá uma nota verificável ao brain de vendas
// (platform-sales-brain / Duda→Bia). Sem eval, nenhuma nota se afirma.
//
// COMO FUNCIONA
//   POST { golden_id?: string, only?: string[], keep?: boolean, cleanup?: boolean }
//   auth = x-brain-secret == BRAIN_INTERNAL_SECRET (mesmo segredo do brain).
//   - sem golden_id / only  → roda TODOS os goldens.
//   - golden_id             → roda 1.
//   - only: [...]           → roda o subconjunto.
//   - cleanup: true         → só limpa os efêmeros e sai (idempotente).
//   Para cada golden:
//     1. cria conversa EFÊMERA (visitor_id 'wa:eval-<id>-<rand>'), lead e,
//        se leadSeed, semeia a memória de qualificação;
//     2. injeta os inbound[] um a um (wa_timestamp no passado p/ derrotar o
//        DEBOUNCE de 25s sem cair no STALE de 10min);
//     3. chama o platform-sales-brain (server-to-server, x-brain-secret);
//     4. coleta as bolhas outbound persistidas (a resposta) e roda as
//        assertions binárias → pass/fail por golden.
//   Ao fim: LIMPA tudo com prefixo 'wa:eval-' (idempotente), a menos que
//   keep=true. Retorna o placar por golden + score agregado.
//
// ⚠️ ZERO ENTREGA REAL (defesa em profundidade):
//   - visitor_whatsapp / visitor_phone = 'eval-no-send' (SEM dígitos): o
//     deliverViaWhatsAppCloud do brain faz .replace(/\D/g,'') → '' →
//     retorna 'no_destination_phone' e NUNCA chama o Graph;
//   - as bolhas ainda são persistidas no CRM (o brain persiste ANTES de
//     entregar), que é de onde lemos a resposta.
//   Mesmo que exista conexão Cloud API 'active' no ambiente, nada é enviado.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { timingSafeEqual } from '../_shared/meta-graph.ts';
import { platformCrmCorsHeaders as corsHeaders } from '../_shared/platform-crm-auth.ts';
import { GOLDENS, GOLDENS_BY_ID, type Golden, type GoldenInbound } from './goldens.ts';
import { scoreGolden, type GoldenScore } from './assertions.ts';

const EVAL_PREFIX = 'wa:eval-';
const NO_SEND_PHONE = 'eval-no-send'; // sem dígitos ⇒ o brain nunca entrega
// wa_timestamp default das inbounds injetadas: 35s no passado. Derrota o
// DEBOUNCE (25s) sem cair no STALE_REDELIVERY (10min) — o brain responde já.
const DEFAULT_WA_AGO_SEC = 35;
// Espera máxima pela resposta do brain (ele tem 2 chamadas LLM + debounce curto).
const BRAIN_TIMEOUT_MS = 120_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** Auth: x-brain-secret == BRAIN_INTERNAL_SECRET (timing-safe). Mesma chave do
 *  brain — é uma EF interna de teste, nunca exposta ao cliente. */
function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const header = req.headers.get('x-brain-secret') ?? '';
  if (!!secret && !!header && timingSafeEqual(header, secret)) return true;
  // EF descartável de teste: a service-role (super-admin) também autoriza, para o
  // operador rodar o eval do terminal sem o BRAIN_INTERNAL_SECRET em plaintext.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  return !!serviceKey && !!bearer && timingSafeEqual(bearer, serviceKey);
}

// Mesmo contorno do platform-sales-brain (que usa `supabase: any` nos helpers):
// o supabase-js@2 sobre Deno colapsa os generics do client e gera TS2345 falso.
// A EF é código de teste — `any` aqui é proporcional e alinhado ao estilo da casa.
type Supa = any;

/** Produto default do funil (mesmo critério do webhook: slug 'nexvybeauty'). */
async function resolveProductId(supabase: Supa): Promise<string | null> {
  const { data } = await supabase
    .from('platform_crm_products')
    .select('id')
    .eq('slug', 'nexvybeauty')
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** id do closer (Bia) ativo no WhatsApp do produto — p/ o golden startWithCloser. */
async function resolveCloserAgentId(supabase: Supa, productId: string): Promise<string | null> {
  const { data } = await supabase
    .from('platform_crm_product_agents')
    .select('id, name, agent_type')
    .eq('product_id', productId)
    .eq('is_active', true)
    .eq('active_in_whatsapp', true);
  const list = (data as Array<Record<string, any>>) || [];
  const closer = list.find((a) => {
    const hay = `${a.agent_type ?? ''} ${a.name ?? ''}`.toLowerCase();
    return hay.includes('closer') || hay.includes('bia');
  });
  return closer?.id ?? null;
}

interface EphemeralConv {
  conversationId: string;
  leadId: string;
  visitorId: string;
}

/** Cria conversa + lead efêmeros p/ um golden (semeia memória se houver seed). */
async function createEphemeral(
  supabase: Supa,
  golden: Golden,
  productId: string,
  closerAgentId: string | null,
): Promise<EphemeralConv> {
  const rand = crypto.randomUUID().slice(0, 8);
  const visitorId = `${EVAL_PREFIX}${golden.id}-${rand}`;

  // Lead efêmero, com memória de qualificação semeada (se o golden pedir).
  const seed = golden.leadSeed;
  const leadMeta = seed
    ? {
        eval: true,
        qualificacao: {
          ...(seed.sub_vertical != null ? { sub_vertical: seed.sub_vertical } : {}),
          ...(seed.tempo_atendimento_meses != null ? { tempo_atendimento_meses: seed.tempo_atendimento_meses } : {}),
          ...(seed.num_clientes != null ? { num_clientes: seed.num_clientes } : {}),
          ...(seed.ticket_medio != null ? { ticket_medio: seed.ticket_medio } : {}),
          ...(seed.recorrencia != null ? { recorrencia: seed.recorrencia } : {}),
          ...(seed.score_0_100 != null ? { score_0_100: seed.score_0_100 } : {}),
        },
      }
    : { eval: true };

  const { data: lead, error: leadErr } = await supabase
    .from('platform_crm_leads')
    .insert({
      name: seed?.name ?? NO_SEND_PHONE,
      phone: NO_SEND_PHONE, // sem dígitos: não colide com lead real por telefone
      source: 'whatsapp',
      lead_channel: 'whatsapp',
      product_id: productId,
      ...(seed?.temperature ? { temperature: seed.temperature } : {}),
      ...(seed?.bant_need ? { bant_need: seed.bant_need } : {}),
      metadata: leadMeta,
    })
    .select('id')
    .single();
  if (leadErr || !lead) throw new Error(`insert lead efêmero: ${leadErr?.message}`);

  const { data: conv, error: convErr } = await supabase
    .from('platform_crm_conversations')
    .insert({
      visitor_id: visitorId,
      visitor_name: seed?.name ?? null,
      visitor_phone: NO_SEND_PHONE,
      visitor_whatsapp: NO_SEND_PHONE,
      channel: 'whatsapp',
      status: 'bot_active',
      needs_human: false,
      product_id: productId,
      lead_id: lead.id,
      // Se o golden simula uma conversa já passada pra Bia, fixa o closer.
      ...(golden.startWithCloser && closerAgentId ? { current_agent_id: closerAgentId } : {}),
    })
    .select('id')
    .single();
  if (convErr || !conv) throw new Error(`insert conversa efêmera: ${convErr?.message}`);

  return { conversationId: conv.id as string, leadId: lead.id as string, visitorId };
}

/** Insere UMA inbound da lead com wa_timestamp no passado (derrota o debounce). */
async function injectInbound(
  supabase: Supa,
  conversationId: string,
  turn: GoldenInbound,
): Promise<void> {
  const agoSec = turn.waAgoSec ?? DEFAULT_WA_AGO_SEC;
  const waTs = Math.floor(Date.now() / 1000) - agoSec; // Unix segundos (string abaixo)
  const { error } = await supabase.from('platform_crm_messages').insert({
    conversation_id: conversationId,
    direction: 'inbound',
    sender_type: 'visitor',
    content: turn.content,
    content_type: 'text',
    metadata: {
      eval: true,
      channel: 'whatsapp_cloud',
      wamid: `eval-${crypto.randomUUID()}`, // único: não colide com dedupe do webhook
      wa_timestamp: String(waTs),
      from: NO_SEND_PHONE,
    },
  });
  if (error) throw new Error(`insert inbound: ${error.message}`);
}

/** Chama o brain (server-to-server, x-brain-secret) e devolve o corpo JSON. */
async function callBrain(conversationId: string): Promise<Record<string, any>> {
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  const secret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), BRAIN_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/functions/v1/platform-sales-brain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-brain-secret': secret },
      body: JSON.stringify({ conversation_id: conversationId }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { http_status: res.status, ...body };
  } catch (e) {
    return { http_status: 0, error: String(e).slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}

/** Lê as bolhas OUTBOUND do bot da conversa, em ordem cronológica (created_at). */
async function readBotBubbles(
  supabase: Supa,
  conversationId: string,
): Promise<Array<{ content: string; created_at: string }>> {
  const { data } = await supabase
    .from('platform_crm_messages')
    .select('content, created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('sender_type', 'bot')
    .order('created_at', { ascending: true });
  return ((data as Array<Record<string, any>>) || []).map((m) => ({
    content: String(m.content ?? ''),
    created_at: String(m.created_at ?? ''),
  }));
}

interface GoldenRunResult {
  id: string;
  title: string;
  goldenPass: boolean;
  score: GoldenScore;
  brain_calls: Array<Record<string, any>>;
  last_turn_text: string;
  all_turns_text: string;
  bubble_count: number;
  error?: string;
}

/**
 * Roda 1 golden de ponta a ponta. Estratégia p/ turnos:
 *   - se ALGUMA inbound é "fresca" (waAgoSec < 25, caso do debounce), a rajada
 *     agrega numa só resposta: injeta tudo e chama o brain UMA vez (é o que a
 *     produção faz — a msg mais nova responde por todas);
 *   - senão, multi-turno: cada inbound (wa_timestamp velho) é um turno
 *     independente e o brain é chamado após cada uma.
 *   O "last turn" avaliado = bolhas surgidas após a ÚLTIMA chamada do brain.
 */
async function runGolden(
  supabase: Supa,
  golden: Golden,
  productId: string,
  closerAgentId: string | null,
): Promise<GoldenRunResult> {
  const eph = await createEphemeral(supabase, golden, productId, closerAgentId);
  const brainCalls: Array<Record<string, any>> = [];
  let bubblesBeforeLastCall = 0;

  try {
    const hasFreshBurst = golden.inbound.some((t) => (t.waAgoSec ?? DEFAULT_WA_AGO_SEC) < 25);

    if (hasFreshBurst) {
      for (const turn of golden.inbound) await injectInbound(supabase, eph.conversationId, turn);
      const before = await readBotBubbles(supabase, eph.conversationId);
      bubblesBeforeLastCall = before.length;
      brainCalls.push(await callBrain(eph.conversationId));
    } else {
      for (let i = 0; i < golden.inbound.length; i++) {
        await injectInbound(supabase, eph.conversationId, golden.inbound[i]);
        const before = await readBotBubbles(supabase, eph.conversationId);
        if (i === golden.inbound.length - 1) bubblesBeforeLastCall = before.length;
        brainCalls.push(await callBrain(eph.conversationId));
        // pequena folga entre turnos p/ o created_at ordenar corretamente
        await sleep(150);
      }
    }

    const allBubbles = await readBotBubbles(supabase, eph.conversationId);
    const lastTurnBubbles = allBubbles.slice(bubblesBeforeLastCall);
    const allTurnsText = allBubbles.map((b) => b.content).join('\n');
    const lastTurnText = lastTurnBubbles.map((b) => b.content).join('\n');

    const score = scoreGolden(golden.assertions, lastTurnText, allTurnsText);

    return {
      id: golden.id,
      title: golden.title,
      goldenPass: score.goldenPass,
      score,
      brain_calls: brainCalls,
      last_turn_text: lastTurnText,
      all_turns_text: allTurnsText,
      bubble_count: allBubbles.length,
    };
  } catch (e) {
    return {
      id: golden.id,
      title: golden.title,
      goldenPass: false,
      score: { total: 0, passed: 0, failed: 0, passRate: 0, results: [], goldenPass: false },
      brain_calls: brainCalls,
      last_turn_text: '',
      all_turns_text: '',
      bubble_count: 0,
      error: String(e).slice(0, 300),
    };
  }
}

/**
 * Limpa TODAS as conversas efêmeras (visitor_id LIKE 'wa:eval-%') e seus
 * satélites (mensagens, notas, leads vinculados). Idempotente: pode rodar a
 * qualquer momento. Retorna as contagens removidas.
 */
async function cleanupEphemeral(supabase: Supa): Promise<Record<string, number>> {
  const { data: convs } = await supabase
    .from('platform_crm_conversations')
    .select('id, lead_id')
    .like('visitor_id', `${EVAL_PREFIX}%`);
  const convList = (convs as Array<Record<string, any>>) || [];
  const convIds = convList.map((c) => c.id);
  const leadIds = [...new Set(convList.map((c) => c.lead_id).filter(Boolean))];

  let msgs = 0, notes = 0, deletedConvs = 0, leads = 0;
  if (convIds.length) {
    // Filhos primeiro (FKs): mensagens e notas por conversa/lead.
    const { count: mc } = await supabase
      .from('platform_crm_messages')
      .delete({ count: 'exact' })
      .in('conversation_id', convIds);
    msgs = mc ?? 0;
    if (leadIds.length) {
      const { count: nc } = await supabase
        .from('platform_crm_lead_notes')
        .delete({ count: 'exact' })
        .in('lead_id', leadIds);
      notes = nc ?? 0;
    }
    const { count: cc } = await supabase
      .from('platform_crm_conversations')
      .delete({ count: 'exact' })
      .in('id', convIds);
    deletedConvs = cc ?? 0;
  }
  if (leadIds.length) {
    // Só apaga leads que marcamos como eval (defesa: nunca toca lead real).
    const { count: lc } = await supabase
      .from('platform_crm_leads')
      .delete({ count: 'exact' })
      .in('id', leadIds)
      .eq('metadata->>eval', 'true');
    leads = lc ?? 0;
  }
  return { conversations: deletedConvs, messages: msgs, notes, leads };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({} as Record<string, any>));

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Modo utilitário: { cleanup: true } → só limpa e sai (idempotente).
  if (body?.cleanup === true) {
    const removed = await cleanupEphemeral(supabase);
    return json({ mode: 'cleanup', removed });
  }

  // Seleção dos goldens a rodar.
  let selected: Golden[];
  if (typeof body?.golden_id === 'string') {
    const g = GOLDENS_BY_ID[body.golden_id];
    if (!g) return json({ error: `golden_id desconhecido: ${body.golden_id}`, available: GOLDENS.map((x) => x.id) }, 400);
    selected = [g];
  } else if (Array.isArray(body?.only) && body.only.length) {
    selected = body.only.map((id: string) => GOLDENS_BY_ID[id]).filter(Boolean);
    if (!selected.length) return json({ error: 'nenhum golden válido em only', available: GOLDENS.map((x) => x.id) }, 400);
  } else {
    selected = GOLDENS;
  }

  const productId = await resolveProductId(supabase);
  if (!productId) {
    return json({ error: 'produto nexvybeauty não encontrado (platform_crm_products.slug=nexvybeauty).' }, 500);
  }
  const closerAgentId = await resolveCloserAgentId(supabase, productId);

  // Limpeza defensiva de qualquer resíduo de rodada anterior antes de começar.
  await cleanupEphemeral(supabase);

  const results: GoldenRunResult[] = [];
  for (const golden of selected) {
    results.push(await runGolden(supabase, golden, productId, closerAgentId));
  }

  // Cleanup final (a menos que keep=true, p/ inspeção manual das conversas).
  let cleanup: Record<string, number> | { skipped: true } = { skipped: true };
  if (body?.keep !== true) cleanup = await cleanupEphemeral(supabase);

  // Placar agregado: goldens que passaram + assertions somadas.
  const goldensPassed = results.filter((r) => r.goldenPass).length;
  const totalAssertions = results.reduce((s, r) => s + r.score.total, 0);
  const passedAssertions = results.reduce((s, r) => s + r.score.passed, 0);
  const assertionPassRate = totalAssertions ? passedAssertions / totalAssertions : 0;

  return json({
    summary: {
      goldens_total: results.length,
      goldens_passed: goldensPassed,
      goldens_pass_rate: results.length ? Number((goldensPassed / results.length).toFixed(4)) : 0,
      assertions_total: totalAssertions,
      assertions_passed: passedAssertions,
      assertions_pass_rate: Number(assertionPassRate.toFixed(4)),
      // GATE do braço: >=90% das assertions passando = agente aprovado.
      gate_90pct: assertionPassRate >= 0.9,
      closer_agent_found: !!closerAgentId,
      cleanup,
    },
    // Detalhe por golden — o "por que falhou" vem de failures[].reason/detail.
    goldens: results.map((r) => ({
      id: r.id,
      title: r.title,
      pass: r.goldenPass,
      passed: r.score.passed,
      total: r.score.total,
      ...(r.error ? { error: r.error } : {}),
      failures: r.score.results
        .filter((x) => !x.pass)
        .map((x) => ({ kind: x.kind, scope: x.scope, reason: x.reason, detail: x.detail })),
      last_turn: r.last_turn_text,
      bubbles: r.bubble_count,
      brain: r.brain_calls.map((b) => ({
        http_status: b.http_status,
        skipped: b.skipped,
        handoff: b.handoff,
        passed_to_bia: b.passed_to_bia,
        bubbles: b.bubbles,
        ...(b.error ? { error: b.error } : {}),
      })),
    })),
  });
});
