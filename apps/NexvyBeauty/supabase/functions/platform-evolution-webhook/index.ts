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
import {
  createPlatformEvolutionWebhookHandler,
} from "../_shared/platform-evolution-webhook-handler.ts";
import { ensurePlatformLeadInPipeline } from "../_shared/platform-crm-pipeline.ts";
import { broadcastPlatformNewMessage } from "../_shared/platform-crm-webchat.ts";
import { phoneVariantsWithPlusBR } from "../_shared/phone-e164-variants.ts";
import {
  allowsDeviceOutboundCreateConversation,
  phoneDigitsFromJid,
  resolveBaileysMessageJids,
} from "../_shared/evolution-baileys-jid.ts";

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
  /** base64 inline do evento (webhookBase64=true na Evolution) — caminho primário do áudio. */
  base64?: string;
  /** objeto cru da mídia (mediaKey etc.) — envelope do fallback getBase64FromMediaMessage. */
  raw?: unknown;
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
      // PR-BDR-11: o base64 inline (webhookBase64=true) e o objeto cru eram
      // DESCARTADOS aqui — e são exatamente o que a transcrição precisa. A URL
      // sozinha não serve: o CDN do WhatsApp entrega o blob CRIPTOGRAFADO
      // (mediaKey por mensagem); quem descriptografa é a Evolution.
      base64: pickBase64(audio),
      raw: audio,
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

    // Reação (👍/❤️) não é mensagem nova — fica p/ a fase de reactions do inbox.
    if (msg.message?.reactionMessage) {
      return { kind: "unknown", instance, event: `${event}:reaction` };
    }

    // Espelha o path Go: @lid → telefone via remoteJidAlt / Pn.
    const jids = resolveBaileysMessageJids(msg);

    return {
      kind: "message",
      instance,
      fromMe: jids.fromMe,
      remoteJid: jids.remoteJid,
      ...(jids.lidJid ? { lidJid: jids.lidJid } : {}),
      pushName: msg.pushName || "",
      messageId: jids.messageId || "",
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
 *  com source/lead_channel do canal Evolution.
 *
 *  PR-BDR-2a — o casamento era por DUAS formas só (`fromDigits` OU `+fromDigits`).
 *  Um lead legado gravado sem o 9º dígito de celular (`+551199998888`, 12 dígitos)
 *  NÃO casava com o inbound de 13 dígitos (`5511999998888`) e virava lead
 *  DUPLICADO. Agora casa por todas as variantes de `phoneVariantsWithPlusBR` —
 *  esse é o helper certo AQUI porque `platform_crm_leads.phone` é convenção
 *  "+E.164" (medido: 8/8 linhas com "+"); contra colunas de dígitos puros o
 *  helper CRU (`phoneVariantsBR`) é que serve. O INSERT continua gravando na
 *  forma com "+", mantendo a convenção da coluna.
 *
 *  Devolve null quando não conseguiu NEM resolver NEM criar o lead. Quem chama
 *  TEM de reagir — ver o alerta de conversa órfã em ensureConversation
 *  (PR-BDR-3). */
async function ensureLead(
  supabase: any,
  fromDigits: string,
  pushName: string | null,
  productId: string | null,
): Promise<string | null> {
  try {
    const phonePlus = `+${fromDigits}`;
    // `.in()` e não `.or()`: o array é passado COMO VALOR ao client, que serializa
    // e cita cada item. No `.or()` os valores viram uma string de filtro PostgREST
    // onde `,`/`(`/`)` são delimitadores e o escape seria manual. As variantes só
    // contêm dígitos e "+", mas a construção segura não fica dependendo disso.
    const variants = phoneVariantsWithPlusBR(fromDigits);
    // Fallback defensivo: telefone que o helper não consegue variar (<8 dígitos)
    // preserva exatamente o casamento anterior em vez de virar `.in(…, [])`,
    // que casaria ZERO e criaria lead novo sempre.
    const phoneMatches = variants.length > 0 ? variants : [fromDigits, phonePlus];
    const { data: existing, error: lookupError } = await supabase
      .from("platform_crm_leads")
      .select("id")
      .in("phone", phoneMatches)
      // Com N variantes o SELECT pode casar mais de um lead; o mais antigo é o
      // canônico. Torna determinístico o que antes era ordem arbitrária do banco.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      // O erro do SELECT era DESCARTADO aqui. O fluxo segue caindo no INSERT
      // (comportamento preservado), mas o caminho que gera lead duplicado deixa
      // de ser invisível.
      console.error(
        `[platform-evolution-webhook] lead lookup by phone FAILED phone=${phonePlus} ` +
          `reason=${lookupError?.message ?? JSON.stringify(lookupError)}`,
      );
    }
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
        // PR-BDR-4: o send+brain por canal Evolution passou a existir (deliver()
        // no platform-sales-brain + despacho no fim deste arquivo), então a
        // conversa volta a nascer/reabrir com o bot no comando, como no V5.
        status: "bot_active",
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
        // PR-BDR-4: ver comentário no reabrir acima — o canal Evolution já tem
        // envio e cérebro. NOTA: o platform-start-whatsapp-conversation continua
        // criando 'human_active' de PROPÓSITO (lá um humano clicou e assume);
        // só o caminho do webhook (a lead falou primeiro) nasce com o bot.
        status: "bot_active",
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
    } else {
      // PR-BDR-3 — antes daqui se saía em SILÊNCIO: a conversa seguia sem
      // lead_id e ficava invisível no CRM. Não é hipótese — o mesmo padrão no
      // canal oficial produziu 4 conversas órfãs, TODAS com telefone
      // preenchido, uma com 56 mensagens, degradando por semanas sem ninguém
      // notar.
      //
      // Saída escolhida: ALERTA inequívoco. Não pode ser fatal (a mensagem da
      // lead ainda precisa ser persistida — quem chama segue adiante), e não há
      // no schema de platform_crm_conversations coluna de "precisa de vínculo"
      // — inventar uma aqui exigiria migration e não é o escopo desta PR. O
      // alerta carrega tudo que é preciso pra achar a conversa e vincular
      // depois, no mesmo formato greppável de notifyColdOutreachInbound.
      console.error(
        `[platform-evolution-webhook] ORPHAN CONVERSATION — sem lead_id ` +
          `conversation_id=${conversation.id} visitor_id=${visitorId} ` +
          `phone=+${fromDigits} evolution_instance_id=${instance.id} ` +
          `product_id=${productId ?? "null"} — a conversa NÃO aparece no CRM ` +
          `enquanto não for vinculada a um lead`,
      );
    }
  }

  return conversation;
}

