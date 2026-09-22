import { assertEquals } from "jsr:@std/assert@1";

const shared = new URL("../", import.meta.url);
const brain = await Deno.readTextFile(
  new URL("platform-sales-brain/index.ts", shared),
);

Deno.test("PRD-06 wiring: Camila QR loads canonical ficha before reply", () => {
  assertEquals(brain.includes("loadCanonicalLeadContext"), true);
  assertEquals(brain.includes("skipped: 'ficha_missing'"), true);
  assertEquals(brain.includes("FICHA CANÔNICA DO LEAD"), true);
  const load = brain.indexOf("loadCanonicalLeadContext");
  const llm = brain.indexOf("chat/completions");
  assertEquals(load >= 0 && load < llm, true);
});

Deno.test("PRD-06 wiring: opaque inbound skips LLM with fixed clarify", () => {
  assertEquals(brain.includes("forceOpaqueClarify"), true);
  assertEquals(brain.includes("isOpaqueInbound"), true);
  assertEquals(brain.includes("OPAQUE_CLARIFY"), true);
  assertEquals(brain.includes("if (forceOpaqueClarify)"), true);
});

Deno.test("PRD-06 wiring: commercial truth validates bubbles against plans", () => {
  assertEquals(brain.includes("validateCommercialTruth"), true);
  assertEquals(brain.includes("allowlistFromPlans"), true);
  assertEquals(brain.includes("commercial truth blocked"), true);
});
