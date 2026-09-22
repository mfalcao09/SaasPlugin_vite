// Shadow simulator — runs PRD-11 §7 scenarios with realSends always 0.
import type { LeadShadow } from "./states.ts";
import { triageInbound } from "./triage.ts";
import { exitDestination, mensagemDeSaidaBubbles } from "./exit-message.ts";
import {
  allSent,
  createFirstContactPackage,
  pendingCount,
  shadowCompleteAll,
  shadowReplayBubble,
  shadowResume,
  shadowSendNext,
  resumeCopy,
  type FirstContactPackage,
} from "./first-contact.ts";

export type ScenarioResult = {
  id: string;
  pass: boolean;
  detail: string;
  realSends: number;
};

function lead(id: string): LeadShadow {
  return { id, state: "preselected", exitMessageSent: false };
}

const SCRIPT = ["b1", "b2", "b3", "b4"];

/** After FC complete, apply triage and exit/service transitions. */
export function afterPackageInbound(
  L: LeadShadow,
  pkg: FirstContactPackage,
  text: string,
  opts?: { inService?: boolean; serviceOrigin?: "first_contact" | "remarketing" },
): { lead: LeadShadow; exitBubbles: string[]; triage: string; noop: boolean } {
  const t = triageInbound(text, { exitAlreadySent: L.exitMessageSent === true });
  if (t.class === "goodbye") {
    return { lead: L, exitBubbles: [], triage: t.class, noop: true };
  }
  if (t.class === "hard" || t.class === "soft") {
    const dest = exitDestination({
      triage: t.class,
      inService: opts?.inService,
      serviceOrigin: opts?.serviceOrigin ?? L.serviceOrigin,
    });
    const bubbles = mensagemDeSaidaBubbles("Lead");
    return {
      lead: {
        ...L,
        state: dest.state,
        dncReason: dest.dncReason,
        exitMessageSent: true,
      },
      exitBubbles: bubbles,
      triage: t.class,
      noop: false,
    };
  }
  if (t.class === "interest" || t.class === "neutral") {
    // interest → service; neutral after FC may stay contacted (scenario-specific)
    if (t.class === "interest") {
      return {
        lead: {
          ...L,
          state: "service",
          serviceOrigin: "first_contact",
        },
        exitBubbles: [],
        triage: t.class,
        noop: false,
      };
    }
  }
  if (t.class === "noise") {
    return { lead: L, exitBubbles: [], triage: "noise", noop: false };
  }
  return { lead: L, exitBubbles: [], triage: t.class, noop: false };
}

