// deno test — prova o núcleo anti-ban com DADOS SEMEADOS, sem tocar no banco.
//   deno test --no-check supabase/functions/_shared/cold-outreach/anti-ban.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  canSendNow,
  DEFAULT_JITTER,
  DEFAULT_KILLSWITCH,
  DEFAULT_WARMUP,
  DEFAULT_WINDOW,
  dedupeOk,
  jitterMs,
  killSwitch,
  remainingToday,
  warmupCapForDay,
  warmupDayFromFirstSend,
  withinWindow,
  zonedParts,
} from "./anti-ban.ts";

Deno.test("warm-up ramp: começa 20, dobra a cada 2 dias, satura em 200", () => {
  assertEquals(warmupCapForDay(DEFAULT_WARMUP, 1), 20);
  assertEquals(warmupCapForDay(DEFAULT_WARMUP, 2), 20);
  assertEquals(warmupCapForDay(DEFAULT_WARMUP, 3), 40);
  assertEquals(warmupCapForDay(DEFAULT_WARMUP, 5), 80);
  assertEquals(warmupCapForDay(DEFAULT_WARMUP, 7), 160);
  assertEquals(warmupCapForDay(DEFAULT_WARMUP, 9), 200); // 320 → cap 200
  assertEquals(warmupCapForDay(DEFAULT_WARMUP, 99), 200);
  assertEquals(warmupCapForDay(DEFAULT_WARMUP, 0), 0);
});

Deno.test("warmupDayFromFirstSend: 1-indexado, nunca < 1", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  assertEquals(warmupDayFromFirstSend(null, now), 1);
  assertEquals(warmupDayFromFirstSend(new Date("2026-07-15T09:00:00Z"), now), 1);
  assertEquals(warmupDayFromFirstSend(new Date("2026-07-14T09:00:00Z"), now), 2);
  assertEquals(warmupDayFromFirstSend(new Date("2026-07-09T09:00:00Z"), now), 7);
});

Deno.test("remainingToday: teto - enviados, nunca negativo", () => {
  assertEquals(remainingToday(DEFAULT_WARMUP, 1, 0), 20);
  assertEquals(remainingToday(DEFAULT_WARMUP, 1, 15), 5);
  assertEquals(remainingToday(DEFAULT_WARMUP, 1, 20), 0);
  assertEquals(remainingToday(DEFAULT_WARMUP, 1, 999), 0);
});

Deno.test("jitter: sempre dentro de [40s,180s] com rng determinístico", () => {
  assertEquals(jitterMs(DEFAULT_JITTER, () => 0), 40_000);
  assertEquals(jitterMs(DEFAULT_JITTER, () => 0.999999), 180_000);
  assertEquals(jitterMs(DEFAULT_JITTER, () => 0.5), 40_000 + Math.floor(0.5 * 140_001));
  // sem rng fixo: ainda dentro da faixa
  for (let i = 0; i < 100; i++) {
    const j = jitterMs();
    if (j < 40_000 || j > 180_000) throw new Error(`jitter fora da faixa: ${j}`);
  }
});

Deno.test("janela: seg 10h dentro; sáb fora; seg 8h fora; seg 18h fora (exclusivo)", () => {
  const tz = DEFAULT_WINDOW.timeZone;
  // 2026-07-13 é uma segunda-feira. 13:00Z = 10:00 em São Paulo (UTC-3).
  assertEquals(withinWindow(new Date("2026-07-13T13:00:00Z")), true);
  // sábado 2026-07-11 13:00Z
  assertEquals(withinWindow(new Date("2026-07-11T13:00:00Z")), false);
  // segunda 11:00Z = 08:00 SP → fora (antes das 9)
  assertEquals(withinWindow(new Date("2026-07-13T11:00:00Z")), false);
  // segunda 21:00Z = 18:00 SP → fora (endHour exclusivo)
  assertEquals(withinWindow(new Date("2026-07-13T21:00:00Z")), false);
  // sanity do zonedParts
  const p = zonedParts(new Date("2026-07-13T13:00:00Z"), tz);
  assertEquals(p.hour, 10);
  assertEquals(p.weekday, 1);
});

Deno.test("dedupe: bloqueia dentro de 24h, libera depois / se nunca tocado", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  assertEquals(dedupeOk(null, now), true);
  assertEquals(dedupeOk(new Date("2026-07-15T01:00:00Z"), now), false); // 11h
  assertEquals(dedupeOk(new Date("2026-07-14T11:00:00Z"), now), true); // 25h
});

