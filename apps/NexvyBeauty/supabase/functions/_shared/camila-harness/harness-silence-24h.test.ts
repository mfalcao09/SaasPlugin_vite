// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/harness-silence-24h.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applySilence24hToPool,
  isCountableHumanInbound,
  isSilence24hDue,
  lastHumanInboundAt,
  SILENCE_24H_MS,
} from "./harness-silence-24h.ts";

const T0 = new Date("2026-09-18T12:00:00.000Z");
const T24 = new Date(T0.getTime() + SILENCE_24H_MS);
const T23 = new Date(T0.getTime() + SILENCE_24H_MS - 1);

const RENATA_AWAY =
  "Ola , Tudo bem ? Que bom que entrou em contato para cuidar das suas unhas. Em breve retorno sua mensagem para passar informações e agendamento.";
const ALINY_AWAY =
  "Oiii, tudo bem?! Aqui é Aliny, e caso não te responda em seguida, vou te deixar abaixo o link de agendamento online.";

Deno.test("silence 24h: contacted + no human inbound after last out → pool", () => {
  assertEquals(
    isSilence24hDue({
      stage: "contacted",
      lastOutboundAt: T0,
      lastHumanInboundAt: null,
      now: T24,
    }),
    true,
  );
  assertEquals(applySilence24hToPool({ id: "x", state: "contacted" }).state, "remarketing_pool");
});

Deno.test("silence 24h: still inside window → stay", () => {
  assertEquals(
    isSilence24hDue({
      stage: "contacted",
      lastOutboundAt: T0,
      lastHumanInboundAt: null,
      now: T23,
    }),
    false,
  );
});

Deno.test("silence 24h: human inbound DURING package does not block after last bubble", () => {
  const lastOut = new Date(T0.getTime() + 3600_000);
  assertEquals(
    isSilence24hDue({
      stage: "contacted",
      firstOutboundAt: T0,
      lastOutboundAt: lastOut,
      lastHumanInboundAt: new Date(T0.getTime() + 1800_000),
      now: new Date(lastOut.getTime() + SILENCE_24H_MS),
    }),
    true,
  );
});

Deno.test("silence 24h: human inbound AFTER last bubble → stay", () => {
  const lastOut = new Date(T0.getTime() + 3600_000);
  assertEquals(
    isSilence24hDue({
      stage: "contacted",
      lastOutboundAt: lastOut,
      lastHumanInboundAt: new Date(lastOut.getTime() + 60_000),
      now: new Date(lastOut.getTime() + SILENCE_24H_MS),
    }),
    false,
  );
});

Deno.test("silence 24h: service / missing outbound → stay", () => {
  assertEquals(
    isSilence24hDue({
      stage: "service",
      lastOutboundAt: T0,
      lastHumanInboundAt: null,
      now: T24,
    }),
    false,
  );
  assertEquals(
    isSilence24hDue({
      stage: "contacted",
      lastOutboundAt: null,
      lastHumanInboundAt: null,
      now: T24,
    }),
    false,
  );
});

Deno.test("Renata/Aliny away texts are not human inbound", () => {
  assertEquals(isCountableHumanInbound(RENATA_AWAY), false);
  assertEquals(isCountableHumanInbound(ALINY_AWAY), false);
  assertEquals(isCountableHumanInbound("Oiii"), true);
});

Deno.test("lastHumanInboundAt ignores auto-reply", () => {
  const lastOut = new Date("2026-09-18T13:25:00.000Z");
  const last = lastHumanInboundAt([
    { direction: "inbound", createdAt: new Date("2026-09-18T13:22:12.000Z"), content: ALINY_AWAY },
    { direction: "outbound", createdAt: lastOut, content: "bubble4" },
  ]);
  assertEquals(last, null);
});
