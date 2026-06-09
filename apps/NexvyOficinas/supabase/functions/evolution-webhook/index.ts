// Edge Function: evolution-webhook (v7)
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: false (chamada por Evolution API com x-webhook-secret)
//
// Sprint 4 adições (v7):
// [v7] storage_url como coluna dedicada no upsert de inbox_messages
// [v7] Buscar avatar do contato via Evolution API (fire-and-forget, só se null)
// [v7] presence.update → broadcast typing via Supabase Realtime
// [v7] messages.reaction → INSERT/DELETE em message_reactions

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

/**
 * [v7] Busca URL da foto do perfil do contato na Evolution API.
 * Fire-and-forget: falha silenciosa não impacta processamento de mensagens.
 */
async function fetchAndStoreAvatar(opts: {
  instanceName: string;
  contactPhone: string;
  convId: string;
  supabase: ReturnType<typeof createClient>;
}): Promise<void> {
  try {
    // Verificar se já tem avatar (evita chamada Evolution redundante)
    const { data: convCheck } = await opts.supabase
      .from("inbox_conversations")
      .select("contact_avatar_url")
      .eq("id", opts.convId)
      .single();

    if (convCheck?.contact_avatar_url) return;

    const picRes = await fetch(
      `${EVOLUTION_API_URL}/chat/fetchProfilePicture/${opts.instanceName}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
        body: JSON.stringify({ number: opts.contactPhone }),
      },
    );

    if (!picRes.ok) return;

    const picData = await picRes.json() as { profilePictureUrl?: string };
    if (picData.profilePictureUrl) {
      await opts.supabase
        .from("inbox_conversations")
        .update({ contact_avatar_url: picData.profilePictureUrl })
        .eq("id", opts.convId);
      console.log(`[webhook] avatar atualizado para conv ${opts.convId}`);
    }
  } catch (err) {
    console.warn("[webhook] fetchAndStoreAvatar error (ignorado):", err);
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

  // ── CONNECTION_UPDATE ──────────────────────────────────────────────────────
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

  // ── QRCODE_UPDATED ─────────────────────────────────────────────────────────
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

  // ── MESSAGES_DELETE ────────────────────────────────────────────────────────
  if (event === "messages.delete" || event === "MESSAGES_DELETE") {
    const rawData = payload.data;
    const items: Array<Record<string, unknown>> = Array.isArray(rawData)
      ? rawData as Array<Record<string, unknown>>
      : [rawData as Record<string, unknown>];

    for (const item of items) {
      const waMessageId = (item?.id ?? (item?.key as Record<string, unknown>)?.id) as string | undefined;
      if (!waMessageId) continue;

      const { error } = await supabase
        .from("inbox_messages")
        .update({ is_deleted: true })
        .eq("wa_message_id", waMessageId);

      if (error) {
        console.error(`[webhook] soft-delete error for ${waMessageId}:`, error.message);
      } else {
        console.log(`[webhook] soft-deleted message ${waMessageId}`);
      }
    }
    return new Response("OK");
  }

  // ── MESSAGES_UPDATE ────────────────────────────────────────────────────────
  if (event === "messages.update" || event === "MESSAGES_UPDATE") {
    const dataField = payload.data as Array<Record<string, unknown>> | Record<string, unknown>;
    const updates: Array<Record<string, unknown>> = Array.isArray(dataField) ? dataField : [dataField];

    for (const item of updates) {
      const waMessageId = ((item.key as Record<string, unknown>)?.id ?? item.id) as string | undefined;
      const status = (item.update as Record<string, unknown> | undefined)?.status as string | undefined;

      if (!waMessageId || !status) continue;

      let deliveryStatus: "delivered" | "read" | null = null;
      if (status === "DELIVERY_ACK") deliveryStatus = "delivered";
      else if (status === "READ") deliveryStatus = "read";

      if (!deliveryStatus) continue;

      const { error } = await supabase
        .from("inbox_messages")
        .update({ delivery_status: deliveryStatus })
        .eq("wa_message_id", waMessageId);

      if (error) {
        console.error(`[webhook] delivery_status update error for ${waMessageId}:`, error.message);
      } else {
        console.log(`[webhook] delivery_status=${deliveryStatus} for ${waMessageId}`);
      }
    }
    return new Response("OK");
  }

  // ── [v7] PRESENCE_UPDATE (typing indicator) ────────────────────────────────
  // Evolution envia quando o contato começa/para de digitar.
  // NOTA: Nem todas as versões da Evolution enviam este evento. Se não chegar,
  // o indicador simplesmente não aparecerá — sem quebrar funcionalidade.
  if (event === "presence.update" || event === "PRESENCE_UPDATE") {
    const data = payload.data as {
      id?: string;
      presences?: Record<string, { lastKnownPresence?: string }>;
    };
    const remoteJid = data?.id ?? "";
    if (!remoteJid || remoteJid.endsWith("@g.us")) return new Response("OK");

    const presences = data?.presences ?? {};
    const isComposing = Object.values(presences).some(
      (p) => p.lastKnownPresence === "composing",
    );

    const { data: conv } = await supabase
      .from("inbox_conversations")
      .select("id")
      .eq("wa_jid", remoteJid)
      .single();

    if (conv) {
      const channel = supabase.channel(`typing:${conv.id}`);
      await channel.send({
        type: "broadcast",
        event: "typing",
        payload: { sender: "contact", isTyping: isComposing },
      });
    }
    return new Response("OK");
  }

  // ── [v7] MESSAGES_REACTION ─────────────────────────────────────────────────
  if (event === "messages.reaction" || event === "MESSAGES_REACTION") {
    const data = payload.data as {
      key?: { id?: string };
      reaction?: { text?: string };
    };
    const waMessageId = data?.key?.id;
    const emoji = data?.reaction?.text;

    if (!waMessageId) return new Response("OK");

    const { data: msg } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("wa_message_id", waMessageId)
      .single();

    if (msg) {
      if (!emoji || emoji === "") {
        // Remoção: contato remove reação (user_id é null para contato)
        await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", msg.id)
          .eq("sender_type", "contact")
          .is("user_id", null);
        console.log(`[webhook] reaction removed for message ${msg.id}`);
      } else {
        // Upsert: contato só pode ter uma reação por mensagem
        await supabase
          .from("message_reactions")
          .upsert(
            { message_id: msg.id, sender_type: "contact", emoji, user_id: null },
            { onConflict: "message_id,sender_type", ignoreDuplicates: false },
          );
        console.log(`[webhook] reaction ${emoji} upserted for message ${msg.id}`);
      }
    }
    return new Response("OK");
  }

  // ── MESSAGES_UPSERT ────────────────────────────────────────────────────────
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
      const msg = rawMsg as Record<string, unknown>;
      if (!msg?.key) continue;

      const key = msg.key as Record<string, unknown>;
      const remoteJid: string = (key.remoteJid as string) ?? "";
      if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

      const waMessageId: string = (key.id as string) ?? "";
      const fromMe: boolean = (key.fromMe as boolean) ?? false;
      const contactPhone = remoteJid.split("@")[0] ?? remoteJid;
      const contactName: string | null = (msg.pushName as string) ?? null;

      const msgContent = (msg.message as Record<string, unknown>) ?? {};

      // ── protocolMessage.type = 5 = REVOKE ─────────────────────────────────
      const protocolMsg = (msgContent.protocolMessage as Record<string, unknown>) ?? null;
      if (protocolMsg && protocolMsg.type === 5) {
        const targetId = ((protocolMsg.key as Record<string, unknown>) ?? {}).id as string | undefined;
        if (targetId) {
          const { error } = await supabase
            .from("inbox_messages")
            .update({ is_deleted: true })
            .eq("wa_message_id", targetId);
          if (error) {
            console.error(`[webhook] protocolMessage soft-delete error for ${targetId}:`, error.message);
          } else {
            console.log(`[webhook] protocolMessage soft-deleted message ${targetId}`);
          }
        }
        continue;
      }

      let content = "";
      let contentType = "text";
      let metadata: Record<string, unknown> = {};

      const imageMsg = (msgContent.imageMessage as Record<string, unknown>) ?? null;
      const audioMsg = (msgContent.audioMessage as Record<string, unknown>) ?? null;
      const videoMsg = (msgContent.videoMessage as Record<string, unknown>) ?? null;
      const docMsg = (msgContent.documentMessage as Record<string, unknown>) ?? null;
      const stickerMsg = (msgContent.stickerMessage as Record<string, unknown>) ?? null;
      const convText = msgContent.conversation as string | undefined;
      const extText = ((msgContent.extendedTextMessage as Record<string, unknown>) ?? {}).text as string | undefined;

      if (convText) {
        content = convText;
      } else if (extText) {
        content = extText;
      } else if (imageMsg) {
        content = (imageMsg.caption as string) ?? "";
        contentType = "image";
        metadata = {
          mime: imageMsg.mimetype,
          width: imageMsg.width,
          height: imageMsg.height,
        };
      } else if (audioMsg) {
        contentType = "audio";
        metadata = {
          mime: audioMsg.mimetype,
          duration: audioMsg.seconds,
        };
      } else if (videoMsg) {
        content = (videoMsg.caption as string) ?? "";
        contentType = "video";
        metadata = {
          mime: videoMsg.mimetype,
          duration: videoMsg.seconds,
          width: videoMsg.width,
          height: videoMsg.height,
        };
      } else if (docMsg) {
        content = (docMsg.caption as string) ?? (docMsg.fileName as string) ?? "Documento";
        contentType = "document";
        metadata = {
          mime: docMsg.mimetype,
          name: docMsg.fileName,
        };
      } else if (stickerMsg) {
        contentType = "sticker";
        metadata = {
          mime: (stickerMsg.mimetype as string) ?? "image/webp",
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

      // [v7] Atualizar contact_name se pushName fornecido e a conversa ainda não tem nome
      if (contactName && !fromMe) {
        await supabase
          .from("inbox_conversations")
          .update({ contact_name: contactName })
          .eq("id", convId)
          .is("contact_name", null);
      }

      // [v6] Verifica bot_paused: se ativo, salva mensagem mas NÃO aciona bot
      if (!fromMe) {
        const { data: convState } = await supabase
          .from("inbox_conversations")
          .select("bot_paused, status")
          .eq("id", convId)
          .single();

        if (convState?.bot_paused) {
          const { error: msgErrPaused } = await supabase.from("inbox_messages").upsert(
            {
              conversation_id: convId,
              direction: "inbound",
              sender_type: "contact",
              content,
              content_type: contentType,
              wa_message_id: waMessageId || null,
              metadata,
              storage_url: null, // [v7] não baixa mídia no branch paused
              is_deleted: false,
            },
            { onConflict: "wa_message_id", ignoreDuplicates: true },
          );
          if (msgErrPaused) console.error("[webhook] bot_paused insert error:", msgErrPaused.message);
          await supabase.rpc("increment_unread_count", { conv_id: convId }).catch(() => {});
          console.log(`[webhook] bot_paused=true — mensagem salva sem acionar bot para conv ${convId}`);
          continue;
        }
      }

      // [v7] Download mídia + upload Storage → preenche storage_url como coluna dedicada
      let storageUrl: string | undefined;
      if (MEDIA_TYPES.has(contentType)) {
        const mediaResult = await fetchAndUploadMedia({
          msg,
          instanceName,
          contentType,
          empresaId: instance.empresa_id as string,
          conversationId: convId as string,
          supabase,
        });
        storageUrl = mediaResult.url;
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
          storage_url: storageUrl ?? null, // [v7]
          is_deleted: false,
        },
        { onConflict: "wa_message_id", ignoreDuplicates: true },
      );
      if (msgErr) console.error("[webhook] insert message error:", msgErr.message);

      if (!fromMe) {
        await supabase.rpc("increment_unread_count", { conv_id: convId }).catch(() => {});

        // [v7] Buscar avatar do contato de forma assíncrona (fire-and-forget)
        fetchAndStoreAvatar({
          instanceName,
          contactPhone,
          convId: convId as string,
          supabase,
        }).catch(() => {});
      }
    }
    return new Response("OK");
  }

  console.log(`[evolution-webhook] unhandled event: ${event}`);
  return new Response("OK");
});
