// Path A canonical reopen decision — classify before mutate; shadow never sends.
// deno test supabase/functions/_shared/cold-outreach/path-a-reopen-decision.test.ts

import { shouldReopenClosedWaQrConversation } from "../wa-qr-conversation-reopen.ts";
import {
  authorizePathAAction,
  reopenSoftEffects,
  type PathAAction,
} from "./path-a-kernel-policy.ts";
import {
  getReopenIntentMode,
  isPathAAllowlisted,
  type PathAMode,
} from "./path-a-flags.ts";
import {
  classifyReopenIntent,
  CLASSIFIER_VERSION,
  type ReopenClass,
  type ReopenIntentResult,
} from "./reopen-intent.ts";

export type PathADesired =
  | "noop"
  | "stay_closed"
  | "reopen_soft"
  | "clarify"
  | "harden_dnc";

export type PathADecision = {
  mode: PathAMode;
  inbound_message_id: string | null;
  classifier_version: string;
  class: ReopenClass;
  reason_code: string;
  matched_rules: string[];
  farewell_window_active: boolean;
  emergency_would_reopen: boolean;
  path_a_desired: PathADesired;
  /** Only true when MODE=enforce + allowlist + reopen_soft. Shadow/off: false. */
  apply_mutation: boolean;
  /** Path A outbound attributed to this decision. Always 0 in off/shadow. */
  path_a_sends: number;
  allow_send: boolean;
  cold_opening_allowed: boolean;
  effects: ReturnType<typeof reopenSoftEffects> | null;
  divergence: "agree_hold" | "path_a_would_reopen" | "emergency_would_reopen" | "n/a";
  fail_closed: boolean;
};

export type PathADecisionInput = {
  text: string;
  conversation: { status?: string | null; metadata?: unknown; id?: string };
  hoursSinceR2?: number | null;
  inboundMessageId?: string | null;
  mode?: PathAMode;
  phoneDigits?: string | null;
  allowlistRaw?: string | null;
  clarifyCapAvailable?: boolean;
  nowIso?: string;
  /** Override Deno env for tests. */
  envMode?: PathAMode;
};

function metaOf(conversation: { metadata?: unknown }): Record<string, unknown> {
  return conversation.metadata && typeof conversation.metadata === "object"
    ? conversation.metadata as Record<string, unknown>
    : {};
}

/** Soft/DNC/remarketing closed → Path A applicable. */
export function isPathAProtectedClosed(conversation: {
  status?: string | null;
  metadata?: unknown;
}): boolean {
  if (String(conversation.status ?? "") !== "closed") return false;
  // Emergency never-reopen cases are exactly the protected set for Path A.
  return !shouldReopenClosedWaQrConversation(conversation);
}

export function hoursSinceR2FromMeta(
  metadata: unknown,
  nowIso?: string,
): number | null {
  const meta = metadata && typeof metadata === "object"
    ? metadata as Record<string, unknown>
    : {};
  const candidates = [
    meta.last_r2_delivered_at,
    meta.r2_delivered_at,
    meta.closed_at,
    meta.do_not_contact_at,
  ];
  const now = Date.parse(nowIso ?? new Date().toISOString());
  for (const c of candidates) {
    if (typeof c !== "string" || !c) continue;
    const t = Date.parse(c);
    if (Number.isNaN(t)) continue;
    return Math.max(0, (now - t) / 3600000);
  }
  return null;
}

function desiredFromClass(
  cls: ReopenClass,
  clarifyCapAvailable: boolean,
): PathADesired {
  switch (cls) {
    case "farewell_ack":
      return "stay_closed";
    case "opt_out_again":
      return "harden_dnc";
    case "reopen_intent":
      return "reopen_soft";
    case "ambiguous":
      return clarifyCapAvailable ? "clarify" : "stay_closed";
    default:
      return "noop";
  }
}

/**
 * Single decision for webhook + cold. Shadow: record only, never mutate/send.
 * Enforce: mutate only if allowlisted reopen_soft (F4+).
 */
