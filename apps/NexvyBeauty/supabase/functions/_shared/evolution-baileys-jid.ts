// Resolução de JID Baileys (MESSAGES_UPSERT) espelhando o path Evolution Go:
// telefone real vem em remoteJidAlt / Pn quando remoteJid é @lid.
//
//   deno test --no-check supabase/functions/_shared/evolution-baileys-jid.test.ts

export type BaileysJidResolution = {
  remoteJid: string;
  lidJid?: string;
  fromMe: boolean;
  messageId: string;
};

/** Extrai JIDs de uma mensagem Baileys (key + campos Alt no key/msg). */
export function resolveBaileysMessageJids(msg: Record<string, unknown> | null | undefined): BaileysJidResolution {
  const key = (msg?.key && typeof msg.key === "object") ? msg.key as Record<string, unknown> : {};
  const fromMe = key.fromMe === true;
  const rawRemoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";

  // fromMe: destino = Alt/Pn do interlocutor. inbound: Alt/Pn do remetente.
  const altCandidates = fromMe
    ? [
      key.remoteJidAlt,
      msg?.remoteJidAlt,
      key.recipientPn,
      msg?.recipientPn,
      key.participantAlt,
    ]
    : [
      key.remoteJidAlt,
      msg?.remoteJidAlt,
      key.senderPn,
      msg?.senderPn,
      key.participantAlt,
    ];

  const altPhoneJid = altCandidates.find(
    (j): j is string => typeof j === "string" && j.includes("@s.whatsapp.net"),
  );
  const remoteJid = altPhoneJid || rawRemoteJid;

  const lidFromRaw = rawRemoteJid.includes("@lid") ? rawRemoteJid : undefined;
  const lidFromAlt = altCandidates.find(
    (j): j is string => typeof j === "string" && j.includes("@lid"),
  );
  const lidJid = lidFromRaw || lidFromAlt;

  return {
    remoteJid,
    ...(lidJid ? { lidJid } : {}),
    fromMe,
    messageId: typeof key.id === "string" ? key.id : "",
  };
}

/** Dígitos E.164-ish a partir de um JID @s.whatsapp.net. @lid / grupo → "". */
export function phoneDigitsFromJid(remoteJid: string): string {
  if (!remoteJid || remoteJid.includes("@lid") || remoteJid.endsWith("@g.us")) return "";
  return remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
}

/**
 * BDR Camila: fromMe no aparelho pode NASCER conversa no CRM.
 * Gate: nome da instância contém "camila" OU metadata.create_conversation_on_device_outbound.
 */
export function allowsDeviceOutboundCreateConversation(instance: {
  name?: string | null;
  metadata?: unknown;
}): boolean {
  const meta = (instance.metadata && typeof instance.metadata === "object")
    ? instance.metadata as Record<string, unknown>
    : {};
  if (meta.create_conversation_on_device_outbound === true) return true;
  return String(instance.name || "").toLowerCase().includes("camila");
}
