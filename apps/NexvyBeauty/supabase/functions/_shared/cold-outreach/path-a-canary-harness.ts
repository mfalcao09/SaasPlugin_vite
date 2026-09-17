// Path A F4 canary harness — pure state machine (no provider).
// Counts outbound/mutations for B2–B7 under MODE=enforce + allowlist.
// deno test supabase/functions/_shared/cold-outreach/path-a-canary-harness.test.ts

import { decidePathAClosedInbound } from "./path-a-reopen-decision.ts";
import { pathAColdOpeningGate } from "./path-a-reopen-decision.ts";
import { classifyReopenIntent } from "./reopen-intent.ts";
import { isPathAProtectedClosed } from "./path-a-reopen-decision.ts";

export type SimState = {
  status: "closed" | "bot_active";
  softOptOutActive: boolean;
  coldSuppressed: boolean;
  dncHard: boolean;
  coldNotBeforeIso: string | null;
  queueStatus: "opted_out" | "queued" | "sent" | "skipped";
  replyGrant: boolean;
  clarifyUsedIn24h: number;
  outboundBubbles: number;
  pathASends: number;
  r2Sends: number;
  brainInvokes: number;
  openings: number;
};

export type SimEvent =
  | { type: "inbound"; text: string; hoursSinceR2?: number }
  | { type: "cold_tick" };

const CANARY = "5511945760964";
const NOW = "2026-09-16T12:00:00.000Z";

export function seedSoftClosed(): SimState {
  return {
    status: "closed",
    softOptOutActive: true,
    coldSuppressed: true,
    dncHard: false,
    coldNotBeforeIso: null,
    queueStatus: "opted_out",
    replyGrant: false,
    clarifyUsedIn24h: 0,
    outboundBubbles: 0,
    pathASends: 0,
    r2Sends: 0,
    brainInvokes: 0,
    openings: 0,
  };
}

function convMeta(s: SimState) {
  return {
    status: s.status,
    id: "canary-conv",
    metadata: {
      do_not_contact: s.softOptOutActive || s.dncHard,
      do_not_contact_reason: s.dncHard ? "hard_opt_out" : "opt_out_remarketing",
      remarketing: s.softOptOutActive || s.dncHard,
      dnc_hard: s.dncHard,
      cold_suppressed: s.coldSuppressed,
      soft_opt_out_active: s.softOptOutActive,
      cold_not_before: s.coldNotBeforeIso,
      last_r2_delivered_at: "2026-09-16T10:00:00.000Z",
    },
  };
}

/** Apply one event under enforce+allowlist. R2 stays OFF (never increments r2Sends). */
export function applyEvent(state: SimState, event: SimEvent): SimState {
  const s = { ...state };
  if (event.type === "cold_tick") {
    const g = pathAColdOpeningGate({
      dncHard: s.dncHard,
      coldSuppressed: s.coldSuppressed,
      softOptOutActive: s.softOptOutActive,
      conversationStatus: s.status,
      coldNotBeforeIso: s.coldNotBeforeIso,
      nowIso: NOW,
    });
    if (g.allowed) s.openings += 1;
    return s;
  }

  // B5: hard opt-out after reopen (bot_active) — still hardens without Path A reopen path.
  const rawClass = classifyReopenIntent({
    text: event.text,
    hoursSinceR2: event.hoursSinceR2 ?? 2,
    applicable: true,
  });
  if (rawClass.class === "opt_out_again" && rawClass.reason_code === "hard_opt_out") {
    s.status = "closed";
    s.dncHard = true;
    s.coldSuppressed = true;
    s.softOptOutActive = false;
    s.replyGrant = false;
    return s;
  }

  if (!isPathAProtectedClosed(convMeta(s))) {
    return s;
  }

  const decision = decidePathAClosedInbound({
    text: event.text,
    conversation: convMeta(s),
    hoursSinceR2: event.hoursSinceR2 ?? 2,
    mode: "enforce",
    phoneDigits: CANARY,
    allowlistRaw: CANARY,
    clarifyCapAvailable: s.clarifyUsedIn24h < 1,
    nowIso: NOW,
    inboundMessageId: `msg-${s.outboundBubbles}`,
  });

  if (decision.path_a_desired === "stay_closed" || decision.class === "farewell_ack") {
    return s;
  }

  if (decision.path_a_desired === "clarify") {
    s.outboundBubbles += 1;
    s.pathASends += 1;
    s.clarifyUsedIn24h += 1;
    return s;
  }

  if (decision.path_a_desired === "reopen_soft" && decision.apply_mutation) {
    s.status = "bot_active";
    s.softOptOutActive = false;
    s.coldSuppressed = false;
    s.coldNotBeforeIso = decision.effects?.coldNotBeforeIso ?? null;
    s.queueStatus = "opted_out";
    s.replyGrant = true;
    s.outboundBubbles += 2;
    s.pathASends += 1;
    s.replyGrant = false;
    return s;
  }

  if (decision.path_a_desired === "harden_dnc") {
    s.status = "closed";
    s.dncHard = true;
    s.coldSuppressed = true;
    s.softOptOutActive = false;
    s.replyGrant = false;
    return s;
  }

  return s;
}

