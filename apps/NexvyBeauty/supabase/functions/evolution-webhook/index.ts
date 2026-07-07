import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizePhoneBR, phoneVariantsBR } from "../_shared/phone.ts";
import { startTyping } from "../_shared/presence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// Anti-spam helpers (humanização + dedup + lock por conversa)
// ============================================================================

/** Hash normalizado de uma resposta para dedup curto-prazo. */
function normalizeResponseHash(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tenta gravar message_id em processed_messages. Retorna true se for duplicado. */
async function isDuplicateInboundMessage(
  supabase: any,
  instanceId: string | null,
  remoteJid: string | null,
  messageId: string | null,
): Promise<boolean> {
  if (!messageId) return false;
  const { error } = await supabase.from("processed_messages").insert({
    instance_id: instanceId,
    remote_jid: remoteJid,
    message_id: messageId,
  });
  if (!error) return false;
  // 23505 = unique violation → já processado
  if ((error as any).code === "23505") return true;
  // Em outros erros, deixa passar (fail-open) para não travar o webhook.
  console.warn("[anti-spam] processed_messages insert non-unique error:", (error as any).message);
  return false;
}

/** Tenta adquirir lock por conversa de forma ATÔMICA via RPC. Retorna true se conseguiu. */
async function acquireConversationLock(
  supabase: any,
  conversationId: string,
  ttlMs = 30_000,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_acquire_conversation_lock", {
    p_conv: conversationId,
    p_ttl_ms: ttlMs,
  });
  if (error) {
    console.warn("[anti-spam] lock acquire rpc error:", error.message);
    return true; // fail-open: prefere responder a travar tudo
  }
  return data === true;
}

async function releaseConversationLock(supabase: any, conversationId: string): Promise<void> {
  try {
    await supabase
      .from("conversation_processing_locks")
      .delete()
      .eq("conversation_id", conversationId);
  } catch (_) { /* best-effort */ }
}

/** Verifica se já enviamos uma resposta com mesmo hash nos últimos windowMs. */
async function isDuplicateResponse(
  supabase: any,
  conversationId: string,
  text: string,
  windowMs: number,
): Promise<boolean> {
  if (!text || !conversationId || windowMs <= 0) return false;
  const hash = normalizeResponseHash(text);
  if (!hash) return false;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data } = await supabase
    .from("sent_responses")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("response_hash", hash)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  return !!data?.id;
}

async function recordSentResponse(supabase: any, conversationId: string, text: string): Promise<void> {
  try {
    const hash = normalizeResponseHash(text);
    if (!hash) return;
    await supabase.from("sent_responses").insert({
      conversation_id: conversationId,
      response_hash: hash,
      response_text: (text || "").slice(0, 2000),
    });
  } catch (_) { /* best-effort */ }
}

/**
 * Adapter that normalizes incoming webhook payloads from BOTH:
 *  - Evolution API v2 (Node.js): events like MESSAGES_UPSERT, CONNECTION_UPDATE, ...
 *  - Evolution Go: events like Message, SendMessage, Connected, QRCode, ...
 *
 * Returns a normalized shape that the rest of the handler understands:
 *   { kind: 'message' | 'connection' | 'qrcode' | 'unknown',
 *     instance: <name or uuid>, ...event-specific fields }
 */
type MediaInfo = {
  type: "audio" | "image" | "video" | "document" | "sticker";
  mime?: string;
  caption?: string;
  // One of the following will be present (provider-dependent)
  url?: string;
  base64?: string;
  // For Evolution v2 we may need to call /chat/getBase64FromMediaMessage with the messageId.
  needsDownload?: boolean;
  // Raw whatsmeow message object (audioMessage / imageMessage) — required for
  // Evolution Go's /message/downloadimage endpoint, which expects mediaKey,
  // directPath, fileEncSHA256, fileSHA256, fileLength, mimetype and url.
  rawMessage?: any;
};

type Normalized =
  | {
      kind: "message";
      instance: string;
      fromMe: boolean;
      remoteJid: string;
      lidJid?: string;
      pushName: string;
      messageId: string;
      content: string;
      media?: MediaInfo;
    }
  | { kind: "connection"; instance: string; state: "open" | "connecting" | "close"; phone?: string }
  | { kind: "qrcode"; instance: string; qr: string }
  | { kind: "revoke"; instance: string; messageIds: string[] }
  | { kind: "unknown"; instance: string; event: string };

function extractInstance(payload: any): string {
  // Try every known location across Evolution v2 and Evolution Go payload shapes
  const candidates = [
    payload?.instance,
    payload?.instanceName,
    payload?.Instance,
    payload?.instance_name,
    payload?.instanceId,
    payload?.instance_id,
    typeof payload?.instance === "object" ? payload?.instance?.instanceName : null,
    typeof payload?.instance === "object" ? payload?.instance?.name : null,
    typeof payload?.instance === "object" ? payload?.instance?.id : null,
    payload?.data?.instance,
    payload?.data?.Instance,
    payload?.data?.instanceName,
    payload?.data?.instance_name,
    typeof payload?.data?.instance === "object" ? payload?.data?.instance?.name : null,
    typeof payload?.data?.instance === "object" ? payload?.data?.instance?.instanceName : null,
    payload?.sender?.instance,
    payload?.session,
    payload?.SessionID,
    payload?.session_id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return "";
}

function normalizeQrString(value: any): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length <= 20) return null;

  // Evolution Go sometimes sends a display PNG and the real WhatsApp pairing
  // payload joined by "|". Encoding the whole string produces an invalid QR.
  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const afterPipe = raw.slice(pipeIndex + 1).trim();
    if (afterPipe.length > 20) return afterPipe;
    const beforePipe = raw.slice(0, pipeIndex).trim();
    if (beforePipe.length > 20) return beforePipe;
  }

  return raw;
}

function normalizePayload(payload: any): Normalized | null {
  const event: string = payload.event || payload.type || payload.Event || "";
  const instance: string = extractInstance(payload);

  if (!instance) return null;
  const data = payload.data || payload;

  // Helper: extract media info from a whatsmeow-style message object.
  // Audio is the most common multimodal input we get from leads.
  function extractMedia(message: any): MediaInfo | undefined {
    if (!message) return undefined;
    const audio = message.audioMessage;
    const image = message.imageMessage;
    const video = message.videoMessage;
    const doc = message.documentMessage;

    const pickUrl = (m: any): string | undefined =>
      m?.url || m?.URL || m?.directPath || m?.DirectPath || undefined;
    // Some Evolution payloads embed the base64 directly; capture both naming styles.
    const pickBase64 = (m: any): string | undefined =>
      typeof m?.base64 === "string" ? m.base64 :
      typeof m?.Base64 === "string" ? m.Base64 :
      typeof m?.media === "string" ? m.media :
      typeof m?.Media === "string" ? m.Media :
      undefined;

    if (audio) {
      const b64 = pickBase64(audio);
      const url = pickUrl(audio);
      return {
        type: "audio",
        mime: audio.mimetype || audio.Mimetype || "audio/ogg",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: audio,
      };
    }
    if (image) {
      const b64 = pickBase64(image);
      const url = pickUrl(image);
      return {
        type: "image",
        mime: image.mimetype || image.Mimetype || "image/jpeg",
        caption: image.caption || image.Caption || "",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: image,
      };
    }
    if (video) {
      const b64 = pickBase64(video);
      const url = pickUrl(video);
      return {
        type: "video",
        mime: video.mimetype || video.Mimetype || "video/mp4",
        caption: video.caption || video.Caption || "",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: video,
      };
    }
    if (doc) {
      const b64 = pickBase64(doc);
      const url = pickUrl(doc);
      return {
        type: "document",
        mime: doc.mimetype || doc.Mimetype || "application/octet-stream",
        caption: doc.fileName || doc.FileName || doc.title || doc.Title || "",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: doc,
      };
    }
    const sticker = message.stickerMessage;
    if (sticker) {
      const b64 = pickBase64(sticker);
      const url = pickUrl(sticker);
      return {
        type: "sticker",
        mime: sticker.mimetype || sticker.Mimetype || "image/webp",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: sticker,
      };
    }
    return undefined;
  }

  // ---- v2 events (Evolution API v2.3.7) ----
  // MESSAGES_UPSERT = inbound; SEND_MESSAGE = outbound echo (device/API).
  // Both carry the same { key, message, pushName } Baileys shape; fromMe
  // distinguishes direction downstream.
  if (
    event === "messages.upsert" || event === "MESSAGES_UPSERT" ||
    event === "send.message" || event === "SEND_MESSAGE"
  ) {
    const messages = Array.isArray(data.messages) ? data.messages : [data];
    const msg = messages[0];
    if (!msg) return null;
    const key = msg.key || {};
    const media = extractMedia(msg.message);
    return {
      kind: "message",
      instance,
      fromMe: key.fromMe === true,
      remoteJid: key.remoteJid || "",
      pushName: msg.pushName || "",
      messageId: key.id || "",
      content:
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        (msg.message?.audioMessage ? "[áudio]" : "") ||
        (msg.message?.imageMessage ? "[imagem]" : "") ||
        (msg.message?.videoMessage ? "[vídeo]" : "") ||
        (msg.message?.documentMessage ? "[documento]" : "") ||
        msg.body ||
        "",
      media,
    };
  }

  if (event === "connection.update" || event === "CONNECTION_UPDATE") {
    return {
      kind: "connection",
      instance,
      state: data.state === "open" ? "open" : data.state === "connecting" ? "connecting" : "close",
      phone: data.wuid || data.number,
    };
  }

  if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
    return { kind: "qrcode", instance, qr: normalizeQrString(data.qrcode?.base64 || data.qrcode?.code || data.base64 || data.code) || "" };
  }

  // ---- Revoke / "apagar para todos" (Baileys v2) ----
  // A mensagem apagada no aparelho chega como messages.delete carregando a(s)
  // key(s) revogada(s). Marcamos is_deleted preservando o texto (o inbox mostra
  // o original tachado). Payload varia: array | {keys:[...]} | {key} | {id}.
  if (event === "messages.delete" || event === "MESSAGES_DELETE") {
    const raw = Array.isArray(data) ? data
      : Array.isArray(data?.keys) ? data.keys
      : data?.key ? [data.key]
      : data?.id ? [data]
      : [];
    const messageIds = raw
      .map((k: any) => (typeof k === "string" ? k : k?.id))
      .filter((id: any): id is string => typeof id === "string" && id.length > 0);
    if (messageIds.length === 0) return null;
    return { kind: "revoke", instance, messageIds };
  }

  // ---- Revoke vindo como MESSAGES_UPDATE (Baileys) ----
  // Algumas versões mandam "apagar para todos" como messages.update com
  // protocolMessage REVOKE (type 0) ou messageStubType de revoke. Como
  // MESSAGES_UPDATE já é assinado, isso captura o revoke mesmo sem MESSAGES_DELETE.
  if (event === "messages.update" || event === "MESSAGES_UPDATE") {
    const arr = Array.isArray(data?.messages) ? data.messages
      : Array.isArray(data) ? data
      : [data];
    const ids: string[] = [];
    for (const it of arr) {
      if (!it) continue;
      const upd = it.update || it;
      const proto = upd?.message?.protocolMessage || it?.message?.protocolMessage;
      const isRevoke =
        (proto && (proto.type === 0 || proto.type === "REVOKE")) ||
        upd?.messageStubType === "REVOKE" || upd?.messageStubType === 1;
      const id = proto?.key?.id || it?.key?.id;
      if (isRevoke && typeof id === "string" && id) ids.push(id);
    }
    if (ids.length) return { kind: "revoke", instance, messageIds: ids };
    return null; // update sem revoke → ignorado (comportamento atual)
  }

  // ---- Evolution Go events ----
  // Message / SendMessage payloads carry whatsmeow Info + Message structures.
  if (event === "Message" || event === "SendMessage") {
    const info = data.Info || data.info || {};
    const message = data.Message || data.message || {};
    const sender: string = info.Sender || info.sender || info.RemoteJid || "";
    const rawRemoteJid: string = info.Chat || info.RemoteJid || sender || "";
    const fromMe: boolean = !!(info.IsFromMe ?? info.isFromMe ?? event === "SendMessage");

    // Resolver JID @lid → JID @s.whatsapp.net (telefone real) quando whatsmeow envia o "Alt".
    // Em fromMe, o destino real (telefone) vem em RecipientAlt/RecipientPn/ChatAlt.
    // Em inbound, o sender real vem em SenderAlt/SenderPn.
    const altJidCandidates = fromMe
      ? [info.RecipientAlt, info.RecipientPn, info.ChatAlt, info.recipientAlt, info.recipientPn, info.chatAlt]
      : [info.SenderAlt, info.SenderPn, info.senderAlt, info.senderPn];
    const altPhoneJid = altJidCandidates.find(
      (j: any) => typeof j === "string" && j.includes("@s.whatsapp.net"),
    ) as string | undefined;

    // Preferimos o JID telefônico real; mantemos o LID como referência separada.
    const remoteJid = altPhoneJid || rawRemoteJid;
    const lidJid = rawRemoteJid.includes("@lid") ? rawRemoteJid : (altJidCandidates.find((j: any) => typeof j === "string" && j.includes("@lid")) as string | undefined);

    const content =
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      message.videoMessage?.caption ||
      (message.audioMessage ? "[áudio]" : "") ||
      (message.imageMessage ? "[imagem]" : "") ||
      (message.videoMessage ? "[vídeo]" : "") ||
      (message.documentMessage ? "[documento]" : "") ||
      "";

    const media = extractMedia(message);

    return {
      kind: "message",
      instance,
      fromMe,
      remoteJid,
      lidJid,
      pushName: info.PushName || info.pushName || "",
      messageId: info.ID || info.id || "",
      content,
      media,
    };
  }

  if (event === "Connected" || event === "PairSuccess") {
    return { kind: "connection", instance, state: "open", phone: data.JID || data.jid };
  }
  if (event === "LoggedOut" || event === "Disconnected") {
    return { kind: "connection", instance, state: "close" };
  }
  if (event === "QRCode" || event === "QR" || event === "QRCodeUpdated") {
    // Evolution Go can deliver the QR in many shapes. Walk the payload and pick
    // the first usable string. Accept BOTH a base64 PNG (data:image/...) and
    // the raw whatsmeow pairing string (e.g. "2@xyz,abc==,def==,1") — the
    // frontend renders raw strings via api.qrserver.com and base64 directly.
    const candidates = [
      data.QRCode, data.qrcode, data.qr, data.Qr, data.code, data.Code,
      data.base64, data.Base64,
      data?.qrcode?.base64, data?.qrcode?.code,
      data?.QRCode?.Base64, data?.QRCode?.Code,
      data?.data?.qrcode, data?.data?.base64, data?.data?.code,
      payload.QRCode, payload.qrcode, payload.qr, payload.code, payload.base64,
    ];
    let qr = "";
    for (const c of candidates) {
      const normalizedQr = normalizeQrString(c);
      if (normalizedQr) { qr = normalizedQr; break; }
    }
    if (!qr) {
      try {
        console.warn("[evolution-webhook] QRCode event sem QR extraível — payload:",
          JSON.stringify(payload).slice(0, 2000));
      } catch { /* ignore */ }
    }
    return { kind: "qrcode", instance, qr };
  }

  return { kind: "unknown", instance, event };
}

