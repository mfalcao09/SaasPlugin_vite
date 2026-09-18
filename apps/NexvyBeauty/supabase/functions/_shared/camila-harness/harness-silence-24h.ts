// Relógio do silêncio 24h → remarketing_pool (STATE-MACHINE: silêncio, sem auto disparo).
import { silence24hToPool } from "./wire-pool.ts";
import type { LeadShadow } from "./states.ts";

export const SILENCE_24H_MS = 24 * 60 * 60 * 1000;

export function isSilence24hDue(input: {
  stage: string | null | undefined;
  firstOutboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastInboundAt: Date | null;
  now: Date;
  windowMs?: number;
}): boolean {
  if (input.stage !== "contacted") return false;
  if (!input.lastOutboundAt) return false;
  const windowMs = input.windowMs ?? SILENCE_24H_MS;
  if (input.now.getTime() - input.lastOutboundAt.getTime() < windowMs) {
    return false;
  }
  const cycleStart = input.firstOutboundAt ?? input.lastOutboundAt;
  if (
    input.lastInboundAt &&
    input.lastInboundAt.getTime() >= cycleStart.getTime()
  ) {
    return false;
  }
  return true;
}

export function applySilence24hToPool(lead: LeadShadow): LeadShadow {
  return silence24hToPool(lead);
}