export type CanaryReport = {
  farewell_outbound: number;
  clarify_bubbles: number;
  reopen_bubbles: number;
  queue_queued: boolean;
  cold_tick_openings: number;
  r2_sends: number;
  hard_dnc: boolean;
  soft_revoked_after_reopen: boolean;
  cold_not_before_set: boolean;
  path_a_sends_total: number;
  allowlist_only: true;
  r2_auto_mode: "off";
};

/** Full F4 roteiro automático (synthetic). */
export function runF4CanaryRoteiro(): { state: SimState; report: CanaryReport } {
  let s = seedSoftClosed();

  // B2 farewell
  const beforeFarewell = s.outboundBubbles;
  s = applyEvent(s, { type: "inbound", text: "Pode deixar" });
  const farewell_outbound = s.outboundBubbles - beforeFarewell;

  // B4 ambiguous ×2
  const beforeClarify = s.outboundBubbles;
  s = applyEvent(s, { type: "inbound", text: "oi" });
  s = applyEvent(s, { type: "inbound", text: "oi" });
  const clarify_bubbles = s.outboundBubbles - beforeClarify;

  // B3 reopen
  const beforeReopen = s.outboundBubbles;
  s = applyEvent(s, {
    type: "inbound",
    text: "Obrigada, mudei de ideia, quero ver como funciona",
  });
  const reopen_bubbles = s.outboundBubbles - beforeReopen;
  const soft_revoked = !s.softOptOutActive && !s.coldSuppressed;
  const cold_not_before_set = !!s.coldNotBeforeIso;
  const queue_queued = s.queueStatus === "queued";

  // B7 cold tick immediate
  const beforeOpen = s.openings;
  s = applyEvent(s, { type: "cold_tick" });
  const cold_tick_openings = s.openings - beforeOpen;

  // B5 hard
  s = applyEvent(s, { type: "inbound", text: "pare de me mandar mensagem" });

  return {
    state: s,
    report: {
      farewell_outbound,
      clarify_bubbles,
      reopen_bubbles,
      queue_queued,
      cold_tick_openings,
      r2_sends: s.r2Sends,
      hard_dnc: s.dncHard,
      soft_revoked_after_reopen: soft_revoked,
      cold_not_before_set,
      path_a_sends_total: s.pathASends,
      allowlist_only: true,
      r2_auto_mode: "off",
    },
  };
}

export function assertF4Report(r: CanaryReport): string[] {
  const fails: string[] = [];
  if (r.farewell_outbound !== 0) fails.push(`farewell_outbound=${r.farewell_outbound}`);
  if (r.clarify_bubbles > 1) fails.push(`clarify_bubbles=${r.clarify_bubbles}`);
  if (r.clarify_bubbles < 1) fails.push(`clarify_bubbles_missing`);
  if (r.reopen_bubbles < 1 || r.reopen_bubbles > 2) {
    fails.push(`reopen_bubbles=${r.reopen_bubbles}`);
  }
  if (r.queue_queued) fails.push("queue_queued");
  if (r.cold_tick_openings !== 0) fails.push(`cold_tick_openings=${r.cold_tick_openings}`);
  if (r.r2_sends !== 0) fails.push(`r2_sends=${r.r2_sends}`);
  if (!r.hard_dnc) fails.push("hard_dnc_false");
  if (!r.soft_revoked_after_reopen) fails.push("soft_not_revoked");
  if (!r.cold_not_before_set) fails.push("cold_not_before_missing");
  if (r.r2_auto_mode !== "off") fails.push("r2_not_off");
  return fails;
}
