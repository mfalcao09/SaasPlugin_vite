// Loop 2 WIRE scenario runner — all realSends=0, fail-closed.
import { authorizeWireSend, authorizeHarnessReply } from "./wire-gates.ts";
import {
  planAutomaticBlocked,
  planSupervisedFirstContact,
  wireDryRunCompletePackage,
  wireDryRunExit,
  shadowReplayBubble,
} from "./wire-send.ts";
import { shadowSendNext } from "./first-contact.ts";
import { silence24hToPool, wireApplyInbound, markRemarketingPool } from "./wire-pool.ts";
import type { LeadShadow } from "./states.ts";
import { FIXTURE } from "./attendance-window.ts";
import {
  emptyOutboundQueue,
  enqueue,
  pickNext,
  deliverPicked,
  makeOpenBubble1Envelope,
  makeContinueEnvelope,
} from "./outbound-queue.ts";
import { LEAD_SPACING_MIN_MS, LEAD_SPACING_MAX_MS } from "./lead-spacing.ts";

export type WireScenario = { id: string; pass: boolean; detail: string; realSends: number };

const LIST = ["lead_manual_1", "lead_manual_2"];
const NOW = FIXTURE.tue1000;

export function runWireScenarios(): WireScenario[] {
  const out: WireScenario[] = [];

  {
    const r = planSupervisedFirstContact({
      goId: null,
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "OFF",
      killOn: true,
      now: NOW,
    });
    out.push({
      id: "W1_no_go_blocked",
      pass: !r.gate.allowed && r.gate.reason === "supervised_requires_go_id" &&
        r.realSends === 0,
      detail: r.gate.reason,
      realSends: r.realSends,
    });
  }

  {
    const r = planSupervisedFirstContact({
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "OFF",
      killOn: true,
      now: NOW,
    });
    let pass = r.gate.allowed && r.package !== null && r.plannedBubbles.length === 4;
    if (r.package) {
      const done = wireDryRunCompletePackage(r.package);
      pass = pass && done.bubbles.every((b) => b.status === "sent") && done.realSends === 0;
    }
    out.push({
      id: "W2_supervised_dry_run_fc1",
      pass,
      detail: r.gate.reason,
      realSends: 0,
    });
  }

  {
    const r = planAutomaticBlocked({
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      now: NOW,
    });
    out.push({
      id: "W3_kill_blocks_auto",
      pass: !r.gate.allowed && r.gate.reason === "kill_blocks_automatic",
      detail: r.gate.reason,
      realSends: 0,
    });
  }

  {
    const g = authorizeWireSend({
      kind: "supervised",
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      dryRun: true,
      allowRealWhatsapp: false,
      now: NOW,
      attendanceAction: "open_new_package",
    });
    out.push({
      id: "W4_kill_allows_supervised_dry",
      pass: g.allowed === true,
      detail: g.reason,
      realSends: 0,
    });
  }

  {
    const r = planSupervisedFirstContact({
      goId: "GO-WIRE-1",
      leadId: "outsider",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      now: NOW,
    });
    out.push({
      id: "W5_outside_list_blocked",
      pass: !r.gate.allowed && r.gate.reason === "lead_not_on_manual_list",
      detail: r.gate.reason,
      realSends: 0,
    });
  }

  {
    const g = authorizeWireSend({
      kind: "supervised",
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      dryRun: false,
      allowRealWhatsapp: true,
      now: NOW,
    });
    out.push({
      id: "W6_l2_real_forbidden",
      pass: !g.allowed && g.reason === "l2_real_whatsapp_forbidden",
      detail: g.reason,
      realSends: 0,
    });
  }

  {
    const g = authorizeWireSend({
      kind: "supervised",
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      dryRun: false,
      allowRealWhatsapp: true,
      pilotLive: true,
      now: NOW,
    });
    out.push({
      id: "W6b_pilot_live_supervised_ok",
      pass: g.allowed && g.reason === "supervised_real_ok" && g.dryRun === false,
      detail: g.reason,
      realSends: 0,
    });
  }

  {
    const r = planSupervisedFirstContact({
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "OFF",
      killOn: true,
      now: NOW,
    });
    let pass = false;
    if (r.package) {
      const sent = shadowSendNext(r.package);
      const pkg = sent.pkg;
      const key = pkg.bubbles[0].idempotencyKey;
      const replay = shadowReplayBubble(pkg, key);
      pass = replay.duplicateBlocked === true && pkg.realSends === 0;
    }
    out.push({ id: "W7_idempotent", pass, detail: "replay", realSends: 0 });
  }

  {
    const lead: LeadShadow = {
      id: "lead_manual_1",
      state: "contacted",
      serviceOrigin: "first_contact",
    };
    const ex = wireDryRunExit({ lead, text: "nao tenho interesse", now: NOW });
    out.push({
      id: "W8_exit_to_pool",
      pass: ex.lead.state === "remarketing_pool" && ex.bubbles.length === 2 &&
        ex.realSends === 0,
      detail: ex.lead.state,
      realSends: 0,
    });
  }

  {
    let lead: LeadShadow = { id: "x", state: "contacted" };
    lead = silence24hToPool(lead);
    const poolOnly = markRemarketingPool(lead);
    const ib = wireApplyInbound(poolOnly, "Tenho interesse, como funciona?");
    out.push({
      id: "W9_pool_inbound_service",
      pass: poolOnly.state === "remarketing_pool" && ib.lead.state === "service" &&
        ib.cite,
      detail: `pool=${poolOnly.state} after=${ib.lead.state}`,
      realSends: 0,
    });
  }

  {
    const g = authorizeWireSend({
      kind: "supervised",
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "OFF",
      killOn: true,
      dryRun: false,
      allowRealWhatsapp: false,
      now: NOW,
    });
    out.push({
      id: "W10_voice_off_blocks_real",
      pass: !g.allowed && g.reason === "voice_off_blocks_real_supervised",
      detail: g.reason,
      realSends: 0,
    });
  }

  {
    const openLate = authorizeWireSend({
      kind: "supervised",
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      dryRun: true,
      now: FIXTURE.tue1800,
      attendanceAction: "open_new_package",
    });
    const continueLate = authorizeWireSend({
      kind: "supervised",
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      dryRun: true,
      now: FIXTURE.tue1805,
      attendanceAction: "continue_package",
    });
    out.push({
      id: "W11_attendance_open_vs_continue_after_18",
      pass: !openLate.allowed && openLate.reason === "outside_commercial_window" &&
        continueLate.allowed === true,
      detail: `open=${openLate.reason};cont=${continueLate.reason}`,
      realSends: 0,
    });
  }

  {
    const replyOk = authorizeHarnessReply({ now: FIXTURE.sat1500, action: "reply" });
    const openSat = authorizeWireSend({
      kind: "supervised",
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      dryRun: true,
      now: FIXTURE.sat1500,
      attendanceAction: "open_new_package",
    });
    out.push({
      id: "W12_saturday_reply_ok_open_blocked",
      pass: replyOk.allowed && replyOk.canIn && !openSat.allowed,
      detail: `reply=${replyOk.reason};open=${openSat.reason}`,
      realSends: 0,
    });
  }

  {
    const sun = authorizeHarnessReply({ now: FIXTURE.sun1100, action: "reply" });
    const hol = authorizeWireSend({
      kind: "supervised",
      goId: "GO-WIRE-1",
      leadId: "lead_manual_1",
      manualList: LIST,
      voice: "TEST",
      killOn: true,
      dryRun: true,
      now: FIXTURE.holiday1100,
      attendanceAction: "open_new_package",
      holidayDates: new Set(["2026-09-07"]),
    });
    out.push({
      id: "W13_sunday_and_holiday_closed",
      pass: !sun.allowed && sun.reason === "closed_sunday" && !hol.allowed &&
        hol.reason === "closed_national_holiday",
      detail: `sun=${sun.reason};hol=${hol.reason}`,
      realSends: 0,
    });
  }

  {
    const after22 = authorizeHarnessReply({ now: FIXTURE.tue2200, action: "reply" });
    const exitBlocked = wireDryRunExit({
      lead: { id: "x", state: "contacted", serviceOrigin: "first_contact" },
      text: "nao tenho interesse",
      now: FIXTURE.tue2200,
    });
    out.push({
      id: "W14_after_22_blocks_reply_and_exit",
      pass: !after22.allowed && exitBlocked.bubbles.length === 0 &&
        exitBlocked.replyGateReason === "outside_extended_window",
      detail: after22.reason,
      realSends: 0,
    });
  }

  {
    // Cadence: spacing 42–197s + fila sem antecipar + envelope por lead
    const t0 = new Date("2026-09-19T12:00:00.000Z");
    let q = emptyOutboundQueue();
    q = enqueue(
      q,
      makeOpenBubble1Envelope({
        id: "w15a1",
        leadId: "lead_A",
        conversationId: "cA",
        text: "A1",
        notBefore: t0,
      }),
    );
    let pick = pickNext(q, t0);
    const okA = pick.envelope?.leadId === "lead_A" && pick.envelope?.text === "A1";
    q = deliverPicked(q, pick.envelope!, t0, { rng: () => 0 }); // +42s
    q = enqueue(
      q,
      makeContinueEnvelope({
        id: "w15a2",
        leadId: "lead_A",
        conversationId: "cA",
        bubbleIndex: 2,
        text: "A2",
        notBefore: new Date(t0.getTime() + 30_000),
      }),
    );
    q = enqueue(
      q,
      makeOpenBubble1Envelope({
        id: "w15b1",
        leadId: "lead_B",
        conversationId: "cB",
        text: "B1",
        notBefore: new Date(t0.getTime() + LEAD_SPACING_MIN_MS),
      }),
    );
    pick = pickNext(q, new Date(t0.getTime() + 30_000));
    const okA2 = pick.envelope?.text === "A2";
    q = deliverPicked(q, pick.envelope!, new Date(t0.getTime() + 30_000));
    const tooEarly = pickNext(q, new Date(t0.getTime() + LEAD_SPACING_MIN_MS - 1));
    pick = pickNext(q, new Date(t0.getTime() + LEAD_SPACING_MIN_MS));
    const okB = pick.envelope?.leadId === "lead_B" && pick.envelope?.text === "B1" &&
      tooEarly.envelope === null &&
      q.spacing.lastSampledMs != null &&
      q.spacing.lastSampledMs >= LEAD_SPACING_MIN_MS &&
      q.spacing.lastSampledMs <= LEAD_SPACING_MAX_MS;
    out.push({
      id: "W15_cadence_spacing_and_queue",
      pass: okA && okA2 && okB,
      detail: `sampled=${q.spacing.lastSampledMs}`,
      realSends: 0,
    });
  }

  return out;
}

export const WIRE_SCENARIO_IDS = [
  "W1_no_go_blocked",
  "W2_supervised_dry_run_fc1",
  "W3_kill_blocks_auto",
  "W4_kill_allows_supervised_dry",
  "W5_outside_list_blocked",
  "W6_l2_real_forbidden",
  "W6b_pilot_live_supervised_ok",
  "W7_idempotent",
  "W8_exit_to_pool",
  "W9_pool_inbound_service",
  "W10_voice_off_blocks_real",
  "W11_attendance_open_vs_continue_after_18",
  "W12_saturday_reply_ok_open_blocked",
  "W13_sunday_and_holiday_closed",
  "W14_after_22_blocks_reply_and_exit",
  "W15_cadence_spacing_and_queue",
] as const;