// ---------- Multimodal helpers ----------------------------------------------
// Helper: convert array-of-ints (whatsmeow JSON) OR base64 string to base64.
function toBase64(value: any): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    // Accept raw base64 and data URLs returned by some Evolution builds.
    return value.includes(",") ? value.split(",", 2)[1] : value;
  }
  if (Array.isArray(value)) {
    let bin = "";
    const chunk = 0x8000;
    const arr = value as number[];
    for (let i = 0; i < arr.length; i += chunk) {
      bin += String.fromCharCode(...arr.slice(i, i + chunk));
    }
    return btoa(bin);
  }
  return undefined;
}

// Magic-byte sniffer: returns true if the buffer looks like a valid decrypted
// audio/image format (OggS, JPEG, PNG, WebP, MP3, etc.). Used to refuse
// passing still-encrypted WhatsApp blobs to OpenAI.
function looksDecrypted(b64: string): boolean {
  if (!b64 || b64.length < 16) return false;
  try {
    const head = atob(b64.slice(0, 32));
    const bytes = new Uint8Array(head.length);
    for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i);
    const ascii = (i: number, n: number) =>
      String.fromCharCode(...Array.from(bytes.subarray(i, i + n)));
    // Images
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true; // JPEG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true; // PNG
    if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return true;
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return true;
    // Audio
    if (ascii(0, 4) === "OggS") return true;
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return true;
    if (ascii(0, 4) === "fLaC") return true;
    if (ascii(0, 3) === "ID3") return true;
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true; // MP3 sync
    if (ascii(4, 4) === "ftyp") return true; // M4A/MP4
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true; // WebM
    return false;
  } catch {
    return false;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function bytesFromAny(value: any): Uint8Array | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value.map((n) => Number(n) & 0xff));
  if (Array.isArray(value?.data)) return new Uint8Array(value.data.map((n: any) => Number(n) & 0xff));
  if (typeof value === "string" && value.trim()) {
    try {
      const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const bin = atob(padded.includes(",") ? padded.split(",", 2)[1] : padded);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  return null;
}

function pickRaw(rawMessage: any, ...names: string[]): any {
  for (const name of names) {
    const v = rawMessage?.[name] ?? rawMessage?.[name.charAt(0).toUpperCase() + name.slice(1)];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

async function decryptWhatsAppMedia(rawMessage: any, mediaType?: string): Promise<{ base64: string; mime?: string } | null> {
  if (!rawMessage) return null;

  const mediaKey = bytesFromAny(pickRaw(rawMessage, "mediaKey"));
  const directPath = String(pickRaw(rawMessage, "directPath") || "").trim();
  const url = String(pickRaw(rawMessage, "url") || "").trim();
  const mediaUrl = url || (directPath ? `https://mmg.whatsapp.net${directPath.startsWith("/") ? directPath : `/${directPath}`}` : "");
  if (!mediaKey || !mediaUrl) {
    console.warn(
      `[evolution-webhook] local media decrypt skipped: mediaKey=${!!mediaKey} mediaUrl=${!!mediaUrl} rawKeys=${Object.keys(rawMessage || {}).slice(0, 20).join(",")}`,
    );
    return null;
  }

  const encryptedResp = await fetch(mediaUrl);
  if (!encryptedResp.ok) {
    console.warn(`[evolution-webhook] local media fetch failed: ${encryptedResp.status}`);
    return null;
  }
  const encrypted = new Uint8Array(await encryptedResp.arrayBuffer());
  if (encrypted.byteLength <= 16) return null;

  const infoByType: Record<string, string> = {
    image: "WhatsApp Image Keys",
    audio: "WhatsApp Audio Keys",
    video: "WhatsApp Video Keys",
    document: "WhatsApp Document Keys",
    sticker: "WhatsApp Image Keys",
  };
  const infos = Array.from(new Set([
    mediaType ? infoByType[mediaType] : null,
    "WhatsApp Image Keys",
    "WhatsApp Audio Keys",
    "WhatsApp Video Keys",
    "WhatsApp Document Keys",
  ].filter(Boolean) as string[]));

  for (const info of infos) {
    try {
      // new Uint8Array(mediaKey) re-backs the bytes with a plain ArrayBuffer (not the
      // ArrayBufferLike/SharedArrayBuffer union), satisfying BufferSource on current lib.dom.
      const keyMaterial = await crypto.subtle.importKey("raw", new Uint8Array(mediaKey), "HKDF", false, ["deriveBits"]);
      const expanded = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(info) },
        keyMaterial,
        112 * 8,
      ));
      const iv = expanded.slice(0, 16);
      const cipherKey = expanded.slice(16, 48);
      const macKey = expanded.slice(48, 80);
      const ciphertext = encrypted.slice(0, encrypted.byteLength - 10);
      const mac = encrypted.slice(encrypted.byteLength - 10);
      const hmacKey = await crypto.subtle.importKey("raw", macKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const checkPayload = new Uint8Array(iv.byteLength + ciphertext.byteLength);
      checkPayload.set(iv, 0);
      checkPayload.set(ciphertext, iv.byteLength);
      const digest = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, checkPayload));
      const macOk = mac.every((b, i) => b === digest[i]);
      if (!macOk) continue;

      const aesKey = await crypto.subtle.importKey("raw", cipherKey, { name: "AES-CBC" }, false, ["decrypt"]);
      const clear = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, ciphertext));
      const b64 = bytesToBase64(clear);
      if (looksDecrypted(b64)) {
        const mime = pickRaw(rawMessage, "mimetype") || undefined;
        console.log(`[evolution-webhook] ✅ media decrypted locally (${info}, ${b64.length} chars b64, mime=${mime})`);
        return { base64: b64, mime };
      }
    } catch (e) {
      console.warn(`[evolution-webhook] local decrypt attempt failed (${info}):`, (e as any)?.message || String(e));
    }
  }

  console.warn("[evolution-webhook] local media decrypt failed for all key derivations");
  return null;
}

