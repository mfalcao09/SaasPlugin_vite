// Edge Function: evolution-webhook (v4)
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: false (chamada por Evolution API com x-webhook-secret)
//
// Responsabilidades:
// 1. Receber webhooks da Evolution Go (MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED)
// 2. Persistir mensagens inbound em inbox_messages (idempotente por wa_message_id)
// 3. Para mídia (image/audio/video/document/sticker): baixar da Evolution + upload pro bucket inbox-media
// 4. Normalizar metadata: { url, mime, size, name?, duration?, width?, height? }
// 5. Atualizar status/qr_code de evolution_instances

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET")
  ?? Deno.env.get("EVOLUTION_API_KEY")
  ?? "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

function extFromMime(mime: string, contentType: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("jpeg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.includes("spreadsheetml")) return "xlsx";
  if (m.includes("presentationml")) return "pptx";
  if (m.includes("msword")) return "doc";
  if (m.includes("ms-excel")) return "xls";
  if (contentType === "image") return "jpg";
  if (contentType === "audio") return "ogg";
  if (contentType === "video") return "mp4";
  if (contentType === "sticker") return "webp";
  return "bin";
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface MediaResult {
  url?: string;
  mime?: string;
  size?: number;
  name?: string;
}

/** Baixa mídia da Evolution API + upload pro Storage. Fail-soft (retorna {} em falha). */
async function fetchAndUploadMedia(opts: {
  msg: Record<string, unknown>;
  instanceName: string;
  contentType: string;
  empresaId: string;
  conversationId: string;
  supabase: ReturnType<typeof createClient>;
}): Promise<MediaResult> {
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${opts.instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          message: { key: (opts.msg as { key: unknown }).key },
          convertToMp4: false,
        }),
      },
    );
    if (!res.ok) {
      console.error(`[webhook] Evolution download HTTP ${res.status}: ${await res.text()}`);
      return {};
    }
    const data = await res.json() as { base64?: string; media?: string; mimetype?: string; fileName?: string };
    const base64 = data.base64 ?? data.media;
    if (!base64) {
      console.warn("[webhook] no base64 in Evolution response");
      return {};
    }

    const bytes = base64ToBytes(base64);
    const mime = data.mimetype ?? "application/octet-stream";
    const fileName = data.fileName ?? "";
    const ext = extFromMime(mime, opts.contentType);
    const uuid = crypto.randomUUID();
    const path = `${opts.empresaId}/${opts.conversationId}/${uuid}.${ext}`;

    const { error: uploadErr } = await opts.supabase.storage
      .from("inbox-media")
      .upload(path, bytes, {
        contentType: mime,
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadErr) {
      console.error("[webhook] storage upload error:", uploadErr.message);
      return {};
    }

    const { data: urlData } = opts.supabase.storage.from("inbox-media").getPublicUrl(path);
    return {
      url: urlData.publicUrl,
      mime,
      size: bytes.length,
      name: fileName || undefined,
    };
  } catch (err) {
    console.error("[webhook] fetchAndUploadMedia exception:", err);
    return {};
  }
}

