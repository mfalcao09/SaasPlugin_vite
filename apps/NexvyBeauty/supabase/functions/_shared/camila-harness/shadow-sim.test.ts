// deno test --allow-read supabase/functions/_shared/camila-harness/shadow-sim.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runAllScenarios, SCENARIO_IDS } from "./shadow-sim.ts";
import { mensagemDeSaidaBubbles, makeMensagemDeSaidaEnvelopes } from "./exit-message.ts";
import { triageInbound } from "./triage.ts";

Deno.test("L1 shadow: all PRD §7 scenarios PASS + realSends=0", () => {
  const results = runAllScenarios();
  assertEquals(results.length, SCENARIO_IDS.length);
  for (const r of results) {
    if (!r.pass) {
      throw new Error(`FAIL ${r.id}: ${r.detail}`);
    }
    assertEquals(r.realSends, 0, `${r.id} realSends`);
  }
});

Deno.test("Mensagem de Saída: 2 bubbles (text + site)", () => {
  const b = mensagemDeSaidaBubbles("Maria");
  assertEquals(b.length, 2);
  assertEquals(b[0].includes("Sem problemas"), true);
  assertEquals(b[1].includes("nexvy"), true);
});

Deno.test("Mensagem de Saída: envelopes texto→link com preview", () => {
  const envs = makeMensagemDeSaidaEnvelopes({
    phone: "5585996074889",
    conversationId: "c1",
    greetingName: "Victória",
    now: new Date("2026-09-18T15:00:00.000Z"),
    triage: "soft",
  });
  assertEquals(envs.length, 2);
  assertEquals(envs[0].bubbleIndex, 1);
  assertEquals(envs[0].sendAs, "text");
  assertEquals(envs[0].text.includes("Victória"), true);
  assertEquals(envs[1].bubbleIndex, 2);
  assertEquals(envs[1].sendAs, "link");
  assertEquals(envs[1].linkPreview?.linkUrl.includes("nexvybeauty.com.br"), true);
  assertEquals(Date.parse(envs[1].notBeforeIso) > Date.parse(envs[0].notBeforeIso), true);
});

Deno.test("goodbye only after exit", () => {
  const before = triageInbound("Pode deixar", { exitAlreadySent: false });
  const after = triageInbound("Pode deixar", { exitAlreadySent: true });
  assertEquals(after.class, "goodbye");
  // before exit: not goodbye (may be neutral)
  assertEquals(before.class === "goodbye", false);
});
