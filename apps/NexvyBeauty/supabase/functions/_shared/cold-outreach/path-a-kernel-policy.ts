// Path A kernel policy matrix (pure) — mirrors intended authorize rules before SQL refine.
// deno test supabase/functions/_shared/cold-outreach/path-a-kernel-policy.test.ts

export type PathAAction =
  | "opening"
  | "opening_part"
  | "followup"
  | "resume"
  | "reply"
  | "reopen_clarification";

export type PathAAuthInput = {
  action: PathAAction;
  dncHard: boolean;
  coldSuppressed: boolean;
  softOptOutActive: boolean;
  conversationStatus: "closed" | "bot_active" | string;
  reopenClass?: "farewell_ack" | "reopen_intent" | "ambiguous" | "opt_out_again" | null;
  hasValidReplyGrant: boolean;
  clarifyCapAvailable: boolean;
  coldNotBeforeIso?: string | null;
  nowIso?: string;
};

export type PathAAuthResult = { allowed: boolean; reason: string };

const PROACTIVE: PathAAction[] = ["opening", "opening_part", "followup", "resume"];

export function authorizePathAAction(input: PathAAuthInput): PathAAuthResult {
  if (input.dncHard) {
    return { allowed: false, reason: "dnc_hard" };
  }

  const cls = input.reopenClass;
  const closed = input.conversationStatus === "closed";

  if (cls === "farewell_ack") {
    return { allowed: false, reason: "farewell_ack" };
  }
  if (cls === "opt_out_again") {
    return { allowed: false, reason: "opt_out_again" };
  }

  if (cls === "ambiguous") {
    if (input.action === "reopen_clarification" && closed && input.clarifyCapAvailable) {
      return { allowed: true, reason: "clarify_ok" };
    }
    return { allowed: false, reason: "ambiguous_denied" };
  }

  if (PROACTIVE.includes(input.action)) {
    if (input.coldSuppressed || input.softOptOutActive) {
      return { allowed: false, reason: "cold_suppressed" };
    }
    const now = Date.parse(input.nowIso ?? new Date().toISOString());
    const notBefore = input.coldNotBeforeIso
      ? Date.parse(input.coldNotBeforeIso)
      : NaN;
    if (!Number.isNaN(notBefore) && now < notBefore) {
      return { allowed: false, reason: "cold_not_before" };
    }
    if (input.conversationStatus === "bot_active") {
      return { allowed: false, reason: "proactive_while_bot_active" };
    }
  }

  if (input.action === "reply") {
    if (cls === "reopen_intent" || input.hasValidReplyGrant) {
      if (!input.hasValidReplyGrant && cls === "reopen_intent") {
        // grant must be issued by transition; without grant deny
        return { allowed: false, reason: "reply_grant_missing" };
      }
      return { allowed: true, reason: "reply_grant_ok" };
    }
    if (input.conversationStatus === "bot_active" && !input.softOptOutActive) {
      return { allowed: true, reason: "normal_reply" };
    }
    return { allowed: false, reason: "reply_denied" };
  }

  if (input.action === "reopen_clarification") {
    return { allowed: false, reason: "clarify_not_ambiguous" };
  }

  return { allowed: false, reason: "deny_default" };
}

/** Reopen transition effects (pure) — no blast / no queue. */
export function reopenSoftEffects(reopenedAtIso: string): {
  softOptOutActive: boolean;
  coldSuppressed: boolean;
  conversationStatus: "bot_active";
  coldNotBeforeIso: string;
  queueMustNotBeQueued: true;
} {
  const t = Date.parse(reopenedAtIso);
  const notBefore = new Date(t + 24 * 3600 * 1000).toISOString();
  return {
    softOptOutActive: false,
    coldSuppressed: false,
    conversationStatus: "bot_active",
    coldNotBeforeIso: notBefore,
    queueMustNotBeQueued: true,
  };
}
