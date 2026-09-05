// Sequência Estágio 1 APRESENTAR — bolhas 2–4 após bolha 1 (cold outreach).
// Estado em conversation.metadata.apresentar_sequence.
//   deno test --allow-env supabase/functions/_shared/cold-outreach/apresentar-sequence.test.ts

export const APRESENTAR_STEP_DELAY_MS = 15_000;

export type ApresentarSequenceStatus = "in_progress" | "done" | "aborted_human" | "paused";

export interface ApresentarSequenceState {
  campaign_id: string;
  queue_id: string;
  agent_id: string;
  /** Bolhas 2–4 já preenchidas (índice 0 = bolha 2). */
  pending: string[];
  /** Última bolha enviada (1–4). */
  last_sent: number;
  next_at: string;
  status: ApresentarSequenceStatus;
}

export function buildApresentarState(
  input: {
    campaignId: string;
    queueId: string;
    agentId: string;
    bubbles234: string[];
    now?: Date;
  },
): ApresentarSequenceState {
  const now = input.now ?? new Date();
  return {
    campaign_id: input.campaignId,
    queue_id: input.queueId,
    agent_id: input.agentId,
    pending: input.bubbles234.slice(0, 3),
    last_sent: 1,
    next_at: new Date(now.getTime() + APRESENTAR_STEP_DELAY_MS).toISOString(),
    status: "in_progress",
  };
}

export function parseApresentarState(meta: unknown): ApresentarSequenceState | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).apresentar_sequence;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.status !== "in_progress") return null;
  if (!Array.isArray(s.pending)) return null;
  return {
    campaign_id: String(s.campaign_id ?? ""),
    queue_id: String(s.queue_id ?? ""),
    agent_id: String(s.agent_id ?? ""),
    pending: s.pending.map((x) => String(x)),
    last_sent: Number(s.last_sent ?? 1),
    next_at: String(s.next_at ?? ""),
    status: "in_progress",
  };
}

export function isApresentarDue(state: ApresentarSequenceState, now: Date): boolean {
  if (state.status !== "in_progress") return false;
  const t = Date.parse(state.next_at);
  return Number.isFinite(t) && t <= now.getTime();
}

/** Após enviar próxima bolha: devolve novo estado ou done. */
export function advanceApresentarState(
  state: ApresentarSequenceState,
  now: Date,
): ApresentarSequenceState {
  if (state.pending.length === 0) {
    return { ...state, status: "done", next_at: now.toISOString() };
  }
  const [, ...rest] = state.pending;
  if (rest.length === 0) {
    return {
      ...state,
      pending: [],
      last_sent: state.last_sent + 1,
      status: "done",
      next_at: now.toISOString(),
    };
  }
  return {
    ...state,
    pending: rest,
    last_sent: state.last_sent + 1,
    next_at: new Date(now.getTime() + APRESENTAR_STEP_DELAY_MS).toISOString(),
    status: "in_progress",
  };
}

export function abortApresentarForHuman(
  state: ApresentarSequenceState,
  now: Date,
): ApresentarSequenceState {
  return {
    ...state,
    pending: [],
    status: "aborted_human",
    next_at: now.toISOString(),
  };
}

/** Auto-resposta: não aborta; reinicia timer ~15s (registrar e seguir). */
export function bumpApresentarAfterAutoReply(
  state: ApresentarSequenceState,
  now: Date,
): ApresentarSequenceState {
  return {
    ...state,
    next_at: new Date(now.getTime() + APRESENTAR_STEP_DELAY_MS).toISOString(),
  };
}

export function nextBubbleText(state: ApresentarSequenceState): string | null {
  return state.pending[0] ?? null;
}
