// platform-evolution-webhook — recebe eventos do Evolution Go p/ o CRM de
// PLATAFORMA (público, verify_jwt=false). Escreve em platform_crm_evolution_instances.
//
// Porte 1:1 da PARTE de ciclo-de-vida-da-conexão do `evolution-webhook` do CRM
// Vendus (normalização + resolução de instância + eventos connection/qrcode),
// DESACOPLADO do tenant:
//   * Tabela: platform_crm_evolution_instances (SEM organization_id).
//   * Trata: CONNECTION_UPDATE/connection.update/Connected/PairSuccess/
//     Disconnected/LoggedOut  → status/phone_number/last_connected_at/qr_code;
//     QRCODE_UPDATED/qrcode.updated/QRCode/QR  → qr_code/qr_code_updated_at/status.
//   * Ignora (200) qualquer outro evento.
//
// A1.3 (inbox): ingestão de mensagens (MESSAGES_UPSERT/messages.upsert do v2 +
//   Message/SendMessage do Evolution Go) portada do `evolution-webhook` do V5
//   → platform_crm_conversations/messages:
//   * Conversa channel='whatsapp_evolution' com visitor_id='wa_evo:<digitos>'
//     — prefixo próprio pra NUNCA colidir com a conversa 'wa:' do canal Meta
//     Cloud do mesmo telefone (canal-por-conversa); caixa isolada por instância.
//   * Canal-por-conversa: evolution_instance_id na conversa + product_id
//     herdado DA INSTÂNCIA (nunca sobrescreve atribuição manual).
//   * Lead auto-criado por telefone (dedupe) + pipeline; mensagem inbound com
//     mídia básica (URL como a Evolution der — sem pipeline de download);
//     idempotência por key.id (metadata->>evolution_message_id); broadcast.
//   * fromMe = outbound digitado no APARELHO conectado → registrado como
//     agente com metadata.source='external_device' (shape do V5 que o front
//     do inbox de plataforma já reconhece p/ dedup visual).
//   * Receipts/reactions/bot-flows continuam FORA (fase seguinte do inbox).

import { createClient } from "npm:@supabase/supabase-js@2";
import { ensurePlatformLeadInPipeline } from "../_shared/platform-crm-pipeline.ts";
import { broadcastPlatformNewMessage } from "../_shared/platform-crm-webchat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Mídia básica extraída de uma mensagem whatsmeow/Baileys (cópia do V5, sem
 *  rawMessage/base64: não portamos o pipeline de download — persistimos só a
 *  URL "como a Evolution der"; sem URL, needs_download marca a lacuna). */
type MediaInfo = {
  type: "audio" | "image" | "video" | "document" | "sticker";
  mime?: string;
  caption?: string;
  url?: string;
  needsDownload?: boolean;
};

type Normalized =
  | { kind: "connection"; instance: string; state: "open" | "connecting" | "close"; phone?: string }
  | { kind: "qrcode"; instance: string; qr: string }
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
  | { kind: "unknown"; instance: string; event: string };

function extractInstance(payload: any): string {
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

  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const afterPipe = raw.slice(pipeIndex + 1).trim();
    if (afterPipe.length > 20) return afterPipe;
    const beforePipe = raw.slice(0, pipeIndex).trim();
    if (beforePipe.length > 20) return beforePipe;
  }

  return raw;
}

/** Extrai mídia de um objeto message whatsmeow/Baileys (cópia do V5).
 *  base64 embutido NUNCA é persistido (pesado) — só marca que não precisa
 *  de download; sem base64 e sem URL, needsDownload=true. */
