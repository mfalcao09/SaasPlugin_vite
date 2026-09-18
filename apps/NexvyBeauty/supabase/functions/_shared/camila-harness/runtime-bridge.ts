// Runtime bridge — harness v1.2 integration helpers + attendance gates.
// ALWAYS dry-run for WhatsApp unless explicitly flipped (pilot GO) — default OFF.
import {
  authorizeWireSend,
  authorizeHarnessReply,
  type VoiceGate,
  type WireGateVerdict,
} from "./wire-gates.ts";
import { planSupervisedFirstContact } from "./wire-send.ts";
import { wireApplyInbound, silence24hToPool } from "./wire-pool.ts";
import { triageInbound } from "./triage.ts";
import type { LeadShadow } from "./states.ts";
import { FIXTURE, type AttendanceAction } from "./attendance-window.ts";

const ATTENDANCE_ACTIONS: readonly AttendanceAction[] = [
  "open_new_package",
  "continue_package",
  "resume_package",
  "reply",
  "exit_message",
];

export function parseAttendanceAction(raw: unknown): AttendanceAction {
  const s = String(raw ?? "open_new_package");
  return (ATTENDANCE_ACTIONS as readonly string[]).includes(s)
    ? s as AttendanceAction
    : "open_new_package";
}

/** Resposta ou Mensagem de Saída: só janela + feriado. Nunca monta as 4 mensagens. */
export function harnessPlanConversationOut(input: {
  now: Date;
  action: "reply" | "exit_message";
  holidayDates?: ReadonlySet<string> | null;
}): { allowed: boolean; reason: string; plannedBubbles: string[]; realSends: 0 } {
  const v = authorizeHarnessReply({
    now: input.now,
    action: input.action,
    holidayDates: input.holidayDates,
  });
  return {
    allowed: v.allowed,
    reason: v.reason,
    plannedBubbles: [],
    realSends: 0,
  };
}

export const HARNESS_RUNTIME_VERSION = "camila-harness-runtime@1.1";

/** Env: never allow real WA from harness unless both flags set (pilot). Default false. */
export function harnessAllowsRealWhatsapp(env: {
  get: (k: string) => string | undefined;
}): boolean {
  return env.get("HARNESS_PILOT_LIVE") === "1" &&
    env.get("HARNESS_ALLOW_REAL_WHATSAPP") === "1";
}

export function readVoiceGate(env: { get: (k: string) => string | undefined }): VoiceGate {
  const v = String(env.get("CAMILA_VOICE_GATE") ?? env.get("RELEASE_STATE") ?? "OFF")
    .toUpperCase();
  if (v === "TEST" || v === "CANARY" || v === "LIVE") return v;
  return "OFF";
}

export function readKillOn(env: { get: (k: string) => string | undefined }): boolean {
  const k = env.get("CAMILA_KILL_SWITCH") ?? env.get("KILL_SWITCH");
  if (k === "0" || k === "false" || k === "FALSE") return false;
  return true; // default ON (fail-closed)
}

export function parseManualList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Plan supervised first-contact. Forces dryRun unless harnessAllowsRealWhatsapp.
 * Even then, caller must still refuse deliver() unless pilot GO — this function
 * never invokes Z-API.
 */
export function harnessPlanSupervised(input: {
  goId: string | null;
  leadId: string;
  manualList: string[];
  env: { get: (k: string) => string | undefined };
  now?: Date;
  attendanceAction?: AttendanceAction;
  holidayDates?: ReadonlySet<string> | null;
}): {
  gate: WireGateVerdict;
  plannedBubbles: string[];
  realSends: number;
  dryRunForced: true;
  runtimeVersion: string;
} {
  const allowReal = harnessAllowsRealWhatsapp(input.env);
  const gate = authorizeWireSend({
    kind: "supervised",
    goId: input.goId,
    leadId: input.leadId,
    manualList: input.manualList,
    voice: readVoiceGate(input.env),
    killOn: readKillOn(input.env),
    dryRun: true,
    allowRealWhatsapp: false,
    now: input.now ?? FIXTURE.tue1000,
    attendanceAction: input.attendanceAction ?? "open_new_package",
    holidayDates: input.holidayDates,
  });
  if (!gate.allowed) {
    return {
      gate,
      plannedBubbles: [],
      realSends: 0,
      dryRunForced: true,
      runtimeVersion: HARNESS_RUNTIME_VERSION,
    };
  }
  const plan = planSupervisedFirstContact({
    goId: input.goId,
    leadId: input.leadId,
    manualList: input.manualList,
    voice: readVoiceGate(input.env),
    killOn: readKillOn(input.env),
    allowRealWhatsapp: false,
    now: input.now ?? FIXTURE.tue1000,
    attendanceAction: input.attendanceAction ?? "open_new_package",
    holidayDates: input.holidayDates,
  });
  return {
    gate: plan.gate,
    plannedBubbles: plan.plannedBubbles,
    realSends: 0,
    dryRunForced: true,
    runtimeVersion: HARNESS_RUNTIME_VERSION,
    ...(allowReal ? {} : {}),
  };
}

