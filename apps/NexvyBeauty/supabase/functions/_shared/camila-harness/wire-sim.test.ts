// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/wire-sim.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runWireScenarios, WIRE_SCENARIO_IDS } from "./wire-sim.ts";

Deno.test("L2 WIRE: all scenarios PASS + realSends=0", () => {
  const results = runWireScenarios();
  assertEquals(results.length, WIRE_SCENARIO_IDS.length);
  for (const r of results) {
    if (!r.pass) throw new Error(`FAIL ${r.id}: ${r.detail}`);
    assertEquals(r.realSends, 0, r.id);
  }
});
