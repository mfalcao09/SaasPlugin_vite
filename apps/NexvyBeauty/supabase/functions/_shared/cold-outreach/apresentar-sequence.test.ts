import { assertEquals } from "jsr:@std/assert@1";
import {
  advanceApresentarState,
  abortApresentarForHuman,
  buildApresentarState,
  bumpApresentarAfterAutoReply,
  isApresentarDue,
  nextBubbleText,
} from "./apresentar-sequence.ts";

Deno.test("build + advance 3 bolhas pendentes", () => {
  const t0 = new Date("2026-09-02T12:00:00Z");
  let s = buildApresentarState({
    campaignId: "c1",
    queueId: "q1",
    agentId: "a1",
    bubbles234: ["b2", "b3", "b4"],
    now: t0,
  });
  assertEquals(nextBubbleText(s), "b2");
  assertEquals(isApresentarDue(s, t0), false);
  assertEquals(isApresentarDue(s, new Date(t0.getTime() + 16_000)), true);

  s = advanceApresentarState(s, new Date(t0.getTime() + 16_000));
  assertEquals(s.last_sent, 2);
  assertEquals(nextBubbleText(s), "b3");

  s = advanceApresentarState(s, new Date(t0.getTime() + 32_000));
  assertEquals(s.last_sent, 3);
  assertEquals(nextBubbleText(s), "b4");

  s = advanceApresentarState(s, new Date(t0.getTime() + 48_000));
  assertEquals(s.status, "done");
  assertEquals(s.pending.length, 0);
});

Deno.test("abort human para sequência", () => {
  const s = buildApresentarState({
    campaignId: "c",
    queueId: "q",
    agentId: "a",
    bubbles234: ["b2", "b3"],
    now: new Date(),
  });
  const aborted = abortApresentarForHuman(s, new Date());
  assertEquals(aborted.status, "aborted_human");
  assertEquals(aborted.pending.length, 0);
});

Deno.test("auto-reply bump reinicia timer", () => {
  const t0 = new Date("2026-09-02T12:00:00Z");
  const s = buildApresentarState({
    campaignId: "c",
    queueId: "q",
    agentId: "a",
    bubbles234: ["b2"],
    now: t0,
  });
  const bumped = bumpApresentarAfterAutoReply(s, new Date(t0.getTime() + 5_000));
  assertEquals(isApresentarDue(bumped, new Date(t0.getTime() + 10_000)), false);
  assertEquals(isApresentarDue(bumped, new Date(t0.getTime() + 20_000)), true);
});
