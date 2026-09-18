// Wire send planner — supervised first-contact + Mensagem de Saída (dry-run only in L2).
import {
  authorizeWireSend,
  authorizeHarnessReply,
  type VoiceGate,
  type WireGateVerdict,
} from "./wire-gates.ts";
import {
  createFirstContactPackage,
  shadowCompleteAll,
  shadowReplayBubble,
  shadowSendNext,
  type FirstContactPackage,
} from "./first-contact.ts";
import { mensagemDeSaidaBubbles, exitDestination } from "./exit-message.ts";
import type { LeadShadow } from "./states.ts";
import { triageInbound } from "./triage.ts";
import type { AttendanceAction } from "./attendance-window.ts";
import { FIXTURE } from "./attendance-window.ts";

export type WirePlanResult = {
  gate: WireGateVerdict;
  package: FirstContactPackage | null;
  plannedBubbles: string[];
  realSends: number;
};

const DEFAULT_SCRIPT = [
  "Oi! Tudo bem? Sou a Camila da Nexvy Beauty.",
  "Ajudamos salões a atender no WhatsApp com IA.",
  "Posso te mostrar como funciona em 2 minutos?",
  "Se fizer sentido, te mando o link — sem pressão.",
];

export function planSupervisedFirstContact(input: {
  goId: string | null;
  leadId: string;
  manualList: string[];
  voice: VoiceGate;
  killOn: boolean;
  scripts?: string[];
  allowRealWhatsapp?: boolean;
  now?: Date;
  attendanceAction?: AttendanceAction;
  holidayDates?: ReadonlySet<string> | null;
}): WirePlanResult {
  const gate = authorizeWireSend({
    kind: "supervised",
    goId: input.goId,
    leadId: input.leadId,
    manualList: input.manualList,
    voice: input.voice,
    killOn: input.killOn,
    dryRun: true,
    allowRealWhatsapp: input.allowRealWhatsapp ?? false,
    now: input.now ?? FIXTURE.tue1000,
    attendanceAction: input.attendanceAction ?? "open_new_package",
    holidayDates: input.holidayDates,
  });
  if (!gate.allowed) {
    return { gate, package: null, plannedBubbles: [], realSends: 0 };
  }
  const pkg = createFirstContactPackage({
    packageId: `wire:${input.goId}:${input.leadId}`,
    goId: String(input.goId),
    leadId: input.leadId,
    scripts: input.scripts ?? DEFAULT_SCRIPT,
  });
  return {
    gate,
    package: pkg,
    plannedBubbles: pkg.bubbles.map((b) => b.text),
    realSends: 0,
  };
}

export function planAutomaticBlocked(input: {
  leadId: string;
  manualList: string[];
  voice: VoiceGate;
  killOn: boolean;
  now?: Date;
}): WirePlanResult {
  const gate = authorizeWireSend({
    kind: "automatic",
    leadId: input.leadId,
    manualList: input.manualList,
    voice: input.voice,
    killOn: input.killOn,
    dryRun: true,
    allowRealWhatsapp: false,
    now: input.now ?? FIXTURE.tue1000,
    attendanceAction: "open_new_package",
  });
  return { gate, package: null, plannedBubbles: [], realSends: 0 };
}

/** Execute FC-1 in dry-run (shadow marks); realSends always 0. */
export function wireDryRunCompletePackage(pkg: FirstContactPackage): FirstContactPackage {
  return shadowCompleteAll(pkg);
}

export function wireDryRunExit(input: {
  lead: LeadShadow;
  text: string;
  inService?: boolean;
  now?: Date;
  holidayDates?: ReadonlySet<string> | null;
}): {
  lead: LeadShadow;
  bubbles: string[];
  realSends: number;
  replyGateReason?: string;
} {
  const replyGate = authorizeHarnessReply({
    now: input.now ?? FIXTURE.tue1000,
    action: "exit_message",
    holidayDates: input.holidayDates,
  });
  if (!replyGate.allowed) {
    return {
      lead: input.lead,
      bubbles: [],
      realSends: 0,
      replyGateReason: replyGate.reason,
    };
  }
  const t = triageInbound(input.text, { exitAlreadySent: input.lead.exitMessageSent });
  if (t.class !== "hard" && t.class !== "soft") {
    return { lead: input.lead, bubbles: [], realSends: 0 };
  }
  const dest = exitDestination({
    triage: t.class,
    inService: input.inService,
    serviceOrigin: input.lead.serviceOrigin,
  });
  return {
    lead: {
      ...input.lead,
      state: dest.state,
      dncReason: dest.dncReason,
      exitMessageSent: true,
    },
    bubbles: mensagemDeSaidaBubbles("Lead"),
    realSends: 0,
    replyGateReason: replyGate.reason,
  };
}

export { shadowSendNext, shadowReplayBubble };