Deno.test("kill-switch: tripa por falhas consecutivas mesmo sem amostra", () => {
  const v = killSwitch({ sent: 3, blocked: 0, reported: 0, consecutiveFailures: 10 });
  assertEquals(v.tripped, true);
});

Deno.test("kill-switch: tripa por block-rate acima do limiar (com amostra)", () => {
  const v = killSwitch({ sent: 100, blocked: 6, reported: 0, consecutiveFailures: 0 });
  assertEquals(v.tripped, true); // 6% > 5%
  const ok = killSwitch({ sent: 100, blocked: 4, reported: 0, consecutiveFailures: 0 });
  assertEquals(ok.tripped, false); // 4% <= 5%
});

Deno.test("kill-switch: NÃO tripa em amostra pequena (n < minSample)", () => {
  const v = killSwitch({ sent: 5, blocked: 5, reported: 0, consecutiveFailures: 0 });
  assertEquals(v.tripped, false); // 100% block mas n<20 → não avalia taxa
});

Deno.test("kill-switch: tripa por report-rate acima do limiar", () => {
  const v = killSwitch({ sent: 100, blocked: 0, reported: 3, consecutiveFailures: 0 });
  assertEquals(v.tripped, true); // 3% > 2%
});

/** Campanha ARMADA — o veredito que o ciclo de vida devolve no caminho feliz. */
const ARMADA = { armada: true, motivo: null, transicao: null } as const;

Deno.test("canSendNow: portão composto — libera só armada, na janela, com cota, sem kill", () => {
  const base = {
    now: new Date("2026-07-13T13:00:00Z"), // seg 10h SP
    window: DEFAULT_WINDOW,
    warmup: DEFAULT_WARMUP,
    warmupDay: 1,
    sentToday: 0,
    killStats: { sent: 0, blocked: 0, reported: 0, consecutiveFailures: 0 },
    killCfg: DEFAULT_KILLSWITCH,
    lifecycle: ARMADA,
  };
  assertEquals(canSendNow(base).canSend, true);
  assertEquals(canSendNow({ ...base, sentToday: 20 }).reason, "daily_cap_reached");
  assertEquals(canSendNow({ ...base, now: new Date("2026-07-13T21:00:00Z") }).reason, "outside_window");
  const killed = canSendNow({
    ...base,
    killStats: { sent: 100, blocked: 6, reported: 0, consecutiveFailures: 0 },
  });
  assertEquals(killed.canSend, false);
  if (!killed.reason?.startsWith("kill_switch:")) throw new Error("esperava kill_switch");
});

Deno.test("canSendNow: campanha DESARMADA é recusada, mesmo com tudo o mais perfeito", () => {
  // Antes, este caso passava batido: o portão recebia `campaignPaused`, calculado
  // como `status === "paused"` DEPOIS de uma query que já filtrava
  // `in (active, warming)` — nunca podia ser true. Este teste é o que impede a
  // reintrodução daquele bit morto.
  const v = canSendNow({
    now: new Date("2026-07-13T13:00:00Z"), // seg 10h SP: janela ABERTA
    window: DEFAULT_WINDOW,
    warmup: DEFAULT_WARMUP,
    warmupDay: 1,
    sentToday: 0, // cota inteira disponível
    killStats: { sent: 0, blocked: 0, reported: 0, consecutiveFailures: 0 },
    killCfg: DEFAULT_KILLSWITCH,
    lifecycle: { armada: false, motivo: "nao_autorizada", transicao: null },
  });
  assertEquals(v.canSend, false);
  assertEquals(v.reason, "lifecycle:nao_autorizada");
});

Deno.test("canSendNow: o ciclo de vida vem ANTES da janela — motivo mais fundamental vence", () => {
  // Campanha não autorizada E fora da janela: o motivo relatado tem de ser a
  // falta de autorização. Dizer "outside_window" faria o operador esperar as 9h
  // por algo que nunca dispararia.
  const v = canSendNow({
    now: new Date("2026-07-13T21:00:00Z"), // 18h SP: FORA da janela
    window: DEFAULT_WINDOW,
    warmup: DEFAULT_WARMUP,
    warmupDay: 1,
    sentToday: 0,
    killStats: { sent: 0, blocked: 0, reported: 0, consecutiveFailures: 0 },
    killCfg: DEFAULT_KILLSWITCH,
    lifecycle: { armada: false, motivo: "nao_autorizada", transicao: null },
  });
  assertEquals(v.reason, "lifecycle:nao_autorizada");
});

