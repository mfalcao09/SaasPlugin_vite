// Porta + Juiz — contrato executável (MODEL-PORTA-JUIZ.md).
// Harness = porta (tempo, humano, dívida). Cérebro = juiz (texto).
//   deno test --no-check supabase/functions/_shared/camila-harness/porta-juiz.test.ts

import { triageInbound, type TriageClass } from "./triage.ts";

/** 180s após a 1ª bolha: prazo do pacote (G4c). */
export const PACKAGE_LIMIT_MS = 180_000;

export type InboundVerdict =
  | "pending"
  | "noise"
  | "exit"
  | "attend"
  | "consent_asked"
  | "consent_yes"
  | "consent_no";

export type ConversationStatus =
  | "bot_active"
  | "human_active"
  | "waiting_human"
  | "closed"
  | string;

export type WakeFlags = {
  pending_inbound_id: string | null;
  needs_new_consent: boolean;
  spoke_during_package: boolean;
  wake_reason: "pending_inbound" | null;
};

export type ActivationAction = "stop" | "wait_package" | "job";

export type ActivationInput = {
  harnessProduct: boolean;
  status: ConversationStatus;
  dncOrHard: boolean;
  /** Boca 1 ainda no ar: faltam bolhas ou <180s sem 4 wamids. */
  packageInFlight: boolean;
  pendingInboundId: string | null;
  spokeDuringPackage: boolean;
  brainAlreadyRepliedWamid: boolean;
  windowAllowsReply: boolean;
};

export type ActivationDecision = {
  action: ActivationAction;
  reason: string;
  flags: WakeFlags;
};

export type PackageBubble = {
  index: 1 | 2 | 3 | 4;
  wamid: string | null;
  /** false = ainda não tentou enviar; G4b não reenvia. Default true. */
  attempted?: boolean;
};