export function decidePathAClosedInbound(
  input: PathADecisionInput,
): PathADecision {
  const mode = input.mode ?? input.envMode ?? getReopenIntentMode();
  const emergency = shouldReopenClosedWaQrConversation(input.conversation);
  const protectedClosed = isPathAProtectedClosed(input.conversation);
  const inboundId = input.inboundMessageId ?? null;

  const baseFail = (reason: string): PathADecision => ({
    mode,
    inbound_message_id: inboundId,
    classifier_version: CLASSIFIER_VERSION,
    class: "not_applicable",
    reason_code: reason,
    matched_rules: [],
    farewell_window_active: false,
    emergency_would_reopen: emergency,
    path_a_desired: "noop",
    apply_mutation: false,
    path_a_sends: 0,
    allow_send: false,
    cold_opening_allowed: false,
    effects: null,
    divergence: "n/a",
    fail_closed: true,
  });

  if (mode === "off") {
    return {
      ...baseFail("mode_off"),
      fail_closed: false,
      // Containment: emergency gate alone; Path A idle.
      divergence: emergency ? "emergency_would_reopen" : "agree_hold",
    };
  }

  if (!protectedClosed) {
    return {
      ...baseFail("not_protected_closed"),
      fail_closed: false,
      emergency_would_reopen: emergency,
      divergence: "n/a",
    };
  }

  let classification: ReopenIntentResult;
  try {
    classification = classifyReopenIntent({
      text: input.text,
      hoursSinceR2: input.hoursSinceR2 ??
        hoursSinceR2FromMeta(input.conversation.metadata, input.nowIso),
      applicable: true,
    });
  } catch {
    return baseFail("classify_threw");
  }

  const clarifyCap = input.clarifyCapAvailable !== false;
  const desired = desiredFromClass(classification.class, clarifyCap);
  const effects = desired === "reopen_soft"
    ? reopenSoftEffects(input.nowIso ?? new Date().toISOString())
    : null;

  const allowlisted = isPathAAllowlisted({
    phoneDigits: input.phoneDigits,
    conversationId: input.conversation.id,
    allowlistRaw: input.allowlistRaw,
  });

  // Shadow: never mutate, never send. Enforce reopen only on allowlist.
  const applyMutation =
    mode === "enforce" && allowlisted && desired === "reopen_soft";

  let allowSend = false;
  let pathASends = 0;
  if (mode === "enforce" && allowlisted) {
    if (desired === "clarify") {
      const auth = authorizePathAAction({
        action: "reopen_clarification",
        dncHard: false,
        coldSuppressed: true,
        softOptOutActive: true,
        conversationStatus: "closed",
        reopenClass: "ambiguous",
        hasValidReplyGrant: false,
        clarifyCapAvailable: clarifyCap,
      });
      allowSend = auth.allowed;
      pathASends = auth.allowed ? 1 : 0;
    } else if (desired === "reopen_soft") {
      // Reply bubbles gated by grant after transition — F4 issues grant.
      allowSend = false;
      pathASends = 0;
    }
  }

  const coldOpeningAllowed = authorizePathAAction({
    action: "opening" as PathAAction,
    dncHard: classification.class === "opt_out_again" &&
        classification.reason_code === "hard_opt_out",
    coldSuppressed: desired !== "reopen_soft",
    softOptOutActive: desired !== "reopen_soft",
    conversationStatus: desired === "reopen_soft" ? "bot_active" : "closed",
    reopenClass: classification.class === "not_applicable"
      ? null
      : classification.class,
    hasValidReplyGrant: false,
    clarifyCapAvailable: clarifyCap,
    coldNotBeforeIso: effects?.coldNotBeforeIso ?? null,
    nowIso: input.nowIso,
  }).allowed;

  // Divergence vs emergency (emergency always holds protected closed).
  let divergence: PathADecision["divergence"] = "agree_hold";
  if (desired === "reopen_soft") {
    divergence = "path_a_would_reopen";
  } else if (emergency) {
    divergence = "emergency_would_reopen";
  }

  return {
    mode,
    inbound_message_id: inboundId,
    classifier_version: classification.classifier_version,
    class: classification.class,
    reason_code: classification.reason_code,
    matched_rules: classification.matched_rules,
    farewell_window_active: classification.farewell_window_active,
    emergency_would_reopen: emergency,
    path_a_desired: desired,
    apply_mutation: applyMutation,
    path_a_sends: pathASends,
    allow_send: allowSend,
    cold_opening_allowed: coldOpeningAllowed,
    effects,
    divergence,
    fail_closed: false,
  };
}

/** Cold tick: same decision surface — deny opening while suppressed / hold. */
export function pathAColdOpeningGate(input: {
  dncHard: boolean;
  coldSuppressed: boolean;
  softOptOutActive: boolean;
  conversationStatus: string;
  coldNotBeforeIso?: string | null;
  nowIso?: string;
}): { allowed: boolean; reason: string } {
  return authorizePathAAction({
    action: "opening",
    dncHard: input.dncHard,
    coldSuppressed: input.coldSuppressed,
    softOptOutActive: input.softOptOutActive,
    conversationStatus: input.conversationStatus,
    hasValidReplyGrant: false,
    clarifyCapAvailable: false,
    coldNotBeforeIso: input.coldNotBeforeIso,
    nowIso: input.nowIso,
  });
}
