/**
 * Regra de reabertura de conversa WA-QR fechada.
 *
 * Histórico (Joice 2026-09-15): silenceConversation → status=closed no opt-out,
 * mas o próximo inbound ("Pode deixar") passava por ensureConversation e
 * REABRIA bot_active — o harness de parada era desfeito. Opt-out / DNC nunca
 * devem reabrir automaticamente.
 */

export type ReopenConversationInput = {
  status?: string | null;
  metadata?: unknown;
};

/** true = pode voltar a bot_active; false = manter closed. */
export function shouldReopenClosedWaQrConversation(
  conversation: ReopenConversationInput,
): boolean {
  if (String(conversation.status ?? "") !== "closed") return false;

  const meta =
    conversation.metadata && typeof conversation.metadata === "object"
      ? conversation.metadata as Record<string, unknown>
      : {};

  // Trava dura: qualquer do_not_contact (opt-out, already_contacted, incidente).
  if (meta.do_not_contact === true || meta.do_not_contact === "true") {
    return false;
  }

  const reason = String(meta.do_not_contact_reason ?? meta.opt_out_reason ?? "")
    .toLowerCase();
  if (
    reason.includes("opt_out") ||
    reason.includes("already_contacted") ||
    reason.includes("incident")
  ) {
    return false;
  }

  // Remarketing marcado implica não reengajar no cold / brain automático.
  if (meta.remarketing === true || meta.remarketing === "true") {
    return false;
  }

  return true;
}
