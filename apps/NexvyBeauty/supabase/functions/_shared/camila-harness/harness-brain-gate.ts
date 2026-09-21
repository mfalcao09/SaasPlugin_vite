// Único portão: o Harness decide se o cérebro pode falar.
// Webhook e sales-brain importam DAQUI — o ledger não inventa outro relógio.

import {
  authorizeHarnessReply,
  type AttendanceReplyVerdict,
} from "./wire-gates.ts";
import { decideAttendance, type AttendanceAction } from "./attendance-window.ts";
import { isHarnessLockedProduct } from "./harness-product.ts";

export function harnessAllowsInboundBrain(input: {
  replyAllowed: boolean;
  replyReason: string;
  optOut?: boolean;
  doNotContact?: boolean;
  /** G5#2: DNC que voltou a falar — acorda só para consentimento. */
  needsNewConsent?: boolean;
  skipBrain?: boolean;
  canonicalReady?: boolean;
  /** G5#3: boca 1 ainda entregando as 4. */
  waitPackage?: boolean;
}): { allowed: boolean; reason: string } {
  if (input.skipBrain) return { allowed: false, reason: "skip_brain" };
  if (input.canonicalReady === false) {
    return { allowed: false, reason: "canonical_state_not_ready" };
  }
  if (input.waitPackage) return { allowed: false, reason: "mouth1_in_flight" };
  if (input.optOut && !input.needsNewConsent) {
    return { allowed: false, reason: "opt-out" };
  }
  if (input.doNotContact && !input.needsNewConsent) {
    return { allowed: false, reason: "do_not_contact" };
  }
  if (!input.replyAllowed) {
    return { allowed: false, reason: input.replyReason || "harness_window_closed" };
  }
  return { allowed: true, reason: "harness_reply_ok" };
}

/** Reply deste produto: janela do harness, não Mon–Fri 09–18 do ledger. */
export function harnessLedgerAllowsReserve(input: {
  productId: string | null | undefined;
  now?: Date;
  action?: AttendanceAction;
  envGet?: (k: string) => string | undefined;
}): { allowed: boolean; reason: string } {
  if (!isHarnessLockedProduct(input.productId, input.envGet)) {
    return { allowed: true, reason: "not_harness_product" };
  }
  const v = harnessAllowsBrainSend({
    now: input.now,
    action: input.action ?? "reply",
  });
  return { allowed: v.allowed, reason: v.reason };
}

/** Cérebro / conductor: mesma janela do Harness, sem 09–18 do ledger. */
export function harnessAllowsBrainSend(input: {
  now?: Date;
  action?: AttendanceAction;
  holidayDates?: ReadonlySet<string> | null;
}): AttendanceReplyVerdict {
  const action = input.action ?? "reply";
  if (action === "reply" || action === "exit_message") {
    return authorizeHarnessReply({
      now: input.now,
      action,
      holidayDates: input.holidayDates,
    });
  }
  const v = decideAttendance({
    now: input.now ?? new Date(),
    action,
    holidayDates: input.holidayDates,
  });
  return {
    allowed: v.allowed,
    canOut: v.canOut,
    canIn: v.canIn,
    reason: v.reason,
    window: v.window,
  };
}