/** Wamid no CRM: vários nomes do Z-API / eco fromMe / cérebro. */
export function extractWamid(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  for (const k of ["wamid", "evolution_message_id", "zaapId", "zaap_id", "messageId"]) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** G1: outbound do cérebro com wamid. Boca 1 / inbox / eco do chip não conta. */
export function isBrainOutboundWamid(input: {
  direction?: string | null;
  senderType?: string | null;
  metadata?: unknown;
}): boolean {
  if (input.direction !== "outbound") return false;
  if (input.senderType !== "bot") return false;
  const m = input.metadata && typeof input.metadata === "object"
    ? input.metadata as Record<string, unknown>
    : {};
  if (m.harness_mouth === 1) return false;
  if (typeof m.agent_id !== "string" || !m.agent_id.trim()) return false;
  return extractWamid(m) != null;
}

export type PackageReviewInput = {
  firstBubbleAtMs: number | null;
  nowMs: number;
  bubbles: readonly PackageBubble[];
};

export type PackageReview = {
  closed: boolean;
  reason: "open" | "four_wamids" | "deadline_180s" | "not_started";
  /** Índices sem wamid que o tick deve reenviar (só se ainda aberto). */
  resendIndexes: number[];
  wamidCount: number;
};

const EMPTY_FLAGS: WakeFlags = {
  pending_inbound_id: null,
  needs_new_consent: false,
  spoke_during_package: false,
  wake_reason: null,
};

function flagsForJob(input: ActivationInput): WakeFlags {
  return {
    pending_inbound_id: input.pendingInboundId,
    needs_new_consent: input.dncOrHard,
    spoke_during_package: input.spokeDuringPackage,
    wake_reason: "pending_inbound",
  };
}

/**
 * G5 — acordar o juiz. Não classifica texto.
 * #2 DNC não trava: sobe needs_new_consent e segue.
 */
export function decideActivation(input: ActivationInput): ActivationDecision {
  if (!input.harnessProduct) {
    return { action: "stop", reason: "not_harness_product", flags: EMPTY_FLAGS };
  }
  const human = input.status === "human_active" ||
    input.status === "waiting_human";
  if (human) {
    return { action: "stop", reason: "human_in_loop", flags: EMPTY_FLAGS };
  }
  if (input.packageInFlight) {
    return { action: "wait_package", reason: "mouth1_in_flight", flags: EMPTY_FLAGS };
  }
  if (!input.pendingInboundId) {
    return { action: "stop", reason: "no_pending_inbound", flags: EMPTY_FLAGS };
  }
  if (input.brainAlreadyRepliedWamid) {
    return { action: "stop", reason: "brain_already_replied", flags: EMPTY_FLAGS };
  }
  const f = flagsForJob(input);
  if (!input.windowAllowsReply) {
    return { action: "job", reason: "job_held_window", flags: f };
  }
  return { action: "job", reason: "job_ready", flags: f };
}

/**
 * G1 — dívida: falou e o cérebro ainda não respondeu no WhatsApp.
 * Outbound da boca 1 / sistema NÃO apaga dívida.
 */
export function isBrainDebt(input: {
  hasVisitorInbound: boolean;
  brainOutboundWamidAfterInbound: boolean;
}): boolean {
  return input.hasVisitorInbound && !input.brainOutboundWamidAfterInbound;
}

/** G4 a+b+c — revisor de entrega + fechamento. */
export function reviewFirstContactPackage(
  input: PackageReviewInput,
): PackageReview {
  if (input.firstBubbleAtMs == null) {
    return {
      closed: false,
      reason: "not_started",
      resendIndexes: [],
      wamidCount: 0,
    };
  }
  const wamidCount = input.bubbles.filter((b) => Boolean(b.wamid)).length;
  const missing = input.bubbles
    .filter((b) => !b.wamid && b.attempted !== false)
    .map((b) => b.index);
  if (wamidCount >= 4) {
    return { closed: true, reason: "four_wamids", resendIndexes: [], wamidCount };
  }
  const elapsed = input.nowMs - input.firstBubbleAtMs;
  if (elapsed >= PACKAGE_LIMIT_MS) {
    return {
      closed: true,
      reason: "deadline_180s",
      resendIndexes: [],
      wamidCount,
    };
  }
  return {
    closed: false,
    reason: "open",
    resendIndexes: missing,
    wamidCount,
  };
}

export type JuizMode = "consent" | "triage";
export type JuizAto = {
  mode: JuizMode;
  speak: "consent_question" | "exit" | "attend" | "silence";
  verdict: InboundVerdict;
  triage: TriageClass | null;
  reason: string;
};

const YES = /^(sim|quero|pode|confirma|confirmado|vamos|ok,\s*quero|pode\s+retomar)[\s!.]*$/i;
const NO = /^(n[aã]o|para|pare|sair|nao\s+quero|deixa)[\s!.]*$/i;

/**
 * G6+G8 — primeiro ato do cérebro. Flags não substituem o texto.
 * Dúvida → silence (noise). Consentimento é a única fala após DNC até sim/não.
 */
export function juizPrimeiroAto(input: {
  needsNewConsent: boolean;
  text: string;
  exitAlreadySent?: boolean;
}): JuizAto {
  const text = String(input.text ?? "").trim();
  if (input.needsNewConsent) {
    if (YES.test(text)) {
      return {
        mode: "consent",
        speak: "attend",
        verdict: "consent_yes",
        triage: null,
        reason: "consent_yes",
      };
    }
    if (NO.test(text) || text.length === 0) {
      return {
        mode: "consent",
        speak: text.length === 0 ? "consent_question" : "silence",
        verdict: text.length === 0 ? "consent_asked" : "consent_no",
        triage: null,
        reason: text.length === 0 ? "consent_ask" : "consent_no",
      };
    }
    // Primeira inbound após DNC (ex.: "como funciona?") → pergunta, não demo.
    if (!YES.test(text) && !NO.test(text)) {
      return {
        mode: "consent",
        speak: "consent_question",
        verdict: "consent_asked",
        triage: null,
        reason: "consent_required_before_attend",
      };
    }
  }

  const t = triageInbound(text, { exitAlreadySent: input.exitAlreadySent });
  if (t.class === "hard" || t.class === "soft") {
    return {
      mode: "triage",
      speak: "exit",
      verdict: "exit",
      triage: t.class,
      reason: t.reason,
    };
  }
  if (t.class === "noise" || t.class === "goodbye") {
    return {
      mode: "triage",
      speak: "silence",
      verdict: "noise",
      triage: t.class,
      reason: t.reason,
    };
  }
  if (t.class === "interest" || t.class === "neutral") {
    const ambiguous = t.reason === "empty";
    if (ambiguous) {
      return {
        mode: "triage",
        speak: "silence",
        verdict: "noise",
        triage: t.class,
        reason: "g8_doubt_silence",
      };
    }
    return {
      mode: "triage",
      speak: "attend",
      verdict: "attend",
      triage: t.class,
      reason: t.reason,
    };
  }
  return {
    mode: "triage",
    speak: "silence",
    verdict: "noise",
    triage: t.class,
    reason: "g8_doubt_silence",
  };
}

export const CONSENT_QUESTION_DRAFT =
  "Você havia pedido para parar o atendimento. Confirma que deseja retomar e saber mais do nosso software?";
