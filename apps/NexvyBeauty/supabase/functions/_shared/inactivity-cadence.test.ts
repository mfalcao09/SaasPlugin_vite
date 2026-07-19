// inactivity-cadence.test.ts — GOLDEN suite da RÉGUA DE INATIVIDADE.
// Prova, sem banco/rede, a espec Marcelo 2026-07-19: limiares 8/20/25/35 min,
// inbound ZERA a régua, nunca intervém antes do limiar, idempotência por
// (conversa, ocorrência), e o aviso de janela 23h/24h ancorado na última inbound.
// Roda: deno test supabase/functions/_shared/inactivity-cadence.test.ts

import {
  CADENCE_MAX_OCCURRENCE,
  CADENCE_THRESHOLDS_MIN,
  type CadenceSnapshot,
  decideCadence,
  decideWindowNotice,
  buildInactivityRepertoire,
  parseRepertoireStage,
} from './inactivity-cadence.ts';

function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg} — esperado ${expected}, veio ${actual}`);
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const MIN = 60_000;
const HOUR = 3_600_000;
// T0 sintético (época arbitrária) — nenhum dado real.
const T0 = 1_800_000_000_000;

/** Snapshot base: Duda falou em T0, cliente falou antes (T0-2min), sem intervenção. */
function snap(over: Partial<CadenceSnapshot> = {}): CadenceSnapshot {
  return {
    nowMs: T0,
    lastInboundAtMs: T0 - 2 * MIN,
    lastBotOutboundAtMs: T0,
    occurrence: 0,
    lastInterventionAtMs: null,
    ...over,
  };
}

// ─── Ocorrência correta por limiar ──────────────────────────────────────────

Deno.test('1ª ocorrência dispara aos 8min de silêncio (não antes)', () => {
  // 7min59s de silêncio → nada.
  const before = decideCadence(snap({ nowMs: T0 + 8 * MIN - 1000 }));
  eq(before.action, 'none', 'antes do limiar não intervém');
  assert(before.action === 'none' && before.reason === 'below_threshold', 'motivo = below_threshold');

  // 8min exatos → intervém com ocorrência 1.
  const at = decideCadence(snap({ nowMs: T0 + 8 * MIN }));
  eq(at.action, 'intervene', 'aos 8min intervém');
  assert(at.action === 'intervene' && at.occurrence === 1, 'ocorrência = 1');
});

Deno.test('limiares por ocorrência: 2ª=20min, 3ª=25min, 4ª=35min após a intervenção anterior', () => {
  const cases: Array<{ occ: number; min: number }> = [
    { occ: 1, min: 20 },
    { occ: 2, min: 25 },
    { occ: 3, min: 35 },
  ];
  for (const { occ, min } of cases) {
    // Estado: intervenção `occ` feita em T0 (a msg da Duda da intervenção é a última outbound).
    const base = snap({ occurrence: occ, lastInterventionAtMs: T0, lastInboundAtMs: T0 - HOUR });
    const before = decideCadence({ ...base, nowMs: T0 + min * MIN - 1 });
    eq(before.action, 'none', `ocorrência ${occ + 1}: não intervém antes de ${min}min`);
    const at = decideCadence({ ...base, nowMs: T0 + min * MIN });
    assert(at.action === 'intervene' && at.occurrence === occ + 1, `ocorrência ${occ + 1} aos ${min}min`);
  }
});

Deno.test('limiares exportados batem a espec (8/20/25/35)', () => {
  eq(CADENCE_THRESHOLDS_MIN.join(','), '8,20,25,35', 'limiares da espec');
  eq(CADENCE_MAX_OCCURRENCE, 4, '4 ocorrências no total');
});

// ─── Inbound zera a régua ───────────────────────────────────────────────────

Deno.test('inbound DEPOIS da intervenção zera a régua (reset)', () => {
  const d = decideCadence(snap({
    occurrence: 2,
    lastInterventionAtMs: T0,
    lastInboundAtMs: T0 + 5 * MIN, // cliente respondeu após a 2ª intervenção
    lastBotOutboundAtMs: T0,
    nowMs: T0 + 30 * MIN,
  }));
  eq(d.action, 'reset', 'inbound pós-intervenção → reset');
});

Deno.test('após o reset, a régua recomeça da 1ª ocorrência (8min)', () => {
  // Pós-reset: occurrence=0, Duda respondeu a inbound em T0.
  const d = decideCadence(snap({ occurrence: 0, lastInterventionAtMs: null, nowMs: T0 + 8 * MIN }));
  assert(d.action === 'intervene' && d.occurrence === 1, 'recomeça na 1ª');
});

// ─── Não se intromete quando o turno é do brain ─────────────────────────────

Deno.test('cliente falou por último (sem intervenção pendente) → régua não age', () => {
  const d = decideCadence(snap({
    lastInboundAtMs: T0 + MIN, // inbound MAIS NOVA que a última outbound
    nowMs: T0 + 30 * MIN,
  }));
  assert(d.action === 'none' && d.reason === 'awaiting_bot_reply', 'aguardando resposta do brain');
});

Deno.test('Duda nunca falou → sem régua', () => {
  const d = decideCadence(snap({ lastBotOutboundAtMs: null, nowMs: T0 + HOUR }));
  assert(d.action === 'none' && d.reason === 'bot_never_spoke', 'sem fala do bot não há retomada');
});

// ─── Idempotência ───────────────────────────────────────────────────────────

Deno.test('idempotência: claim feito mas entrega falhou — não re-dispara a mesma ocorrência', () => {
  // Intervenção 1 claimed em T0+10min, mas a outbound gravada é anterior (T0):
  // o relógio conta do CLAIM (max), então aos T0+10min+19min ainda não dispara a 2ª.
  const base = snap({ occurrence: 1, lastInterventionAtMs: T0 + 10 * MIN, lastBotOutboundAtMs: T0, lastInboundAtMs: T0 - HOUR });
  const tooSoon = decideCadence({ ...base, nowMs: T0 + 10 * MIN + 19 * MIN });
  eq(tooSoon.action, 'none', 'não re-dispara antes do limiar seguinte contado do claim');
  const due = decideCadence({ ...base, nowMs: T0 + 10 * MIN + 20 * MIN });
  assert(due.action === 'intervene' && due.occurrence === 2, 'a próxima é a 2ª, nunca repete a 1ª');
});

Deno.test('após a 4ª ocorrência a régua se exaure', () => {
  const d = decideCadence(snap({ occurrence: 4, lastInterventionAtMs: T0, lastInboundAtMs: T0 - HOUR, nowMs: T0 + 2 * HOUR }));
  assert(d.action === 'none' && d.reason === 'cadence_exhausted', 'nunca há 5ª intervenção');
});

// ─── Aviso de janela 24h ────────────────────────────────────────────────────

Deno.test('janela: avisa às 23h da última inbound; nunca antes; expira às 24h', () => {
  const lastInbound = T0;
  eq(decideWindowNotice(T0 + 22 * HOUR, lastInbound, null).action, 'none', '22h → cedo demais');
  eq(decideWindowNotice(T0 + 23 * HOUR, lastInbound, null).action, 'notify', '23h → avisa');
  eq(decideWindowNotice(T0 + 24 * HOUR - 1, lastInbound, null).action, 'notify', '23h59 → ainda avisa');
  eq(decideWindowNotice(T0 + 24 * HOUR, lastInbound, null).action, 'expired', '24h → janela fechada, não envia');
});

Deno.test('janela: NUNCA repete o aviso (notifiedAt preenchido) e ignora conversa sem inbound', () => {
  eq(decideWindowNotice(T0 + 23 * HOUR, T0, T0 + 23 * HOUR).action, 'none', 'já avisada → nunca repete');
  eq(decideWindowNotice(T0 + 23 * HOUR, null, null).action, 'none', 'sem inbound não há janela');
});

// ─── Repertório ─────────────────────────────────────────────────────────────

Deno.test('repertório: cada estágio carrega seus princípios e proibições da espec', () => {
  const s1 = buildInactivityRepertoire(1, 'silêncio de ~8 min');
  assert(s1.includes('DAR UM TOQUE'), 'estágio 1 = dar um toque');
  assert(s1.includes('"agora é sua vez de falar"') && s1.includes('"me conta aí"'), 'estágio 1 lista os literais proibidos');
  assert(s1.includes('silêncio de ~8 min'), 'deadline_context injetado');

  const s2 = buildInactivityRepertoire(2);
  assert(s2.includes('AUSÊNCIA DE FATO'), 'estágio 2 = ausência de fato');
  assert(s2.includes('"Faz sentido para você?"'), 'estágio 2 proíbe o literal "Faz sentido para você?"');
  assert(s2.includes('reagendamento SUAVE'), 'estágio 2 conduz a reagendamento suave');

  const s3 = buildInactivityRepertoire(3);
  assert(s3.includes('LINHA CINZENTA') && s3.includes('MAIS INCISIVA'), 'estágio 3 = linha cinzenta, mais incisiva');
  assert(s3.includes('SEM perguntar isso expressamente'), 'estágio 3 crava sem perguntar expressamente');

  const s4 = buildInactivityRepertoire(4);
  assert(s4.includes('DESPEDIDA') && s4.includes('SEM perguntas'), 'estágio 4 = despedida sem perguntas');
  assert(s4.includes('LEVE INDISPONIBILIDADE'), 'estágio 4 gera desejo com leve indisponibilidade');

  const w = buildInactivityRepertoire('janela_24h');
  assert(w.includes('regra da\n  plataforma') || w.includes('regra da plataforma'), 'aviso usa "regra da plataforma"');
  assert(w.includes('SEM perguntas'), 'aviso sem perguntas');
});

Deno.test('parseRepertoireStage aceita 1-4 e janela_24h; rejeita o resto', () => {
  eq(parseRepertoireStage(1), 1, 'número 1');
  eq(parseRepertoireStage('3'), 3, 'string numérica');
  eq(parseRepertoireStage('janela_24h'), 'janela_24h', 'janela');
  eq(parseRepertoireStage(5), null, '5 inválido');
  eq(parseRepertoireStage('x'), null, 'lixo inválido');
  eq(parseRepertoireStage(null), null, 'null inválido');
});
