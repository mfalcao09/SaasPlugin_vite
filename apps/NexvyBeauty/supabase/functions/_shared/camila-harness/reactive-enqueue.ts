// Reactive inbound — PORTA, não juiz.
// Grava que falou. NÃO cancela as 4. NÃO manda saída. NÃO classifica texto.
// Conteúdo = cérebro (porta-juiz.juizPrimeiroAto) depois do pacote / G5.
import { selectAssertiveCite } from "../inbound-cite.ts";
import {
  type OutboundQueueState,
  type OutboundEnvelope,
} from "./outbound-queue.ts";

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

/**
 * Boca 1 segue. Inbound só anota (ficha para o juiz).
 * `manualList` obrigatória — sem atalho hardcoded.
 */
export function enqueueReactiveFromInbound(input: {
  queue: OutboundQueueState;
  phone: string;
  text: string;
  conversationId: string;
  manualList: string[];
  now?: Date;
  holidayDates?: ReadonlySet<string> | null;
  greetingName?: string | null;
  recentTexts?: string[];
}): ReactiveEnqueueResult {
  const phone = digits(input.phone);
  const list = input.manualList.map(digits).filter((d) => d.length > 0);
  const empty = {
    queue: input.queue,
    enqueued: null as OutboundEnvelope | null,
    triage: "deferred",
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

  const cite = selectAssertiveCite([
    ...(input.recentTexts ?? []),
    input.text,
  ]);
  return {
    queue: input.queue,
    enqueued: null,
    reason: "inbound_recorded",
    triage: "deferred",
    cite: cite || null,
    queueMutated: false,
  };
}
