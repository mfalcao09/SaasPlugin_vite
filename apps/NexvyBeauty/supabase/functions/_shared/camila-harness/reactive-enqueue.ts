// Reactive enqueue — inbound piloto → exit na fila, ou cérebro (sem stub).
import { selectAssertiveCite } from "../inbound-cite.ts";
import { triageInbound } from "./triage.ts";
import { authorizeHarnessReply } from "./wire-gates.ts";
import {
  enqueue,
  type OutboundQueueState,
  type OutboundEnvelope,
} from "./outbound-queue.ts";
import { makeMensagemDeSaidaEnvelopes } from "./exit-message.ts";

export type ReactiveEnqueueResult = {
  queue: OutboundQueueState;
  enqueued: OutboundEnvelope | null;
  reason: string;
  triage: string;
  cite: string | null;
  queueMutated: boolean;
};

function digits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** Para as bolhas de abertura ainda pendentes dessa lead. A resposta entra no lugar. */
function pauseOpenPackage(
  state: OutboundQueueState,
  phone: string,
): OutboundQueueState {
  return {
    ...state,
    pending: state.pending.filter((e) =>
      e.leadId !== phone ||
      (e.kind !== "open_bubble1" && e.kind !== "continue_bubble" &&
        e.kind !== "resume")
    ),
    inFlightLeadId: state.inFlightLeadId === phone ? null : state.inFlightLeadId,
  };
}

/**
 * Se phone ∈ lista piloto (passada pelo caller) e janela ok:
 * - soft/hard → para o script dela e enfileira exit_message
 * - interest/neutral → para o script e acorda o cérebro (sem stub “em breve”)
 * - noise → não enfileira; o pacote segue
 *
 * `manualList` é obrigatória — sem atalho hardcoded.
 * Inclui quem já saiu de preselected (contacted), senão a resposta no meio
 * das bolhas cai em not_on_pilot_list.
 */
export function enqueueReactiveFromInbound(input: {
  queue: OutboundQueueState;
  phone: string;
  text: string;
  conversationId: string;
  /** Phones preselected (DB). Obrigatório. */
  manualList: string[];
  now?: Date;
  holidayDates?: ReadonlySet<string> | null;
  greetingName?: string | null;
  /** Rajada inbound (qualquer ordem). Sem isto, cita só `text`. */
  recentTexts?: string[];
}): ReactiveEnqueueResult {
  const phone = digits(input.phone);
  const list = input.manualList.map(digits).filter(Boolean);
  const triage = triageInbound(input.text, { exitAlreadySent: false });
  const empty = {
    queue: input.queue,
    enqueued: null as OutboundEnvelope | null,
    triage: triage.class,
    reason: "noop",
    cite: null as string | null,
    queueMutated: false,
  };

  if (!list.length) {
    return { ...empty, reason: "manual_list_required" };
  }
  if (!phone || !list.includes(phone)) {
    return { ...empty, reason: "not_on_pilot_list" };
  }

  const now = input.now ?? new Date();
  const isExit = triage.class === "soft" || triage.class === "hard";
  const action = isExit ? "exit_message" as const : "reply" as const;
  const win = authorizeHarnessReply({
    now,
    action,
    holidayDates: input.holidayDates,
  });
  if (!win.allowed || !win.canOut) {
    return { ...empty, reason: win.reason };
  }

  if (isExit) {
    const [textEnv, linkEnv] = makeMensagemDeSaidaEnvelopes({
      phone,
      conversationId: input.conversationId,
      greetingName: input.greetingName,
      now,
      triage: triage.class,
    });
    let q = pauseOpenPackage(input.queue, phone);
    q = enqueue(q, textEnv);
    q = enqueue(q, linkEnv);
    return {
      queue: q,
      enqueued: textEnv,
      reason: `enqueued_exit_${triage.class}`,
      triage: triage.class,
      cite: null,
      queueMutated: true,
    };
  }

  if (triage.class === "interest" || triage.class === "neutral") {
    const cite = selectAssertiveCite([
      ...(input.recentTexts ?? []),
      input.text,
    ]);
    const paused = pauseOpenPackage(input.queue, phone);
    return {
      queue: paused,
      enqueued: null,
      reason: "wake_brain",
      triage: triage.class,
      cite: cite || null,
      queueMutated: paused.pending.length !== input.queue.pending.length ||
        paused.inFlightLeadId !== input.queue.inFlightLeadId,
    };
  }

  return { ...empty, reason: `triage_${triage.class}_no_enqueue` };
}
