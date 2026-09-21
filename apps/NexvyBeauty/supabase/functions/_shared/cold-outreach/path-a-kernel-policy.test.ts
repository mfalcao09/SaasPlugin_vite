import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authorizePathAAction,
  reopenSoftEffects,
} from "./path-a-kernel-policy.ts";

Deno.test("farewell denies all", () => {
  for (const action of ["reply", "reopen_clarification", "opening"] as const) {
    const r = authorizePathAAction({
      action,
      dncHard: false,
      coldSuppressed: true,
      softOptOutActive: true,
      conversationStatus: "closed",
      reopenClass: "farewell_ack",
      hasValidReplyGrant: false,
      clarifyCapAvailable: true,
    });
    assertEquals(r.allowed, false);
  }
});

Deno.test("ambiguous allows one clarification only", () => {
  const ok = authorizePathAAction({
    action: "reopen_clarification",
    dncHard: false,
    coldSuppressed: true,
    softOptOutActive: true,
    conversationStatus: "closed",
    reopenClass: "ambiguous",
    hasValidReplyGrant: false,
    clarifyCapAvailable: true,
  });
  assertEquals(ok.allowed, true);
  const deny = authorizePathAAction({
    action: "reply",
    dncHard: false,
    coldSuppressed: true,
    softOptOutActive: true,
    conversationStatus: "closed",
    reopenClass: "ambiguous",
    hasValidReplyGrant: false,
    clarifyCapAvailable: true,
  });
  assertEquals(deny.allowed, false);
});

Deno.test("reopen reply needs grant; opening denied", () => {
  const noGrant = authorizePathAAction({
    action: "reply",
    dncHard: false,
    coldSuppressed: false,
    softOptOutActive: false,
    conversationStatus: "bot_active",
    reopenClass: "reopen_intent",
    hasValidReplyGrant: false,
    clarifyCapAvailable: false,
  });
  assertEquals(noGrant.allowed, false);
  const withGrant = authorizePathAAction({
    action: "reply",
    dncHard: false,
    coldSuppressed: false,
    softOptOutActive: false,
    conversationStatus: "bot_active",
    reopenClass: "reopen_intent",
    hasValidReplyGrant: true,
    clarifyCapAvailable: false,
  });
  assertEquals(withGrant.allowed, true);
  const opening = authorizePathAAction({
    action: "opening",
    dncHard: false,
    coldSuppressed: false,
    softOptOutActive: false,
    conversationStatus: "bot_active",
    reopenClass: "reopen_intent",
    hasValidReplyGrant: true,
    clarifyCapAvailable: false,
  });
  assertEquals(opening.allowed, false);
});

Deno.test("dnc_hard blocks everything", () => {
  const r = authorizePathAAction({
    action: "reply",
    dncHard: true,
    coldSuppressed: false,
    softOptOutActive: false,
    conversationStatus: "bot_active",
    reopenClass: null,
    hasValidReplyGrant: true,
    clarifyCapAvailable: true,
  });
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "dnc_hard");
});

Deno.test("reopenSoftEffects: liberates soft without queue", () => {
  const e = reopenSoftEffects("2026-09-16T00:00:00.000Z");
  assertEquals(e.softOptOutActive, false);
  assertEquals(e.coldSuppressed, false);
  assertEquals(e.conversationStatus, "bot_active");
  assertEquals(e.queueMustNotBeQueued, true);
  assertEquals(e.coldNotBeforeIso, "2026-09-17T00:00:00.000Z");
});

Deno.test("cold_not_before denies proactive", () => {
  const r = authorizePathAAction({
    action: "opening",
    dncHard: false,
    coldSuppressed: false,
    softOptOutActive: false,
    conversationStatus: "closed",
    reopenClass: null,
    hasValidReplyGrant: false,
    clarifyCapAvailable: false,
    coldNotBeforeIso: "2099-01-01T00:00:00.000Z",
    nowIso: "2026-09-16T00:00:00.000Z",
  });
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "cold_not_before");
});