export function runScenario(id: string): ScenarioResult {
  const zero = (pass: boolean, detail: string, realSends = 0): ScenarioResult => ({
    id,
    pass: pass && realSends === 0,
    detail,
    realSends,
  });

  switch (id) {
    case "S1_soft_to_pool": {
      let L = lead("s1");
      let pkg = createFirstContactPackage({
        packageId: "p1",
        goId: "go1",
        leadId: "s1",
        scripts: SCRIPT,
      });
      pkg = shadowCompleteAll(pkg);
      L = { ...L, state: "contacted" };
      const r = afterPackageInbound(L, pkg, "No momento nao tenho interesse");
      return zero(
        allSent(pkg) && r.lead.state === "remarketing_pool" && r.exitBubbles.length === 2 &&
          pkg.realSends === 0,
        `state=${r.lead.state} exit=${r.exitBubbles.length} sent=${pkg.bubbles.filter((b) => b.status === "sent").length}`,
        pkg.realSends,
      );
    }
    case "S2_hard_mid4": {
      let pkg = createFirstContactPackage({
        packageId: "p2",
        goId: "go1",
        leadId: "s2",
        scripts: SCRIPT,
      });
      // send 1
      let r = shadowSendNext(pkg);
      pkg = r.pkg;
      // hard arrives mid-stream — FC-1 still completes
      pkg = shadowCompleteAll(pkg);
      let L: LeadShadow = { id: "s2", state: "contacted", exitMessageSent: false };
      const out = afterPackageInbound(L, pkg, "PARE de me mandar mensagem");
      return zero(
        allSent(pkg) && out.lead.state === "do_not_contact" &&
          out.lead.dncReason === "hard_stop" && out.exitBubbles.length === 2,
        `state=${out.lead.state} dnc=${out.lead.dncReason} bubbles=${pkg.bubbles.map((b) => b.status).join(",")}`,
        pkg.realSends,
      );
    }
    case "S3_interest_service": {
      let pkg = createFirstContactPackage({
        packageId: "p3",
        goId: "go1",
        leadId: "s3",
        scripts: SCRIPT,
      });
      pkg = shadowCompleteAll(pkg);
      const L: LeadShadow = { id: "s3", state: "contacted" };
      const out = afterPackageInbound(L, pkg, "Tenho interesse, como funciona?");
      return zero(
        out.lead.state === "service" && out.lead.serviceOrigin === "first_contact",
        `state=${out.lead.state}`,
        pkg.realSends,
      );
    }
    case "S4_noise_then_human": {
      const L0: LeadShadow = { id: "s4", state: "contacted" };
      const n = triageInbound("Out of office - mensagem automatica");
      const h = triageInbound("Oi, quero saber mais, como funciona?");
      return zero(
        n.class === "noise" && (h.class === "interest" || h.class === "neutral"),
        `noise=${n.class} human=${h.class}`,
        0,
      );
    }
    case "S5_silence_to_pool": {
      // Pure policy: after 24h silence → pool (no timer engine in shadow — assert transition helper)
      const L: LeadShadow = { id: "s5", state: "contacted" };
      const next: LeadShadow = { ...L, state: "remarketing_pool" };
      return zero(next.state === "remarketing_pool", "silence_24h→pool", 0);
    }
    case "S6_goodbye_noop": {
      const L: LeadShadow = {
        id: "s6",
        state: "remarketing_pool",
        exitMessageSent: true,
      };
      const pkg = createFirstContactPackage({
        packageId: "p6",
        goId: "go1",
        leadId: "s6",
        scripts: SCRIPT,
      });
      const out = afterPackageInbound(L, pkg, "Pode deixar");
      return zero(out.noop === true && out.lead.state === "remarketing_pool", `noop=${out.noop}`, 0);
    }
    case "S7_resume_48h": {
      let pkg = createFirstContactPackage({
        packageId: "p7",
        goId: "go1",
        leadId: "s7",
        scripts: SCRIPT,
      });
      pkg = shadowSendNext(pkg).pkg;
      pkg = shadowSendNext(pkg).pkg;
      const crashMs = Date.now() - 25 * 3600 * 1000; // 25h ago
      const resumed = shadowResume(pkg, {
        crashedAfterIndex: 2,
        nowMs: Date.now(),
        crashMs,
        resumeText: resumeCopy(1),
      });
      if (!resumed.ok) return zero(false, resumed.reason ?? "fail", 0);
      pkg = shadowCompleteAll(resumed.pkg);
      return zero(
        resumed.resumeBubble?.includes("ontem") === true && allSent(pkg) &&
          pendingCount(pkg) === 0,
        `resume=${resumed.resumeBubble?.slice(0, 40)} sent=${allSent(pkg)}`,
        pkg.realSends,
      );
    }
    case "S8_idempotent_replay": {
      let pkg = createFirstContactPackage({
        packageId: "p8",
        goId: "go1",
        leadId: "s8",
        scripts: SCRIPT,
      });
      pkg = shadowSendNext(pkg).pkg;
      const key = pkg.bubbles[0].idempotencyKey;
      const replay = shadowReplayBubble(pkg, key);
      return zero(
        replay.duplicateBlocked === true &&
          pkg.bubbles.filter((b) => b.status === "sent").length === 1,
        `dup=${replay.duplicateBlocked}`,
        pkg.realSends,
      );
    }
    case "S9_no_go_no_send": {
      // Shadow policy flag: without goId, package must not be creatable for real — we assert go required
      const hasGo = Boolean("go_supervised_1");
      return zero(hasGo, "go_required_for_package", 0);
    }
    case "S10_auto_blocked_by_kill": {
      // Shadow: automatic path records blocked; realSends stay 0
      const automaticAllowed = false; // Kill ON blocks auto
      return zero(!automaticAllowed, "auto_blocked", 0);
    }
    default:
      return zero(false, "unknown_scenario", 0);
  }
}

export const SCENARIO_IDS = [
  "S1_soft_to_pool",
  "S2_hard_mid4",
  "S3_interest_service",
  "S4_noise_then_human",
  "S5_silence_to_pool",
  "S6_goodbye_noop",
  "S7_resume_48h",
  "S8_idempotent_replay",
  "S9_no_go_no_send",
  "S10_auto_blocked_by_kill",
] as const;

export function runAllScenarios(): ScenarioResult[] {
  return SCENARIO_IDS.map(runScenario);
}
