// _shared/cold-outreach/camila-conductor-policy.ts
//
// Política de wake da vendedora Camila (harness próprio — NÃO é a régua Duda).
// Fonte: tasks/CAMILA-HARNESS-REGRAS.md
//
//   deno test --allow-env supabase/functions/_shared/cold-outreach/camila-conductor-policy.test.ts

import { withinWindow, DEFAULT_WINDOW, type WindowConfig } from "./anti-ban.ts";
import {
  assessConversationTrail,
  type TrailMessage,
  type TrailNextAction,
} from "./conversation-trail.ts";
import { normalize } from "./opt-out.ts";
import { isAutoReply } from "./auto-reply.ts";

/**
 * Auto-reply de loja (away) — NÃO usar isAutoReply cru: o padrão pix+agendamento
 * dá falso positivo em lead humana curta ("pix … taxa de agendamento").
 * Away típico: "agradece seu contato" / "fora do horário" / mensagem longa comercial.
 */
export function isAwayAutoReplyInbound(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  if (/\bagradece\s+(seu|o)\s+contato\b/.test(n)) return true;
  if (/\bfora\s+do\s+horario\s+de\s+atendimento\b/.test(n)) return true;
  if (/\bno\s+momento\s+estamos\s+(fora|offline|indispon)/.test(n)) return true;
  if (/\bfora\s+do\s+expediente\b/.test(n)) return true;
  // Heurística longa do auto-reply.ts só em msgs longas (catálogo/away).
  if (n.length >= 160 && isAutoReply(text)) return true;
  return false;
}

/** v1: só as 5 do incidente. Depois do dry-run verde, expandir (ver REGRAS §6). */
export const INCIDENT_ALLOWLIST: ReadonlySet<string> = new Set([
  "7e427cd4-5181-445d-9eb1-f05906b8f42d", // Deise
  "e882518f-5ebd-457d-8c3c-dc33f400a7a1", // Expert
  "01385b74-29ab-4044-bf10-3a2bcc26928c", // Ellas
  "db870f09-54d1-4e1b-a221-6af8fb24788f", // Jeissiane
  "db7991a9-df6c-4665-8d9b-481b1cc48d53", // Emilly
]);

export const CAMILA_WINDOW: WindowConfig = { ...DEFAULT_WINDOW };

/**
 * Dívida (ela falou, Camila calou) em conversa JÁ ATIVA: janela mais larga.
 * Evita o furo 17:58→debounce 2min→18:00 fora da janela comercial (lead esfria).
 * Cold/conduct continuam em CAMILA_WINDOW (9–18).
 */
export const CAMILA_ACTIVE_DEBT_WINDOW: WindowConfig = {
  startHour: 8,
  endHour: 22,
  days: [1, 2, 3, 4, 5, 6], // seg–sáb
  timeZone: "America/Sao_Paulo",
};

export const DEBT_DEBOUNCE_MS = 2 * 60 * 1000;
export const CONDUCT_AFTER_MS = 45 * 60 * 1000;
export const WAKE_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const MAX_WAKES_PER_HOUR = 8;

export type CamilaWakeKind = "debt" | "conduct" | "cold_resume" | "noop";

export interface CamilaWakeInput {
  conversationId: string;
  messages: TrailMessage[];
  lastWakeAtMs?: number | null;
  wakesInLastHour?: number;
  now: Date;
  /** default: INCIDENT_ALLOWLIST.has(id) */
  inAllowlist?: boolean;
  window?: WindowConfig;
  /**
   * Loja aceita OUT nossa agora (perfil WA business hours).
   * false → cold/conduct viram noop lead_closed; dívida (ela falou) permanece.
   * null/undefined → não sabemos; usa só a janela da Camila.
   */
  leadAcceptingOutbound?: boolean | null;
}

export interface CamilaWakeDecision {
  kind: CamilaWakeKind;
  due: boolean;
  reason: string;
  nextAction: TrailNextAction | null;
}

function msgMs(m: TrailMessage): number | null {
  if (!m.created_at) return null;
  const t = Date.parse(m.created_at);
  return Number.isFinite(t) ? t : null;
}

function isOut(m: TrailMessage): boolean {
  const d = String(m.direction ?? "").toLowerCase();
  if (d === "outbound" || d === "out") return true;
  const s = String(m.sender_type ?? "").toLowerCase();
  return s === "agent" || s === "bot" || s === "ai" || s === "system";
}

function isIn(m: TrailMessage): boolean {
  const d = String(m.direction ?? "").toLowerCase();
  return d === "inbound" || d === "in";
}

function lastOf(
  msgs: TrailMessage[],
  pred: (m: TrailMessage) => boolean,
): { msg: TrailMessage; ms: number } | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!pred(m)) continue;
    const ms = msgMs(m);
    if (ms == null) continue;
    return { msg: m, ms };
  }
  return null;
}

