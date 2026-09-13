import { assertEquals } from "jsr:@std/assert@1";
import {
  type AgentSafetyInput,
  evaluateAgentSafety,
  IMMUTABLE_CONTACT_LIMITS,
} from "./agent-safety-kernel.ts";

const base: AgentSafetyInput = {
  releaseState: "TEST",
  killSwitch: false,
  hasLead: true,
  hasFicha: true,
  ownerMatches: true,
  providerHealthy: true,
  optedOut: false,
  withinWindow: true,
  actionType: "reply",
  proactive: false,
  bubbleCount: 1,
  openingCount: 0,
  followupCount: 0,
  proactiveLast24h: 0,
  msSinceLastProactive: null,
  humanInboundAfterLastOutbound: true,
};

Deno.test("safety kernel: immutable limits match approved baseline", () => {
  assertEquals(IMMUTABLE_CONTACT_LIMITS, {
    maxOpenings: 1,
    maxFollowups: 2,
    minProactiveIntervalMs: 24 * 60 * 60 * 1000,
    maxProactivePerLeadPerDay: 1,
    maxBubblesPerAction: 2,
  });
});

Deno.test("safety kernel: OFF and SHADOW can never call provider", () => {
  assertEquals(
    evaluateAgentSafety({ ...base, releaseState: "OFF" }).reason,
    "release_off",
  );
  assertEquals(
    evaluateAgentSafety({ ...base, releaseState: "SHADOW" }).reason,
    "shadow_no_provider",
  );
});

Deno.test("safety kernel: lead, ficha, owner and provider are mandatory", () => {
  assertEquals(evaluateAgentSafety({ ...base, hasLead: false }).allowed, false);
  assertEquals(
    evaluateAgentSafety({ ...base, hasFicha: false }).allowed,
    false,
  );
  assertEquals(
    evaluateAgentSafety({ ...base, ownerMatches: false }).allowed,
    false,
  );
  assertEquals(
    evaluateAgentSafety({ ...base, providerHealthy: false }).allowed,
    false,
  );
});

Deno.test("safety kernel: opt-out and window fail closed", () => {
  assertEquals(evaluateAgentSafety({ ...base, optedOut: true }).allowed, false);
  assertEquals(
    evaluateAgentSafety({ ...base, withinWindow: false }).allowed,
    false,
  );
});

Deno.test("safety kernel: opening and follow-up hard caps", () => {
  assertEquals(
    evaluateAgentSafety({
      ...base,
      actionType: "opening",
      proactive: true,
      openingCount: 1,
      humanInboundAfterLastOutbound: false,
    }).reason,
    "opening_cap",
  );
  assertEquals(
    evaluateAgentSafety({
      ...base,
      actionType: "followup",
      proactive: true,
      followupCount: 2,
      humanInboundAfterLastOutbound: false,
    }).reason,
    "followup_cap",
  );
});

Deno.test("safety kernel: one proactive action per day and 24h spacing", () => {
  assertEquals(
    evaluateAgentSafety({
      ...base,
      actionType: "resume",
      proactive: true,
      proactiveLast24h: 1,
      humanInboundAfterLastOutbound: false,
    }).reason,
    "proactive_daily_cap",
  );
  assertEquals(
    evaluateAgentSafety({
      ...base,
      actionType: "resume",
      proactive: true,
      msSinceLastProactive: 60_000,
      humanInboundAfterLastOutbound: false,
    }).reason,
    "proactive_interval",
  );
});

Deno.test("safety kernel: human reply cancels cold and bubbles are capped", () => {
  assertEquals(
    evaluateAgentSafety({
      ...base,
      actionType: "followup",
      proactive: true,
    }).reason,
    "human_replied",
  );
  assertEquals(
    evaluateAgentSafety({ ...base, bubbleCount: 3 }).reason,
    "bubble_cap",
  );
});

Deno.test("safety kernel: healthy reply is allowed", () => {
  assertEquals(evaluateAgentSafety(base), { allowed: true, reason: null });
});