Deno.serve(async (req) => {
  const incomingSecret = req.headers.get("x-webhook-secret") ?? "";
  if (WEBHOOK_SECRET && incomingSecret !== WEBHOOK_SECRET) {
    console.warn("[evolution-webhook] invalid secret");
    return new Response("Unauthorized", { status: 401 });
  }
  if (req.method !== "POST") return new Response("OK");

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const event = payload.event as string;
  const instanceName = payload.instance as string;
  console.log(`[evolution-webhook] event=${event} instance=${instanceName}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // CONNECTION_UPDATE
  if (event === "connection.update" || event === "CONNECTION_UPDATE") {
    const state = (payload.data as { state?: string })?.state;
    const mapped = state === "open"
      ? "connected"
      : state === "connecting" || state === "pairingCode"
        ? "connecting"
        : "disconnected";
    const update: Record<string, unknown> = { status: mapped };
    if (mapped === "connected") update.last_connected_at = new Date().toISOString();
    if (mapped === "disconnected") update.qr_code = null;
    await supabase.from("evolution_instances").update(update).eq("instance_id", instanceName);
    return new Response("OK");
  }

  // QRCODE_UPDATED
  if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
    const data = payload.data as { qrcode?: { base64?: string }; base64?: string };
    const qr = data?.qrcode?.base64 ?? data?.base64 ?? null;
    if (qr) {
      await supabase.from("evolution_instances").update({
        qr_code: qr,
        qr_code_updated_at: new Date().toISOString(),
        status: "connecting",
      }).eq("instance_id", instanceName);
    }
    return new Response("OK");
  }

  // MESSAGES_UPSERT
  if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
    const dataField = payload.data;
    const messages = Array.isArray(dataField)
      ? dataField
      : (dataField as { messages?: unknown[] })?.messages ?? [dataField];

    const { data: instance } = await supabase
      .from("evolution_instances")
      .select("id, empresa_id")
      .eq("instance_id", instanceName)
      .single();
    if (!instance) {
      console.warn(`[webhook] instance not found: ${instanceName}`);
      return new Response("OK");
    }

    for (const rawMsg of messages) {
      const msg = rawMsg as Record<string, any>;
      if (!msg?.key) continue;

      const remoteJid: string = msg.key.remoteJid ?? "";
      if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

      const waMessageId: string = msg.key.id ?? "";
      const fromMe: boolean = msg.key.fromMe ?? false;
      const contactPhone = remoteJid.split("@")[0] ?? remoteJid;
      const contactName: string | null = msg.pushName ?? null;

      const msgContent = msg.message ?? {};
      let content = "";
      let contentType = "text";
      let metadata: Record<string, unknown> = {};

      if (msgContent.conversation) {
        content = msgContent.conversation;
      } else if (msgContent.extendedTextMessage?.text) {
        content = msgContent.extendedTextMessage.text;
      } else if (msgContent.imageMessage) {
        content = msgContent.imageMessage.caption ?? "";
        contentType = "image";
        metadata = {
          mime: msgContent.imageMessage.mimetype,
          width: msgContent.imageMessage.width,
          height: msgContent.imageMessage.height,
        };
      } else if (msgContent.audioMessage) {
        contentType = "audio";
        metadata = {
          mime: msgContent.audioMessage.mimetype,
          duration: msgContent.audioMessage.seconds,
        };
      } else if (msgContent.videoMessage) {
        content = msgContent.videoMessage.caption ?? "";
        contentType = "video";
        metadata = {
          mime: msgContent.videoMessage.mimetype,
          duration: msgContent.videoMessage.seconds,
          width: msgContent.videoMessage.width,
          height: msgContent.videoMessage.height,
        };
      } else if (msgContent.documentMessage) {
        content = msgContent.documentMessage.caption ?? msgContent.documentMessage.fileName ?? "Documento";
        contentType = "document";
        metadata = {
          mime: msgContent.documentMessage.mimetype,
          name: msgContent.documentMessage.fileName,
        };
      } else if (msgContent.stickerMessage) {
        contentType = "sticker";
        metadata = {
          mime: msgContent.stickerMessage.mimetype ?? "image/webp",
        };
      } else {
        content = "[mensagem não suportada]";
        metadata = { raw_keys: Object.keys(msgContent) };
      }

      const { data: convId, error: rpcErr } = await supabase.rpc(
        "find_or_create_inbox_conversation",
        {
          p_empresa_id: instance.empresa_id,
          p_evolution_instance_id: instance.id,
          p_contact_phone: contactPhone,
          p_contact_name: contactName,
          p_wa_jid: remoteJid,
        },
      );
      if (rpcErr || !convId) {
        console.error("[webhook] find_or_create error:", rpcErr?.message);
        continue;
      }

      // Se for mídia, baixa da Evolution e faz upload pro Storage (fail-soft)
      if (MEDIA_TYPES.has(contentType)) {
        const mediaResult = await fetchAndUploadMedia({
          msg,
          instanceName,
          contentType,
          empresaId: instance.empresa_id as string,
          conversationId: convId as string,
          supabase,
        });
        metadata = { ...metadata, ...mediaResult };
      }

      const { error: msgErr } = await supabase.from("inbox_messages").upsert(
        {
          conversation_id: convId,
          direction: fromMe ? "outbound" : "inbound",
          sender_type: fromMe ? "agent" : "contact",
          content,
          content_type: contentType,
          wa_message_id: waMessageId || null,
          metadata,
        },
        { onConflict: "wa_message_id", ignoreDuplicates: true },
      );
      if (msgErr) console.error("[webhook] insert message error:", msgErr.message);

      if (!fromMe) {
        await supabase.rpc("increment_unread_count", { conv_id: convId }).catch(() => {});
      }
    }
    return new Response("OK");
  }

  console.log(`[evolution-webhook] unhandled event: ${event}`);
  return new Response("OK");
});
