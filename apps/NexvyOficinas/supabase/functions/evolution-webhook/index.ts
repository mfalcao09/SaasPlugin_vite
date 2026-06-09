// Edge Function: evolution-webhook (v10 — Sprint 10)
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: false (chamada por Evolution API com x-webhook-secret)
//
// Sprint 7 adições (v8):
// [v8] F1 CSAT: captura resposta 1-5 ANTES de find_or_create_inbox_conversation
// [v8] F2 SLA: set first_response_at quando agente envia primeira mensagem
// [v8] F5 Keywords: verifica regras de auto-resposta ANTES de bot_paused check
//
// Sprint 8 adições (v9):
// [v9] F4 Chatbot: sessões de chatbot de fluxo com árvore de decisão (ANTES de keyword rules)
// [v9] F5 Notificações: INSERT inbox_agent_notifications para auto-assign
//
// Sprint 10 adições (v10):
// [v10] F3 Instagram: parse channel (whatsapp|instagram) baseado em remoteJid
// [v10] F2 Alertas: dispara WhatsApp em (nova conv | CSAT baixo | fila > threshold)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET")
  ?? Deno.env.get("EVOLUTION_API_KEY")
  ?? "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);

// ── Sprint5 F4 — Verifica se estamos dentro do horário de atendimento ────────
// Timezone: BRT = UTC-3. Sem configuração = sempre aberto.
async function isWithinOfficeHours(
  empresaId: string,
  sb: ReturnType<typeof createClient>,
): Promise<{ open: boolean; outMsg: string }> {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const dayOfWeek = brt.getUTCDay(); // 0=Dom
  const hh = String(brt.getUTCHours()).padStart(2, "0");
  const mm = String(brt.getUTCMinutes()).padStart(2, "0");
  const currentTime = `${hh}:${mm}`;

  const { data: hours } = await sb
    .from("inbox_office_hours")
    .select("hora_inicio, hora_fim, ativo")
    .eq("empresa_id", empresaId)
    .eq("dia_semana", dayOfWeek)
    .eq("ativo", true)
    .single();

  if (!hours) return { open: true, outMsg: "" }; // sem config = sempre aberto

  const isOpen =
    currentTime >= (hours.hora_inicio as string).slice(0, 5) &&
    currentTime <= (hours.hora_fim as string).slice(0, 5);

  let outMsg = "Olá! Nosso atendimento funciona em horário comercial. Em breve retornaremos! 🕐";
  try {
    const { data: emp } = await sb
      .from("empresas")
      .select("inbox_out_of_hours_message")
      .eq("id", empresaId)
      .single();
    if (emp?.inbox_out_of_hours_message) outMsg = emp.inbox_out_of_hours_message;
  } catch { /* ignore */ }

  return { open: isOpen, outMsg: isOpen ? "" : outMsg };
}

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

