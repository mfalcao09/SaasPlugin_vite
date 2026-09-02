// Normaliza callbacks Z-API → shape interno do platform-whatsapp-qr-webhook.
// Mantém o handler de ingestão intacto (kind connection | message | unknown).

export type ZapiNormalized =
  | { kind: "connection"; instance: string; state: "open" | "connecting" | "close"; phone?: string }
  | {
    kind: "message";
    instance: string;
    fromMe: boolean;
    remoteJid: string;
    lidJid?: string;
    needsLidLookup?: boolean;
    pushName: string;
    messageId: string;
    content: string;
    media?: {
      type: "audio" | "image" | "video" | "document" | "sticker";
      mime?: string;
      caption?: string;
      url?: string;
      needsDownload?: boolean;
    };
  }
  /**
   * ACK de status/entrega. outcome:
   * - delivered = mensagem chegou no aparelho (MessageStatusCallback RECEIVED)
   * - failed = DeliveryCallback com error (falha de envio)
   * - ignored = sinal que NÃO alimenta delivered_count (SENT/READ/Delivery ok)
   *
   * DeliveryCallback sem error = só "aceitou no servidor WA" — NÃO é entrega
   * no aparelho. Contar isso como delivered inflaria a taxa e mascararia queima.
   */
  | {
    kind: "delivery";
    instance: string;
    messageIds: string[];
    outcome: "delivered" | "failed" | "ignored";
    statusRaw: string;
  }
  | { kind: "unknown"; instance: string; event: string };

function digitsOrLid(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.includes("@lid")) return s;
  const d = s.replace(/\D/g, "");
  return d;
}

function asRemoteJid(phoneOrLid: string): string {
  if (!phoneOrLid) return "";
  if (phoneOrLid.includes("@")) return phoneOrLid;
  return `${phoneOrLid}@s.whatsapp.net`;
}

export function isZapiWebhookPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const t = String((payload as Record<string, unknown>).type ?? "");
  return (
    t === "ReceivedCallback" ||
    t === "ReceivedCallbackDelivery" ||
    t === "DeliveryCallback" ||
    t === "MessageStatusCallback" ||
    t === "ConnectedCallback" ||
    t === "DisconnectedCallback" ||
    t === "PresenceChatCallback"
  );
}

