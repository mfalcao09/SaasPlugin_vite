// Immutable authorization rules for any autonomous Camila provider call.

export const IMMUTABLE_CONTACT_LIMITS = {
  maxOpenings: 1,
  maxFollowups: 2,
  minProactiveIntervalMs: 24 * 60 * 60 * 1000,
  maxProactivePerLeadPerDay: 1,
  maxBubblesPerAction: 4,
} as const;

export type AgentReleaseState = "OFF" | "SHADOW" | "TEST" | "CANARY" | "LIVE";
export type AgentActionType = "opening" | "opening_part" | "followup" | "resume" | "reply";

export interface AgentSafetyInput {
  releaseState: AgentReleaseState;
  killSwitch: boolean;
  hasLead: boolean;
  hasFicha: boolean;
  ownerMatches: boolean;
  providerHealthy: boolean;
  optedOut: boolean;
  withinWindow: boolean;
  actionType: AgentActionType;
  proactive: boolean;
  bubbleCount: number;
  openingCount: number;
  followupCount: number;
  proactiveLast24h: number;
  msSinceLastProactive: number | null;
  humanInboundAfterLastOutbound: boolean;
}

export interface AgentSafetyDecision {
  allowed: boolean;
  reason: string | null;
}

export function evaluateAgentSafety(
  input: AgentSafetyInput,
): AgentSafetyDecision {
  if (input.releaseState === "OFF") {
    return { allowed: false, reason: "release_off" };
  }
  if (input.releaseState === "SHADOW") {
    return { allowed: false, reason: "shadow_no_provider" };
  }
  if (input.killSwitch) return { allowed: false, reason: "kill_switch" };
  if (!input.hasLead) return { allowed: false, reason: "lead_missing" };
  if (!input.hasFicha) return { allowed: false, reason: "ficha_missing" };
  if (!input.ownerMatches) return { allowed: false, reason: "owner_mismatch" };
  if (!input.providerHealthy) {
    return { allowed: false, reason: "provider_unhealthy" };
  }
  if (input.optedOut) return { allowed: false, reason: "opted_out" };
  if (!input.withinWindow) return { allowed: false, reason: "outside_window" };
  if (input.bubbleCount < 1) {
    return { allowed: false, reason: "empty_action" };
  }
  if (input.bubbleCount > IMMUTABLE_CONTACT_LIMITS.maxBubblesPerAction) {
    return { allowed: false, reason: "bubble_cap" };
  }
  if (
    input.actionType === "opening" &&
    input.openingCount >= IMMUTABLE_CONTACT_LIMITS.maxOpenings
  ) {
    return { allowed: false, reason: "opening_cap" };
  }
  if (
    input.actionType === "followup" &&
    input.followupCount >= IMMUTABLE_CONTACT_LIMITS.maxFollowups
  ) {
    return { allowed: false, reason: "followup_cap" };
  }
  // opening_part = bolhas 2–4 do script de abordagem (após opening).
  // followupCount no input = quantas opening_part já enviadas (0–3).
  if (input.actionType === "opening_part") {
    if (input.openingCount < 1) {
      return { allowed: false, reason: "opening_part_without_opening" };
    }
    if (input.followupCount >= 3) {
      return { allowed: false, reason: "opening_part_cap" };
    }
  }
  if (
    (input.actionType === "opening" ||
      input.actionType === "followup" ||
      input.actionType === "opening_part") &&
    input.humanInboundAfterLastOutbound
  ) {
    return { allowed: false, reason: "human_replied" };
  }
  // same-session approach: opening_part ignora caps diários/intervalo
  if (input.actionType !== "opening_part") {
    if (
      input.proactive &&
      input.proactiveLast24h >=
        IMMUTABLE_CONTACT_LIMITS.maxProactivePerLeadPerDay
    ) {
      return { allowed: false, reason: "proactive_daily_cap" };
    }
    if (
      input.proactive &&
      input.msSinceLastProactive != null &&
      input.msSinceLastProactive <
        IMMUTABLE_CONTACT_LIMITS.minProactiveIntervalMs
    ) {
      return { allowed: false, reason: "proactive_interval" };
    }
  }
  return { allowed: true, reason: null };
}
