import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertF4Report,
  runF4CanaryRoteiro,
} from "./path-a-canary-harness.ts";

Deno.test("F4 canary roteiro B2–B7 binary counters", () => {
  const { report } = runF4CanaryRoteiro();
  const fails = assertF4Report(report);
  assertEquals(fails, [], `F4 fails: ${fails.join(",")}`);
  assertEquals(report.farewell_outbound, 0);
  assertEquals(report.clarify_bubbles, 1);
  assertEquals(report.reopen_bubbles, 2);
  assertEquals(report.cold_tick_openings, 0);
  assertEquals(report.r2_sends, 0);
  assertEquals(report.hard_dnc, true);
});