function extractMedia(message: any): MediaInfo | undefined {
  if (!message) return undefined;
  const pickUrl = (m: any): string | undefined =>
    m?.url || m?.URL || m?.directPath || m?.DirectPath || undefined;
  const pickBase64 = (m: any): string | undefined =>
    typeof m?.base64 === "string" ? m.base64 :
    typeof m?.Base64 === "string" ? m.Base64 :
    typeof m?.media === "string" ? m.media :
    typeof m?.Media === "string" ? m.Media :
    undefined;

  const audio = message.audioMessage;
  if (audio) {
    const url = pickUrl(audio);
    return {
      type: "audio",
      mime: audio.mimetype || audio.Mimetype || "audio/ogg",
      url,
      needsDownload: !pickBase64(audio) && !url,
    };
  }
  const image = message.imageMessage;
  if (image) {
    const url = pickUrl(image);
    return {
      type: "image",
      mime: image.mimetype || image.Mimetype || "image/jpeg",
      caption: image.caption || image.Caption || "",
      url,
      needsDownload: !pickBase64(image) && !url,
    };
  }
  const video = message.videoMessage;
  if (video) {
    const url = pickUrl(video);
    return {
      type: "video",
      mime: video.mimetype || video.Mimetype || "video/mp4",
      caption: video.caption || video.Caption || "",
      url,
      needsDownload: !pickBase64(video) && !url,
    };
  }
  const doc = message.documentMessage;
  if (doc) {
    const url = pickUrl(doc);
    return {
      type: "document",
      mime: doc.mimetype || doc.Mimetype || "application/octet-stream",
      caption: doc.fileName || doc.FileName || doc.title || doc.Title || "",
      url,
      needsDownload: !pickBase64(doc) && !url,
    };
  }
  const sticker = message.stickerMessage;
  if (sticker) {
    const url = pickUrl(sticker);
    return {
      type: "sticker",
      mime: sticker.mimetype || sticker.Mimetype || "image/webp",
      url,
      needsDownload: !pickBase64(sticker) && !url,
    };
  }
  return undefined;
}

/** Texto exibível de um objeto message whatsmeow/Baileys (cascade do V5). */
function extractTextContent(message: any): string {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    (message?.audioMessage ? "[áudio]" : "") ||
    (message?.imageMessage ? "[imagem]" : "") ||
    (message?.videoMessage ? "[vídeo]" : "") ||
    (message?.documentMessage ? "[documento]" : "") ||
    (message?.stickerMessage ? "[figurinha]" : "") ||
    (message?.contactMessage || message?.contactsArrayMessage ? "📇 Contato compartilhado" : "") ||
    ""
  );
}

function normalizePayload(payload: any): Normalized | null {
  const event: string = payload.event || payload.type || payload.Event || "";
  const instance: string = extractInstance(payload);
  if (!instance) return null;
  const data = payload.data || payload;

  // ---- v2 events ----
  if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
    const messages = Array.isArray(data.messages) ? data.messages : [data];
    const msg = messages[0];
    if (!msg) return null;
    const key = msg.key || {};

    // Reação (👍/❤️) não é mensagem nova — fica p/ a fase de reactions do inbox.
    if (msg.message?.reactionMessage) {
      return { kind: "unknown", instance, event: `${event}:reaction` };
    }

    return {
      kind: "message",
      instance,
      fromMe: key.fromMe === true,
      remoteJid: key.remoteJid || "",
      pushName: msg.pushName || "",
      messageId: key.id || "",
      content: extractTextContent(msg.message) || msg.body || "",
      media: extractMedia(msg.message),
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

  // ---- Evolution Go events ----
  // Message / SendMessage carregam estruturas whatsmeow Info + Message (V5).
  if (event === "Message" || event === "SendMessage") {
    const info = data.Info || data.info || {};
    const message = data.Message || data.message || {};
    const sender: string = info.Sender || info.sender || info.RemoteJid || "";
    const rawRemoteJid: string = info.Chat || info.RemoteJid || sender || "";
    const fromMe: boolean = !!(info.IsFromMe ?? info.isFromMe ?? event === "SendMessage");

    // Resolver JID @lid → JID @s.whatsapp.net (telefone real) quando o
    // whatsmeow envia o "Alt". Em fromMe o destino real vem em
    // RecipientAlt/RecipientPn/ChatAlt; em inbound, em SenderAlt/SenderPn.
    const altJidCandidates = fromMe
      ? [info.RecipientAlt, info.RecipientPn, info.ChatAlt, info.recipientAlt, info.recipientPn, info.chatAlt]
      : [info.SenderAlt, info.SenderPn, info.senderAlt, info.senderPn];
    const altPhoneJid = altJidCandidates.find(
      (j: any) => typeof j === "string" && j.includes("@s.whatsapp.net"),
    ) as string | undefined;
    const remoteJid = altPhoneJid || rawRemoteJid;
    const lidJid = rawRemoteJid.includes("@lid")
      ? rawRemoteJid
      : (altJidCandidates.find((j: any) => typeof j === "string" && j.includes("@lid")) as string | undefined);

    // Reação não é mensagem nova — fica p/ a fase de reactions do inbox.
    if (message.reactionMessage || message.ReactionMessage) {
      return { kind: "unknown", instance, event: `${event}:reaction` };
    }

    return {
      kind: "message",
      instance,
      fromMe,
      remoteJid,
      lidJid,
      pushName: info.PushName || info.pushName || "",
      messageId: info.ID || info.id || "",
      content: extractTextContent(message),
      media: extractMedia(message),
    };
  }

  if (event === "Connected" || event === "PairSuccess") {
    return { kind: "connection", instance, state: "open", phone: data.JID || data.jid };
  }
  if (event === "LoggedOut" || event === "Disconnected") {
    return { kind: "connection", instance, state: "close" };
  }
  if (event === "QRCode" || event === "QR" || event === "QRCodeUpdated") {
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
        console.warn("[platform-evolution-webhook] QRCode event sem QR extraível — payload:",
          JSON.stringify(payload).slice(0, 2000));
      } catch { /* ignore */ }
    }
    return { kind: "qrcode", instance, qr };
  }

  // Demais eventos (receipts/reactions/presença) — fase seguinte do inbox.
  return { kind: "unknown", instance, event };
}