/** Veredito do on-inbound do cold outreach.
 *  `optOut`  → a lead pediu PARE/SAIR: o cérebro NÃO pode responder.
 *  `ok:false` → não deu pra saber (invoke falhou/rejeitou). Ver a decisão
 *  registrada em dispatchSalesBrain: desconhecido NÃO é tratado como opt-out. */
type ColdOutreachInboundVerdict = { ok: boolean; optOut: boolean };

// PR-BDR-1 — OPT-OUT VIVO. A action 'on-inbound' do platform-cold-outreach
// (supressão Art.18 do SAIR/PARE, parada da cadência, silenciamento da conversa
// e handoff BDR->Duda) existia sem NENHUM invocador: o pg_cron só chama
// {"action":"tick"}. Este é o invocador. Roda depois da persistência do inbound
// e ANTES de qualquer despacho de cérebro — desde a PR-BDR-4 esse despacho
// EXISTE (dispatchSalesBrain, no fim de handleMessage), e a ordem virou
// requisito duro: quem pediu PARE não pode receber resposta da Duda. Por isso
// esta função passou a DEVOLVER o veredito em vez de void.
// Auth interna: o client foi criado com SUPABASE_SERVICE_ROLE_KEY, e
// functions.invoke propaga `Authorization: Bearer <SERVICE_ROLE_KEY>` — mesmo
// padrão de platform-cold-outreach -> platform-evolution-send.
// NUNCA lança (o webhook não pode quebrar por causa disto) e NUNCA falha em
// silêncio: todo caminho de erro sai em console.error com o conversation_id.
async function notifyColdOutreachInbound(
  supabase: any,
  a: { productId: string | null; conversationId: string; telefone: string; text: string },
): Promise<ColdOutreachInboundVerdict> {
  try {
    const { data, error } = await supabase.functions.invoke("platform-cold-outreach", {
      body: {
        action: "on-inbound",
        product_id: a.productId,
        conversation_id: a.conversationId,
        telefone: a.telefone,
        text: a.text,
      },
    });
    if (error) {
      console.error(
        `[platform-evolution-webhook] cold-outreach on-inbound FAILED conversation_id=${a.conversationId} reason=${error?.message ?? String(error)}`,
      );
      return { ok: false, optOut: false };
    }
    const res = data as
      | { ok?: boolean; intent?: string; affected?: number; handoff?: unknown; error?: string }
      | null;
    if (!res || res.ok !== true) {
      console.error(
        `[platform-evolution-webhook] cold-outreach on-inbound REJECTED conversation_id=${a.conversationId} response=${JSON.stringify(res)}`,
      );
      return { ok: false, optOut: false };
    }
    if (res.intent === "opt_out") {
      // Lead pediu pra sair: registro legível aqui; o efeito é do motor.
      console.warn(
        `[platform-evolution-webhook] cold-outreach OPT-OUT conversation_id=${a.conversationId} telefone=${a.telefone} queue_rows=${res.affected ?? 0}`,
      );
      return { ok: true, optOut: true };
    }
    console.log(
      `[platform-evolution-webhook] cold-outreach on-inbound ok conversation_id=${a.conversationId} intent=${res.intent} affected=${res.affected ?? 0} handoff=${JSON.stringify(res.handoff ?? null)}`,
    );
    return { ok: true, optOut: false };
  } catch (e: any) {
    console.error(
      `[platform-evolution-webhook] cold-outreach on-inbound EXCEPTION conversation_id=${a.conversationId} reason=${e?.message ?? String(e)}`,
    );
    return { ok: false, optOut: false };
  }
}

