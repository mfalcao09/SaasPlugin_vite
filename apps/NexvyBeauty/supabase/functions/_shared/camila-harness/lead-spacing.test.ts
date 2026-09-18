// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/lead-spacing.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  sampleLeadSpacingMs,
  afterFirstBubbleSent,
  canOpenNextLeadFirstBubble,
  emptyLeadSpacing,
  LEAD_SPACING_MIN_MS,
  LEAD_SPACING_MAX_MS,
} from "./lead-spacing.ts";

Deno.test("sampleLeadSpacingMs fica em [42s, 197s]", () => {
  const fixed = (u: number) => () => u;
  assertEquals(sampleLeadSpacingMs(undefined, fixed(0)), LEAD_SPACING_MIN_MS);
  assertEquals(sampleLeadSpacingMs(undefined, fixed(1)), LEAD_SPACING_MAX_MS);
  const mid = sampleLeadSpacingMs(undefined, fixed(0.5));
  assertEquals(mid >= LEAD_SPACING_MIN_MS && mid <= LEAD_SPACING_MAX_MS, true);
});

Deno.test("após bolha 1: próximo lead bloqueado até not_before", () => {
  const t0 = new Date("2026-09-19T12:00:00.000Z");
  const rng = () => 0; // exatamente 42s
  const st = afterFirstBubbleSent(emptyLeadSpacing(), t0, undefined, rng);
  assertEquals(st.lastSampledMs, 42_000);
  assertEquals(st.nextLeadNotBeforeIso, "2026-09-19T12:00:42.000Z");

  const early = canOpenNextLeadFirstBubble(st, new Date("2026-09-19T12:00:41.000Z"));
  assertEquals(early.allowed, false);
  assertEquals(early.reason, "lead_spacing_wait");

  const ok = canOpenNextLeadFirstBubble(st, new Date("2026-09-19T12:00:42.000Z"));
  assertEquals(ok.allowed, true);
});

Deno.test("sem bolha 1 prévia: abertura liberada", () => {
  const v = canOpenNextLeadFirstBubble(emptyLeadSpacing(), new Date());
  assertEquals(v.allowed, true);
  assertEquals(v.reason, "no_prior_first_bubble");
});