export function normalizeZapiWebhook(
  payload: Record<string, unknown>,
  instanceRef: string,
): ZapiNormalized {
  const type = String(payload.type ?? "");
  const instance = instanceRef || String(payload.instanceId ?? payload.instance ?? "zapi");

  if (type === "ConnectedCallback") {
    const phone = digitsOrLid(payload.phone ?? payload.connectedPhone);
    return {
      kind: "connection",
      instance,
      state: "open",
      phone: phone.includes("@") ? phone.split("@")[0].replace(/\D/g, "") : phone,
    };
  }

  if (type === "DisconnectedCallback") {
    return { kind: "connection", instance, state: "close" };
  }

  if (type === "PresenceChatCallback") {
    return { kind: "unknown", instance, event: type };
  }

  // On-send (Z-API "Delivery"): aceito pelo servidor WA ≠ entregue no aparelho.
  // Só falha (campo error) alimenta métrica; sucesso vira ignored.
  if (type === "DeliveryCallback") {
    const ids = [payload.messageId, payload.zaapId]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
    const err = payload.error != null ? String(payload.error).trim() : "";
    if (err) {
      return {
        kind: "delivery",
        instance,
        messageIds: [...new Set(ids)],
        outcome: "failed",
        statusRaw: err,
      };
    }
    return {
      kind: "delivery",
      instance,
      messageIds: [...new Set(ids)],
      outcome: "ignored",
      statusRaw: "DeliveryCallback",
    };
  }

  // Status no WhatsApp: RECEIVED = 2º check (entregue). READ/PLAYED implicam
  // entrega mas NÃO contam — senão sent+received+read triplicaria o contador
  // (mesma regra do bloco Evolution: só DELIVERY, não read).
  if (type === "MessageStatusCallback") {
    const rawIds = Array.isArray(payload.ids) ? payload.ids : [];
    const single = payload.messageId ?? payload.zaapId;
    const ids = [
      ...rawIds.map((x) => String(x ?? "").trim()),
      ...(single != null ? [String(single).trim()] : []),
    ].filter(Boolean);
    const st = String(payload.status ?? "").toUpperCase();
    const outcome = st === "RECEIVED"
      ? "delivered" as const
      : st === "SENT" || st === "READ" || st === "READ_BY_ME" || st === "PLAYED"
      ? "ignored" as const
      : "ignored" as const;
    return {
      kind: "delivery",
      instance,
      messageIds: [...new Set(ids)],
      outcome,
      statusRaw: st || type,
    };
  }

  if (type === "ReceivedCallback" || type === "ReceivedCallbackDelivery") {
    const fromMe = Boolean(payload.fromMe);
    const chatLid = typeof payload.chatLid === "string" ? payload.chatLid : "";
    const senderLid = typeof payload.senderLid === "string" ? payload.senderLid : "";
    const phone = digitsOrLid(payload.phone);
    const lidJid = chatLid.includes("@lid")
      ? chatLid
      : senderLid.includes("@lid")
      ? senderLid
      : phone.includes("@lid")
      ? phone
      : undefined;
    const remotePhone = phone.includes("@lid") ? "" : phone;
    // PN primeiro: identity do inbox. LID fica em lidJid.
    // Preferir @lid em remoteJid fazia phoneDigitsFromJid → "" → skipped:no_phone.
    const remoteJid = remotePhone
      ? asRemoteJid(remotePhone)
      : (lidJid || "");

    const messageId = String(payload.messageId ?? payload.zaapId ?? "");
    const pushName = String(
      (payload.senderName as string) ||
        (payload.chatName as string) ||
        (payload.notifyName as string) ||
        "",
    );

    let content = "";
    let media: {
      type: "audio" | "image" | "video" | "document" | "sticker";
      mime?: string;
      caption?: string;
      url?: string;
      needsDownload?: boolean;
    } | undefined;

    const text = payload.text;
    if (text && typeof text === "object" && typeof (text as any).message === "string") {
      content = String((text as any).message);
    } else if (typeof payload.message === "string") {
      content = payload.message;
    }

    const image = payload.image as Record<string, unknown> | undefined;
    if (image && (image.imageUrl || image.image)) {
      media = {
        type: "image",
        url: String(image.imageUrl ?? image.image ?? ""),
        caption: image.caption != null ? String(image.caption) : undefined,
        mime: image.mimeType != null ? String(image.mimeType) : undefined,
      };
      if (!content && media.caption) content = media.caption;
    }

    const audio = payload.audio as Record<string, unknown> | undefined;
    if (audio && (audio.audioUrl || audio.audio)) {
      media = {
        type: "audio",
        url: String(audio.audioUrl ?? audio.audio ?? ""),
        mime: audio.mimeType != null ? String(audio.mimeType) : "audio/ogg",
      };
      if (!content) content = "[áudio]";
    }

    const video = payload.video as Record<string, unknown> | undefined;
    if (video && (video.videoUrl || video.video)) {
      media = {
        type: "video",
        url: String(video.videoUrl ?? video.video ?? ""),
        caption: video.caption != null ? String(video.caption) : undefined,
        mime: video.mimeType != null ? String(video.mimeType) : undefined,
      };
      if (!content && media.caption) content = media.caption;
    }

    const document = payload.document as Record<string, unknown> | undefined;
    if (document && (document.documentUrl || document.document)) {
      media = {
        type: "document",
        url: String(document.documentUrl ?? document.document ?? ""),
        caption: document.fileName != null ? String(document.fileName) : undefined,
        mime: document.mimeType != null ? String(document.mimeType) : undefined,
      };
      if (!content) content = media.caption ? `[documento] ${media.caption}` : "[documento]";
    }

    const sticker = payload.sticker as Record<string, unknown> | undefined;
    if (sticker && (sticker.stickerUrl || sticker.sticker)) {
      media = {
        type: "sticker",
        url: String(sticker.stickerUrl ?? sticker.sticker ?? ""),
        mime: sticker.mimeType != null ? String(sticker.mimeType) : undefined,
      };
      if (!content) content = "[sticker]";
    }

    if (!content && !media) content = "";

    return {
      kind: "message",
      instance,
      fromMe,
      remoteJid,
      lidJid,
      needsLidLookup: !lidJid && !remotePhone,
      pushName,
      messageId,
      content,
      media,
    };
  }

  return { kind: "unknown", instance, event: type || "zapi_unknown" };
}