// PR-BDR-4 — DESPACHO DO CÉREBRO. Até aqui o canal Evolution persistia a
// mensagem da lead e parava: ninguém acordava o platform-sales-brain (o webhook
// oficial faz isso desde a F2). Este é o invocador — mesmo padrão do
// platform-meta-whatsapp-webhook: fire-and-forget com waitUntil, porque o
// cérebro leva DEZENAS DE SEGUNDOS (LLM + pausas humanas de digitação) e a
// Evolution re-entrega o evento se este webhook não responder rápido.
// O brain revalida canal/status e tem claim + dedupe próprios.
async function dispatchSalesBrain(conversationId: string): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const brainSecret = Deno.env.get("BRAIN_INTERNAL_SECRET") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base || (!brainSecret && !serviceKey)) {
    console.error(
      `[platform-evolution-webhook] brain NÃO despachado conversation_id=${conversationId} — faltam SUPABASE_URL e/ou credencial interna (BRAIN_INTERNAL_SECRET|SUPABASE_SERVICE_ROLE_KEY); a lead ficaria sem resposta`,
    );
    return;
  }
  // O brain aceita x-brain-secret OU Bearer service-role (isAuthorized). Usamos
  // o secret quando existe (padrão do webhook oficial) e caímos no service-role
  // — que este arquivo já tem — em vez de calar por falta de env.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (brainSecret) headers["x-brain-secret"] = brainSecret;
  else headers["Authorization"] = `Bearer ${serviceKey}`;

  const call = fetch(`${base}/functions/v1/platform-sales-brain`, {
    method: "POST",
    headers,
    body: JSON.stringify({ conversation_id: conversationId }),
  })
    .then(async (r) => {
      if (!r.ok) {
        console.error(
          `[platform-evolution-webhook] brain retornou ${r.status} conversation_id=${conversationId} body=${(await r.text()).slice(0, 200)}`,
        );
      }
    })
    .catch((e) =>
      console.error(
        `[platform-evolution-webhook] brain fetch error conversation_id=${conversationId} reason=${e?.message ?? String(e)}`,
      )
    );

  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(call);
  else await call;
}