// ─────────────────────────────────────────────────────────────────────────────
// TAXA DE NÃO-ENTREGA — o único sinal REAL de queima de número
//
// Contexto (auditoria 2026-08-06): os ramos de blockRate/reportRate NÃO PODEM
// disparar, e não por falta de trabalho — o WhatsApp não notifica bloqueio nem
// denúncia. Quando alguém bloqueia, a mensagem só para de ser entregue.
// A não-entrega é o proxy que existe: MESSAGES_UPDATE chega de verdade.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = { blocked: 0, reported: 0, consecutiveFailures: 0 };

Deno.test("não-entrega: CONTROLE NEGATIVO — delivered undefined NÃO acusa", () => {
  // Quem não sabe informar `delivered` não recebe veredito. Campo ausente jamais
  // vira acusação — mesma regra do conversation_state (campo em dúvida OMITE).
  // Se este cair, o motor passa a pausar campanha por falta de dado.
  const v = killSwitch({ ...BASE, sent: 100 }, DEFAULT_KILLSWITCH);
  assertEquals(v.tripped, false);
  assertEquals(v.reason, null);
});

Deno.test("não-entrega: CONTROLE NEGATIVO — delivered 0 com amostra PEQUENA não acusa", () => {
  // ACK demora. Tratar "ainda não entregou" como "nunca vai" pausaria a campanha
  // por impaciência, logo no começo, quando ninguém teve tempo de receber.
  const v = killSwitch({ ...BASE, sent: 29, delivered: 0 }, DEFAULT_KILLSWITCH);
  assertEquals(v.tripped, false, "abaixo de minSampleDelivery (30) não opina");
});

Deno.test("não-entrega: número SAUDÁVEL não é pausado", () => {
  // 95% de entrega — comportamento normal. Se isto tripar, o gate mata campanha boa.
  const v = killSwitch({ ...BASE, sent: 100, delivered: 95 }, DEFAULT_KILLSWITCH);
  assertEquals(v.tripped, false);
});

Deno.test("não-entrega: número QUEIMANDO é pausado", () => {
  // 50 enviadas, 20 entregues ⇒ 60% de não-entrega. É a assinatura de bloqueio em
  // massa: o envio continua retornando sucesso e a mensagem não chega.
  const v = killSwitch({ ...BASE, sent: 50, delivered: 20 }, DEFAULT_KILLSWITCH);
  assertEquals(v.tripped, true);
  assertEquals(v.reason?.includes("undelivered_rate"), true);
  assertEquals(v.reason?.includes("queimando"), true);
});

Deno.test("não-entrega: exatamente NO limiar não tripa (só ACIMA)", () => {
  // 40% exato com teto 0.4 ⇒ não tripa. Fronteira explícita: `>` e não `>=`.
  const v = killSwitch({ ...BASE, sent: 100, delivered: 60 }, DEFAULT_KILLSWITCH);
  assertEquals(v.tripped, false, "40% == teto: tolera");
  const v2 = killSwitch({ ...BASE, sent: 100, delivered: 59 }, DEFAULT_KILLSWITCH);
  assertEquals(v2.tripped, true, "41% > teto: pausa");
});

Deno.test("não-entrega: limiar e amostra são CONFIGURÁVEIS", () => {
  const rigoroso = { ...DEFAULT_KILLSWITCH, maxUndeliveredRate: 0.1, minSampleDelivery: 10 };
  const v = killSwitch({ ...BASE, sent: 10, delivered: 8 }, rigoroso);
  assertEquals(v.tripped, true, "20% > 10% na config rigorosa");
});

Deno.test("não-entrega: falha de ENVIO consecutiva continua tendo precedência", () => {
  // O ramo antigo não pode ser encoberto pelo novo: número morto pausa na hora,
  // sem esperar amostra de entrega.
  const v = killSwitch(
    { sent: 5, blocked: 0, reported: 0, consecutiveFailures: 10, delivered: 5 },
    DEFAULT_KILLSWITCH,
  );
  assertEquals(v.tripped, true);
  assertEquals(v.reason?.includes("consecutive_send_failures"), true);
});
