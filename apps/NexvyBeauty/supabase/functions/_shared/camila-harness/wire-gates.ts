// Wire gates — automático vs supervisionado + janela de atendimento (Harness Engineering).
// Pure: no Z-API. Real send never happens in L2 (dry_run forced).

import {
  decideAttendance,
  type AttendanceAction,
} from "./attendance-window.ts";

export type VoiceGate = "OFF" | "TEST" | "CANARY" | "LIVE";

export type SendKind = "automatic" | "supervised";

export type WireGateInput = {
  kind: SendKind;
  voice: VoiceGate;
  killOn: boolean;
  /** Required for supervised. */
  goId?: string | null;
  /** Manual list (preselected / pilot phones). */
  leadId: string;
  manualList: string[];
  /** Default true — dry plan. Set false only with pilotLive for real send. */
  dryRun?: boolean;
  /** Caller intends real WhatsApp (still gated). */
  allowRealWhatsapp?: boolean;
  /**
   * PRD-12: unlock real supervised send when true + allowReal + !dryRun +
   * goId + list + voice≠OFF. Default false → l2_real_whatsapp_forbidden.
   */
  pilotLive?: boolean;
  /** Relógio do harness (default: agora). Testes devem fixar. */
  now?: Date;
  /**
   * Ação de atendimento. Default: open_new_package (abertura = comercial).
   * continue/resume/reply/exit → estendida.
   */
  attendanceAction?: AttendanceAction;
  /** Datas YYYY-MM-DD (BRT) de feriados nacionais; vazio = não bloqueia por feriado. */
  holidayDates?: ReadonlySet<string> | null;
};

export type WireGateVerdict = {
  allowed: boolean;
  reason: string;
  /** Would have been dry-run even if allowed. */
  dryRun: boolean;
  attendanceReason?: string;
};

export type AttendanceReplyVerdict = {
  allowed: boolean;
  canOut: boolean;
  canIn: boolean;
  reason: string;
  window: string;
};

/**
 * Kill blocks AUTOMATIC only.
 * Supervised requires goId + lead on manual list.
 * Voice OFF blocks all (including supervised) for REAL send; dry-run may still plan.
 * Attendance windows always apply (comercial / estendida / fechado).
 * Real send: only when pilotLive + allowRealWhatsapp + dryRun===false + supervised path.
 */
export function authorizeWireSend(input: WireGateInput): WireGateVerdict {
  const dryRun = input.dryRun !== false; // default true
  const allowReal = input.allowRealWhatsapp === true;
  const pilotLive = input.pilotLive === true;
  const now = input.now ?? new Date();
  const attendanceAction: AttendanceAction = input.attendanceAction ??
    "open_new_package";

  if (allowReal && dryRun === false && !pilotLive) {
    return {
      allowed: false,
      reason: "l2_real_whatsapp_forbidden",
      dryRun: true,
    };
  }

  if (allowReal && dryRun === false && pilotLive && input.kind === "automatic") {
    return {
      allowed: false,
      reason: "automatic_real_forbidden",
      dryRun: true,
    };
  }

  const attendance = decideAttendance({
    now,
    action: attendanceAction,
    holidayDates: input.holidayDates,
  });
  if (!attendance.allowed) {
    return {
      allowed: false,
      reason: attendance.reason,
      dryRun,
      attendanceReason: attendance.reason,
    };
  }

  if (input.kind === "automatic") {
    if (input.killOn) {
      return { allowed: false, reason: "kill_blocks_automatic", dryRun };
    }
    if (input.voice === "OFF") {
      return { allowed: false, reason: "voice_off_blocks_automatic", dryRun };
    }
    return { allowed: false, reason: "automatic_not_enabled_in_harness_v1", dryRun };
  }

  // supervised
  if (!input.goId || String(input.goId).trim() === "") {
    return { allowed: false, reason: "supervised_requires_go_id", dryRun };
  }
  if (!input.manualList.includes(input.leadId)) {
    return { allowed: false, reason: "lead_not_on_manual_list", dryRun };
  }

  if (!dryRun && input.voice === "OFF") {
    return { allowed: false, reason: "voice_off_blocks_real_supervised", dryRun: false };
  }

  return {
    allowed: true,
    reason: dryRun ? "supervised_dry_run_ok" : "supervised_real_ok",
    dryRun,
    attendanceReason: attendance.reason,
  };
}

/** Reply / Mensagem de Saída: só janela (estendida) — sem GO/lista. */
export function authorizeHarnessReply(input: {
  now?: Date;
  action?: "reply" | "exit_message";
  holidayDates?: ReadonlySet<string> | null;
}): AttendanceReplyVerdict {
  const v = decideAttendance({
    now: input.now ?? new Date(),
    action: input.action ?? "reply",
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