export function harnessPlanAutomaticBlocked(input: {
  leadId: string;
  manualList: string[];
  env: { get: (k: string) => string | undefined };
  now?: Date;
  holidayDates?: ReadonlySet<string> | null;
  attendanceAction?: AttendanceAction;
}): WireGateVerdict {
  return authorizeWireSend({
    kind: "automatic",
    leadId: input.leadId,
    manualList: input.manualList,
    voice: readVoiceGate(input.env),
    killOn: readKillOn(input.env),
    dryRun: true,
    allowRealWhatsapp: false,
    now: input.now ?? FIXTURE.tue1000,
    attendanceAction: input.attendanceAction ?? "open_new_package",
    holidayDates: input.holidayDates,
  });
}

/**
 * Build conversation.metadata.harness patch from inbound (triage always).
 * Reply permission is gated by janela estendida — does not send WhatsApp.
 */
export function harnessInboundMetaPatch(
  prevMeta: Record<string, unknown>,
  text: string,
  opts?: {
    now?: Date;
    holidayDates?: ReadonlySet<string> | null;
  },
): {
  metadata: Record<string, unknown>;
  triage: string;
  cite: boolean;
  replyAllowed: boolean;
  replyReason: string;
} {
  const state = String(prevMeta.harness_state ?? "contacted") as LeadShadow["state"];
  const lead: LeadShadow = {
    id: String(prevMeta.harness_lead_id ?? "unknown"),
    state: [
        "db",
        "preselected",
        "contacted",
        "remarketing_pool",
        "service",
        "do_not_contact",
        "closing",
        "onboarding",
      ].includes(state)
      ? state as LeadShadow["state"]
      : "contacted",
    exitMessageSent: prevMeta.harness_exit_sent === true,
    serviceOrigin: (prevMeta.harness_service_origin as LeadShadow["serviceOrigin"]) ??
      "first_contact",
  };
  const applied = wireApplyInbound(lead, text);
  const t = triageInbound(text, { exitAlreadySent: lead.exitMessageSent });
  const reply = authorizeHarnessReply({
    now: opts?.now ?? new Date(),
    action: "reply",
    holidayDates: opts?.holidayDates,
  });
  return {
    triage: applied.triage,
    cite: applied.cite,
    replyAllowed: reply.allowed && reply.canIn,
    replyReason: reply.reason,
    metadata: {
      ...prevMeta,
      harness_runtime_version: HARNESS_RUNTIME_VERSION,
      harness_state: applied.lead.state,
      harness_last_triage: t.class,
      harness_last_triage_reason: t.reason,
      harness_cite_inbound: applied.cite,
      harness_reply_allowed: reply.allowed && reply.canIn,
      harness_reply_reason: reply.reason,
      harness_attendance_window: reply.window,
      harness_updated_at: new Date().toISOString(),
      harness_real_whatsapp: false,
    },
  };
}

export function harnessSilenceToPoolMeta(
  prevMeta: Record<string, unknown>,
): Record<string, unknown> {
  const lead: LeadShadow = {
    id: "x",
    state: "contacted",
  };
  const next = silence24hToPool(lead);
  return {
    ...prevMeta,
    harness_state: next.state,
    harness_silence_24h_at: new Date().toISOString(),
    harness_real_whatsapp: false,
  };
}
