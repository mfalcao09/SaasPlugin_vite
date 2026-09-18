// Outbound queue — um envelope por vez; nunca antes de not_before; lead_id no envelope.
// Prioridade: (1) reply/exit de quem respondeu (2) continuar pacote em curso (3) abrir 1ª do próximo.

import {
  afterFirstBubbleSent,
  canOpenNextLeadFirstBubble,
  emptyLeadSpacing,
  type LeadSpacingState,
  type LeadSpacingConfig,
  DEFAULT_LEAD_SPACING,
} from "./lead-spacing.ts";

export type OutboundKind =
  | "open_bubble1"
  | "continue_bubble"
  | "resume"
  | "reply"
  | "exit_message";

export type OutboundLinkPreview = {
  linkUrl: string;
  title: string;
  linkDescription: string;
  image: string;
  linkType: "SMALL" | "MEDIUM" | "LARGE";
};

export type OutboundEnvelope = {
  id: string;
  leadId: string;
  /** Conversation CRM id OU lead UUID canônico quando ainda sem conversa. */
  conversationId: string;
  /** UUID platform_crm_leads — para transição de estágio. */
  crmLeadId?: string;
  kind: OutboundKind;
  /** 1..4 para pacote; 1=texto / 2=link na Mensagem de Saída. */
  bubbleIndex: number | null;
  text: string;
  /** Não enviar antes deste instante (ISO). */
  notBeforeIso: string;
  idempotencyKey: string;
  /** Bolha 2 da saída: card OG, não URL crua. */
  sendAs?: "text" | "link";
  linkPreview?: OutboundLinkPreview;
};

export type OutboundQueueState = {
  pending: OutboundEnvelope[];
  /** true enquanto houver pacote FC incompleto deste lead. */
  inFlightLeadId: string | null;
  spacing: LeadSpacingState;
  /** Último envelope entregue (auditoria). */
  lastDeliveredId: string | null;
};

export function emptyOutboundQueue(): OutboundQueueState {
  return {
    pending: [],
    inFlightLeadId: null,
    spacing: emptyLeadSpacing(),
    lastDeliveredId: null,
  };
}

export function enqueue(
  state: OutboundQueueState,
  envelope: OutboundEnvelope,
): OutboundQueueState {
  if (state.pending.some((e) => e.idempotencyKey === envelope.idempotencyKey)) {
    return state; // idempotente
  }
  return { ...state, pending: [...state.pending, envelope] };
}

function priorityRank(e: OutboundEnvelope, _inFlightLeadId: string | null): number {
  // Resposta ou saída de quem escreveu vence continuar o script.
  if (e.kind === "reply" || e.kind === "exit_message") return 0;
  if (e.kind === "continue_bubble" || e.kind === "resume") return 1;
  if (e.kind === "open_bubble1") return 4;
  return 5;
}

function isDue(e: OutboundEnvelope, nowMs: number): boolean {
  const t = Date.parse(e.notBeforeIso);
  return Number.isFinite(t) && t <= nowMs;
}

/**
 * Escolhe o próximo envelope devido. Nunca antecipa not_before.
 * open_bubble1 também exige lead-spacing (próximo lead).
 */
export function pickNext(
  state: OutboundQueueState,
  now: Date,
): { envelope: OutboundEnvelope | null; reason: string } {
  const nowMs = now.getTime();
  const due = state.pending.filter((e) => isDue(e, nowMs));
  if (due.length === 0) {
    return { envelope: null, reason: "none_due" };
  }

  const ranked = due.slice().sort((a, b) => {
    const pa = priorityRank(a, state.inFlightLeadId);
    const pb = priorityRank(b, state.inFlightLeadId);
    if (pa !== pb) return pa - pb;
    const ta = Date.parse(a.notBeforeIso);
    const tb = Date.parse(b.notBeforeIso);
    if (ta !== tb) return ta - tb;
    const ia = a.bubbleIndex ?? 99;
    const ib = b.bubbleIndex ?? 99;
    if (ia !== ib) return ia - ib;
    return a.id.localeCompare(b.id);
  });

  for (const e of ranked) {
    if (e.kind === "open_bubble1") {
      const space = canOpenNextLeadFirstBubble(state.spacing, now);
      if (!space.allowed) {
        continue; // espera spacing; tenta outros due
      }
    }
    // Mensagem de Saída: texto (1) antes do link (2). Id "exit:site" < "exit:soft"
    // no localeCompare — sem esta guarda o card sai primeiro e sem preview.
    if (
      e.kind === "exit_message" && e.bubbleIndex === 2 &&
      state.pending.some((p) =>
        p.leadId === e.leadId && p.kind === "exit_message" && p.bubbleIndex === 1
      )
    ) {
      continue;
    }
    return { envelope: e, reason: "picked" };
  }

  return { envelope: null, reason: "waiting_lead_spacing_or_not_before" };
}