// ─── Persistência no inbox de plataforma (espelho do meta-whatsapp-webhook) ──

/** Lead por telefone (dedupe) ou cria — espelho do platform-meta-whatsapp-webhook,
 *  com source/lead_channel do canal Evolution. */
async function ensureLead(
  supabase: any,
  fromDigits: string,
  pushName: string | null,
  productId: string | null,
): Promise<string | null> {
  try {
    const phonePlus = `+${fromDigits}`;
    const { data: existing } = await supabase
      .from("platform_crm_leads")
      .select("id")
      .or(`phone.eq.${fromDigits},phone.eq.${phonePlus}`)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
      .from("platform_crm_leads")
      .insert({
        name: pushName || `WhatsApp ${phonePlus}`,
        phone: phonePlus,
        source: "whatsapp_evolution",
        lead_channel: "whatsapp_evolution",
        // Só no INSERT: lead existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select("id")
      .single();
    if (error) {
      console.error("[platform-evolution-webhook] auto-create lead failed (non-fatal):", error);
      return null;
    }
    return (created?.id as string) ?? null;
  } catch (e) {
    console.error("[platform-evolution-webhook] ensureLead error (non-fatal):", e);
    return null;
  }
}

/** Conversa da caixa Evolution (isolada por instância, V5-style) ou cria
 *  (channel='whatsapp_evolution'). visitor_id usa prefixo 'wa_evo:' pra nunca
 *  colidir com a conversa 'wa:' do canal Meta Cloud do mesmo telefone.
 *  Reabre fechada como bot_active — padrão do inbox de plataforma. */
async function ensureConversation(
  supabase: any,
  instance: any,
  fromDigits: string,
  pushName: string | null,
  productId: string | null,
): Promise<any | null> {
  const visitorId = `wa_evo:${fromDigits}`;
  const { data: rows } = await supabase
    .from("platform_crm_conversations")
    .select("*")
    .eq("visitor_id", visitorId)
    .eq("channel", "whatsapp_evolution")
    .eq("evolution_instance_id", instance.id)
    .order("created_at", { ascending: false })
    .limit(1);
  let conversation = rows?.[0] ?? null;

  if (conversation && conversation.status === "closed") {
    const { data: reopened, error } = await supabase
      .from("platform_crm_conversations")
      .update({
        status: "waiting_human", // até existir send+brain por canal Evolution (era bot_active no V5)
        needs_human: false,
        accepted_at: null,
        accepted_by: null,
        assigned_to: null,
      })
      .eq("id", conversation.id)
      .select()
      .single();
    if (!error && reopened) conversation = reopened;
  }

  if (!conversation) {
    const { data: created, error } = await supabase
      .from("platform_crm_conversations")
      .insert({
        visitor_id: visitorId,
        visitor_name: pushName || null,
        visitor_phone: `+${fromDigits}`,
        visitor_whatsapp: `+${fromDigits}`,
        channel: "whatsapp_evolution",
        status: "waiting_human", // até existir send+brain por canal Evolution (era bot_active no V5)
        needs_human: false,
        evolution_instance_id: instance.id,
        // Só no INSERT: conversa existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select()
      .single();
    if (error) {
      console.error("[platform-evolution-webhook] create conversation failed:", error);
      return null;
    }
    conversation = created;
  }

  // Canal-por-conversa (A1.3): herda product_id da instância APENAS quando a
  // conversa ainda não tem produto (atribuição manual nunca é sobrescrita).
  if (!conversation.product_id && productId) {
    const { error: patchError } = await supabase
      .from("platform_crm_conversations")
      .update({ product_id: productId })
      .eq("id", conversation.id);
    if (!patchError) conversation.product_id = productId;
  }

  if (!conversation.lead_id) {
    const leadId = await ensureLead(supabase, fromDigits, pushName, productId);
    if (leadId) {
      await supabase
        .from("platform_crm_conversations")
        .update({ lead_id: leadId })
        .eq("id", conversation.id);
      conversation.lead_id = leadId;
      await ensurePlatformLeadInPipeline(supabase, leadId);
    }
  }

  return conversation;
}

/** Ingestão de 1 mensagem Evolution → inbox de plataforma. Retorna a Response
 *  (sempre 200 — Evolution re-entregaria em não-200 e o key.id já dedupa). */
async function handleMessage(
  supabase: any,
  instance: any,
  norm: Extract<Normalized, { kind: "message" }>,
): Promise<Response> {
  const ok = (body: Record<string, unknown>) =>
    new Response(JSON.stringify({ ok: true, ...body }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Grupos ficam fora do inbox de vendas (igual V5).
  if (norm.remoteJid.endsWith("@g.us")) return ok({ skipped: "group" });

  // JID @lid sem telefone real resolvido → sem identidade utilizável (V5:
  // não criar conversa fantasma a partir de LID).
  const remoteIsLid = norm.remoteJid.includes("@lid");
  const fromDigits = remoteIsLid
    ? ""
    : norm.remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
  if (!fromDigits) return ok({ skipped: "no_phone" });

  // Idempotência por key.id (padrão wamid/ig_mid): re-entregas não duplicam.
  if (norm.messageId) {
    const { data: dupe } = await supabase
      .from("platform_crm_messages")
      .select("id")
      .eq("metadata->>evolution_message_id", norm.messageId)
      .limit(1)
      .maybeSingle();
    if (dupe) return ok({ skipped: "duplicate_message_id" });
  }

  const productId = (instance.product_id as string | null) ?? null;
  const media = norm.media;
  const contentType = media ? media.type : "text";
  const content = norm.content || (media ? `[${media.type}]` : "");
  if (!content && !media) return ok({ skipped: "empty" });

  // Shape metadata.media espelhado do inbox (kind/mime/url/caption); a URL é
  // a que a Evolution der (pode ser CDN .enc do WhatsApp — o pipeline de
  // download/decrypt é fase seguinte; needs_download marca a lacuna).
  const mediaMeta = media
    ? {
        kind: media.type,
        type: media.type,
        mime: media.mime ?? null,
        url: media.url ?? null,
        caption: media.caption || null,
        ...(media.needsDownload ? { needs_download: true } : {}),
      }
    : null;

  // fromMe = enviada pelo APARELHO conectado (fora do CRM) → outbound de
  // agente com metadata.source='external_device' (V5; o front já reconhece).
  if (norm.fromMe) {
    const visitorId = `wa_evo:${fromDigits}`;
    const { data: rows } = await supabase
      .from("platform_crm_conversations")
      .select("id, status")
      .eq("visitor_id", visitorId)
      .eq("channel", "whatsapp_evolution")
      .eq("evolution_instance_id", instance.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const conv = rows?.[0] ?? null;
    // Sem conversa → papo iniciado fora do CRM; o inbox de VENDAS nasce de
    // inbound (lead fala primeiro). Não criamos conversa fantasma (o V5 criava
    // com status 'human' — decisão de escopo registrada no retorno A1.3).
    if (!conv) return ok({ skipped: "device_outbound_no_conversation" });

    // Dedupe extra do V5: mesmo conteúdo outbound nos últimos 60s na mesma
    // conversa (eco do envio feito pelo próprio CRM via Evolution).
    if (content) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: recent } = await supabase
        .from("platform_crm_messages")
        .select("id")
        .eq("conversation_id", conv.id)
        .eq("direction", "outbound")
        .eq("content", content)
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      if (recent?.id) return ok({ skipped: "outbound_echo_content" });
    }

    const { data: inserted, error } = await supabase
      .from("platform_crm_messages")
      .insert({
        conversation_id: conv.id,
        direction: "outbound",
        sender_type: "agent",
        content: content || "[mídia]",
        content_type: contentType,
        metadata: {
          evolution_message_id: norm.messageId || null,
          evolution_instance_id: instance.id,
          channel: "whatsapp_evolution",
          source: "external_device",
          from_device: true,
          remote_jid: norm.remoteJid,
          ...(mediaMeta ? { media: mediaMeta } : {}),
        },
      })
      .select()
      .single();
    if (error) {
      if (!String(error.code).includes("23505")) {
        console.error("[platform-evolution-webhook] insert device outbound failed:", error);
      }
      return ok({ stored: false });
    }

    await supabase
      .from("platform_crm_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conv.id);
    await broadcastPlatformNewMessage(supabase, String(conv.id), inserted);
    return ok({ stored: "external_outbound" });
  }

  // ---- INBOUND ----
  const conversation = await ensureConversation(
    supabase, instance, fromDigits, norm.pushName || null, productId,
  );
  if (!conversation) return ok({ stored: false });

  const { data: inserted, error } = await supabase
    .from("platform_crm_messages")
    .insert({
      conversation_id: conversation.id,
      direction: "inbound",
      sender_type: "visitor",
      content: content || "[mensagem]",
      content_type: contentType,
      metadata: {
        evolution_message_id: norm.messageId || null,
        evolution_instance_id: instance.id,
        channel: "whatsapp_evolution",
        remote_jid: norm.remoteJid,
        ...(norm.lidJid ? { wa_lid: norm.lidJid.split("@")[0].split(":")[0] } : {}),
        push_name: norm.pushName || null,
        ...(mediaMeta ? { media: mediaMeta } : {}),
      },
    })
    .select()
    .single();
  if (error) {
    // 23505 = corrida entre re-entregas resolvida por índice único (ok).
    if (!String(error.code).includes("23505")) {
      console.error("[platform-evolution-webhook] insert message failed:", error);
    }
    return ok({ stored: false });
  }

  await supabase
    .from("platform_crm_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      ...(norm.pushName && !conversation.visitor_name ? { visitor_name: norm.pushName } : {}),
    })
    .eq("id", conversation.id);

  await broadcastPlatformNewMessage(supabase, String(conversation.id), inserted);
  return ok({ stored: "inbound" });
}

// ============================================================================
// B3 — Prova de posse da instância (gate anti-injeção do webhook PÚBLICO)
// ----------------------------------------------------------------------------
// verify_jwt=false: qualquer um POSTa aqui. A ÚNICA prova de que o evento veio
// da NOSSA instância é o token que a Evolution API v2 ecoa no corpo de todo
// evento (campo `apikey` == platform_crm_evolution_instances.instance_token).
// Mesma régua da evolution-history-sync: timingSafeEq (R11) + lookup .eq()
// injection-safe (nunca instanceRef interpolado no .or()).
//
// Neste gêmeo da PLATAFORMA o gate roda ENFORCING (retorna 401 em token
// inválido): platform_crm_evolution_instances tem 0 instâncias hoje, logo não há
// ingestão legítima a quebrar. Quando instâncias forem criadas, precisam ter
// instance_token setado (mesma dependência do webhook do tenant).
function timingSafeEq(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** Token reenviado pela Evolution: corpo (apikey, v2) OU header (fallback). */
function extractWebhookToken(payload: any, headers: Headers): string {
  const body =
    (typeof payload?.apikey === "string" && payload.apikey.trim()) ||
    (typeof payload?.data?.apikey === "string" && payload.data.apikey.trim()) ||
    "";
  if (body) return body;
  const h = (headers.get("apikey") || headers.get("x-webhook-token") || "").trim();
  if (h) return h;
  const m = (headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

/** Resolve a instância (injection-safe) e EXIGE token válido. */
async function authenticateInstance(
  supabase: any,
  instanceRef: string,
  payload: any,
  headers: Headers,
): Promise<{ ok: true; instance: any } | { ok: false; reason: string }> {
  const token = extractWebhookToken(payload, headers);
  if (!token) return { ok: false, reason: "no_token" };
  const SEL = "id, instance_token";
  let inst: any = null;
  for (const q of [
    supabase.from("platform_crm_evolution_instances").select(SEL).eq("instance_id", instanceRef).limit(1),
    supabase.from("platform_crm_evolution_instances").select(SEL).eq("name", instanceRef).limit(1),
    supabase.from("platform_crm_evolution_instances").select(SEL).eq("metadata->>instance_name", instanceRef).limit(1),
    supabase.from("platform_crm_evolution_instances").select(SEL).eq("metadata->>instance_uuid", instanceRef).limit(1),
  ]) {
    const { data } = await q;
    if (data && data.length) { inst = data[0]; break; }
  }
  if (!inst) return { ok: false, reason: "unknown_instance" };
  const known = String(inst.instance_token || "").trim();
  if (!known || !timingSafeEq(token, known)) return { ok: false, reason: "token_mismatch" };
  return { ok: true, instance: inst };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = await req.json().catch(() => ({}));
    const rawEvent = payload.event || payload.type || payload.Event;
    const rawInstance = extractInstance(payload);
    console.log("[platform-evolution-webhook] raw event:", rawEvent, "instance:", rawInstance || "<MISSING>");

    // ---- B3: gate de prova de posse (ENFORCING). ANTES de qualquer efeito.
    //      Resposta 401 idêntica p/ no_token/unknown/mismatch (sem oráculo de
    //      enumeração). 0 instâncias hoje → não bloqueia ingestão legítima.
    const gate = await authenticateInstance(
      supabase, String(rawInstance || "").trim(), payload, req.headers,
    );
    if (!gate.ok) {
      console.warn(`[platform-evolution-webhook] 401 auth reason=${gate.reason} instance=${rawInstance || "<none>"} event=${rawEvent}`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const norm = normalizePayload(payload);
    if (!norm) {
      // Return 200 so Evolution Go does not retry indefinitely
      return new Response(JSON.stringify({ ok: true, ignored: "missing_instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ciclo-de-vida da conexão apenas; demais eventos são ignorados aqui.
    if (norm.kind === "unknown") {
      return new Response(JSON.stringify({ ok: true, ignored_event: norm.event }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup instance by either instance_id (UUID) OR name OR metadata.instance_name.
    const { data: instances } = await supabase
      .from("platform_crm_evolution_instances")
      .select("*")
      .or(`instance_id.eq.${norm.instance},name.eq.${norm.instance}`);
    let instance = instances?.[0];

    if (!instance) {
      const { data: byMeta } = await supabase
        .from("platform_crm_evolution_instances")
        .select("*")
        .or(`metadata->>instance_name.eq.${norm.instance},metadata->>instance_uuid.eq.${norm.instance}`);
      instance = byMeta?.[0];
    }

    if (!instance) {
      console.warn("[platform-evolution-webhook] unknown instance:", norm.instance);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- MESSAGE (ingestão A1.3) ----
    if (norm.kind === "message") {
      return await handleMessage(supabase, instance, norm);
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
      await supabase.from("platform_crm_evolution_instances").update(updates).eq("id", instance.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- QR CODE ----
    if (norm.kind === "qrcode") {
      if (norm.qr) {
        await supabase
          .from("platform_crm_evolution_instances")
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

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("platform-evolution-webhook error:", err);
    // 200 to avoid Evolution retry storms.
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
