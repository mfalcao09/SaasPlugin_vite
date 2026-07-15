// deno test — prova o planejador de inbound (opt-out para cadência; quero→handoff).
//   deno test --no-check supabase/functions/_shared/cold-outreach/inbound-plan.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { planInbound, type QueueRowRef } from "./inbound-plan.ts";

const rows: QueueRowRef[] = [
  { id: "q1", lead_id: null, handle: "salao_x", product_id: "prod-1" },
  { id: "q2", lead_id: null, handle: "salao_x", product_id: "prod-1" },
];
const ctx = { product_id: "prod-1", conversation_id: "conv-1", telefone: "55 (41) 98503-6800", handle: "salao_x" };

Deno.test("opt-out: grava supressão, para cadência, silencia conversa, NÃO faz handoff", () => {
  const p = planInbound("quero SAIR dessa lista", rows, ctx);
  assertEquals(p.intent, "opt_out");
  assertEquals(p.optOut?.product_id, "prod-1");
  assertEquals(p.optOut?.telefone, "5541985036800"); // dígitos normalizados
  assertEquals(p.queueStatus, "opted_out");
  assertEquals(p.clearFollowups, true);
  assertEquals(p.handoff, false);
  assertEquals(p.silenceConversation, true);
});

Deno.test("want: handoff pra Duda, para cadência, sem opt-out", () => {
  const p = planInbound("quero ver o raio-x", rows, ctx);
  assertEquals(p.intent, "want");
  assertEquals(p.handoff, true);
  assertEquals(p.queueStatus, "handed_off");
  assertEquals(p.optOut, null);
  assertEquals(p.clearFollowups, true);
});

Deno.test("want SEM conversa: cai em 'replied' (não dá pra fazer handoff sem thread)", () => {
  const p = planInbound("quero", rows, { ...ctx, conversation_id: null });
  assertEquals(p.handoff, false);
  assertEquals(p.queueStatus, "replied");
});

Deno.test("neutral: só para follow-ups (stop-on-response), sem opt-out/handoff", () => {
  const p = planInbound("oi, quem é você?", rows, ctx);
  assertEquals(p.intent, "neutral");
  assertEquals(p.queueStatus, "replied");
  assertEquals(p.handoff, false);
  assertEquals(p.optOut, null);
  assertEquals(p.clearFollowups, true);
});

Deno.test("opt-out sem product_id conhecido: plano sem gravação de optout (mas para cadência)", () => {
  const p = planInbound("pare", [{ id: "q9" }], { conversation_id: "c", product_id: null });
  assertEquals(p.intent, "opt_out");
  assertEquals(p.optOut, null); // sem product não grava
  assertEquals(p.queueStatus, "opted_out");
});