const CONDUCT_ACTIONS: ReadonlySet<TrailNextAction> = new Set([
  "bridge_diagnostic_to_value",
  "advance_next_beat",
  "describe_product_after_yes",
]);

/**
 * Decide se a Camila deve acordar o brain nesta conversa AGORA.
 * Nunca recomenda espera passiva como estratégia de venda — só "noop" por
 * escopo/janela/teto (infra), não por "deixar a lead pensar".
 */
export function decideCamilaWake(input: CamilaWakeInput): CamilaWakeDecision {
  const nowMs = input.now.getTime();
  const window = input.window ?? CAMILA_WINDOW;
  const inAllowlist = input.inAllowlist ?? INCIDENT_ALLOWLIST.has(input.conversationId);
  const lastWake = input.lastWakeAtMs ?? null;
  const wakesHour = input.wakesInLastHour ?? 0;

  if (!inAllowlist) {
    return { kind: "noop", due: false, reason: "scope_v1", nextAction: null };
  }
  if (lastWake != null && nowMs - lastWake < WAKE_COOLDOWN_MS) {
    return { kind: "noop", due: false, reason: "cooldown_2h", nextAction: null };
  }
  if (wakesHour >= MAX_WAKES_PER_HOUR) {
    return { kind: "noop", due: false, reason: "cap_hour", nextAction: null };
  }

  const chrono = input.messages.slice().sort((a, b) => {
    const ta = msgMs(a) ?? 0;
    const tb = msgMs(b) ?? 0;
    return ta - tb;
  });
  const trail = assessConversationTrail(chrono);
  const lastIn = lastOf(chrono, isIn);
  const lastOut = lastOf(chrono, isOut);
  const debtWindow = CAMILA_ACTIVE_DEBT_WINDOW;
  const inCommercial = withinWindow(input.now, window);
  const inDebtWindow = withinWindow(input.now, debtWindow);

  // Dívida: última humana mais nova que a nossa OUT, já passou o debounce.
  // Conversa ativa (já houve OUT nossa) → janela estendida 8–22; não deixa esfriar às 18h.
  if (lastIn && (!lastOut || lastIn.ms > lastOut.ms)) {
    const lastInText = String(lastIn.msg.content ?? "");
    if (isAwayAutoReplyInbound(lastInText)) {
      return {
        kind: "noop",
        due: false,
        reason: "auto_reply_inbound",
        nextAction: trail.nextAction,
      };
    }
    const age = nowMs - lastIn.ms;
    if (age < DEBT_DEBOUNCE_MS) {
      return {
        kind: "noop",
        due: false,
        reason: "debt_debounce",
        nextAction: trail.nextAction,
      };
    }
    const threadActive = !!lastOut; // já falamos nesta trilha
    if (threadActive ? !inDebtWindow : !inCommercial) {
      return {
        kind: "noop",
        due: false,
        reason: threadActive ? "outside_active_debt_window" : "outside_window",
        nextAction: trail.nextAction,
      };
    }
    return {
      kind: "debt",
      due: true,
      reason: "inbound_unanswered",
      nextAction: trail.nextAction,
    };
  }

  // Cold / conduct: janela comercial estrita 9–18.
  if (!inCommercial) {
    return { kind: "noop", due: false, reason: "outside_window", nextAction: null };
  }

  // Condução / frio: última bola é nossa.
  if (lastOut && (!lastIn || lastOut.ms >= lastIn.ms)) {
    const silence = nowMs - lastOut.ms;

    if (CONDUCT_ACTIONS.has(trail.nextAction)) {
      if (silence >= CONDUCT_AFTER_MS) {
        if (input.leadAcceptingOutbound === false) {
          return {
            kind: "noop",
            due: false,
            reason: "lead_closed",
            nextAction: trail.nextAction,
          };
        }
        return {
          kind: "conduct",
          due: true,
          reason: "trail_conduct_due",
          nextAction: trail.nextAction,
        };
      }
      return {
        kind: "noop",
        due: false,
        reason: "conduct_wait_45m",
        nextAction: trail.nextAction,
      };
    }

    if (trail.nextAction === "mode_a_r1_r2") {
      if (input.leadAcceptingOutbound === false) {
        return {
          kind: "noop",
          due: false,
          reason: "lead_closed",
          nextAction: trail.nextAction,
        };
      }
      // Já estamos na janela (checado acima) → due.
      return {
        kind: "cold_resume",
        due: true,
        reason: "opening_silence_in_window",
        nextAction: trail.nextAction,
      };
    }

    // Mode B/C hanging as last assessment without newer inbound shouldn't happen
    // often; if trail says mode_b but last is out, treat as cold/conduct noop.
    return {
      kind: "noop",
      due: false,
      reason: `trail_${trail.nextAction}_no_wake`,
      nextAction: trail.nextAction,
    };
  }

  return { kind: "noop", due: false, reason: "no_messages", nextAction: null };
}