/**
 * Entrega (marca enviado) o envelope escolhido. Atualiza spacing se for bolha 1.
 * realSends fica a cargo do caller piloto; aqui só estado puro.
 */
export function deliverPicked(
  state: OutboundQueueState,
  envelope: OutboundEnvelope,
  deliveredAt: Date,
  opts?: {
    packageComplete?: boolean;
    spacingCfg?: LeadSpacingConfig;
    rng?: () => number;
  },
): OutboundQueueState {
  const pending = state.pending.filter((e) => e.id !== envelope.id);
  let spacing = state.spacing;
  let inFlightLeadId = state.inFlightLeadId;

  if (envelope.kind === "open_bubble1" || envelope.kind === "resume") {
    spacing = afterFirstBubbleSent(
      spacing,
      deliveredAt,
      opts?.spacingCfg ?? DEFAULT_LEAD_SPACING,
      opts?.rng ?? Math.random,
    );
    inFlightLeadId = envelope.leadId;
  } else if (
    envelope.kind === "continue_bubble"
  ) {
    inFlightLeadId = envelope.leadId;
  }

  if (opts?.packageComplete === true && envelope.leadId === inFlightLeadId) {
    inFlightLeadId = null;
  }
  // bolha 4 = pacote completo se bubbleIndex === 4
  if (
    (envelope.kind === "continue_bubble" || envelope.kind === "open_bubble1" ||
      envelope.kind === "resume") &&
    envelope.bubbleIndex === 4
  ) {
    inFlightLeadId = null;
  }

  return {
    pending,
    inFlightLeadId,
    spacing,
    lastDeliveredId: envelope.id,
  };
}

/** Tira envelopes (e in-flight) de um lead que saiu do funil ativo. */
export function dropLeadPending(
  state: OutboundQueueState,
  leadRef: string,
): OutboundQueueState {
  const ref = String(leadRef ?? "");
  const digits = ref.replace(/\D/g, "");
  const hit = (id: string | undefined) => {
    if (!id) return false;
    if (id === ref) return true;
    const d = id.replace(/\D/g, "");
    return Boolean(digits && d && d === digits);
  };
  const pending = state.pending.filter((e) => !hit(e.leadId) && !hit(e.crmLeadId));
  const inFlightHit = hit(state.inFlightLeadId ?? undefined);
  return {
    ...state,
    pending,
    inFlightLeadId: inFlightHit ? null : state.inFlightLeadId,
  };
}

/** Helper: monta envelope de abertura com not_before = agora (ou spacing). */
export function makeOpenBubble1Envelope(input: {
  id: string;
  leadId: string;
  conversationId: string;
  text: string;
  notBefore: Date;
}): OutboundEnvelope {
  return {
    id: input.id,
    leadId: input.leadId,
    conversationId: input.conversationId,
    kind: "open_bubble1",
    bubbleIndex: 1,
    text: input.text,
    notBeforeIso: input.notBefore.toISOString(),
    idempotencyKey: `fc:${input.leadId}:b1`,
  };
}

export function makeContinueEnvelope(input: {
  id: string;
  leadId: string;
  conversationId: string;
  bubbleIndex: 2 | 3 | 4;
  text: string;
  notBefore: Date;
}): OutboundEnvelope {
  return {
    id: input.id,
    leadId: input.leadId,
    conversationId: input.conversationId,
    kind: "continue_bubble",
    bubbleIndex: input.bubbleIndex,
    text: input.text,
    notBeforeIso: input.notBefore.toISOString(),
    idempotencyKey: `fc:${input.leadId}:b${input.bubbleIndex}`,
  };
}

export function makeReplyEnvelope(input: {
  id: string;
  leadId: string;
  conversationId: string;
  text: string;
  notBefore: Date;
}): OutboundEnvelope {
  return {
    id: input.id,
    leadId: input.leadId,
    conversationId: input.conversationId,
    kind: "reply",
    bubbleIndex: null,
    text: input.text,
    notBeforeIso: input.notBefore.toISOString(),
    idempotencyKey: `reply:${input.leadId}:${input.id}`,
  };
}