/**
 * PR-BDR-11 — áudio da lead vira TEXTO antes do insert (porte do canal Meta).
 *
 * Espelha platform-meta-whatsapp-webhook:transcribeInboundAudio, que é o caminho
 * PROVADO da Duda: storage ANTES da transcrição (o humano OUVE mesmo quando a IA
 * não lê) e Gemini 2.5-flash como transcritor (a OPENAI_API_KEY dos secrets está
 * revogada — medido lá em 2026-08-03; não "voltar" para OpenAI).
 *
 * Só muda a AQUISIÇÃO dos bytes, que aqui vem da Evolution:
 *   1º base64 inline no evento (webhookBase64=true — caminho primário);
 *   2º /chat/getBase64FromMediaMessage (a Evolution descriptografa; a URL crua
 *      do CDN do WhatsApp NÃO serve — entrega o blob criptografado por mediaKey).
 *
 * Best-effort de ponta a ponta: qualquer falha devolve null e a mensagem segue
 * como '[áudio]' — o prompt da agente manda pedir por texto nesse caso. Perder a
 * transcrição é degradação; derrubar a ingestão seria perda.
 */
async function transcribeEvolutionAudio(
  supabase: any,
  instance: any,
  media: MediaInfo,
  messageId: string,
  remoteJid: string,
): Promise<{ transcript: string | null; mediaUrl: string | null } | null> {
  try {
    // ── 1) Bytes: inline primeiro, download decriptado como fallback ─────────
    let b64 = String(media.base64 ?? "").trim();
    if (b64.startsWith("data:")) b64 = b64.slice(b64.indexOf(",") + 1);

    if (!b64) {
      const { data: cfg } = await supabase
        .from("platform_settings")
        .select("evolution_go_url, evolution_go_global_api_key")
        .maybeSingle();
      const evoUrl = String(cfg?.evolution_go_url ?? "").replace(/\/$/, "");
      const keys = [instance.instance_token, cfg?.evolution_go_global_api_key]
        .map((k: unknown) => String(k ?? "").trim())
        .filter(Boolean);
      const name = String(instance.name ?? "").trim();
      if (evoUrl && keys.length > 0 && name) {
        const key = { id: messageId, remoteJid, fromMe: false };
        // Envelope completo primeiro (whatsmeow canônico); só a key como 2ª tentativa.
        const bodies = media.raw
          ? [
            { message: { key, message: { audioMessage: media.raw } }, convertToMp4: false },
            { message: { key }, convertToMp4: false },
          ]
          : [{ message: { key }, convertToMp4: false }];
        outer:
        for (const apikey of keys) {
          for (const body of bodies) {
            const res = await fetch(
              `${evoUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(name)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey },
                body: JSON.stringify(body),
              },
            );
            const parsed = await res.json().catch(() => null);
            const got = typeof parsed?.base64 === "string"
              ? parsed.base64
              : typeof parsed?.media === "string"
              ? parsed.media
              : "";
            if (res.ok && got) {
              b64 = got.startsWith("data:") ? got.slice(got.indexOf(",") + 1) : got;
              break outer;
            }
          }
        }
      }
      if (!b64) {
        console.error(
          `[platform-evolution-webhook] audio: sem base64 inline E download falhou message_id=${messageId} — segue '[áudio]'`,
        );
        return null;
      }
    }

    // Teto espelhado do canal Meta (25MB) — voz real fica em KB.
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch (_e) {
      console.error(`[platform-evolution-webhook] audio: base64 inválido message_id=${messageId}`);
      return null;
    }
    if (bytes.length === 0 || bytes.length > 25 * 1024 * 1024) {
      console.error(`[platform-evolution-webhook] audio: tamanho inválido ${bytes.length}`);
      return null;
    }

    // ── 2) Storage ANTES da transcrição — player na UI mesmo se o Gemini falhar.
    //     Bucket e formato de path idênticos ao canal Meta (mesmo player lê os dois).
    const mimeClean = String(media.mime ?? "audio/ogg").split(";")[0].trim() || "audio/ogg";
    let mediaUrl: string | null = null;
    try {
      const path = `platform-crm/whatsapp-audio/evo-${messageId}.ogg`;
      const { error: upErr } = await supabase.storage
        .from("inbox-media")
        .upload(path, bytes, { contentType: mimeClean, upsert: true });
      if (upErr) {
        console.error("[platform-evolution-webhook] audio: upload storage falhou", upErr.message);
      } else {
        const { data: pub } = supabase.storage.from("inbox-media").getPublicUrl(path);
        mediaUrl = pub?.publicUrl ?? null;
      }
    } catch (e) {
      console.error("[platform-evolution-webhook] audio: upload exceção", String(e).slice(0, 160));
    }

    // ── 3) Gemini transcreve (mesmo modelo e MESMO prompt do canal Meta) ─────
    let transcript: string | null = null;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      console.error("[platform-evolution-webhook] audio: GEMINI_API_KEY ausente — segue sem transcrição");
    } else {
      const trRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: mimeClean, data: b64 } },
                {
                  text: "Transcreva este áudio em português brasileiro, fielmente e sem comentários. " +
                    "Responda SOMENTE com o texto falado. Se não houver fala, responda exatamente [inaudivel].",
                },
              ],
            }],
          }),
        },
      );
      const trBody = await trRes.json().catch(() => ({}));
      const parts = (trBody as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        ?.candidates?.[0]?.content?.parts ?? [];
      const t = parts.map((p) => p?.text ?? "").join("").trim();
      if (!trRes.ok || !t || t === "[inaudivel]") {
        console.error(
          "[platform-evolution-webhook] audio: gemini falhou",
          trRes.status,
          JSON.stringify(trBody).slice(0, 200),
        );
      } else {
        transcript = t;
      }
    }

    if (!transcript && !mediaUrl) return null;
    return { transcript, mediaUrl };
  } catch (e) {
    console.error("[platform-evolution-webhook] audio: exceção", String(e).slice(0, 200));
    return null;
  }
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

  // JID @lid sem telefone real resolvido (Alt) → sem identidade utilizável.
  const fromDigits = phoneDigitsFromJid(norm.remoteJid);
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
    let conv = rows?.[0] ?? null;
    // BDR Camila: 1º toque no aparelho pode NASCER conversa (gate por nome/flag).
    // Demais instâncias mantêm o skip A1.3 (inbox nasce no inbound).
    if (!conv) {
      if (!allowsDeviceOutboundCreateConversation(instance)) {
        return ok({ skipped: "device_outbound_no_conversation" });
      }
      conv = await ensureConversation(
        supabase, instance, fromDigits, null, productId,
      );
      if (!conv) return ok({ stored: false, skipped: "device_outbound_create_failed" });
    }

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

  // PR-BDR-11: áudio vira TEXTO antes do insert — igual ao canal Meta, os dois
  // consumidores (cérebro lê `content`, UI lê a mesma coluna + player) são
  // consertados de uma vez. DIVERGÊNCIA deliberada do Meta: quando a transcrição
  // falha mas o player existe, o content continua "[áudio]" (lá vira "") — o
  // prompt da agente chaveia em "[áudio]" para pedir por texto em vez de
  // responder no escuro, e content vazio apagaria esse gatilho.
  let inboundContent = content || "[mensagem]";
  let inboundMediaMeta = mediaMeta;
  let audioTranscript: string | null = null;
  if (media?.type === "audio") {
    const tr = await transcribeEvolutionAudio(supabase, instance, media, norm.messageId, norm.remoteJid);
    if (tr?.transcript) {
      audioTranscript = tr.transcript;
      inboundContent = `🎙️ ${tr.transcript}`;
    }
    if (tr?.mediaUrl && inboundMediaMeta) {
      // URL do bucket substitui a do CDN (que expira e é criptografada); com o
      // binário salvo, needs_download deixa de ser verdade.
      const { needs_download: _nd, ...rest } = inboundMediaMeta as Record<string, unknown>;
      inboundMediaMeta = { ...rest, url: tr.mediaUrl } as typeof inboundMediaMeta;
    }
  }

  const { data: inserted, error } = await supabase
    .from("platform_crm_messages")
    .insert({
      conversation_id: conversation.id,
      direction: "inbound",
      sender_type: "visitor",
      content: inboundContent,
      content_type: contentType,
      metadata: {
        evolution_message_id: norm.messageId || null,
        evolution_instance_id: instance.id,
        channel: "whatsapp_evolution",
        remote_jid: norm.remoteJid,
        ...(norm.lidJid ? { wa_lid: norm.lidJid.split("@")[0].split(":")[0] } : {}),
        push_name: norm.pushName || null,
        ...(audioTranscript ? { transcription: audioTranscript } : {}),
        ...(inboundMediaMeta ? { media: inboundMediaMeta } : {}),
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

  // PR-BDR-1: mensagem já persistida → leva a resposta da lead ao motor de cold
  // outreach (opt-out/cadência/handoff). `fromDigits` é o telefone só-dígitos do
  // remetente, formato que o on-inbound normaliza p/ platform_crm_lead_optout.
  const coldVerdict = await notifyColdOutreachInbound(supabase, {
    productId: (conversation.product_id as string | null) ?? productId,
    conversationId: String(conversation.id),
    telefone: fromDigits,
    // PR-BDR-11: com a transcrição, um "pare"/"me tira" FALADO em áudio também
    // chega ao detector de opt-out — antes o áudio era um "[áudio]" opaco que
    // nunca casava padrão nenhum.
    text: inboundContent || "[mensagem]",
  });

  // PR-BDR-4: cérebro SÓ depois do on-inbound e SÓ se não houve opt-out. A ordem
  // não é estética: quem pediu PARE não pode receber resposta da Duda, e é o
  // on-inbound que detecta o PARE (e fecha a conversa via silenceConversation).
  //
  // Veredito DESCONHECIDO (invoke falhou/rejeitou) NÃO vira opt-out presumido: o
  // opt-out nasce do TEXTO da lead, não da saúde do motor de cold outreach, e
  // presumir "pediu PARE" a cada falha de infra transformaria indisponibilidade
  // em silêncio para toda lead — que é a troca cara (silêncio perde venda).
  // Fica registrado alto para não ser uma decisão invisível.
  if (coldVerdict.optOut) {
    console.warn(
      `[platform-evolution-webhook] brain NÃO despachado (opt-out) conversation_id=${conversation.id} telefone=${fromDigits}`,
    );
  } else {
    if (!coldVerdict.ok) {
      console.error(
        `[platform-evolution-webhook] brain despachado SEM confirmação de opt-out conversation_id=${conversation.id} — o on-inbound do cold outreach não respondeu; se a lead pediu PARE, a supressão não foi aplicada`,
      );
    }
    await dispatchSalesBrain(String(conversation.id));
  }

  return ok({ stored: "inbound" });
}

// ============================================================================
// B3 — Prova de posse da instância (gate anti-injeção do webhook PÚBLICO)
// ----------------------------------------------------------------------------
// verify_jwt=false: qualquer um POSTa aqui. A ÚNICA prova de que o evento veio
// da NOSSA instância é o token que a Evolution API v2 ecoa no corpo de todo
// evento (campo `apikey` == platform_crm_evolution_instances.instance_token).
// Mesma régua da evolution-history-sync: comparação constante + lookup .eq()
// injection-safe (nunca instanceRef interpolado no .or()).
//
// Neste gêmeo da PLATAFORMA o gate roda ENFORCING (retorna 401 em token
// inválido): platform_crm_evolution_instances tem 0 instâncias hoje, logo não há
// ingestão legítima a quebrar. Quando instâncias forem criadas, precisam ter
// instance_token setado (mesma dependência do webhook do tenant).
/** Resolve a instância para o gate, sem interpolar input em filtros compostos. */
async function findWebhookInstance(
  supabase: any,
  instanceRef: string,
): Promise<any | null> {
  const selection = "*";
  let inst: any = null;
  for (
    const q of [
      supabase.from("platform_crm_evolution_instances").select(selection).eq(
        "instance_id",
        instanceRef,
      ).limit(1),
      supabase.from("platform_crm_evolution_instances").select(selection).eq(
        "name",
        instanceRef,
      ).limit(1),
      supabase.from("platform_crm_evolution_instances").select(selection).eq(
        "metadata->>instance_name",
        instanceRef,
      ).limit(1),
      supabase.from("platform_crm_evolution_instances").select(selection).eq(
        "metadata->>instance_uuid",
        instanceRef,
      ).limit(1),
    ]
  ) {
    const { data } = await q;
    if (data && data.length) {
      inst = data[0];
      break;
    }
  }
  return inst;
}

async function handleAuthorizedWebhook(
  supabase: any,
  _req: Request,
  payload: any,
  instance: any,
): Promise<Response> {
  const rawEvent = payload.event || payload.type || payload.Event;
  const rawInstance = extractInstance(payload);
  console.log(
    "[platform-evolution-webhook] raw event:",
    rawEvent,
    "instance:",
    rawInstance || "<MISSING>",
  );

  // ─── ACK DE ENTREGA → delivered_count (elos 3-4 da cadeia do wamid) ───────
  // ANTES do normalizePayload de propósito: MESSAGES_UPDATE cairia em 'unknown'
  // e seria descartado silenciosamente.
  //
  // POR QUE EXISTE: o kill-switch anti-ban por taxa de bloqueio/denúncia NÃO
  // PODE disparar — o WhatsApp não notifica nenhum dos dois. O único sinal real
  // de queima de número é a NÃO-ENTREGA: número saudável entrega quase tudo,
  // número queimando para de entregar. Sem este bloco, delivered_count fica em
  // zero e a regra de anti-ban.ts dorme (ela se cala quando `delivered` é
  // undefined — por desenho, pra não acusar quem não sabe).
  if (rawEvent === "messages.update" || rawEvent === "MESSAGES_UPDATE") {
    try {
      const d = payload.data || payload;
      const arr = Array.isArray(d?.messages) ? d.messages : [d];
      for (const m of arr) {
        const wamid: string | null = m?.key?.id ?? m?.keyId ?? null;
        // Só ACK de ENTREGA conta. 'sent' já foi contado no envio, e 'read' vem
        // DEPOIS de entregue — contar os dois somaria em dobro.
        const st = String(m?.status ?? m?.update?.status ?? "").toUpperCase();
        const entregue = st.includes("DELIVERY") || st === "DELIVERED" ||
          st === "2";
        if (!wamid || !entregue) continue;

        const { data: msg } = await supabase
          .from("platform_crm_messages")
          .select("metadata, created_at")
          .eq("metadata->>wamid", wamid)
          .eq("metadata->>connection_id", instance.id)
          .maybeSingle();
        const meta = (msg?.metadata ?? {}) as Record<string, unknown>;
        if (String(meta.connection_id ?? "") !== String(instance.id)) continue;
        const campaignId = meta.campaign_id as string | undefined;
        if (!campaignId) continue; // não é mensagem de campanha — nada a contar

        // ⚠️ O dia é o do ENVIO, não o do ACK. O ACK pode chegar no dia
        // seguinte, e a taxa sent/delivered só significa alguma coisa se as
        // duas pernas caírem no MESMO balde. Contar no dia do ACK inflaria a
        // não-entrega de ontem e a entrega de hoje — e não-entrega inflada
        // PAUSA CAMPANHA SAUDÁVEL, o modo de falha caro deste mecanismo.
        const day = String(msg?.created_at ?? "").slice(0, 10);
        if (!day) continue;

        await supabase.rpc("pcrm_cold_bump_counter", {
          p_campaign: campaignId,
          p_instance: instance.id,
          p_day: day,
          p_sent: 0,
          p_delivered: 1,
          p_blocked: 0,
          p_reported: 0,
          p_failed: 0,
        });
        console.log("[platform-evolution-webhook] delivered+1", {
          campaignId,
          day,
          wamid,
        });
      }
    } catch (e) {
      // NUNCA derrubar o webhook por causa de métrica: perder um ACK degrada a
      // medição; falhar aqui derrubaria a ingestão de mensagens REAIS.
      console.warn(
        "[platform-evolution-webhook] ACK de entrega falhou (non-fatal):",
        String(e).slice(0, 200),
      );
    }
    return new Response(
      JSON.stringify({ ok: true, handled: "delivery_ack" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const norm = normalizePayload(payload);
  if (!norm) {
    // Return 200 so Evolution Go does not retry indefinitely
    return new Response(
      JSON.stringify({ ok: true, ignored: "missing_instance" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Ciclo-de-vida da conexão apenas; demais eventos são ignorados aqui.
  if (norm.kind === "unknown") {
    return new Response(
      JSON.stringify({ ok: true, ignored_event: norm.event }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ---- MESSAGE (ingestão A1.3) ----
  if (norm.kind === "message") {
    return await handleMessage(supabase, instance, norm);
  }

  // ---- CONNECTION ----
  if (norm.kind === "connection") {
    const mapped = norm.state === "open"
      ? "connected"
      : norm.state === "connecting"
      ? "qr_pending"
      : "disconnected";
    const updates: any = { status: mapped };
    if (mapped === "connected") {
      updates.last_connected_at = new Date().toISOString();
      updates.qr_code = null;
      if (norm.phone) {
        updates.phone_number = String(norm.phone).split("@")[0].split(":")[0]
          .replace(/\D/g, "");
      }
    }
    await supabase.from("platform_crm_evolution_instances").update(updates)
      .eq("id", instance.id);
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
}

export function createPlatformEvolutionWebhookReceiver(
  createContext: () => any = () =>
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ),
): (request: Request) => Promise<Response> {
  return createPlatformEvolutionWebhookHandler({
    createContext,
    extractInstanceRef: (payload) => extractInstance(payload),
    findInstance: findWebhookInstance,
    handleAuthorized: (supabase, req, payload, instance) =>
      handleAuthorizedWebhook(supabase, req, payload, instance),
    // Nunca ecoar instance/event/body em falhas pré-gate: são controlados pelo
    // solicitante e o endpoint é público.
    logAuthFailure: (reason) =>
      console.warn(`[platform-evolution-webhook] 401 auth reason=${reason}`),
    logHandlerFailure: () =>
      console.error("[platform-evolution-webhook] request failed"),
    corsHeaders,
  });
}

if (import.meta.main) {
  Deno.serve(createPlatformEvolutionWebhookReceiver());
}
