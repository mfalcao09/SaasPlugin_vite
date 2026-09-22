// Relógio do silêncio 24h → remarketing_pool (STATE-MACHINE: silêncio, sem auto disparo).
import { isAutoReply } from "../cold-outreach/auto-reply.ts";
import { silence24hToPool } from "./wire-pool.ts";
import type { LeadShadow } from "./states.ts";

export const SILENCE_24H_MS = 24 * 60 * 60 * 1000;

/** Auto-reply não conta. Housekeep não classifica texto (C). */
export function isCountableHumanInbound(text: string): boolean {
  if (isAutoReply(text)) return false;
  return String(text ?? "").trim().length > 0;
}

export function lastHumanInboundAt(
  messages: readonly { direction?: string; createdAt: Date | null; content?: string }[],
): Date | null {
  let last: Date | null = null;
  for (const m of messages) {
    if (m.direction !== "inbound" || !m.createdAt) continue;
    if (!isCountableHumanInbound(String(m.content ?? ""))) continue;
    if (!last || m.createdAt > last) last = m.createdAt;
  }
  return last;
}

/**
 * Após a última bolha de saída: 24h sem inbound humano posterior → pool.
 * Inbound no meio do pacote (ou auto-reply) NÃO segura a lead em contacted.
 */
export function isSilence24hDue(input: {
  stage: string | null | undefined;
  firstOutboundAt?: Date | null;
  lastOutboundAt: Date | null;
  lastInboundAt?: Date | null;
  lastHumanInboundAt?: Date | null;
  now: Date;
  windowMs?: number;
}): boolean {
  if (input.stage !== "contacted") return false;
  if (!input.lastOutboundAt) return false;
  const windowMs = input.windowMs ?? SILENCE_24H_MS;
  if (input.now.getTime() - input.lastOutboundAt.getTime() < windowMs) {
    return false;
  }
  const lastHuman = input.lastHumanInboundAt ?? null;
  if (lastHuman && lastHuman.getTime() >= input.lastOutboundAt.getTime()) {
    return false;
  }
  return true;
}

export function applySilence24hToPool(lead: LeadShadow): LeadShadow {
  return silence24hToPool(lead);
}
