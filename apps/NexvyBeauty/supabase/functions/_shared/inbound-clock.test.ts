/**
 * Testes do PR-D — relógio da inbound e aritmética do debounce.
 *
 * Rodar:
 *   deno test --no-check apps/NexvyBeauty/supabase/functions/_shared/inbound-clock.test.ts
 *
 * A espinha destes testes é uma cicatriz, não cerimônia. Antes deste módulo, DOIS
 * diagnósticos errados sobreviveram até quase virar código:
 *
 *   (1) "o debounce usa o gatilho errado" — falso, triggerInbound É a inbound mais
 *       recente. Coberto pelos CONTROLES NEGATIVOS, que assertam que o caso sem
 *       defasagem continua idêntico ao comportamento antigo.
 *   (2) "a janela encolhe porque o relógio corre enquanto o bot entrega bolhas" —
 *       falso, o sleep tem deadline ABSOLUTO. Coberto pelo bloco `deadline absoluto`,
 *       que asserta exatamente isso, pra ninguém "consertar" um não-bug de novo.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { debounceWaitMs, inboundEpochMs } from './inbound-clock.ts';

const DEBOUNCE_MS = 12_000; // mesmo default do platform-sales-brain:87
const AGORA = Date.parse('2026-08-06T05:00:00.000Z');

/** Constrói uma inbound sintética. `waAgoSec`/`createdAgoMs` = idade a partir de AGORA. */
function inbound(opts: { waAgoSec?: number | null; createdAgoMs?: number | null }) {
  const m: Record<string, unknown> = {};
  if (opts.waAgoSec != null) {
    // A Meta manda epoch em SEGUNDOS, e o webhook persiste como STRING.
    m.metadata = { wa_timestamp: String(Math.floor((AGORA - opts.waAgoSec * 1000) / 1000)) };
  }
  if (opts.createdAgoMs != null) {
    m.created_at = new Date(AGORA - opts.createdAgoMs).toISOString();
  }
  return m as { metadata?: unknown; created_at?: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// O DEFEITO MEDIDO — áudio transcrito
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('DEFEITO: áudio transcrito (wa 12s atrás, linha nasce agora) NÃO pode zerar o debounce', () => {
  // A transcrição roda antes do INSERT: o wa_timestamp é de 12s atrás, mas a linha
  // só ficou visível AGORA. Ancorando só no relógio do mundo, ageMs = 12000 e o
  // debounce vira no-op — foi exatamente isto que produziu resposta instantânea.
  const m = inbound({ waAgoSec: 12, createdAgoMs: 0 });

  const ref = inboundEpochMs(m);
  assertEquals(ref, AGORA, 'deve ancorar na VISIBILIDADE, não no relógio do mundo');

  const espera = debounceWaitMs(ref, AGORA, DEBOUNCE_MS);
  assertEquals(espera, DEBOUNCE_MS, 'janela CHEIA — a rajada volta a coalescer');
});

Deno.test('DEFEITO (regressão): o comportamento ANTIGO daria espera 0 — prova que o fix não é no-op', () => {
  const m = inbound({ waAgoSec: 12, createdAgoMs: 0 });

  // Reprodução literal do código antigo: wa_timestamp com fallback pra created_at.
  const meta = (m.metadata ?? {}) as Record<string, string>;
  const antigoRef = Number(meta.wa_timestamp) * 1000;
  const antigaEspera = debounceWaitMs(antigoRef, AGORA, DEBOUNCE_MS);
  assertEquals(antigaEspera, 0, 'o código antigo de fato zerava a janela');

  const novaEspera = debounceWaitMs(inboundEpochMs(m), AGORA, DEBOUNCE_MS);
  assertEquals(novaEspera, DEBOUNCE_MS);

  // Se algum dia estes dois derem igual, a correção virou decorativa.
  assertEquals(antigaEspera === novaEspera, false, 'antigo e novo TÊM que divergir aqui');
});

Deno.test('defasagem parcial (áudio curto, 4s): sobra a janela contada da visibilidade', () => {
  const m = inbound({ waAgoSec: 4, createdAgoMs: 1_000 });
  assertEquals(inboundEpochMs(m), AGORA - 1_000);
  assertEquals(debounceWaitMs(inboundEpochMs(m), AGORA, DEBOUNCE_MS), 11_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLES NEGATIVOS — o caminho feliz NÃO pode mudar
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('CONTROLE NEGATIVO: texto normal (sem defasagem) mantém o comportamento antigo', () => {
  // Texto puro: o webhook insere na hora, wa_timestamp ≈ created_at. O relógio do
  // mundo continua mandando e a espera é a mesma de antes do PR-D.
  const m = inbound({ waAgoSec: 5, createdAgoMs: 5_000 });
  assertEquals(inboundEpochMs(m), AGORA - 5_000);
  assertEquals(debounceWaitMs(inboundEpochMs(m), AGORA, DEBOUNCE_MS), 7_000);
});

Deno.test('CONTROLE NEGATIVO: lead calada há muito tempo continua tendo resposta imediata', () => {
  // Silêncio REAL (não defasagem): a lead sumiu 5 min e voltou. Nada a coalescer —
  // segurar aqui seria fazer a lead esperar à toa.
  const m = inbound({ waAgoSec: 300, createdAgoMs: 300_000 });
  assertEquals(debounceWaitMs(inboundEpochMs(m), AGORA, DEBOUNCE_MS), 0);
});

Deno.test('CONTROLE NEGATIVO: janela desligada (DEBOUNCE_MS=0) nunca segura', () => {
  const m = inbound({ waAgoSec: 0, createdAgoMs: 0 });
  assertEquals(debounceWaitMs(inboundEpochMs(m), AGORA, 0), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// DEADLINE ABSOLUTO — a lição que derrubou o diagnóstico anterior
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('deadline absoluto: a janela NÃO encolhe — só o resto dela diminui', () => {
  // Mesma mensagem, avaliada em três instantes diferentes (simula re-invocações de
  // hand-back). O INSTANTE DE DESPERTAR é o mesmo nos três: referencia + janela.
  const m = inbound({ waAgoSec: 0, createdAgoMs: 0 });
  const ref = inboundEpochMs(m)!;

  for (const decorrido of [0, 2_604, 8_320]) {
    const agora = AGORA + decorrido;
    const espera = debounceWaitMs(ref, agora, DEBOUNCE_MS);
    assertEquals(
      agora + espera,
      ref + DEBOUNCE_MS,
      `desperta sempre em ref+janela (decorrido=${decorrido}ms)`,
    );
  }
});

Deno.test('deadline absoluto: a série 9396→3680→0 é a janela SENDO CONSUMIDA, não degradação', () => {
  // Os três números medidos em produção 2026-08-06. Se alguém os reencontrar em
  // log, este teste é a prova de que são comportamento correto — o defeito estava
  // no RELÓGIO, não na aritmética.
  const ref = AGORA;
  assertEquals(debounceWaitMs(ref, AGORA + 2_604, DEBOUNCE_MS), 9_396);
  assertEquals(debounceWaitMs(ref, AGORA + 8_320, DEBOUNCE_MS), 3_680);
  assertEquals(debounceWaitMs(ref, AGORA + 12_000, DEBOUNCE_MS), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// BORDAS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('borda: sem wa_timestamp cai em created_at', () => {
  const m = inbound({ createdAgoMs: 3_000 });
  assertEquals(inboundEpochMs(m), AGORA - 3_000);
});

Deno.test('borda: sem created_at usa wa_timestamp', () => {
  const m = inbound({ waAgoSec: 3 });
  assertEquals(inboundEpochMs(m), AGORA - 3_000);
});

Deno.test('borda: inbound nula, sem relógio nenhum e lixo ⇒ null e espera 0 (não segura)', () => {
  assertEquals(inboundEpochMs(null), null);
  assertEquals(inboundEpochMs({}), null);
  assertEquals(inboundEpochMs({ metadata: 'nao-e-objeto', created_at: null }), null);
  assertEquals(inboundEpochMs({ metadata: { wa_timestamp: 'abc' }, created_at: 'data-invalida' }), null);
  assertEquals(debounceWaitMs(null, AGORA, DEBOUNCE_MS), 0);
});

Deno.test('borda: wa_timestamp numérico (não só string) é aceito', () => {
  const m = { metadata: { wa_timestamp: Math.floor((AGORA - 6_000) / 1000) } };
  assertEquals(inboundEpochMs(m), AGORA - 6_000);
});

Deno.test('borda: wa_timestamp zero/negativo é lixo, não epoch — cai em created_at', () => {
  const created = new Date(AGORA - 2_000).toISOString();
  assertEquals(inboundEpochMs({ metadata: { wa_timestamp: '0' }, created_at: created }), AGORA - 2_000);
  assertEquals(inboundEpochMs({ metadata: { wa_timestamp: '-5' }, created_at: created }), AGORA - 2_000);
});

Deno.test('borda: relógio da Meta adiantado (wa no futuro) faz esperar mais, nunca menos', () => {
  // Clock skew do lado da Meta. `max` devolve o futuro ⇒ idade negativa ⇒ o
  // Math.min trava na janela cheia. Conservador de propósito.
  const m = inbound({ waAgoSec: -30, createdAgoMs: 0 });
  assertEquals(debounceWaitMs(inboundEpochMs(m), AGORA, DEBOUNCE_MS), DEBOUNCE_MS);
});
