/**
 * Extrai id de mensagem do envelope de platform-whatsapp-qr-send.
 *
 * Shape Evolution: { body: { key: { id } } }
 * Shape Z-API:     { body: { messageId } }  (zaapId = id interno Z-API)
 *
 * Preferir messageId WA; ausente > id errado (corrupção de ACK).
 * Espelha platform-cold-outreach sendViaQr.
 */
export function extractQrSendMessageId(data: unknown): string | null {
  const d = data as Record<string, any> | null;
  if (!d || typeof d !== "object") return null;
  const body = d.body;
  if (typeof body?.messageId === "string" && body.messageId.trim()) {
    return body.messageId.trim();
  }
  if (typeof body?.key?.id === "string" && body.key.id.trim()) {
    return body.key.id.trim();
  }
  if (typeof d.key?.id === "string" && d.key.id.trim()) {
    return d.key.id.trim();
  }
  if (typeof body?.zaapId === "string" && body.zaapId.trim()) {
    return body.zaapId.trim();
  }
  return null;
}
