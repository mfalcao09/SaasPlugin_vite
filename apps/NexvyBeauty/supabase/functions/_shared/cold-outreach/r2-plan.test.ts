import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  planR2Close,
  planR2CloseOnce,
  r2IdempotencyKey,
} from "./r2-plan.ts";

Deno.test("B1 soft → Joice gold: polite + URL-only, sends=0", () => {
  const p = planR2Close({
    conversationId: "c1",
    eventId: "e1",
    optOutText: "No momento não tenho interesse",
    mode: "shadow",
    greetingName: "Joice",
  });
  assertEquals(p.shouldPlan, true);
  assertEquals(p.optOutKind, "soft");
  assertEquals(p.sends, 0);
  assertEquals(p.bubbles.length, 2);
  assertEquals(
    p.bubbles[0],
    "Sem problemas, Joice! Vou deixar aqui o nosso site para você dar uma olhada com calma, e se tiver interesse é só nos chamar no whatsapp novamente. Combinado?",
  );
  assertEquals(p.bubbles[1], "https://nexvybeauty.com.br");
  assertEquals(p.idempotencyKey, r2IdempotencyKey("c1", "e1", 1));
});

Deno.test("hard PARE/SAIR → zero plan", () => {
  for (const t of ["PARE", "SAIR", "pare de me mandar"]) {
    const p = planR2Close({
      conversationId: "c1",
      eventId: "e-hard",
      optOutText: t,
      mode: "shadow",
    });
    assertEquals(p.shouldPlan, false, t);
    assertEquals(p.optOutKind, "hard");
    assertEquals(p.bubbles.length, 0);
  }
});

Deno.test("replay same key → no duplicate plan", () => {
  const seen = new Set<string>();
  const input = {
    conversationId: "c1",
    eventId: "e1",
    optOutText: "sem interesse",
    mode: "shadow" as const,
  };
  const a = planR2CloseOnce(input, seen);
  const b = planR2CloseOnce(input, seen);
  assertEquals(a.shouldPlan, true);
  assertEquals(b.shouldPlan, false);
  assertEquals(b.skipReason, "duplicate_idempotency_key");
});

Deno.test("30d repeat blocked", () => {
  const p = planR2Close({
    conversationId: "c1",
    eventId: "e2",
    optOutText: "sem interesse",
    mode: "shadow",
    lastR2AtIso: "2026-09-01T00:00:00.000Z",
    nowIso: "2026-09-16T00:00:00.000Z",
  });
  assertEquals(p.shouldPlan, false);
  assertEquals(p.skipReason, "r2_repeat_30d");
});

Deno.test("mode off → no plan", () => {
  const p = planR2Close({
    conversationId: "c1",
    eventId: "e1",
    optOutText: "sem interesse",
    mode: "off",
  });
  assertEquals(p.shouldPlan, false);
});
