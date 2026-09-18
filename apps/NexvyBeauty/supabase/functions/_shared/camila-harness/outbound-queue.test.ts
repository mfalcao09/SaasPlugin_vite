// deno test --allow-read --no-check supabase/functions/_shared/camila-harness/outbound-queue.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  emptyOutboundQueue,
  enqueue,
  pickNext,
  deliverPicked,
  makeOpenBubble1Envelope,
  makeContinueEnvelope,
  makeReplyEnvelope,
} from "./outbound-queue.ts";

const T0 = new Date("2026-09-19T12:00:00.000Z");

Deno.test("nunca entrega antes de not_before", () => {
  let q = emptyOutboundQueue();
  q = enqueue(
    q,
    makeOpenBubble1Envelope({
      id: "e1",
      leadId: "A",
      conversationId: "cA",
      text: "oi A",
      notBefore: new Date(T0.getTime() + 60_000),
    }),
  );
  const early = pickNext(q, T0);
  assertEquals(early.envelope, null);
  assertEquals(early.reason, "none_due");

  const due = pickNext(q, new Date(T0.getTime() + 60_000));
  assertEquals(due.envelope?.leadId, "A");
  assertEquals(due.envelope?.text, "oi A");
});

Deno.test("envelope leva leadId: texto de A não vira pick de B", () => {
  let q = emptyOutboundQueue();
  q = enqueue(
    q,
    makeOpenBubble1Envelope({
      id: "a1",
      leadId: "A",
      conversationId: "cA",
      text: "texto-da-A",
      notBefore: T0,
    }),
  );
  q = enqueue(
    q,
    makeOpenBubble1Envelope({
      id: "b1",
      leadId: "B",
      conversationId: "cB",
      text: "texto-da-B",
      notBefore: T0,
    }),
  );
  const p = pickNext(q, T0);
  assertEquals(p.envelope?.leadId, "A");
  assertEquals(p.envelope?.text, "texto-da-A");
  assertEquals(p.envelope?.conversationId, "cA");
});

Deno.test("continua pacote A antes de abrir B; B nunca antes do spacing", () => {
  let q = emptyOutboundQueue();
  const a1 = makeOpenBubble1Envelope({
    id: "a1",
    leadId: "A",
    conversationId: "cA",
    text: "A1",
    notBefore: T0,
  });
  q = enqueue(q, a1);
  let pick = pickNext(q, T0);
  assertEquals(pick.envelope?.id, "a1");
  q = deliverPicked(q, pick.envelope!, T0, { rng: () => 0 }); // +42s → B not before 12:00:42

  const a2 = makeContinueEnvelope({
    id: "a2",
    leadId: "A",
    conversationId: "cA",
    bubbleIndex: 2,
    text: "A2",
    notBefore: new Date(T0.getTime() + 30_000),
  });
  const b1 = makeOpenBubble1Envelope({
    id: "b1",
    leadId: "B",
    conversationId: "cB",
    text: "B1",
    notBefore: new Date(T0.getTime() + 42_000),
  });
  q = enqueue(q, a2);
  q = enqueue(q, b1);

  // 12:00:30 — A2 due; B ainda não por spacing/not_before relativo
  pick = pickNext(q, new Date(T0.getTime() + 30_000));
  assertEquals(pick.envelope?.id, "a2");
  assertEquals(pick.envelope?.text, "A2");
  q = deliverPicked(q, pick.envelope!, new Date(T0.getTime() + 30_000));

  // 12:00:41 — B not_before 42s ainda não
  pick = pickNext(q, new Date(T0.getTime() + 41_000));
  assertEquals(pick.envelope, null);

  // 12:00:42 — B pode
  pick = pickNext(q, new Date(T0.getTime() + 42_000));
  assertEquals(pick.envelope?.id, "b1");
  assertEquals(pick.envelope?.leadId, "B");
  assertEquals(pick.envelope?.text, "B1");
});

Deno.test("reply de quem escreveu sai antes de continuar o script", () => {
  let q = emptyOutboundQueue();
  q = {
    ...q,
    inFlightLeadId: "A",
  };
  const a3 = makeContinueEnvelope({
    id: "a3",
    leadId: "A",
    conversationId: "cA",
    bubbleIndex: 3,
    text: "A3",
    notBefore: T0,
  });
  const replyA = makeReplyEnvelope({
    id: "rA",
    leadId: "A",
    conversationId: "cA",
    text: "resposta-A",
    notBefore: T0,
  });
  const b1 = makeOpenBubble1Envelope({
    id: "b1",
    leadId: "B",
    conversationId: "cB",
    text: "B1",
    notBefore: T0,
  });
  q = enqueue(q, b1);
  q = enqueue(q, replyA);
  q = enqueue(q, a3);

  let pick = pickNext(q, T0);
  assertEquals(pick.envelope?.id, "rA");
  assertEquals(pick.envelope?.text, "resposta-A");
  q = deliverPicked(q, pick.envelope!, T0);

  pick = pickNext(q, T0);
  assertEquals(pick.envelope?.id, "a3");
});

Deno.test("idempotência: mesmo idempotencyKey não duplica", () => {
  let q = emptyOutboundQueue();
  const e = makeOpenBubble1Envelope({
    id: "a1",
    leadId: "A",
    conversationId: "cA",
    text: "A1",
    notBefore: T0,
  });
  q = enqueue(q, e);
  q = enqueue(q, { ...e, id: "a1-dup" });
  assertEquals(q.pending.length, 1);
});
