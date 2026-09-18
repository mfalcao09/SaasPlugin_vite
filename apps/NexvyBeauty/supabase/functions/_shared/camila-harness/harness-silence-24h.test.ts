// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/harness-silence-24h.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applySilence24hToPool,
  isSilence24hDue,
  SILENCE_24H_MS,
} from "./harness-silence-24h.ts";

const T0 = new Date("2026-09-18T12:00:00.000Z");
const T24 = new Date(T0.getTime() + SILENCE_24H_MS);
const T23 = new Date(T0.getTime() + SILENCE_24H_MS - 1);

Deno.test("silence 24h: contacted + no inbound after first out → pool", () => {
  assertEquals(
    isSilence24hDue({
      stage: "contacted",
      firstOutboundAt: T0,
      lastOutboundAt: T0,
      lastInboundAt: null,
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
      firstOutboundAt: T0,
      lastOutboundAt: T0,
      lastInboundAt: null,
      now: T23,
    }),
    false,
  );
});

Deno.test("silence 24h: inbound after first outbound (Andressa) → stay", () => {
  assertEquals(
    isSilence24hDue({
      stage: "contacted",
      firstOutboundAt: T0,
      lastOutboundAt: new Date(T0.getTime() + 3600_000),
      lastInboundAt: new Date(T0.getTime() + 1800_000),
      now: T24,
    }),
    false,
  );
});

Deno.test("silence 24h: service / remarketing / missing outbound → stay", () => {
  assertEquals(
    isSilence24hDue({
      stage: "service",
      firstOutboundAt: T0,
      lastOutboundAt: T0,
      lastInboundAt: null,
      now: T24,
    }),
    false,
  );
  assertEquals(
    isSilence24hDue({
      stage: "contacted",
      firstOutboundAt: null,
      lastOutboundAt: null,
      lastInboundAt: null,
      now: T24,
    }),
    false,
  );
});