// Try to download decrypted media bytes from Evolution Go.
// WhatsApp media is end-to-end encrypted: providers MUST decrypt using the
// per-message mediaKey. We try, in order:
//   1. /chat/getBase64FromMediaMessage (Evolution Go canonical, decrypts)
//   2. /chat/getBase64                 (alias on some installs)
//   3. /message/downloadMedia          (newer Evolution Go alias)
//   4. /message/downloadAudio | /message/downloadImage  (typed endpoints)
//   5. /message/downloadimage          (legacy lowercase used previously)
// After download, we validate the magic bytes — if the blob still looks
// encrypted (e.g. starts with `e0eeb612...`), we reject and try the next.
async function downloadMediaBase64(
  evoUrl: string,
  apikeys: string[],
  rawMessage: any,
  fallbackMessageId?: string,
  mediaType?: "audio" | "image" | "video" | "document" | "sticker",
  remoteJid?: string,
  instanceNameOrId?: string,
  instanceUuid?: string,
): Promise<{ base64: string; mime?: string } | null> {
  const keys = Array.from(new Set(apikeys.map((k) => String(k || "").trim()).filter(Boolean)));
  const local = await decryptWhatsAppMedia(rawMessage, mediaType);
  if (local) return local;
  if (!evoUrl || keys.length === 0) return null;

  // Build the payload Evolution Go expects (DownloadImageStruct).
  const fields = ["mediaKey", "directPath", "fileEncSHA256", "fileSHA256", "fileLength", "mimetype", "url"];
  const mediaPayload: Record<string, any> = {};
  if (rawMessage) {
    for (const f of fields) {
      const v = rawMessage[f] ?? rawMessage[f.charAt(0).toUpperCase() + f.slice(1)];
      if (v !== undefined && v !== null) mediaPayload[f] = v;
    }
  }

  // Build the standard whatsmeow message envelope used by /chat/getBase64FromMediaMessage.
  const messageKey = fallbackMessageId
    ? { id: fallbackMessageId, remoteJid: remoteJid || "", fromMe: false }
    : null;
  const messageEnvelope = rawMessage
    ? {
        key: messageKey,
        message: mediaType === "audio"
          ? { audioMessage: rawMessage }
          : mediaType === "image"
          ? { imageMessage: rawMessage }
          : { mediaMessage: rawMessage },
      }
    : (messageKey ? { key: messageKey } : null);

  type Attempt = { path: string; body: any; headers?: Record<string, string> };
  const attempts: Attempt[] = [];
  const instanceCandidates = Array.from(new Set([instanceNameOrId, instanceUuid].filter(Boolean).map(String)));

  // 1+2: canonical decrypting endpoints (need full message envelope)
  if (messageEnvelope) {
    for (const inst of instanceCandidates) {
      const encoded = encodeURIComponent(inst);
      attempts.push({ path: `/chat/getBase64FromMediaMessage/${encoded}`, body: { message: messageEnvelope, convertToMp4: false } });
      if (fallbackMessageId) {
        attempts.push({ path: `/chat/getBase64FromMediaMessage/${encoded}`, body: { message: { key: messageKey }, convertToMp4: false } });
      }
    }
    attempts.push({ path: "/chat/getBase64FromMediaMessage", body: { message: messageEnvelope, convertToMp4: false } });
    if (fallbackMessageId) {
      attempts.push({ path: "/chat/getBase64FromMediaMessage", body: { message: { key: messageKey }, convertToMp4: false } });
    }
    attempts.push({ path: "/chat/getBase64", body: { message: messageEnvelope } });
  }

  // 3: newer Evolution Go alias accepting the raw media object
  if (Object.keys(mediaPayload).length > 0) {
    attempts.push({ path: "/message/downloadMedia", body: mediaPayload });
    // 4: typed endpoints (preferred for audio/image specifically)
    if (mediaType === "audio") {
      attempts.push({ path: "/message/downloadAudio", body: mediaPayload });
    } else if (mediaType === "image") {
      attempts.push({ path: "/message/downloadImage", body: mediaPayload });
    }
    // 5: legacy lowercase (was used before — kept as last resort)
    attempts.push({ path: "/message/downloadimage", body: mediaPayload });
  }

  for (const a of attempts) {
    for (const apikey of keys) {
    try {
      const res = await fetch(`${evoUrl}${a.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey, ...(instanceUuid ? { instanceId: instanceUuid } : {}), ...(a.headers || {}) },
        body: JSON.stringify(a.body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.warn(`[evolution-webhook] ${a.path} failed: ${res.status} ${t.slice(0, 200)}`);
        continue;
      }
      const data = await res.json().catch(() => null);
      const candidate =
        data?.data?.base64 || data?.data?.image || data?.data?.file || data?.data?.media ||
        data?.base64 || data?.Base64 || data?.image || data?.file || data?.body || data?.media ||
        (typeof data === "string" ? data : null);
      const b64 = toBase64(candidate);
      if (!b64 || b64.length < 50) {
        console.warn(`[evolution-webhook] ${a.path}: no usable base64 (keys=${Object.keys(data || {}).join(",")})`);
        continue;
      }
      // VALIDATE: are the bytes actually decrypted? If not, this endpoint
      // returned us garbage — try the next one rather than ship encrypted
      // bytes to OpenAI (which always rejects them).
      if (!looksDecrypted(b64)) {
        const head = atob(b64.slice(0, 16));
        const hex = Array.from(head).map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
        console.warn(`[evolution-webhook] ${a.path}: bytes look ENCRYPTED (head=${hex}); trying next endpoint`);
        continue;
      }
      const mime = data?.mimetype || data?.Mimetype || data?.mime || (rawMessage?.mimetype) || undefined;
      console.log(`[evolution-webhook] ✅ media downloaded via ${a.path} (${b64.length} chars b64, mime=${mime})`);
      return { base64: b64, mime };
    } catch (e) {
      console.warn(`[evolution-webhook] ${a.path} exception:`, (e as any)?.message);
    }
    }
  }

  console.error("[evolution-webhook] all media download attempts failed");
  return null;
}

// Decode base64 → Uint8Array (chunked, safe for large media).
function base64ToUint8(b64: string): Uint8Array {
  const cleaned = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Map a mime type to a sensible file extension for storage paths.
function extFromMime(mime?: string, fallback = "bin"): string {
  if (!mime) return fallback;
  const m = mime.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("m4a") || m.includes("mp4a")) return "m4a";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("msword")) return "doc";
  if (m.includes("officedocument.wordprocessingml")) return "docx";
  if (m.includes("ms-excel")) return "xls";
  if (m.includes("officedocument.spreadsheetml")) return "xlsx";
  if (m.includes("zip")) return "zip";
  return fallback;
}

// Upload decrypted inbound media bytes to the public `chat-media` bucket
// and return the public URL. The webhook is reentrant — same messageId always
// maps to the same path so duplicates upsert harmlessly.
async function uploadInboundMediaToStorage(
  supabase: any,
  organizationId: string,
  conversationId: string,
  messageId: string | undefined,
  bytes: Uint8Array,
  mime: string,
  filename?: string | null,
): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const safeName = (filename || "").replace(/[^\w.\-]+/g, "_").slice(0, 80);
    const ext = extFromMime(mime, safeName.includes(".") ? safeName.split(".").pop()! : "bin");
    const baseId = (messageId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]+/g, "_");
    const finalName = safeName ? `${baseId}-${safeName}` : `${baseId}.${ext}`;
    const path = `whatsapp-inbound/${organizationId}/${conversationId}/${finalName}`;
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const { error } = await supabase.storage
      .from("chat-media")
      .upload(path, ab, { contentType: mime || "application/octet-stream", upsert: true });
    if (error) {
      console.warn("[evolution-webhook] storage upload failed:", error.message);
      return null;
    }
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/chat-media/${path}`;
    console.log(`[evolution-webhook] ✅ media uploaded to storage (${bytes.byteLength}B, ${mime}) → ${path}`);
    return publicUrl;
  } catch (e: any) {
    console.warn("[evolution-webhook] storage upload exception:", e?.message || String(e));
    return null;
  }
}

// Calls the process-media-message edge function (Whisper for audio, GPT-4o-mini for images).
// Returns the textual representation that should become the message content.
async function processMediaToText(
  supabaseUrl: string,
  serviceKey: string,
  payload: { kind: "audio" | "image"; base64?: string; url?: string; mime?: string; caption?: string; organization_id?: string },
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/process-media-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      console.warn("[evolution-webhook] process-media-message failed:", res.status, JSON.stringify(data)?.slice(0, 200));
      return null;
    }
    return String(data.text || "").trim() || null;
  } catch (e) {
    console.warn("[evolution-webhook] process-media-message exception:", (e as any)?.message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json().catch(() => ({}));
    const rawEvent = payload.event || payload.type || payload.Event;
    const rawInstance = extractInstance(payload);
    console.log("[evolution-webhook] raw event:", rawEvent, "instance:", rawInstance || "<MISSING>");

    const norm = normalizePayload(payload);
    if (!norm) {
      // Log full payload (truncated) so we can identify where the instance name lives
      try {
        const dump = JSON.stringify(payload).slice(0, 4000);
        console.warn("[evolution-webhook] missing instance — payload dump:", dump);
      } catch {
        console.warn("[evolution-webhook] missing instance — payload not serializable");
      }
      // Return 200 so Evolution Go does not retry indefinitely
      return new Response(JSON.stringify({ ok: true, ignored: "missing_instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup instance by either instance_id (UUID) OR name OR metadata.instance_name
    // The Go server may send the instance NAME in webhook payloads even though
    // we registered the webhook with the UUID.
    const { data: instances } = await supabase
      .from("evolution_instances")
      .select("*")
      .or(`instance_id.eq.${norm.instance},name.eq.${norm.instance}`);
    let instance = instances?.[0];

    if (!instance) {
      // Last-resort: try metadata.instance_name / metadata.instance_uuid
      const { data: byMeta } = await supabase
        .from("evolution_instances")
        .select("*")
        .or(`metadata->>instance_name.eq.${norm.instance},metadata->>instance_uuid.eq.${norm.instance}`);
      instance = byMeta?.[0];
    }

    if (!instance) {
      console.warn("[evolution-webhook] unknown instance:", norm.instance);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- REVOKE (mensagem apagada no aparelho) ----
    if (norm.kind === "revoke") {
      // Casa pelo id WhatsApp guardado em metadata (inbound=evolution_message_id,
      // outbound-echo=external_id) e marca is_deleted SEM apagar o content.
      let marked = 0;
      for (const extId of norm.messageIds) {
        const { data: rows, error } = await supabase
          .from("webchat_messages")
          .update({ is_deleted: true })
          .or(`metadata->>evolution_message_id.eq.${extId},metadata->>external_id.eq.${extId}`)
          .eq("is_deleted", false)
          .select("id, conversation_id");
        if (error) {
          console.warn("[evolution-webhook] revoke: update error", extId, error.message);
        } else if (rows) {
          marked += rows.length;
          // Propaga em tempo real pros inboxes abertos (mesmo canal do new_message).
          for (const r of rows as any[]) {
            try {
              await supabase.channel(`conversation:${r.conversation_id}`).send({
                type: "broadcast",
                event: "message_deleted",
                payload: { id: r.id, conversation_id: r.conversation_id },
              });
            } catch (e) {
              console.warn("[evolution-webhook] revoke: broadcast failed (non-fatal)", (e as any)?.message);
            }
          }
        }
      }
      console.log("[evolution-webhook] revoke: marked", marked, "of", norm.messageIds.length);
      return new Response(JSON.stringify({ ok: true, revoked: marked }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CONNECTION ----
    if (norm.kind === "connection") {
      const mapped =
        norm.state === "open" ? "connected" : norm.state === "connecting" ? "qr_pending" : "disconnected";
      const updates: any = { status: mapped };
      if (mapped === "connected") {
        updates.last_connected_at = new Date().toISOString();
        updates.qr_code = null;
        if (norm.phone) {
          updates.phone_number = String(norm.phone).split("@")[0].split(":")[0].replace(/\D/g, "");
        }
      }
      await supabase.from("evolution_instances").update(updates).eq("id", instance.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- QR CODE ----
    if (norm.kind === "qrcode") {
      if (norm.qr) {
        await supabase
          .from("evolution_instances")
          .update({
            qr_code: norm.qr,
            qr_code_updated_at: new Date().toISOString(),
            status: "qr_pending",
          })
          .eq("id", instance.id);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- MESSAGE ----
    if (norm.kind === "message") {
      const remoteJid = norm.remoteJid;
      const remoteIsLid = remoteJid.includes("@lid");
      const lidJid = norm.lidJid || (remoteIsLid ? remoteJid : undefined);
      const lidId = lidJid ? lidJid.split("@")[0].split(":")[0] : undefined;
      // Se só temos @lid (sem telefone real resolvido), NÃO derivamos um "telefone" do LID.
      const remotePhone = remoteIsLid ? "" : remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
      const instancePhone = (instance.phone_number || "").replace(/\D/g, "");
      const remotePhoneCandidates = remotePhone ? phoneVariantsBR(remotePhone) : [];
      const remotePhoneCanonical = remotePhone ? (normalizePhoneBR(remotePhone) || remotePhone) : "";

      // fromMe = mensagem partiu do APARELHO conectado.
      const isFromDevice = norm.fromMe || (!!instancePhone && remotePhone === instancePhone);

      console.log("[evolution-webhook] decision:", JSON.stringify({
        event: rawEvent,
        instanceName: instance.name,
        instanceId: instance.instance_id,
        IsFromMe: norm.fromMe,
        Sender: remoteJid,
        lidJid,
        instance_phone_db: instancePhone,
        remotePhone,
        decision: isFromDevice ? "device_outbound" : "insert_inbound",
        contentPreview: (norm.content || "").slice(0, 80),
      }));

      if (remoteJid.endsWith("@g.us")) {
        console.log("[evolution-webhook] skipped: group");
        return new Response(JSON.stringify({ ok: true, skipped: "group" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mensagem vinda do APARELHO conectado → outbound externo (dono digitou no celular)
      if (isFromDevice) {
        try {
          // Eventos de eco sem destinatário claro
          if (!remotePhone && !lidId) {
            console.log("[evolution-webhook] external_outbound: skip self_echo_no_target");
            return new Response(JSON.stringify({ ok: true, skipped: "self_echo_no_target" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (remotePhone && remotePhone === instancePhone) {
            console.log("[evolution-webhook] external_outbound: skip self_echo (same phone)");
            return new Response(JSON.stringify({ ok: true, skipped: "self_echo_no_target" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Dedupe 1: external_id idêntico (mensagem já gravada anteriormente por nós)
          if (norm.messageId) {
            const { data: existingMsg } = await supabase
              .from("webchat_messages")
              .select("id")
              .eq("metadata->>external_id", norm.messageId)
              .limit(1)
              .maybeSingle();
            if (existingMsg?.id) {
              console.log("[evolution-webhook] external_outbound: dedupe_external_id_match", norm.messageId);
              return new Response(JSON.stringify({ ok: true, skipped: "outbound_echo" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }

          // Localiza conversa: por telefone real OU por LID já registrado em metadata.
          const targetPhone = remotePhoneCanonical;
          let convOut: { id: string; status?: string } | null = null;

          if (remotePhoneCanonical) {
            const { data: existingConvOut } = await supabase
              .from("webchat_conversations")
              .select("id, status")
              .eq("organization_id", instance.organization_id)
              .eq("channel", "whatsapp")
              .eq("visitor_phone_normalized", remotePhoneCanonical)
              .order("status", { ascending: true })
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            convOut = existingConvOut as any;
          }

          // Fallback: só temos LID — tenta achar conversa que já tenha esse LID guardado.
          if (!convOut?.id && lidId) {
            const { data: convByLid } = await supabase
              .from("webchat_conversations")
              .select("id, status")
              .eq("organization_id", instance.organization_id)
              .eq("channel", "whatsapp")
              .eq("metadata->>wa_lid", lidId)
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            convOut = convByLid as any;
          }

          // Dedupe 2 (após localizar conv): mesmo conteúdo outbound nos últimos 60s nesta conv
          if (convOut?.id && norm.content) {
            const since = new Date(Date.now() - 60_000).toISOString();
            const { data: recentSameContent } = await supabase
              .from("webchat_messages")
              .select("id")
              .eq("conversation_id", convOut.id)
              .eq("direction", "outbound")
              .eq("content", norm.content)
              .gte("created_at", since)
              .limit(1)
              .maybeSingle();
            if (recentSameContent?.id) {
              console.log("[evolution-webhook] external_outbound: dedupe_recent_content_match");
              return new Response(JSON.stringify({ ok: true, skipped: "outbound_echo_content" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }

          if (convOut?.id && convOut.status === "closed") {
            await supabase
              .from("webchat_conversations")
              .update({ status: "human_active", closed_at: null, evolution_instance_id: instance.id })
              .eq("id", convOut.id);
          }

          // Persiste o LID na conversa achada por telefone (pra próximos eventos só com @lid casarem).
          if (convOut?.id && lidId) {
            const { data: convRow } = await supabase
              .from("webchat_conversations")
              .select("metadata")
              .eq("id", convOut.id)
              .maybeSingle();
            const meta = (convRow?.metadata as any) || {};
            if (meta.wa_lid !== lidId) {
              await supabase
                .from("webchat_conversations")
                .update({ metadata: { ...meta, wa_lid: lidId } })
                .eq("id", convOut.id);
            }
          }

          // Sem telefone real e sem match por LID → não criar conversa fantasma.
          if (!convOut?.id && !remotePhoneCanonical) {
            console.log("[evolution-webhook] external_outbound: skip lid_no_phone", { lidId });
            return new Response(JSON.stringify({ ok: true, skipped: "lid_no_phone" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (!convOut?.id) {
            const { data: newLead, error: newLeadErr } = await supabase
              .from("leads")
              .insert({
                organization_id: instance.organization_id,
                name: norm.pushName || targetPhone,
                phone: targetPhone,
                source: "whatsapp",
              })
              .select("id")
              .single();
            if (newLeadErr) {
              console.error("[evolution-webhook] external_outbound: lead_insert_error", newLeadErr.message);
            }

            const { data: newConv, error: newConvErr } = await supabase
              .from("webchat_conversations")
              .insert({
                organization_id: instance.organization_id,
                channel: "whatsapp",
                visitor_phone: targetPhone,
                visitor_name: norm.pushName || targetPhone,
                status: "human",
                evolution_instance_id: instance.id,
                lead_id: newLead?.id || null,
                last_message_at: new Date().toISOString(),
                metadata: lidId ? { wa_lid: lidId } : {},
              })
              .select("id")
              .single();
            if (newConvErr && (newConvErr as any).code === "23505") {
              const { data: race } = await supabase
                .from("webchat_conversations")
                .select("id")
                .eq("organization_id", instance.organization_id)
                .eq("channel", "whatsapp")
                .eq("visitor_phone_normalized", remotePhoneCanonical)
                .neq("status", "closed")
                .limit(1)
                .maybeSingle();
              convOut = race as any;
              console.log("[evolution-webhook] external_outbound: conv_race_resolved", convOut?.id);
            } else if (newConvErr) {
              console.error("[evolution-webhook] external_outbound: conv_insert_error", newConvErr.message);
            } else {
              convOut = newConv as any;
              console.log("[evolution-webhook] external_outbound: conv_created", convOut?.id);
            }
          } else {
            console.log("[evolution-webhook] external_outbound: conv_found", convOut.id);
          }

          if (convOut?.id) {
            const mediaInfo = norm.media
              ? { media_url: norm.media.url || null, media_type: norm.media.type || null }
              : null;
            const { data: insertedAgentMsg, error: insertErr } = await supabase
              .from("webchat_messages")
              .insert({
                conversation_id: convOut.id,
                sender_type: "agent",
                direction: "outbound",
                content: norm.content || (norm.media ? "[mídia]" : ""),
                content_type: norm.media?.type === "image"
                  ? "image"
                  : norm.media?.type === "audio"
                  ? "audio"
                  : norm.media
                  ? "file"
                  : "text",
                metadata: {
                  external_id: norm.messageId,
                  source: "external_device",
                  from_device: true,
                  ...(mediaInfo || {}),
                },
              })
              .select("*")
              .single();

            if (insertErr) {
              console.error(
                "[evolution-webhook] external_outbound: insert_error",
                insertErr.message,
                JSON.stringify(insertErr),
              );
              return new Response(
                JSON.stringify({ ok: false, error: insertErr.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }

            console.log(
              "[evolution-webhook] external_outbound: insert_ok",
              JSON.stringify({ message_id: insertedAgentMsg?.id, conversation_id: convOut.id }),
            );

            await supabase
              .from("webchat_conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", convOut.id);

            // Broadcast realtime → painel atualiza na hora
            if (insertedAgentMsg) {
              try {
                const ch = supabase.channel(`conversation:${convOut.id}`);
                await ch.send({
                  type: "broadcast",
                  event: "new_message",
                  payload: insertedAgentMsg,
                });
                await supabase.removeChannel(ch);
              } catch (e) {
                console.error("[evolution-webhook] broadcast (agent) non-fatal:", e);
              }
            }
          }

          return new Response(JSON.stringify({ ok: true, stored: "external_outbound" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error(
            "[evolution-webhook] external_outbound: exception",
            e?.message || String(e),
            e?.stack || "",
          );
          return new Response(
            JSON.stringify({ ok: false, error: e?.message || "external_outbound exception" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const phone = remotePhone;
      const phoneCandidates = remotePhoneCandidates;
      const phoneCanonical = remotePhoneCanonical;
      if (!phone) {
        console.log("[evolution-webhook] skipped: no_phone (LID-only inbound), remoteJid was:", remoteJid, "lid:", lidId);
        return new Response(JSON.stringify({ ok: true, skipped: "no_phone" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const senderName = norm.pushName || phone;
      console.log("[evolution-webhook] processing message from phone:", phone, "name:", senderName);

      // Find or create conversation for this phone + org.
      // Estratégia tolerante a troca de instância:
      //   1) Tenta achar conversa aberta com a MESMA instância.
      //   2) Se não achar, busca qualquer conversa aberta do mesmo (org, telefone, whatsapp)
      //      sem filtrar instância — assim PRESERVAMOS o histórico do contato mesmo
      //      quando o número é reconectado/migrado para outra instância.
      // NÃO fechamos conversas duplicadas automaticamente: o histórico do atendente
      // nunca pode sumir por trás dele. Se houver duplicatas, o atendente encerra
      // manualmente quando quiser.
      let conversationId: string | null = null;
      let existing: { id: string } | null = null;

      // Busca por telefone NORMALIZADO (canonical BR), tolerante a 55/+55/9 móvel.
      // Aceita também conversa FECHADA do mesmo número e reabre — assim nunca duplicamos.
      const { data: existingByPhone } = await supabase
        .from("webchat_conversations")
        .select("id, status")
        .eq("organization_id", instance.organization_id)
        .eq("channel", "whatsapp")
        .eq("visitor_phone_normalized", phoneCanonical)
        .order("evolution_instance_id", { ascending: false, nullsFirst: false })
        .order("product_id", { ascending: false, nullsFirst: false })
        .order("status", { ascending: true }) // 'closed' fica por último
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingByPhone?.id) {
        existing = { id: existingByPhone.id };
        if ((existingByPhone as any).status === "closed") {
          // Reabre a mesma conversa em vez de criar uma nova: preserva histórico
          await supabase
            .from("webchat_conversations")
            .update({ status: "waiting_human", closed_at: null })
            .eq("id", existingByPhone.id);
          console.log("[evolution-webhook] reopened closed conversation for phone:", phoneCanonical);
        }
      }

      // Telemetria: se houver mais de uma conversa aberta, apenas logamos.
      try {
        const { count: openCount } = await supabase
          .from("webchat_conversations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", instance.organization_id)
          .in("visitor_phone", phoneCandidates)
          .eq("channel", "whatsapp")
          .neq("status", "closed");
        if ((openCount ?? 0) > 1) {
          console.log(
            `[evolution-webhook] multiple open conversations for phone=${phone} count=${openCount} (NOT auto-closing — preserving history)`,
          );
        }
      } catch (_) { /* non-fatal */ }

      if (existing) {
        conversationId = existing.id;

        // Read current_agent_id + agent_type + orchestrator state to decide whether
        // we can/should reassign an instance-bound agent here.
        const { data: currentConv } = await supabase
          .from("webchat_conversations")
          .select("current_agent_id, orchestrator_state, product_agents:current_agent_id(agent_type, is_active)")
          .eq("id", existing.id)
          .maybeSingle();

        const currentAgentInfo = (currentConv as any)?.product_agents;
        const isManualAdminOverride =
          currentAgentInfo?.agent_type === "admin" && currentAgentInfo?.is_active === true;

        // Check if the org uses an Orchestrator. When enabled, the Orchestrator owns
        // the routing and we MUST NOT pre-assign instance-bound agents while the
        // conversation is still in triage / quick-menu states. Otherwise the lead
        // would be answered by an SDR before going through the welcome flow.
        const { data: orchCfg } = await supabase
          .from("organization_orchestrator_config")
          .select("is_enabled, orchestrator_agent_id")
          .eq("organization_id", instance.organization_id)
          .maybeSingle();
        const orchActive = !!(orchCfg?.is_enabled && orchCfg?.orchestrator_agent_id);
        const convState = (currentConv as any)?.orchestrator_state || null;

        // Auto-reset for stale conversations: if the orchestrator is active and
        // the lead has been silent for a long time, force the conversation back
        // into triage so the welcome flow runs again. This makes "returning leads"
        // pass through the orchestrator on every reactivation, as required.
        let stateAfterReset = convState;
        let didResetForStale = false;
        if (orchActive && !isManualAdminOverride) {
          try {
            const { data: lastOutboundEW } = await supabase
              .from("webchat_messages")
              .select("created_at")
              .eq("conversation_id", existing.id)
              .eq("direction", "outbound")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
            const lastT = (lastOutboundEW as any)?.created_at
              ? new Date((lastOutboundEW as any).created_at).getTime()
              : 0;
            if (lastT > 0 && Date.now() - lastT > SIX_HOURS_MS) {
              didResetForStale = true;
              stateAfterReset = null;
              console.log("[evolution-webhook] existing conv: silence>6h → resetting orchestrator");
            }
          } catch (_) { /* non-fatal */ }
        }

        const inTriageStates =
          orchActive &&
          (stateAfterReset === null || stateAfterReset === "triagem" || stateAfterReset === "aguardando_menu");

        const updatePayload: any = {
          evolution_instance_id: instance.id,
          last_message_at: new Date().toISOString(),
        };

        if (didResetForStale) {
          updatePayload.orchestrator_state = null;
          updatePayload.orchestrator_context = null;
          updatePayload.orchestrator_question_count = 0;
          updatePayload.current_agent_id = null;
        }

        if (isManualAdminOverride) {
          console.log(
            "[evolution-webhook] preserving admin agent override:",
            (currentConv as any)?.current_agent_id,
          );
        } else if (inTriageStates) {
          // Orchestrator is in charge — leave current_agent_id untouched (likely null)
          // so the orchestrator can route fresh based on the lead's message.
          console.log("[evolution-webhook] existing conv in triage → letting orchestrator route");
        } else {
          // No orchestrator (or already in active attendance with a specialist):
          // safe to bind the conversation to the instance-bound agent if we have one.
          const { data: instanceBoundAgent } = await supabase
            .from("product_agents")
            .select("id")
            .eq("evolution_instance_id", instance.id)
            .eq("is_active", true)
            .order("is_default", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (instanceBoundAgent?.id) {
            updatePayload.current_agent_id = instanceBoundAgent.id;
            console.log("[evolution-webhook] existing conv → reassigning to bound agent:", instanceBoundAgent.id);
          }
        }
        await supabase
          .from("webchat_conversations")
          .update(updatePayload)
          .eq("id", existing.id);
      } else {
        const { data: widget } = await supabase
          .from("webchat_widgets")
          .select("id, product_id")
          .eq("organization_id", instance.organization_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        // Lookup do lead pelo telefone NORMALIZADO (anti-duplicação por DDI/9 móvel)
        let { data: lead } = await supabase
          .from("leads")
          .select("id, name")
          .eq("organization_id", instance.organization_id)
          .eq("phone_normalized", phoneCanonical)
          .limit(1)
          .maybeSingle();

        // Auto-create lead if none exists for this contact (no manual linking).
        if (!lead?.id) {
          try {
            const { data: createdLead, error: createLeadErr } = await supabase
              .from("leads")
              .insert({
                organization_id: instance.organization_id,
                name: senderName || phoneCanonical,
                phone: phoneCanonical,
                source: "whatsapp",
              })
              .select("id, name")
              .single();
            if (createLeadErr) {
              // 23505 → outro fluxo criou simultaneamente; recupera o existente
              if ((createLeadErr as any).code === "23505") {
                const { data: race } = await supabase
                  .from("leads")
                  .select("id, name")
                  .eq("organization_id", instance.organization_id)
                  .eq("phone_normalized", phoneCanonical)
                  .limit(1)
                  .maybeSingle();
                lead = race as any;
              } else {
                console.error("[evolution-webhook] auto-create lead failed (non-fatal):", createLeadErr);
              }
            } else {
              lead = createdLead;
              console.log("[evolution-webhook] auto-created lead:", lead?.id);
            }
          } catch (e) {
            console.error("[evolution-webhook] auto-create lead error (non-fatal):", e);
          }
        }

        // Decide initial status: if product has an active AI agent, start in bot_active
        let initialStatus = "waiting_human";
        let initialAgentId: string | null = null;
        let productResolvedId: string | null = (widget as any)?.product_id ?? null;

        // PRIORITY 1 (ALWAYS): agent explicitly bound to THIS Evolution instance.
        // A dedicated WhatsApp number means the customer is talking to a SPECIFIC
        // product/agent — the orchestrator must NEVER override this, otherwise a
        // number dedicated to "Product A" could end up being answered by an agent
        // from "Product B", which is exactly the bug we just fixed.
        const { data: instanceBoundAgent } = await supabase
          .from("product_agents")
          .select("id, product_id")
          .eq("evolution_instance_id", instance.id)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (instanceBoundAgent?.id) {
          initialStatus = "bot_active";
          initialAgentId = instanceBoundAgent.id;
          if (instanceBoundAgent.product_id) {
            productResolvedId = instanceBoundAgent.product_id;
          }
          console.log("[evolution-webhook] new conv → instance-bound agent (lock):", initialAgentId, "product:", productResolvedId);
        } else {
          // No agent dedicated to this WhatsApp number → fall back to orchestrator
          // (when enabled) or to product default agent (legacy).
          const { data: orchCfgNew } = await supabase
            .from("organization_orchestrator_config")
            .select("is_enabled, orchestrator_agent_id")
            .eq("organization_id", instance.organization_id)
            .maybeSingle();
          const orchActiveNew = !!(orchCfgNew?.is_enabled && orchCfgNew?.orchestrator_agent_id);

          if (orchActiveNew) {
            initialStatus = "bot_active";
            initialAgentId = null;
            if (!productResolvedId) {
              const { data: anyProd } = await supabase
                .from("products")
                .select("id")
                .eq("organization_id", instance.organization_id)
                .eq("is_active", true)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              productResolvedId = anyProd?.id || null;
            }
            console.log("[evolution-webhook] new conv → no instance lock; orchestrator will triage");
          } else if (productResolvedId) {
            // Priority 2: default agent of the widget's product (legacy behavior)
            const { data: defAgent } = await supabase
              .from("product_agents")
              .select("id")
              .eq("product_id", productResolvedId)
              .eq("is_default", true)
              .eq("is_active", true)
              .maybeSingle();
            let agent = defAgent;
            if (!agent) {
              const { data: anyAgent } = await supabase
                .from("product_agents")
                .select("id")
                .eq("product_id", productResolvedId)
                .eq("is_active", true)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              agent = anyAgent;
            }
            if (agent?.id) {
              initialStatus = "bot_active";
              initialAgentId = agent.id;
            }
          }

          // Priority 3 (FINAL FALLBACK): no instance-lock, no orchestrator, no
          // widget product_id resolved. Pick ANY active agent of the org with a
          // product_id so the bot can at least respond instead of going silent.
          // Without this, conversations end up with status=bot_active but
          // agent_id=null/product_id=null and webchat-bot just skips ("no product_id").
          if (!initialAgentId) {
            const { data: orgFallbackAgent } = await supabase
              .from("product_agents")
              .select("id, product_id")
              .eq("organization_id", instance.organization_id)
              .eq("is_active", true)
              .not("product_id", "is", null)
              .order("is_default", { ascending: false })
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (orgFallbackAgent?.id) {
              initialStatus = "bot_active";
              initialAgentId = orgFallbackAgent.id;
              productResolvedId = orgFallbackAgent.product_id;
              console.log("[evolution-webhook] new conv → org-wide fallback agent:", initialAgentId, "product:", productResolvedId);
            }
          }
        }

        // ---- FUNNEL TRIGGER (WhatsApp channel) ----
        // Look for an active capture_funnel that has the WhatsApp channel enabled
        // and matches this evolution instance (or any instance) and trigger rules.
        let funnelToRun: { id: string; start_block_id: string | null } | null = null;
        try {
          const { data: candidates } = await supabase
            .from("capture_funnels")
            .select("id, start_block_id, channels")
            .eq("organization_id", instance.organization_id)
            .eq("status", "active");

          const lowerMsg = (norm.content || "").toLowerCase();
          for (const cand of candidates || []) {
            const wa = (cand as any).channels?.whatsapp;
            if (!wa?.enabled) continue;
            const boundInstance = wa.evolution_instance_id;
            if (boundInstance && boundInstance !== instance.id) continue;
            // Sem regras de gatilho: toda primeira mensagem dispara o funil habilitado.
            funnelToRun = { id: cand.id, start_block_id: (cand as any).start_block_id || null };
            break;
          }
        } catch (e: any) {
          console.warn("[evolution-webhook] funnel lookup error:", e?.message || String(e));
        }

        // Resolve setor padrão da organização (fallback "Sem Setor")
        let defaultSectorId: string | null = null;
        try {
          const { data: defSec } = await supabase
            .from("sectors")
            .select("id")
            .eq("organization_id", instance.organization_id)
            .eq("is_default", true)
            .maybeSingle();
          defaultSectorId = (defSec as any)?.id || null;
        } catch (_) { /* noop */ }

        const newConv: any = {
          organization_id: instance.organization_id,
          visitor_id: crypto.randomUUID(),
          channel: "whatsapp",
          status: initialStatus,
          visitor_phone: phoneCanonical,
          visitor_name: lead?.name || senderName,
          evolution_instance_id: instance.id,
          last_message_at: new Date().toISOString(),
        };
        if (widget?.id) newConv.widget_id = widget.id;
        if (lead?.id) newConv.lead_id = lead.id;
        if (initialAgentId) newConv.current_agent_id = initialAgentId;
        if (defaultSectorId) newConv.sector_id = defaultSectorId;

        // If a funnel matches, the funnel takes over: bot_active + flow state set
        if (funnelToRun && funnelToRun.start_block_id) {
          newConv.status = "bot_active";
          newConv.current_flow_id = funnelToRun.id;
          newConv.current_block_id = funnelToRun.start_block_id;
          newConv.flow_variables = {};
          newConv.flow_completed = false;
          newConv.flow_source = "funnel";
          // The funnel controls the conversation; agent only takes over via ai_takeover/agent_switch.
          newConv.current_agent_id = null;
          console.log("[evolution-webhook] funnel matched → starting funnel run", JSON.stringify({
            funnel_id: funnelToRun.id,
            start_block_id: funnelToRun.start_block_id,
          }));
        }

        const { data: created, error: convErr } = await supabase
          .from("webchat_conversations")
          .insert(newConv)
          .select("id")
          .single();

        if (convErr) {
          if ((convErr as any).code === "23505") {
            // Race com outro fluxo — reusar conversa existente do mesmo telefone
            const { data: race } = await supabase
              .from("webchat_conversations")
              .select("id")
              .eq("organization_id", instance.organization_id)
              .eq("channel", "whatsapp")
              .eq("visitor_phone_normalized", phoneCanonical)
              .neq("status", "closed")
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            if (race?.id) {
              conversationId = race.id;
              console.log("[evolution-webhook] reused conversation after 23505 race:", conversationId);
            } else {
              console.error("[evolution-webhook] conv create error (23505 no race row):", convErr);
              return new Response(JSON.stringify({ ok: false, error: convErr.message }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } else {
            console.error("[evolution-webhook] conv create error:", convErr);
            return new Response(JSON.stringify({ ok: false, error: convErr.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          conversationId = created.id;
        }

        console.log("[evolution-webhook] new conversation created", JSON.stringify({
          id: conversationId,
          status: initialStatus,
          agent_id: initialAgentId,
          phone,
        }));

        // Fire-and-forget: enrich with WhatsApp profile picture (best effort, non-blocking).
        // Pulled from Evolution Go: GET /chat/findContacts or /chat/fetchProfilePictureUrl.
        try {
          const { data: cfg } = await supabase
            .from("integration_settings")
            .select("settings")
            .eq("organization_id", instance.organization_id)
            .eq("integration_type", "whatsapp_provider")
            .maybeSingle();
          const settings = (cfg as any)?.settings || {};
          let evoUrl = String(settings.evolution_go_url || "").replace(/\/$/, "");
          let apiKey: string | undefined =
            instance.instance_token || settings.evolution_go_global_api_key;
          if (!evoUrl || !apiKey) {
            const { data: platformCfg } = await supabase
              .from("platform_settings")
              .select("evolution_go_url, evolution_go_global_api_key")
              .limit(1)
              .maybeSingle();
            evoUrl = evoUrl || String((platformCfg as any)?.evolution_go_url || "").replace(/\/$/, "");
            apiKey = apiKey || (platformCfg as any)?.evolution_go_global_api_key;
          }
          if (evoUrl && apiKey && instance.name) {
            const picResp = await fetch(
              `${evoUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance.name)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: apiKey },
                body: JSON.stringify({ number: phone }),
              },
            );
            if (picResp.ok) {
              const picJson = await picResp.json().catch(() => null);
              const picUrl: string | undefined =
                picJson?.profilePictureUrl || picJson?.profile_picture_url || picJson?.url;
              if (picUrl && /^https?:\/\//.test(picUrl)) {
                await supabase
                  .from("webchat_conversations")
                  .update({ visitor_avatar_url: picUrl })
                  .eq("id", conversationId);
                console.log("[evolution-webhook] saved visitor_avatar_url for", conversationId);
              }
            } else {
              console.log("[evolution-webhook] profile pic lookup status", picResp.status);
            }
          }
        } catch (picErr) {
          console.warn("[evolution-webhook] profile pic lookup failed (non-fatal):", picErr);
        }

        // Safety net: fecha qualquer outra conversa aberta do mesmo telefone normalizado
        const { error: closeErr } = await supabase
          .from("webchat_conversations")
          .update({ status: "closed", closed_at: new Date().toISOString() })
          .eq("organization_id", instance.organization_id)
          .eq("visitor_phone_normalized", phoneCanonical)
          .eq("channel", "whatsapp")
          .neq("status", "closed")
          .neq("id", conversationId);
        if (closeErr) {
          console.warn("[evolution-webhook] close duplicates warn:", closeErr.message);
        }
      }

      // conversationId is resolved above (existing / race / created). If none of those
      // set it (e.g. creation failed), nothing below — media persistence, dedup/locks,
      // bot dispatch — is meaningful. Ack the webhook and stop (mirrors other skip paths).
      if (!conversationId) {
        console.warn("[evolution-webhook] no conversationId resolved; skipping media/bot processing");
        return new Response(JSON.stringify({ ok: true, skipped: "no_conversation" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ---- MULTIMODAL ENRICHMENT (audio / image / video / document / sticker) ----
      // For ALL inbound media we attempt to:
      //   1. Decrypt / download the bytes (local HKDF/AES, then Evolution Go fallbacks).
      //   2. Upload the decrypted bytes to the public `chat-media` bucket so the
      //      Inbox can render them (the original WhatsApp URL is an encrypted
      //      `.enc` blob and never works as an <img>/<video> src).
      //   3. For audio/image: also call process-media-message (Whisper / Vision)
      //      to enrich the textual content the agent will read.
      //
      // mediaMeta is the canonical payload consumed by `extractMedia()` on the
      // front-end (src/lib/messageMedia.ts) → Inbox renders audio player, image,
      // video player, document chip, sticker.
      const isWhatsappEncryptedUrl = (u?: string | null) =>
        !!u && /(mmg\.whatsapp\.net|media\.fmaa|whatsapp\.net)/i.test(u);

      const mediaMeta: any = norm.media
        ? {
            kind: norm.media.type,
            mime: norm.media.mime || null,
            // Start with whatever URL the webhook gave us, but null it out if
            // it's a WhatsApp-encrypted URL (which the browser cannot render).
            // Storage upload below will overwrite this with a public URL.
            url: isWhatsappEncryptedUrl(norm.media.url) ? null : (norm.media.url || null),
            caption: (norm.media as any).caption || null,
            filename:
              (norm.media as any).rawMessage?.fileName ||
              (norm.media as any).rawMessage?.FileName ||
              null,
            size_bytes:
              Number(
                (norm.media as any).rawMessage?.fileLength ||
                  (norm.media as any).rawMessage?.FileLength ||
                  0,
              ) || null,
            duration_ms:
              norm.media.type === "audio" && (norm.media as any).rawMessage?.seconds
                ? Number((norm.media as any).rawMessage.seconds) * 1000
                : norm.media.type === "video" && (norm.media as any).rawMessage?.seconds
                ? Number((norm.media as any).rawMessage.seconds) * 1000
                : null,
            width:
              Number(
                (norm.media as any).rawMessage?.width ||
                  (norm.media as any).rawMessage?.Width ||
                  0,
              ) || null,
            height:
              Number(
                (norm.media as any).rawMessage?.height ||
                  (norm.media as any).rawMessage?.Height ||
                  0,
              ) || null,
          }
        : null;

      let processedContent = norm.content;
      let processedKind: "audio" | "image" | null = null;

      if (norm.media) {
        try {
          // 1) Resolve agent (for audio/image AI toggles only).
          const { data: convAgent } = await supabase
            .from("webchat_conversations")
            .select("current_agent_id")
            .eq("id", conversationId)
            .maybeSingle();
          let agentId: string | null = (convAgent as any)?.current_agent_id || null;
          if (!agentId) {
            const { data: ia } = await supabase
              .from("product_agents")
              .select("id")
              .eq("evolution_instance_id", instance.id)
              .eq("is_active", true)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            agentId = (ia as any)?.id || null;
          }
          let canAudio = true;
          let canImage = true;
          if (agentId) {
            const { data: ag } = await supabase
              .from("product_agents")
              .select("enable_audio_transcription, enable_image_vision")
              .eq("id", agentId)
              .maybeSingle();
            if (ag) {
              canAudio = (ag as any).enable_audio_transcription !== false;
              canImage = (ag as any).enable_image_vision !== false;
            }
          }

          // 2) Download / decrypt bytes (always for any media type).
          let b64 = norm.media.base64;
          let mime = norm.media.mime;
          let mediaUrl = norm.media.url && !isWhatsappEncryptedUrl(norm.media.url)
            ? norm.media.url
            : undefined;

          if (!b64) {
            const { data: cfg } = await supabase
              .from("integration_settings")
              .select("settings")
              .eq("organization_id", instance.organization_id)
              .eq("integration_type", "whatsapp_provider")
              .maybeSingle();
            const settings = (cfg as any)?.settings || {};
            let evoUrl = String(settings.evolution_go_url || "").replace(/\/$/, "");
            const apiKeys = [instance.instance_token, settings.evolution_go_global_api_key];
            if (!evoUrl || apiKeys.every((k) => !k)) {
              const { data: platformCfg } = await supabase
                .from("platform_settings")
                .select("evolution_go_url, evolution_go_global_api_key")
                .limit(1)
                .maybeSingle();
              evoUrl = evoUrl || String((platformCfg as any)?.evolution_go_url || "").replace(/\/$/, "");
              apiKeys.push((platformCfg as any)?.evolution_go_global_api_key);
            }
            const dl = await downloadMediaBase64(
              evoUrl,
              apiKeys,
              norm.media.rawMessage,
              norm.messageId,
              norm.media.type,
              norm.remoteJid,
              instance.name || norm.instance,
              instance.instance_id,
            );
            if (dl) {
              b64 = dl.base64;
              if (dl.mime) mime = dl.mime;
              mediaUrl = undefined;
            }
          }

          // 3) Upload decrypted bytes to Storage so the Inbox can render them.
          if (b64) {
            try {
              const bytes = base64ToUint8(b64);
              const finalMime = mime || mediaMeta?.mime || "application/octet-stream";
              const publicUrl = await uploadInboundMediaToStorage(
                supabase,
                instance.organization_id,
                conversationId,
                norm.messageId,
                bytes,
                finalMime,
                mediaMeta?.filename,
              );
              if (publicUrl && mediaMeta) {
                mediaMeta.url = publicUrl;
                mediaMeta.mime = finalMime;
                if (!mediaMeta.size_bytes) mediaMeta.size_bytes = bytes.byteLength;
              }
            } catch (upErr: any) {
              console.warn("[evolution-webhook] media upload pipeline failed:", upErr?.message || String(upErr));
            }
          } else if (mediaMeta && isWhatsappEncryptedUrl(norm.media.url)) {
            // No bytes AND original URL is encrypted → frontend cannot render.
            mediaMeta.url = null;
          }

          // 4) AI text enrichment (audio Whisper / image Vision only).
          const aiAllowed =
            (norm.media.type === "audio" && canAudio) ||
            (norm.media.type === "image" && canImage);

          if (aiAllowed) {
            if (b64 || mediaUrl) {
              const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
              const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
              const text = await processMediaToText(supabaseUrl, serviceKey, {
                kind: norm.media.type as "audio" | "image",
                base64: b64,
                url: mediaUrl,
                mime,
                caption: norm.media.caption,
                organization_id: instance.organization_id,
              });
              if (text) {
                processedKind = norm.media.type as "audio" | "image";
                if (norm.media.type === "audio") {
                  processedContent = `🎙️ Áudio do cliente (transcrito): ${text}`;
                } else {
                  processedContent = norm.media.caption
                    ? `🖼️ Imagem (legenda: "${norm.media.caption}"): ${text}`
                    : `🖼️ Imagem do cliente: ${text}`;
                }
                console.log(
                  `[evolution-webhook] media processed (${norm.media.type}): ${text.slice(0, 80)}...`,
                );
              } else {
                if (norm.media.type === "audio") {
                  processedContent = `🎙️ [Áudio recebido — não consegui transcrever. Peça ao cliente para reenviar ou descrever em texto.]`;
                } else {
                  processedContent = norm.media.caption
                    ? `🖼️ [Imagem recebida (legenda: "${norm.media.caption}") — não consegui analisar o conteúdo. Peça para reenviar ou descrever.]`
                    : `🖼️ [Imagem recebida — não consegui analisar o conteúdo. Peça para reenviar ou descrever.]`;
                }
                console.warn(`[evolution-webhook] media NOT processed (${norm.media.type}); using fallback placeholder`);
              }
            } else {
              if (norm.media.type === "audio") {
                processedContent = `🎙️ [Áudio recebido — sem dados disponíveis para transcrição.]`;
              } else {
                processedContent = `🖼️ [Imagem recebida — sem dados disponíveis para análise.]`;
              }
              console.warn(`[evolution-webhook] media has no b64 nor url; using fallback placeholder`);
            }
          } else if (norm.media.type === "audio" || norm.media.type === "image") {
            // Toggle off but media uploaded → still surface placeholder for agent.
            if (norm.media.type === "audio") {
              processedContent = `🎙️ [Áudio recebido — transcrição desativada para este agente.]`;
            } else {
              processedContent = `🖼️ [Imagem recebida — análise visual desativada para este agente.]`;
            }
          } else {
            // video / document / sticker → no AI enrichment, just a textual marker.
            const fname = mediaMeta?.filename;
            if (norm.media.type === "video") {
              processedContent = norm.media.caption
                ? `🎥 Vídeo (legenda: "${norm.media.caption}")`
                : `🎥 [Vídeo enviado pelo cliente]`;
            } else if (norm.media.type === "document") {
              processedContent = fname
                ? `📎 Documento: ${fname}`
                : `📎 [Documento enviado pelo cliente]`;
            } else if (norm.media.type === "sticker") {
              processedContent = `🟡 [Figurinha enviada pelo cliente]`;
            }
          }
        } catch (e: any) {
          console.warn("[evolution-webhook] media processing failed:", e?.message || String(e));
          if (norm.media.type === "audio") {
            processedContent = `🎙️ [Áudio recebido — falha técnica ao processar.]`;
          } else if (norm.media.type === "image") {
            processedContent = `🖼️ [Imagem recebida — falha técnica ao processar.]`;
          } else if (norm.media.type === "video") {
            processedContent = `🎥 [Vídeo recebido — falha técnica ao processar.]`;
          } else if (norm.media.type === "document") {
            processedContent = `📎 [Documento recebido — falha técnica ao processar.]`;
          } else {
            processedContent = `📎 [Mídia recebida — falha técnica ao processar.]`;
          }
        }
      }

      // ============================================================
      // INBOUND DEDUP — Evolution Go pode reentregar o mesmo webhook
      // várias vezes (timeout do nosso handler). Camadas:
      //  1) processed_messages (UNIQUE instance_id+message_id) → barra retries
      //     antes de qualquer trabalho pesado. TTL de 24h.
      //  2) webchat_messages.metadata->>evolution_message_id → 2ª barreira.
      // ============================================================
      if (norm.messageId) {
        const isDup = await isDuplicateInboundMessage(
          supabase,
          instance.id,
          remotePhone || null,
          norm.messageId,
        );
        if (isDup) {
          console.log("[evolution-webhook] skip: duplicate_message_id", norm.messageId);
          return new Response(JSON.stringify({ ok: true, skipped: "duplicate_message_id" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: dup } = await supabase
          .from("webchat_messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("metadata->>evolution_message_id", norm.messageId)
          .limit(1)
          .maybeSingle();
        if (dup?.id) {
          console.log("[evolution-webhook] skip: inbound duplicate (evolution_message_id match)", norm.messageId);
          return new Response(JSON.stringify({ ok: true, skipped: "inbound_duplicate" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }


      const insertPayload = {
        conversation_id: conversationId,
        content: processedContent,
        sender_type: "visitor",
        direction: "inbound",
        metadata: {
          evolution_message_id: norm.messageId,
          evolution_instance_id: instance.id,
          sender_name: senderName,
          ...(mediaMeta ? { media: mediaMeta } : {}),
          ...(processedKind ? { multimodal_processed: processedKind } : {}),
        },
      };

      let savedMessageCreatedAt: string | null = null;
      let savedMessageId: string | null = null;
      try {
        const { data: inserted, error: insertErr } = await supabase
          .from("webchat_messages")
          .insert(insertPayload)
          .select("*")
          .single();

        if (insertErr) {
          // Race: outra invocação concorrente já gravou esta mesma msg
          // (índice único parcial garante unicidade no banco).
          if ((insertErr as any).code === "23505") {
            console.log("[evolution-webhook] skip: inbound duplicate (unique index)", norm.messageId);
            return new Response(JSON.stringify({ ok: true, skipped: "inbound_duplicate_race" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          console.error("[evolution-webhook] insert_result: error", JSON.stringify({
            error: insertErr.message,
            code: insertErr.code,
            details: insertErr.details,
            hint: insertErr.hint,
            conversation_id: conversationId,
            content_preview: (norm.content || "").slice(0, 80),
          }));
          return new Response(JSON.stringify({ ok: false, error: insertErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        savedMessageCreatedAt = inserted?.created_at ?? null;
        savedMessageId = inserted?.id ?? null;
        console.log("[evolution-webhook] insert_result: ok", JSON.stringify({
          message_id: inserted?.id,
          conversation_id: conversationId,
        }));

        // Broadcast realtime → o painel (SellerInbox) escuta `conversation:{id}`
        // e adiciona a mensagem na cache instantaneamente. Sem isso, a janela
        // de chat fica congelada até o usuário recarregar / trocar de conversa.
        if (inserted) {
          try {
            const ch = supabase.channel(`conversation:${conversationId}`);
            await ch.send({
              type: "broadcast",
              event: "new_message",
              payload: inserted,
            });
            await supabase.removeChannel(ch);
          } catch (e) {
            console.error("[evolution-webhook] broadcast (visitor) non-fatal:", e);
          }
        }

        // Campaign response hook (fire-and-forget): aplica post_response_actions
        // se esta conversa pertencer a um target ativo de uma campanha.
        try {
          const supabaseUrlEnv = Deno.env.get("SUPABASE_URL");
          const serviceKeyEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
          if (supabaseUrlEnv && serviceKeyEnv) {
            fetch(`${supabaseUrlEnv}/functions/v1/campaign-on-response`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKeyEnv}` },
              body: JSON.stringify({
                conversation_id: conversationId,
                organization_id: instance.organization_id,
              }),
            }).catch((e) => console.error("[evolution-webhook] campaign-on-response non-fatal:", e));
            // Cadence response hook (fire-and-forget)
            fetch(`${supabaseUrlEnv}/functions/v1/cadence-on-response`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKeyEnv}` },
              body: JSON.stringify({ conversation_id: conversationId, organization_id: instance.organization_id }),
            }).catch((e) => console.error("[evolution-webhook] cadence-on-response non-fatal:", e));
          }
        } catch (e) {
          console.error("[evolution-webhook] campaign/cadence-on-response wrap non-fatal:", e);
        }

        // ===== Booking reply detection (non-blocking) =====
        // If this inbound number has an active booking awaiting confirmation,
        // parse 1/2/3 (or text) and update the booking accordingly.
        try {
          const phoneDigits = (remotePhone || "").replace(/\D/g, "");
          if (phoneDigits) {
            // Match by suffix (last 10 digits) to be tolerant to DDI variations.
            const suffix = phoneDigits.slice(-10);
            const { data: bookings } = await supabase
              .from("booking_requests")
              .select("id, organization_id, status, guest_phone, host_user_id")
              .in("status", ["confirmacao_enviada", "lembrete_enviado", "confirmed", "agendado"])
              .order("start_time", { ascending: false })
              .limit(20);

            const target = (bookings || []).find((b: any) =>
              (b.guest_phone || "").replace(/\D/g, "").endsWith(suffix)
            );

            if (target) {
              const text = (norm.content || "").trim().toLowerCase();
              let newStatus: string | null = null;
              if (/^1\b|^confirm/i.test(text)) newStatus = "confirmado";
              else if (/^2\b|reagend/i.test(text)) newStatus = "reagendamento_solicitado";
              else if (/^3\b|cancel/i.test(text)) newStatus = "cancelado";

              const updates: Record<string, any> = {
                last_reply_at: new Date().toISOString(),
                last_reply_text: norm.content || "",
              };
              if (newStatus) {
                updates.status = newStatus;
                if (newStatus === "confirmado") updates.confirmed_at = new Date().toISOString();
              }

              await supabase.from("booking_requests").update(updates).eq("id", target.id);
              await supabase.from("booking_logs").insert({
                booking_id: target.id,
                organization_id: target.organization_id,
                type: "reply_received",
                channel: "whatsapp",
                payload: { text: norm.content, parsed_status: newStatus },
              });
              console.log(`[evolution-webhook] booking reply matched id=${target.id} -> ${newStatus || "noop"}`);
            }
          }
        } catch (e: any) {
          console.warn("[evolution-webhook] booking reply hook failed:", e?.message || String(e));
        }
      } catch (e: any) {
        console.error("[evolution-webhook] insert_result: exception", e?.message || String(e));
        return new Response(JSON.stringify({ ok: false, error: e?.message || "insert exception" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============================================================
      // BUFFER CURTO (humanização sem queimar tempo)
      // ============================================================
      // Lê configurações de humanização da org. Janela padrão = 3s.
      // Teto absoluto = 8s desde a 1ª msg do burst — nunca mais que isso.
      // Loop: dorme em fatias de 1s; se chegou nova msg do visitor, deferimos
      // para a invocação dessa nova msg (que vai re-medir o teto).
      let groupingEnabled = true;
      let groupingWindowMs = 3000;
      let groupingMaxMs = 8000;
      let presenceEnabledOrg = true;
      try {
        const { data: orgRow } = await supabase
          .from("organizations")
          .select("ai_grouping_enabled, ai_grouping_window_ms, ai_grouping_max_ms, ai_debounce_ms, presence_enabled")
          .eq("id", instance.organization_id)
          .maybeSingle();
        if (orgRow) {
          if (orgRow.ai_grouping_enabled === false) groupingEnabled = false;
          if (orgRow.ai_grouping_window_ms != null) {
            groupingWindowMs = Math.max(0, Math.min(8000, Number(orgRow.ai_grouping_window_ms)));
          } else if (orgRow.ai_debounce_ms != null) {
            // Fallback compatível com config antiga, mas com TETO de 8s.
            groupingWindowMs = Math.max(0, Math.min(8000, Number(orgRow.ai_debounce_ms)));
          }
          if (orgRow.ai_grouping_max_ms != null) {
            groupingMaxMs = Math.max(groupingWindowMs, Math.min(8000, Number(orgRow.ai_grouping_max_ms)));
          }
          if ((orgRow as any).presence_enabled === false) presenceEnabledOrg = false;
        }
      } catch (_) { /* keep defaults */ }

      if (groupingEnabled && groupingWindowMs > 0 && savedMessageCreatedAt) {
        const startedAt = Date.now();
        const tickMs = 1000;
        let lastSeenAt = savedMessageCreatedAt;
        let lastSeenId = savedMessageId || "00000000-0000-0000-0000-000000000000";
        let deferred = false;
        let extensions = 0;
        console.log("[evolution-webhook] grouping start", JSON.stringify({ window: groupingWindowMs, max: groupingMaxMs }));

        // Rolling window: a cada msg nova do visitor, estende a espera até o teto absoluto (max).
        // Se outra invocação posterior assumir o turno, abortamos esta.
        while ((Date.now() - startedAt) < groupingMaxMs) {
          const remainingToWindow = groupingWindowMs - (Date.now() - startedAt) + extensions * groupingWindowMs;
          const remainingToMax = groupingMaxMs - (Date.now() - startedAt);
          const wait = Math.max(0, Math.min(tickMs, remainingToWindow, remainingToMax));
          if (wait <= 0) break;
          await new Promise((r) => setTimeout(r, wait));

          const { data: newer } = await supabase
            .from("webchat_messages")
            .select("id, created_at")
            .eq("conversation_id", conversationId)
            .eq("sender_type", "visitor")
            .gte("created_at", lastSeenAt)
            .order("created_at", { ascending: false })
            .limit(5);

          const arrived = (newer || []).filter((m: any) => {
            if (!m) return false;
            if (m.created_at > lastSeenAt) return true;
            if (m.created_at === lastSeenAt && m.id > lastSeenId) return true;
            return false;
          });

          if (arrived.length > 0) {
            // Nova mensagem do visitor → estende janela. A invocação mais nova
            // assume o turno: se esta não for a mais antiga, abortamos.
            const newest = arrived[0];
            lastSeenAt = newest.created_at;
            lastSeenId = newest.id;
            extensions += 1;
            deferred = true; // outra invocação (gerada pela msg nova) cuidará da resposta
            console.log("[evolution-webhook] grouping: newer msg arrived, deferring to it");
            break;
          }
        }

        if (deferred) {
          return new Response(JSON.stringify({ ok: true, debounced: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log("[evolution-webhook] grouping done", JSON.stringify({ waitedMs: Date.now() - startedAt }));
      }


      // ---- BOT TRIGGER ----
      // If conversation is in bot_active mode, run the funnel engine OR delegate to webchat-bot.
      try {
        const { data: conv } = await supabase
          .from("webchat_conversations")
          .select("id, status, widget_id, visitor_name, current_agent_id, lead_id, current_flow_id, current_block_id, flow_variables, flow_completed, flow_source, orchestrator_state, webchat_widgets(product_id)")
          .eq("id", conversationId)
          .maybeSingle();

        // ---- FUNNEL ENGINE (WhatsApp) ----
        // If the conversation is bound to a funnel and the flow is not completed,
        // execute the next blocks here. Agents take over only when blocks
        // ai_takeover/agent_switch/handoff/end are reached, or when flow finishes.
        if (
          conv &&
          conv.status === "bot_active" &&
          (conv as any).flow_source === "funnel" &&
          (conv as any).current_flow_id &&
          (conv as any).current_block_id &&
          !(conv as any).flow_completed
        ) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

          const { data: funnel } = await supabase
            .from("capture_funnels")
            .select("id, flow_blocks")
            .eq("id", (conv as any).current_flow_id)
            .maybeSingle();

          const blocks: any[] = ((funnel as any)?.flow_blocks || []) as any[];
          const findBlock = (id: string | null) => (id ? blocks.find((b) => b.id === id) : null);

          let currentBlock: any = findBlock((conv as any).current_block_id);
          let flowVariables: Record<string, string> = { ...(((conv as any).flow_variables) || {}) };
          let chunksToSend: string[] = [];
          let nextBlockId: string | null = (conv as any).current_block_id;
          let flowCompleted = false;
          let handoffToAgent: string | null = null;
          let releaseToOrchestrator = false;
          let closeConversation = false;

          const replaceVars = (txt: string) => {
            if (!txt) return "";
            return txt.replace(/\{\{?(\w+)\}?\}/g, (_, k) => flowVariables[k] || flowVariables[k.toLowerCase()] || "");
          };

          // 1) If currentBlock waits for input/buttons, consume the user's message first
          if (currentBlock?.type === "input") {
            const varName = currentBlock.data?.variable_name || currentBlock.data?.input_type || "resposta";
            flowVariables[varName] = norm.content;
            // Also enrich conversation if it looks like email/phone
            if (/^\S+@\S+\.\S+$/.test(norm.content)) flowVariables["email"] = norm.content;
            if (/^\+?\d[\d\s().-]{6,}$/.test(norm.content)) flowVariables["telefone"] = norm.content;
            nextBlockId = currentBlock.next_block_id || null;
            currentBlock = findBlock(nextBlockId);
          } else if (currentBlock?.type === "buttons") {
            const opts: any[] = currentBlock.data?.options || [];
            const lower = norm.content.trim().toLowerCase();
            const numMatch = lower.match(/^(\d+)/);
            let chosen: any = null;
            if (numMatch) {
              const idx = parseInt(numMatch[1], 10) - 1;
              if (idx >= 0 && idx < opts.length) chosen = opts[idx];
            }
            if (!chosen) {
              chosen = opts.find((o) => (o.label || "").toLowerCase() === lower)
                || opts.find((o) => lower.includes((o.label || "").toLowerCase()));
            }
            if (chosen) {
              nextBlockId = chosen.next_block_id || currentBlock.next_block_id || null;
              currentBlock = findBlock(nextBlockId);
            } else {
              // re-prompt the same buttons block
              chunksToSend.push(replaceVars(currentBlock.data?.content || "Por favor, escolha uma das opções:")
                + "\n\n" + opts.map((o: any, i: number) => `${i + 1}) ${o.emoji ? o.emoji + ' ' : ''}${o.label}`).join("\n"));
              nextBlockId = currentBlock.id;
              currentBlock = null; // stop loop
            }
          }

          // 2) Walk passive blocks and emit chunks until we need user input or a release
          let safety = 0;
          while (currentBlock && safety < 12) {
            safety++;
            const b = currentBlock;
            switch (b.type) {
              case "message": {
                if (b.data?.content) chunksToSend.push(replaceVars(b.data.content));
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "delay": {
                const ms = Math.min(b.data?.delay_ms || 1500, 3000);
                await new Promise((r) => setTimeout(r, ms));
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "input": {
                if (b.data?.content) chunksToSend.push(replaceVars(b.data.content));
                else if (b.data?.placeholder) chunksToSend.push(replaceVars(b.data.placeholder));
                nextBlockId = b.id; // wait here for next user message
                currentBlock = null;
                break;
              }
              case "buttons": {
                const opts: any[] = b.data?.options || [];
                const header = replaceVars(b.data?.content || "Escolha uma opção:");
                chunksToSend.push(header + "\n\n" + opts.map((o: any, i: number) => `${i + 1}) ${o.emoji ? o.emoji + ' ' : ''}${o.label}`).join("\n"));
                nextBlockId = b.id; // wait here for next user message
                currentBlock = null;
                break;
              }
              case "condition": {
                const cond = b.data?.condition;
                let truthy = false;
                if (cond) {
                  const lhs = (flowVariables[cond.variable] || "").toString();
                  const rhs = (cond.value ?? "").toString();
                  switch (cond.operator) {
                    case "equals": truthy = lhs === rhs; break;
                    case "not_equals": truthy = lhs !== rhs; break;
                    case "contains": truthy = lhs.toLowerCase().includes(rhs.toLowerCase()); break;
                    case "greater_than": truthy = Number(lhs) > Number(rhs); break;
                    case "less_than": truthy = Number(lhs) < Number(rhs); break;
                  }
                }
                nextBlockId = (truthy ? b.data?.true_next_block_id : b.data?.false_next_block_id) || b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "ai_takeover":
              case "agent_switch": {
                handoffToAgent = b.data?.agent_id || null;
                releaseToOrchestrator = true;
                flowCompleted = true;
                nextBlockId = null;
                currentBlock = null;
                break;
              }
              case "handoff": {
                if (b.data?.handoff_message) chunksToSend.push(replaceVars(b.data.handoff_message));
                flowCompleted = true;
                nextBlockId = null;
                currentBlock = null;
                // Mark conversation as needing human
                await supabase.from("webchat_conversations").update({
                  status: "waiting_human",
                  flow_completed: true,
                  current_block_id: null,
                  flow_variables: flowVariables,
                }).eq("id", conversationId);
                break;
              }
              case "end": {
                if (b.data?.success_message) chunksToSend.push(replaceVars(b.data.success_message));
                flowCompleted = true;
                closeConversation = true;
                nextBlockId = null;
                currentBlock = null;
                break;
              }
              default: {
                // Unknown/unsupported block in WhatsApp engine — just advance
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
              }
            }
          }

          // 3) Persist flow state
          const updatePatch: any = {
            flow_variables: flowVariables,
            current_block_id: nextBlockId,
            flow_completed: flowCompleted,
          };
          if (handoffToAgent) updatePatch.current_agent_id = handoffToAgent;
          if (closeConversation) {
            updatePatch.status = "closed";
            updatePatch.closed_at = new Date().toISOString();
          }
          await supabase.from("webchat_conversations").update(updatePatch).eq("id", conversationId);

          // 4) Send chunks via Evolution — com hard-cap de 2 bolhas (anti-spam)
          if (chunksToSend.length > 2) {
            const head = chunksToSend[0];
            const tail = chunksToSend.slice(1).join("\n\n").trim();
            chunksToSend = [head, tail];
            console.log("[evolution-webhook] funnel hard-cap: chunks reduced to 2");
          }
          for (let i = 0; i < chunksToSend.length; i++) {
            const text = chunksToSend[i];
            try {
              await fetch(`${supabaseUrl}/functions/v1/evolution-send`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
                body: JSON.stringify({
                  organization_id: instance.organization_id,
                  instance_id: instance.id,
                  type: "text",
                  to: phone,
                  payload: { text },
                }),
              });
            } catch (sendErr: any) {
              console.error("[evolution-webhook] funnel_send: exception", sendErr?.message || String(sendErr));
            }
            if (i < chunksToSend.length - 1) await new Promise((r) => setTimeout(r, 1000));
          }

          console.log("[evolution-webhook] funnel_run: done", JSON.stringify({
            chunks: chunksToSend.length,
            next_block_id: nextBlockId,
            flow_completed: flowCompleted,
            handoff_to_agent: handoffToAgent,
            closed: closeConversation,
          }));

          // If we are NOT releasing to the orchestrator/agent, stop here
          if (!releaseToOrchestrator) {
            return new Response(JSON.stringify({ ok: true, funnel: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          // Otherwise fall through to the normal bot pipeline below so the
          // newly assigned agent can respond on the same incoming message.
        }

        if (conv && conv.status === "bot_active") {
          const productId = (conv as any).webchat_widgets?.product_id;

          // PRIORITY: if THIS instance has a dedicated agent, lock to it and
          // bypass the orchestrator entirely. A WhatsApp number dedicated to a
          // product/agent must NEVER be answered by another product's agent.
          const { data: instanceLockAgent } = await supabase
            .from("product_agents")
            .select("id, product_id")
            .eq("evolution_instance_id", instance.id)
            .eq("is_active", true)
            .order("is_default", { ascending: false })
            .limit(1)
            .maybeSingle();

          let agentId: string | null = null;
          let resolvedProductId: string | null = productId || null;
          let orchOwnsConversation = false;

          if (instanceLockAgent?.id) {
            agentId = instanceLockAgent.id;
            if (instanceLockAgent.product_id) resolvedProductId = instanceLockAgent.product_id;
            // Se a conversa já está com OUTRO agente ATIVO da mesma org (típico
            // após handoff Maria→Sonia), respeite — NÃO force voltar pro instance lock.
            // Só sobrescreve se current_agent_id for null/inválido.
            const currentAgentId = (conv as any).current_agent_id || null;
            if (currentAgentId && currentAgentId !== agentId) {
              const { data: currentAgentRow } = await supabase
                .from("product_agents")
                .select("id, organization_id, is_active")
                .eq("id", currentAgentId)
                .maybeSingle();
              if (
                currentAgentRow?.is_active &&
                currentAgentRow.organization_id === instance.organization_id
              ) {
                agentId = currentAgentRow.id;
                console.log("[evolution-webhook] bot_call: respecting current_agent_id (post-handoff):", agentId);
              } else {
                await supabase
                  .from("webchat_conversations")
                  .update({ current_agent_id: agentId, orchestrator_state: "em_atendimento" })
                  .eq("id", conversationId);
                console.log("[evolution-webhook] bot_call: re-locking conv to instance agent (current invalid):", agentId);
              }
            }
          } else {
            // No instance lock → consider orchestrator
            const { data: orchCfgBot } = await supabase
              .from("organization_orchestrator_config")
              .select("is_enabled, orchestrator_agent_id")
              .eq("organization_id", instance.organization_id)
              .maybeSingle();
            const orchActiveBot = !!(orchCfgBot?.is_enabled && orchCfgBot?.orchestrator_agent_id);
            const convOrchState = (conv as any).orchestrator_state || null;
            orchOwnsConversation =
              orchActiveBot && (convOrchState === null || convOrchState === "triagem" || convOrchState === "aguardando_menu");

            if (!orchOwnsConversation) {
              agentId = (conv as any).current_agent_id || null;
              if (!agentId && resolvedProductId) {
                const { data: defAgent } = await supabase
                  .from("product_agents")
                  .select("id")
                  .eq("product_id", resolvedProductId)
                  .eq("is_default", true)
                  .eq("is_active", true)
                  .maybeSingle();
                agentId = defAgent?.id || null;
              }
              if (!agentId && resolvedProductId) {
                const { data: anyAgent } = await supabase
                  .from("product_agents")
                  .select("id")
                  .eq("product_id", resolvedProductId)
                  .eq("is_active", true)
                  .order("created_at", { ascending: true })
                  .limit(1)
                  .maybeSingle();
                agentId = anyAgent?.id || null;
              }
            } else {
              console.log("[evolution-webhook] bot_call: orchestrator owns conversation → no agent_id");
            }
          }

          // Derive product_id from agent when only agent_id is known
          if (agentId && !resolvedProductId) {
            const { data: agentRow } = await supabase
              .from("product_agents")
              .select("product_id")
              .eq("id", agentId)
              .maybeSingle();
            if (agentRow?.product_id) {
              resolvedProductId = agentRow.product_id;
              console.log("[evolution-webhook] bot_call: derived product_id from agent:", resolvedProductId);
            }
          }

          // Persist resolved product_id on the conversation so future messages skip resolution
          if (resolvedProductId && !(conv as any).product_id) {
            await supabase
              .from("webchat_conversations")
              .update({ product_id: resolvedProductId })
              .eq("id", conversationId);
          }

          let productIdForBot = resolvedProductId;

          // FINAL FALLBACK: if we still have no product/agent and orchestrator is not active,
          // grab any active agent of the org with a product_id so we never go silent.
          if (!productIdForBot && !orchOwnsConversation && !agentId) {
            const { data: orgFallbackAgent } = await supabase
              .from("product_agents")
              .select("id, product_id")
              .eq("organization_id", instance.organization_id)
              .eq("is_active", true)
              .not("product_id", "is", null)
              .order("is_default", { ascending: false })
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (orgFallbackAgent?.id) {
              agentId = orgFallbackAgent.id;
              productIdForBot = orgFallbackAgent.product_id;
              await supabase
                .from("webchat_conversations")
                .update({ current_agent_id: agentId })
                .eq("id", conversationId);
              console.log("[evolution-webhook] bot_call: org-wide fallback agent applied:", agentId, "product:", productIdForBot);
            }
          }

          if (!productIdForBot && !orchOwnsConversation) {
            console.log("[evolution-webhook] bot_call: skip (no product_id and no orchestrator)");
          } else {

            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

            // ============================================================
            // LOCK POR CONVERSA — impede 2 jobs paralelos para o mesmo lead
            // ============================================================
            let singleProc = true;
            let dedupEnabled = true;
            let dedupWindowMs = 120_000;
            try {
              const { data: orgCfg } = await supabase
                .from("organizations")
                .select("ai_single_processing_per_conversation, ai_dedup_enabled, ai_dedup_window_ms")
                .eq("id", instance.organization_id)
                .maybeSingle();
              if (orgCfg) {
                if (orgCfg.ai_single_processing_per_conversation === false) singleProc = false;
                if (orgCfg.ai_dedup_enabled === false) dedupEnabled = false;
                if (orgCfg.ai_dedup_window_ms != null) {
                  dedupWindowMs = Math.max(0, Math.min(600_000, Number(orgCfg.ai_dedup_window_ms)));
                }
              }
            } catch (_) { /* keep defaults */ }

            let lockAcquired = false;
            if (singleProc) {
              lockAcquired = await acquireConversationLock(supabase, conversationId, 30_000);
              if (!lockAcquired) {
                console.log("[evolution-webhook] bot_call: skip (conversation locked by another job)");
                return new Response(JSON.stringify({ ok: true, skipped: "conversation_locked" }), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }
            }

            // Disponibiliza p/ o restante deste bloco (resp dedup + release)
            (globalThis as any).__convDedup = { enabled: dedupEnabled, windowMs: dedupWindowMs };

            console.log("[evolution-webhook] bot_call: invoking", JSON.stringify({
              conversation_id: conversationId,
              product_id: productIdForBot,
              agent_id: agentId,
              instance_locked: !!instanceLockAgent?.id,
              lock_acquired: lockAcquired,
            }));


            // ============================================================
            // Agrega TODAS as mensagens do visitor desde a última resposta
            // do bot/agente. Garante que múltiplas mensagens consecutivas
            // virem 1 contexto único para o agente raciocinar.
            // ============================================================
            let aggregatedMessage = processedContent || norm.content;
            try {
              const { data: lastBotMsg } = await supabase
                .from("webchat_messages")
                .select("created_at")
                .eq("conversation_id", conversationId)
                .in("sender_type", ["bot", "agent"])
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              let pendingQ = supabase
                .from("webchat_messages")
                .select("content, created_at")
                .eq("conversation_id", conversationId)
                .eq("sender_type", "visitor")
                .order("created_at", { ascending: true });
              if (lastBotMsg?.created_at) {
                pendingQ = pendingQ.gt("created_at", lastBotMsg.created_at);
              }
              const { data: pendingMsgs } = await pendingQ;

              if (pendingMsgs && pendingMsgs.length > 1) {
                aggregatedMessage = pendingMsgs
                  .map((m: any) => String(m.content || "").trim())
                  .filter((s: string) => s.length > 0)
                  .join("\n");
                console.log("[evolution-webhook] aggregated", pendingMsgs.length, "visitor msgs into one");
              }
            } catch (aggErr: any) {
              console.warn("[evolution-webhook] aggregation failed (non-fatal):", aggErr?.message);
            }

            const botRes = await fetch(`${supabaseUrl}/functions/v1/webchat-bot`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
                apikey: serviceKey,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                // Send aggregated content so the agent sees the full thought
                // (e.g. "Boa noite\nTudo bem?\nQuero ver imóveis") at once.
                message: aggregatedMessage,
                product_id: productIdForBot,
                visitor_name: (conv as any).visitor_name || senderName,
                agent_id: agentId,
                lead_id: (conv as any).lead_id || null,
                channel: "whatsapp",
              }),
            });

            const botText = await botRes.text();
            let botData: any = null;
            try { botData = botText ? JSON.parse(botText) : null; } catch { botData = botText; }

            if (!botRes.ok) {
              console.error("[evolution-webhook] bot_call: error", JSON.stringify({
                status: botRes.status,
                body: typeof botData === "string" ? botData.slice(0, 500) : JSON.stringify(botData).slice(0, 500),
              }));
            } else {
              // Collect responses: prefer chunks, fallback to single message content
              let chunks: string[] = Array.isArray(botData?.chunks) && botData.chunks.length > 0
                ? botData.chunks.filter((c: any) => typeof c === "string" && c.trim().length > 0)
                : (botData?.message?.content ? [String(botData.message.content)] : []);

              // Humanization delays (computed by webchat-bot via humanizer)
              const firstDelayMs: number = Number(botData?.delays?.firstMs) || 0;
              let betweenDelaysMs: number[] = Array.isArray(botData?.delays?.betweenMs)
                ? botData.delays.betweenMs.map((n: any) => Number(n) || 0)
                : [];
              let typingMsPerBubble: number[] = Array.isArray(botData?.typingMs)
                ? botData.typingMs.map((n: any) => Number(n) || 0)
                : [];
              const sharedMetadata = botData?.metadata || null;

              // ============================================================
              // CAP de bolhas (defesa em profundidade) — apenas teto absoluto
              // de 4 bolhas para WhatsApp. Não colapsa a decisão do agente.
              // ============================================================
              if (chunks.length > 0) {
                const HARD_TETO = 4;
                if (chunks.length > HARD_TETO) {
                  const head = chunks.slice(0, HARD_TETO - 1);
                  const tail = chunks.slice(HARD_TETO - 1).join("\n\n").trim();
                  chunks = [...head, tail];
                  betweenDelaysMs = betweenDelaysMs.slice(0, HARD_TETO - 1);
                  while (betweenDelaysMs.length < HARD_TETO - 1) betweenDelaysMs.push(1200);
                  if (typingMsPerBubble.length > HARD_TETO) {
                    const headT = typingMsPerBubble.slice(0, HARD_TETO - 1);
                    const tailT = typingMsPerBubble.slice(HARD_TETO - 1).reduce((a, b) => a + b, 0);
                    typingMsPerBubble = [...headT, tailT];
                  }
                  console.log("[evolution-webhook] whatsapp hard-cap: chunks reduced to", chunks.length);
                }
                // Clamp delays entre 800ms e 4000ms
                betweenDelaysMs = betweenDelaysMs.map((n) => Math.min(4000, Math.max(800, Number(n) || 1200)));
              }

              console.log("[evolution-webhook] bot_call: ok", JSON.stringify({
                chunks_count: chunks.length,
                first_delay_ms: firstDelayMs,
                between_delays_ms: betweenDelaysMs,
              }));

              // Initial human-like delay before the first bubble.
              // HARD CAP: 15s — antes era 120s e estava fazendo IA demorar 1-2 min.
              if (firstDelayMs > 0) {
                await new Promise((r) => setTimeout(r, Math.min(firstDelayMs, 15_000)));
              }

              // Toggle "Simular digitando..." do agente liga/desliga a Presence Engine real.
              const agentTypingIndicator = botData?.typingIndicator !== false;

              const sendEvo = async (payloadBody: any) => {
                return await fetch(`${supabaseUrl}/functions/v1/evolution-send`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceKey}`,
                    apikey: serviceKey,
                  },
                  body: JSON.stringify(payloadBody),
                });
              };

              const dedupCfg = (globalThis as any).__convDedup || { enabled: true, windowMs: 120_000 };

              for (let i = 0; i < chunks.length; i++) {
                const text = chunks[i];

                // 0) DEDUP DE RESPOSTA — não envia se uma resposta igual saiu há pouco
                if (dedupCfg.enabled) {
                  const dup = await isDuplicateResponse(supabase, conversationId, text, dedupCfg.windowMs);
                  if (dup) {
                    console.log("[evolution-webhook] bot_send: skip duplicate_response", text.slice(0, 60));
                    continue;
                  }
                }

                // 1) "digitando..." REAL no WhatsApp via Presence Engine
                //    (POST /message/presence — Evolution Go, com heartbeat a cada 7s)
                const typingMs = Math.max(
                  600,
                  Math.min(
                    typingMsPerBubble[i] || (1500 + text.length * 25),
                    8000,
                  ),
                );
                const presenceEnabled = presenceEnabledOrg && agentTypingIndicator;
                const typingHandle = await startTyping(supabase, {
                  organization_id: instance.organization_id,
                  instance_id: instance.id,
                  phone,
                  isAudio: false,
                  enabled: presenceEnabled,
                });
                await new Promise((r) => setTimeout(r, typingMs));

                // 2) Envia o balão
                let externalId: string | null = null;
                try {
                  const sendRes = await sendEvo({
                    organization_id: instance.organization_id,
                    instance_id: instance.id,
                    type: "text",
                    to: phone,
                    payload: { text },
                  });
                  const sendBody = await sendRes.text();
                  console.log("[evolution-webhook] bot_send chunk", i + 1, "/", chunks.length, "status:", sendRes.status, "body:", sendBody.slice(0, 200));
                  if (sendRes.ok) {
                    await recordSentResponse(supabase, conversationId, text);
                  }
                  try {
                    const parsed = JSON.parse(sendBody);
                    externalId =
                      parsed?.body?.key?.id ||
                      parsed?.body?.messageId ||
                      parsed?.body?.id ||
                      null;
                  } catch { /* ignore */ }
                } catch (sendErr: any) {
                  console.error("[evolution-webhook] bot_send: exception", sendErr?.message || String(sendErr));
                }

                // 2.5) Encerra "digitando..." (paused) — heartbeat para
                try { await typingHandle.stop(); } catch { /* noop */ }


                // 3) Persiste 1 linha por chunk no Inbox (espelho fiel do WhatsApp)
                try {
                  const chunkMetadata: Record<string, any> = {
                    chunk_index: i,
                    chunk_total: chunks.length,
                  };
                  if (externalId) chunkMetadata.external_id = externalId;
                  if (sharedMetadata && i === chunks.length - 1) {
                    Object.assign(chunkMetadata, sharedMetadata);
                  }
                  await supabase.from("webchat_messages").insert({
                    conversation_id: conversationId,
                    direction: "outbound",
                    sender_type: "bot",
                    content: text,
                    message_type: "text",
                    metadata: chunkMetadata,
                  });
                } catch (persistErr: any) {
                  console.warn("[evolution-webhook] persist chunk: failed (non-fatal)", persistErr?.message);
                }

                // 4) Pausa humana entre balões — HARD CAP 6s (antes 60s).
                if (i < chunks.length - 1) {
                  const between = betweenDelaysMs[i] ?? 1200;
                  await new Promise((r) => setTimeout(r, Math.min(between, 6_000)));
                }
              }

              // Atualiza last_message_at depois de todos os chunks
              if (chunks.length > 0) {
                try {
                  await supabase
                    .from("webchat_conversations")
                    .update({ last_message_at: new Date().toISOString() })
                    .eq("id", conversationId);
                } catch { /* ignore */ }
              }
            }
          }
        } else {
          console.log("[evolution-webhook] bot_call: skip (status:", conv?.status || "unknown", ")");
        }
      } catch (botErr: any) {
        // Never break the webhook because of bot errors — Evolution Go would retry
        console.error("[evolution-webhook] bot_call: exception", botErr?.message || String(botErr));
      } finally {
        // Sempre libera o lock por conversa (best-effort)
        try { await releaseConversationLock(supabase, conversationId); } catch (_) { /* noop */ }
      }


      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- UNKNOWN ----
    console.log("[evolution-webhook] unhandled event:", (norm as any).event);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[evolution-webhook] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
