// Inbound do Harness → conversa bot_active + cérebro. Sem Path A.
// Housekeep fecha remarketing; o wake precisa reabrir, senão o cérebro
// devolve bot_not_active.

export function shouldApplyHarnessWakeBrain(input: {
  reason: string;
  doNotContact?: boolean | string | null;
  needsNewConsent?: boolean;
}): boolean {
  const dnc = input.doNotContact === true || input.doNotContact === "true";
  if (dnc && !input.needsNewConsent) return false;
  return input.reason === "wake_brain" || input.reason === "inbound_recorded";
}

export function harnessWakeConversationPatch(
  prev: { status?: string | null; metadata?: unknown },
  nowIso: string,
): { status: "bot_active"; metadata: Record<string, unknown> } {
  const prevMeta =
    prev.metadata && typeof prev.metadata === "object"
      ? prev.metadata as Record<string, unknown>
      : {};
  const fromPool = prevMeta.harness_state === "remarketing_pool" ||
    prevMeta.remarketing === true ||
    prevMeta.remarketing === "true";
  const origin = fromPool
    ? "remarketing"
    : (typeof prevMeta.harness_service_origin === "string"
      ? prevMeta.harness_service_origin
      : "first_contact");
  return {
    status: "bot_active",
    metadata: {
      ...prevMeta,
      remarketing: false,
      harness_state: "service",
      harness_service_origin: origin,
      harness_wake_at: nowIso,
    },
  };
}
