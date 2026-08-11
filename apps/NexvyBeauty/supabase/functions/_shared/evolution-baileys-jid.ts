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

/** Dígitos do LID a partir de `622…@lid` ou só dígitos. Vazio se inválido. */
export function lidDigitsFromWaLid(waLid: string | null | undefined): string {
  if (!waLid) return "";
  const raw = String(waLid).trim();
  if (!raw) return "";
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  const digits = local.split(":")[0].replace(/\D/g, "");
  // LID WhatsApp é longo; rejeita PN curto acidental (< 10) e vazio.
  return digits.length >= 10 ? digits : "";
}

/** Formato aceito pelo Evolution sendText quando o destino é LID. */
export function formatLidSendNumber(waLid: string | null | undefined): string {
  const digits = lidDigitsFromWaLid(waLid);
  return digits ? `${digits}@lid` : "";
}

export type EvolutionSendAddress = {
  /** Valor de `number` no body Evolution. */
  number: string;
  usedLid: boolean;
  /** Dígitos PN para fallback (vazio se só LID conhecido). */
  phoneDigits: string;
};

/**
 * Destino de envio Evolution: preferir `@lid` quando conhecido; senão PN.
 * Cold first-touch (só telefone, sem wa_lid) → digits PN — não quebra prospecção.
 *
 * `to` pode ser dígitos, `+E.164`, JID `@s.whatsapp.net` ou já `…@lid`.
 * `waLid` (metadata.wa_lid ou `…@lid`) tem precedência sobre PN em `to`.
 */
export function resolveEvolutionSendNumber(opts: {
  to?: string | null;
  waLid?: string | null;
}): EvolutionSendAddress {
  const toRaw = String(opts.to ?? "").trim();
  const lidFromTo = toRaw.includes("@lid") ? formatLidSendNumber(toRaw) : "";
  const lidFromMeta = formatLidSendNumber(opts.waLid);
  const lidNumber = lidFromMeta || lidFromTo;

  let phoneDigits = "";
  if (toRaw && !toRaw.includes("@lid")) {
    phoneDigits = phoneDigitsFromJid(
      toRaw.includes("@") ? toRaw : `${toRaw.replace(/\D/g, "")}@s.whatsapp.net`,
    );
    if (!phoneDigits) phoneDigits = toRaw.replace(/\D/g, "");
  }

  if (lidNumber) {
    return { number: lidNumber, usedLid: true, phoneDigits };
  }
  return { number: phoneDigits, usedLid: false, phoneDigits };
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

function isPnJid(jid: string): boolean {
  return typeof jid === "string" && jid.includes("@s.whatsapp.net");
}

/**
 * Webhook Baileys às vezes entrega remoteJid + remoteJidAlt ambos PN com
 * addressingMode=lid — o LID real só está no store findMessages.
 * True → caller deve consultar Evolution antes de persistir/enviar.
 */
export function lidLookupNeeded(msg: Record<string, unknown> | null | undefined): boolean {
  if (!msg || typeof msg !== "object") return false;
  const key = (msg.key && typeof msg.key === "object")
    ? msg.key as Record<string, unknown>
    : {};
  const addressingMode = String(
    msg.addressingMode ?? key.addressingMode ?? "",
  ).toLowerCase();
  if (addressingMode === "lid") return true;

  const remote = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const alt =
    (typeof key.remoteJidAlt === "string" && key.remoteJidAlt) ||
    (typeof msg.remoteJidAlt === "string" && msg.remoteJidAlt) ||
    "";
  return Boolean(remote && alt && isPnJid(remote) && isPnJid(alt));
}

/**
 * Extrai o primeiro `@lid` útil de records do Evolution `chat/findMessages`.
 * Store tipicamente: remoteJid=`…@lid`, remoteJidAlt=`…@s.whatsapp.net`.
 */
export function pickLidJidFromEvolutionMessageRecords(records: unknown): string {
  const list = Array.isArray(records) ? records : [];
  for (const rec of list) {
    if (!rec || typeof rec !== "object") continue;
    const resolved = resolveBaileysMessageJids(rec as Record<string, unknown>);
    if (resolved.lidJid) return resolved.lidJid;
  }
  return "";
}

/**
 * Camila (e instâncias com flag): envio API DEVE ir por `@lid`.
 * PN → ACK 463 no aparelho; sem fallback PN.
 */
export function requiresLidSend(instance: {
  name?: string | null;
  metadata?: unknown;
}): boolean {
  const meta = (instance.metadata && typeof instance.metadata === "object")
    ? instance.metadata as Record<string, unknown>
    : {};
  if (meta.require_lid_send === true) return true;
  return String(instance.name || "").toLowerCase().includes("camila");
}