// ── [v10] F2 Alertas WhatsApp — envia mensagem fire-and-forget pro número configurado ──
async function sendAlertWhatsApp(opts: {
  empresaId: string;
  text: string;
  supabase: ReturnType<typeof createClient>;
}): Promise<void> {
  try {
    const { data: emp } = await opts.supabase
      .from("empresas")
      .select("alert_phone")
      .eq("id", opts.empresaId)
      .single();
    const phone = (emp as { alert_phone?: string } | null)?.alert_phone;
    if (!phone) return;

    // Buscar a instância Evolution conectada da empresa
    const { data: inst } = await opts.supabase
      .from("evolution_instances")
      .select("instance_id, status")
      .eq("empresa_id", opts.empresaId)
      .eq("status", "connected")
      .limit(1)
      .single();
    const instanceId = (inst as { instance_id?: string } | null)?.instance_id;
    if (!instanceId) {
      console.warn(`[webhook] alert skip — sem instância conectada empresa=${opts.empresaId}`);
      return;
    }

    await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${instanceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ number: phone, text: opts.text }),
      },
    );
  } catch (err) {
    console.warn("[webhook] sendAlertWhatsApp error:", err);
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

      // [v10] F3 — detecta canal Instagram pelo sufixo do remoteJid
      const channel: "whatsapp" | "instagram" = remoteJid.includes("@instagram")
        ? "instagram"
        : "whatsapp";

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

      // [v8] F1 CSAT — captura resposta ANTES de find_or_create_inbox_conversation
      // Se o número tem CSAT pendente (score IS NULL, sent_at IS NOT NULL) e o
      // content é número 1-5: registra score e NÃO cria nova conversa.
      if (!fromMe && content) {
        const trimmedContent = content.trim();
        const csatScore = parseInt(trimmedContent, 10);
        const isValidScore = !isNaN(csatScore) && csatScore >= 1 && csatScore <= 5 && trimmedContent === String(csatScore);

        if (isValidScore) {
          const { data: pendingCsat } = await supabase
            .from("inbox_csat_responses")
            .select("id")
            .eq("contact_phone", contactPhone)
            .eq("empresa_id", instance.empresa_id)
            .is("score", null)
            .not("sent_at", "is", null)
            .order("sent_at", { ascending: false })
            .limit(1)
            .single();

          if (pendingCsat) {
            await supabase
              .from("inbox_csat_responses")
              .update({
                score: csatScore,
                responded_at: new Date().toISOString(),
              })
              .eq("id", pendingCsat.id);
            console.log(`[webhook] CSAT score=${csatScore} registrado para ${contactPhone}`);
            continue; // NÃO cria nova conversa
          }
        }
      }

      // [v9] F4 Chatbot — processa sessões de fluxo ANTES de criar conversa normal
      // Só para mensagens inbound de texto (fromMe=false)
      if (!fromMe && contentType === "text") {
        const instanceIdForChatbot = (await supabase
          .from("evolution_instances")
          .select("instance_id")
          .eq("id", instance.id)
          .single()).data?.instance_id ?? instanceName;

        // 1. Verificar se há sessão ativa para este contato/empresa
        const { data: activeSession } = await supabase
          .from("inbox_chatbot_sessions")
          .select("id, flow_id, current_node_id")
          .eq("empresa_id", instance.empresa_id)
          .eq("contact_phone", contactPhone)
          .is("ended_at", null)
          .limit(1)
          .single();

        if (activeSession) {
          // Sessão ativa: avançar pelo fluxo
          const currentNodeId = activeSession.current_node_id;

          if (currentNodeId) {
            const { data: currentNode } = await supabase
              .from("inbox_chatbot_nodes")
              .select("id, node_type, message, options")
              .eq("id", currentNodeId)
              .single();

            if (currentNode) {
              const options = (currentNode.options as Array<{ label: string; next_node_id: string | null }>) ?? [];
              const msgLower = content.toLowerCase().trim();

              // Match de opção pelo label (case-insensitive, contains)
              const matched = options.find(
                (opt) => opt.label && msgLower.includes(opt.label.toLowerCase().trim()),
              );

              const nextNodeId = matched?.next_node_id ?? null;

              if (nextNodeId) {
                // Avançar para o próximo nó
                const { data: nextNode } = await supabase
                  .from("inbox_chatbot_nodes")
                  .select("id, node_type, message")
                  .eq("id", nextNodeId)
                  .single();

                if (nextNode) {
                  // Enviar mensagem do próximo nó
                  await fetch(
                    `${EVOLUTION_API_URL}/message/sendText/${instanceIdForChatbot}`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                      body: JSON.stringify({ number: contactPhone, text: nextNode.message }),
                    },
                  ).catch(() => {});

                  if (nextNode.node_type === "end") {
                    // Encerrar sessão
                    await supabase
                      .from("inbox_chatbot_sessions")
                      .update({ ended_at: new Date().toISOString(), current_node_id: nextNode.id })
                      .eq("id", activeSession.id);
                    console.log(`[webhook] chatbot sessão encerrada para ${contactPhone}`);
                  } else {
                    // Atualizar nó atual
                    await supabase
                      .from("inbox_chatbot_sessions")
                      .update({ current_node_id: nextNode.id })
                      .eq("id", activeSession.id);
                  }
                }
              } else if (currentNode.node_type === "end") {
                // Nó final sem opção de avanço: encerrar sessão
                await supabase
                  .from("inbox_chatbot_sessions")
                  .update({ ended_at: new Date().toISOString() })
                  .eq("id", activeSession.id);
                console.log(`[webhook] chatbot sessão encerrada (nó end) para ${contactPhone}`);
              }
            }
          }

          console.log(`[webhook] chatbot sessão ativa processada para conv ${contactPhone}`);
          continue; // NÃO cria conversa normal enquanto sessão de chatbot ativa
        }

        // 2. Sem sessão ativa: verificar se algum fluxo ativo tem keyword que bate
        const { data: activeFlows } = await supabase
          .from("inbox_chatbot_flows")
          .select("id, trigger_keywords")
          .eq("empresa_id", instance.empresa_id)
          .eq("is_active", true);

        if (activeFlows && activeFlows.length > 0) {
          const msgLower = content.toLowerCase().trim();
          let triggeredFlowId: string | null = null;

          for (const flow of activeFlows) {
            const keywords = (flow.trigger_keywords as string[]) ?? [];
            if (keywords.some((kw) => msgLower.includes(kw.toLowerCase().trim()))) {
              triggeredFlowId = flow.id as string;
              break;
            }
          }

          if (triggeredFlowId) {
            // Buscar nó raiz do fluxo
            const { data: rootNode } = await supabase
              .from("inbox_chatbot_nodes")
              .select("id, message, node_type")
              .eq("flow_id", triggeredFlowId)
              .eq("is_root", true)
              .single();

            if (rootNode) {
              // Criar sessão de chatbot
              await supabase
                .from("inbox_chatbot_sessions")
                .upsert(
                  {
                    empresa_id: instance.empresa_id,
                    contact_phone: contactPhone,
                    flow_id: triggeredFlowId,
                    current_node_id: rootNode.id,
                    started_at: new Date().toISOString(),
                    ended_at: null,
                  },
                  { onConflict: "empresa_id,contact_phone,flow_id" },
                );

              // Enviar mensagem do nó raiz
              const instanceIdForFlow = (await supabase
                .from("evolution_instances")
                .select("instance_id")
                .eq("id", instance.id)
                .single()).data?.instance_id ?? instanceName;

              await fetch(
                `${EVOLUTION_API_URL}/message/sendText/${instanceIdForFlow}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                  body: JSON.stringify({ number: contactPhone, text: rootNode.message }),
                },
              ).catch(() => {});

              console.log(`[webhook] chatbot iniciado para ${contactPhone}, flow=${triggeredFlowId}`);
              continue; // NÃO cria conversa normal
            }
          }
        }
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

      // [v10] F3 — set channel se for Instagram (default da coluna é 'whatsapp')
      if (channel === "instagram") {
        await supabase
          .from("inbox_conversations")
          .update({ channel: "instagram" })
          .eq("id", convId)
          .neq("channel", "instagram");
      }

      // [v9] F5 Notificações — dispara 'new_conversation' para agente atribuído
      if (!fromMe) {
        const { data: newConv } = await supabase
          .from("inbox_conversations")
          .select("assigned_user_id, contact_name, contact_phone")
          .eq("id", convId)
          .single();

        if (newConv?.assigned_user_id) {
          const { count: prevMsgCount } = await supabase
            .from("inbox_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", convId);

          if ((prevMsgCount ?? 0) === 0) {
            const displayName = newConv.contact_name ?? newConv.contact_phone ?? "desconhecido";
            const { error: notifErr } = await supabase.from("inbox_agent_notifications").insert({
              empresa_id: instance.empresa_id,
              user_id: newConv.assigned_user_id,
              type: "new_conversation",
              content: `Nova conversa atribuída: ${displayName}`,
              conversation_id: convId,
            });
            if (notifErr) console.warn("[webhook] notif insert error:", notifErr.message);
          }
        }
      }

      // [v8] F5 Keywords — verifica ANTES de bot_paused (prioridade máxima)
      // Só para mensagens de contato (inbound)
      if (!fromMe && content && contentType === "text") {
        const { data: keywordRules } = await supabase
          .from("inbox_keyword_rules")
          .select("keyword, response, match_type")
          .eq("empresa_id", instance.empresa_id)
          .eq("is_active", true)
          .order("priority", { ascending: false })
          .limit(50);

        if (keywordRules && keywordRules.length > 0) {
          const msgLower = content.toLowerCase().trim();
          let matchedResponse: string | null = null;

          for (const rule of keywordRules) {
            const kw = (rule.keyword as string).toLowerCase().trim();
            const mt = rule.match_type as string;
            let matched = false;
            if (mt === "exact") {
              matched = msgLower === kw;
            } else if (mt === "starts_with") {
              matched = msgLower.startsWith(kw);
            } else {
              // contains (default)
              matched = msgLower.includes(kw);
            }
            if (matched) {
              matchedResponse = rule.response as string;
              break;
            }
          }

          if (matchedResponse) {
            // Salva mensagem do contato
            await supabase.from("inbox_messages").upsert(
              {
                conversation_id: convId,
                direction: "inbound",
                sender_type: "contact",
                content,
                content_type: contentType,
                wa_message_id: waMessageId || null,
                metadata,
                storage_url: null,
                is_deleted: false,
                channel,
              },
              { onConflict: "wa_message_id", ignoreDuplicates: true },
            );
            await supabase.rpc("increment_unread_count", { conv_id: convId }).catch(() => {});

            // Envia auto-reply via Evolution + salva como bot
            const instanceData = await supabase
              .from("evolution_instances")
              .select("instance_id")
              .eq("id", instance.id)
              .single();

            if (instanceData.data?.instance_id) {
              await fetch(
                `${EVOLUTION_API_URL}/message/sendText/${instanceData.data.instance_id}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                  body: JSON.stringify({ number: contactPhone, text: matchedResponse }),
                },
              ).catch(() => {});

              await supabase.from("inbox_messages").insert({
                conversation_id: convId,
                direction: "outbound",
                sender_type: "bot",
                content: matchedResponse,
                content_type: "text",
                is_deleted: false,
                channel,
              });
            }

            console.log(`[webhook] keyword match → auto-reply enviado para conv ${convId}`);
            continue;
          }
        }
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
              channel,
            },
            { onConflict: "wa_message_id", ignoreDuplicates: true },
          );
          if (msgErrPaused) console.error("[webhook] bot_paused insert error:", msgErrPaused.message);
          await supabase.rpc("increment_unread_count", { conv_id: convId }).catch(() => {});
          console.log(`[webhook] bot_paused=true — mensagem salva sem acionar bot para conv ${convId}`);
          continue;
        }

        // [Sprint5 F4] Verifica horário de atendimento (só para mensagens inbound, bot não pausado)
        const { open: withinHours, outMsg: oohMsg } = await isWithinOfficeHours(
          instance.empresa_id as string,
          supabase,
        );
        if (!withinHours) {
          // Salva mensagem normalmente, mas NÃO muda status nem aciona bot
          await supabase.from("inbox_messages").upsert(
            {
              conversation_id: convId,
              direction: "inbound",
              sender_type: "contact",
              content,
              content_type: contentType,
              wa_message_id: waMessageId || null,
              metadata,
              storage_url: null,
              is_deleted: false,
              channel,
            },
            { onConflict: "wa_message_id", ignoreDuplicates: true },
          );
          await supabase.rpc("increment_unread_count", { conv_id: convId }).catch(() => {});
          if (oohMsg) {
            await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
              body: JSON.stringify({ number: contactPhone, text: oohMsg }),
            }).catch(() => {});
          }
          console.log(`[webhook] out-of-hours — mensagem salva, auto-reply enviado para conv ${convId}`);
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
          channel,
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
      } else {
        // [v8] F2 SLA — set first_response_at na primeira mensagem do agente
        const { data: slaConv } = await supabase
          .from("inbox_conversations")
          .select("first_response_at")
          .eq("id", convId)
          .single();

        if (slaConv && slaConv.first_response_at === null) {
          await supabase
            .from("inbox_conversations")
            .update({ first_response_at: new Date().toISOString() })
            .eq("id", convId)
            .is("first_response_at", null);
          console.log(`[webhook] first_response_at definido para conv ${convId}`);
        }
      }
    }
    return new Response("OK");
  }

  console.log(`[evolution-webhook] unhandled event: ${event}`);
  return new Response("OK");
});
