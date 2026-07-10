// platform-webchat-inbox — INBOX do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `webchat-inbox` do CRM Vendus (lado AGENTE), desacoplado do tenant:
//   * Tabelas: platform_crm_conversations / platform_crm_messages /
//     platform_crm_leads / platform_crm_conversation_notes / platform_crm_lead_notes /
//     platform_crm_deals / platform_crm_pipeline_stages. SEM organization_id.
//   * Broadcast: canal `platform-conversation:{id}`, evento `new_message`, payload =
//     row completa de platform_crm_messages (+ client_temp_id quando enviado) —
//     exatamente o shape que `usePlatformCrmConversations.ts` deduplica por id.
//   * Auth: Bearer JWT do usuário validado via getClaims + gate super_admin em
//     user_roles (o original checava org-membership; aqui o "membership" é o papel).
//   * Escrita SEMPRE via SERVICE_ROLE (RLS não se aplica ao edge; gate em código).
//
// Actions portadas (nomes verbatim do original):
//   conversation, assign, send, close, accept, reopen, return-to-queue, resume,
//   link-lead, edit-message, delete-message, star-message, forward-message,
//   resend, set-product, activate-bot, ai-reactivate.
// REVIVAL onda 6 (infra que "não existia" no porte HOJE existe):
//   * resend      → reentrega uma mensagem outbound `delivery_status=failed` pelo
//                   MESMO Cloud API sender (deliverViaWhatsAppCloud), atualiza
//                   metadata e faz broadcast. Idempotência: só reenvia mensagens
//                   marcadas como failed (nunca duplica uma já entregue).
//   * set-product → vincula a conversa a um produto de `platform_crm_products`
//                   (coluna `product_id` existe na conversa; o sales-brain a usa
//                   para escolher persona/playbook). Diferença vs. tenant: o CRM da
//                   plataforma NÃO tem product_id no lead (schema anotado) — o
//                   vínculo é SÓ na conversa. product_id=null limpa o override.
//   * activate-bot / ai-reactivate → LIGA a IA (Duda) numa conversa. activate-bot
//                   alterna status→bot_active (devolve a conversa à IA, limpando o
//                   atendente) e dispara `platform-sales-brain` (que só roda em
//                   bot_active) para a IA reconectar. ai-reactivate dispara o
//                   cérebro SEM mudar de dono (reengajamento contextual). O sentido
//                   inverso (assumir manualmente → human_active) já mora em
//                   accept/assign/resume. Invocação do cérebro: x-brain-secret,
//                   MESMO contrato de platform-meta-whatsapp-webhook.
// Actions NÃO portadas (dependem de infra de tenant, inexistente na plataforma):
//   conversations/conversation_counts (RPCs SQL de listagem — a lista da plataforma
//   é client-side via RLS), trigger-flow (chat_flows = fase futura).
// Adaptações de schema (colunas ausentes em platform_crm_*):
//   * edited_at/original_content, delivery_status, forwarded_from_message_id →
//     persistidos dentro de `metadata` jsonb (sem migration).
//   * closed_at/closing_outcome/closing_reason/closing_value na conversa →
//     desfecho registrado como nota interna (platform_crm_conversation_notes)
//     + nota no lead, como o front (TODO(edge) do hook) espera.
//   * webchat_assignment_events → inexistente na plataforma; auditoria omitida.
//   * Assinatura do atendente (getAttendantSignature) → recurso de organização
//     do tenant; sem equivalente na plataforma.
//   * Roteamento de canal: conversas `channel='whatsapp'` (número de VENDAS,
//     Cloud API oficial) são ENTREGUES via Graph API na action `send` — a
//     connection ativa vem de platform_crm_whatsapp_meta_connections e o wamid
//     retornado vai no metadata (statuses do webhook atualizam por ele).
//     Instagram segue fase futura.
// A1.2 (2026-07-09) — mídia via storage + agendamento:
//   * send aceita `media: { bucket:'platform-crm-media', path, mimeType,
//     kind:'image'|'audio'|'video'|'document', filename?, caption? }` — a edge
//     resolve o objeto no bucket (signed URL p/ o fetch da Meta, que também
//     valida a existência do objeto; URL PÚBLICA estável persistida no metadata
//     — bucket é público, mesmo padrão do chat-media do tenant) e envia media
//     message na Graph API (`type`=image/audio/video/document + link).
//     Shape persistido ESPELHA o inbound (platform-meta-whatsapp-webhook):
//     content = caption||filename||`[kind]`, content_type = kind CRU (image/
//     audio/video/document — substitui o mapa antigo document→'file'; o caminho
//     legado `media:{url,kind}` segue aceito e não tinha consumidor), metadata
//     ganha wa_type + media{bucket,path,url,kind,mime,filename,caption,+extras}
//     — shape compatível campo a campo com PlatformCrmMediaPayload do front.
//     Idempotência por wamid: índice único uq_platform_crm_messages_wamid
//     (metadata->>'wamid') + wamid gravado pós-entrega. Erro da Graph NUNCA é
//     engolido: metadata.delivery_status='failed' + delivery_error (string) +
//     delivery_error_detail {code,subcode,fbtrace_id} e `delivery_warning` na
//     resposta (mensagem persiste; `resend` recupera).
//   * dispatch-scheduled → drena platform_crm_scheduled_messages vencidas
//     (claim atômico pending→sending por linha, padrão campaign-dispatcher) e
//     entrega pelo MESMO caminho do send (performOutboundSend). Auth: bearer
//     SERVICE_ROLE (cron pg_cron, migration 20260709) OU JWT super_admin.
//     Anti-duplicação: linha 'sending' presa >10min vira 'failed' SEM reenvio
//     (não dá pra saber se a Meta recebeu — resend manual na conversa decide).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { ensurePlatformLeadInPipeline } from '../_shared/platform-crm-pipeline.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE } from '../_shared/meta-graph.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Detalhe estruturado de erro da Graph API — NUNCA engolido (vai pro
 *  metadata.delivery_error_detail e pros logs). */
interface GraphDeliveryErrorDetail {
  message: string;
  code: number | null;
  subcode: number | null;
  fbtrace_id: string | null;
  http_status: number | null;
}

/**
 * Entrega uma mensagem outbound no WhatsApp Cloud API (número de VENDAS).
 * Mono-connection por ora: usa a connection `active` mais recente. Retorna o
 * wamid para casar com os statuses (sent/delivered/read) do webhook.
 *
 * Mídia: `media.url` é o link que a Meta baixa (signed URL do storage no
 * caminho novo; URL direta no legado). Caption: `media.caption` tem precedência,
 * senão `content` (compat com resend legado). Cloud API suporta caption em
 * image/video/document (audio NÃO) e filename só em document.
 */
async function deliverViaWhatsAppCloud(
  supabase: any,
  toPhone: string,
  content: string,
  media?: { kind: string; url: string; caption?: string | null; filename?: string | null } | null,
): Promise<{ wamid: string | null; error: string | null; errorDetail: GraphDeliveryErrorDetail | null }> {
  try {
    const { data: conn } = await supabase
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, phone_number_id, access_token_encrypted')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn?.access_token_encrypted || !conn?.phone_number_id) {
      return { wamid: null, error: 'no_active_connection', errorDetail: null };
    }
    const token = await decryptSecret(conn.access_token_encrypted as string);
    const to = String(toPhone ?? '').replace(/\D/g, '');
    if (!to) return { wamid: null, error: 'no_destination_phone', errorDetail: null };

    let payload: Record<string, unknown>;
    if (media?.url && media?.kind) {
      const typeMap: Record<string, string> = {
        image: 'image', audio: 'audio', video: 'video', document: 'document', sticker: 'image',
      };
      const waType = typeMap[media.kind] ?? 'document';
      const caption = String(media.caption ?? content ?? '').trim();
      const mediaObject: Record<string, unknown> = { link: media.url };
      if (caption && (waType === 'image' || waType === 'video' || waType === 'document')) {
        mediaObject.caption = caption;
      }
      if (waType === 'document' && media.filename) {
        mediaObject.filename = String(media.filename);
      }
      payload = { messaging_product: 'whatsapp', to, type: waType, [waType]: mediaObject };
    } else {
      payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: content } };
    }

    const res = await fetch(`${GRAPH_BASE}/${conn.phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const graphErr = data?.error ?? {};
      const detail: GraphDeliveryErrorDetail = {
        message: String(graphErr?.message ?? `graph ${res.status}`).slice(0, 300),
        code: typeof graphErr?.code === 'number' ? graphErr.code : null,
        subcode: typeof graphErr?.error_subcode === 'number' ? graphErr.error_subcode : null,
        fbtrace_id: graphErr?.fbtrace_id ? String(graphErr.fbtrace_id) : null,
        http_status: res.status,
      };
      console.error('[platform-webchat-inbox] entrega WhatsApp falhou:', JSON.stringify(detail));
      return { wamid: null, error: detail.message, errorDetail: detail };
    }
    return { wamid: data?.messages?.[0]?.id ?? null, error: null, errorDetail: null };
  } catch (e) {
    console.error('[platform-webchat-inbox] entrega WhatsApp exception:', e);
    return { wamid: null, error: String(e).slice(0, 300), errorDetail: null };
  }
}

/**
 * Broadcast realtime no canal da conversa da plataforma.
 * `platform-conversation:{id}` — MESMO canal/eventos que o front assina.
 */
async function broadcastToConversation(
  supabase: any,
  conversationId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  try {
    const channel = supabase.channel(`platform-conversation:${conversationId}`);
    await channel.send({ type: 'broadcast', event, payload });
    await supabase.removeChannel(channel);
  } catch (broadcastError) {
    console.error('[platform-webchat-inbox] broadcast error (non-fatal):', broadcastError);
  }
}

/**
 * Dispara o cérebro de IA (`platform-sales-brain`) para uma conversa — MESMO
 * contrato interno de `platform-meta-whatsapp-webhook` (auth por `x-brain-secret`,
 * config.toml verify_jwt=false). Fire-and-forget via EdgeRuntime.waitUntil quando
 * disponível, para não bloquear a resposta HTTP ao agente.
 *
 * O cérebro tem seus próprios gates (roda só em `status=bot_active`, canal
 * whatsapp, e ignora redeliveries/mensagens recentes) — aqui apenas o acordamos;
 * ele decide se e o que gerar. Falha é non-fatal (a ação de UI já persistiu).
 */
function triggerSalesBrain(conversationId: string): void {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
    if (!supabaseUrl || !brainSecret) {
      console.warn('[platform-webchat-inbox] sales-brain não disparado: URL/secret ausente');
      return;
    }
    const call = fetch(`${supabaseUrl}/functions/v1/platform-sales-brain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-brain-secret': brainSecret },
      body: JSON.stringify({ conversation_id: conversationId }),
    })
      .then(async (r) => {
        if (!r.ok) {
          console.error(
            '[platform-webchat-inbox] sales-brain retornou',
            r.status,
            (await r.text()).slice(0, 200),
          );
        }
      })
      .catch((e) => console.error('[platform-webchat-inbox] sales-brain fetch error:', e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(call);
    // Sem waitUntil (ex.: dev local), não damos await para não segurar a resposta —
    // o runtime encerra o request e o fetch já foi despachado.
  } catch (e) {
    console.error('[platform-webchat-inbox] triggerSalesBrain exception (non-fatal):', e);
  }
}

// ─── A1.2: mídia via storage + envio unificado + agendamento ────────────────

/** Bucket canônico de mídia do CRM da plataforma (migration 20260709). */
const PLATFORM_CRM_MEDIA_BUCKET = 'platform-crm-media';

/** Kinds aceitos no payload de mídia (contrato com a UI). */
const OUTBOUND_MEDIA_KINDS = new Set(['image', 'audio', 'video', 'document']);

/** Validade da signed URL usada pelo fetch da Meta (15 min é folga suficiente —
 *  a Meta baixa o link na hora do POST; NÃO é a URL persistida). */
const MEDIA_SIGNED_URL_TTL_SECONDS = 15 * 60;

/** Payload de mídia aceito pela action `send` (e pela linha agendada).
 *  Caminho novo: bucket+path (objeto no storage). Legado: url direta.
 *  Extras opcionais (size_bytes/duration_ms/width/height/thumbnail_url) são
 *  repassados ao metadata persistido — o renderer da UI
 *  (PlatformCrmMediaAttachment / PlatformCrmMediaPayload) os usa. */
interface OutboundMediaInput {
  bucket?: string;
  path?: string;
  mimeType?: string;
  kind: string;
  filename?: string | null;
  caption?: string | null;
  url?: string; // legado — URL direta, sem storage
  size_bytes?: number | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnail_url?: string | null;
}

/** Shape persistido em metadata.media — deliberadamente compatível campo a
 *  campo com PlatformCrmMediaPayload do front (kind/url/mime/filename/caption/
 *  size_bytes/duration_ms/width/height/thumbnail_url), pra UI fazer
 *  `media={metadata.media}` sem adaptação. bucket/path registram a origem. */
interface PersistedOutboundMedia {
  bucket: string | null;
  path: string | null;
  url: string;
  kind: string;
  mime: string | null;
  filename: string | null;
  caption: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  thumbnail_url: string | null;
}

interface ResolvedOutboundMedia {
  /** Link entregue à Meta (signed URL no caminho storage; a própria url no legado). */
  deliverUrl: string;
  /** Shape persistido em metadata.media — URL pública ESTÁVEL (bucket público). */
  persistMedia: PersistedOutboundMedia;
  /** content persistido — espelha o inbound: caption || filename || `[kind]`. */
  contentLabel: string;
  /** Caption efetiva enviada à Meta (caption do payload || content do send). */
  effectiveCaption: string;
}

/** Extras numéricos/URL do payload → persistidos como vieram (ou null). */
function pickMediaExtras(media: OutboundMediaInput): Pick<
  PersistedOutboundMedia,
  'size_bytes' | 'duration_ms' | 'width' | 'height' | 'thumbnail_url'
> {
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
  return {
    size_bytes: num(media?.size_bytes),
    duration_ms: num(media?.duration_ms),
    width: num(media?.width),
    height: num(media?.height),
    thumbnail_url: media?.thumbnail_url ? String(media.thumbnail_url) : null,
  };
}

/**
 * Valida e resolve o payload de mídia. Retorna erro ESTRUTURADO (nunca engole):
 * kind inválido, path suspeito, bucket fora do contrato ou objeto inexistente
 * no storage (createSignedUrl com service role falha se o objeto não existe —
 * validação de existência de graça antes de acionar a Meta).
 */
async function resolveOutboundMedia(
  supabase: any,
  media: OutboundMediaInput,
  content: string,
): Promise<{ resolved: ResolvedOutboundMedia | null; error: string | null; status: number }> {
  const kind = String(media?.kind ?? '');
  if (!OUTBOUND_MEDIA_KINDS.has(kind)) {
    return {
      resolved: null,
      error: `invalid_media_kind: '${kind}' (aceitos: image|audio|video|document)`,
      status: 400,
    };
  }

  const caption = String(media?.caption ?? '').trim();
  const effectiveCaption = caption || String(content ?? '').trim();
  const filename = media?.filename ? String(media.filename) : null;
  const contentLabel = effectiveCaption || filename || `[${kind}]`;
  const mimeType = media?.mimeType ? String(media.mimeType) : null;

  // Caminho novo: objeto no bucket platform-crm-media.
  if (media?.path) {
    const bucket = String(media.bucket ?? PLATFORM_CRM_MEDIA_BUCKET);
    if (bucket !== PLATFORM_CRM_MEDIA_BUCKET) {
      return {
        resolved: null,
        error: `invalid_media_bucket: '${bucket}' (esperado: ${PLATFORM_CRM_MEDIA_BUCKET})`,
        status: 400,
      };
    }
    const path = String(media.path).replace(/^\/+/, '');
    if (!path || path.includes('..')) {
      return { resolved: null, error: 'invalid_media_path', status: 400 };
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, MEDIA_SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      return {
        resolved: null,
        error: `media_not_found: ${bucket}/${path} (${signErr?.message ?? 'sem signed url'})`,
        status: 400,
      };
    }

    // URL pública estável (bucket é público — padrão chat-media): é o que a UI
    // renderiza pra sempre; a signed URL expira e serve só pro fetch da Meta.
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;

    return {
      resolved: {
        deliverUrl: signed.signedUrl as string,
        persistMedia: {
          bucket,
          path,
          url: publicUrl,
          kind,
          mime: mimeType,
          filename,
          caption: caption || null,
          ...pickMediaExtras(media),
        },
        contentLabel,
        effectiveCaption,
      },
      error: null,
      status: 200,
    };
  }

  // Legado: URL direta (sem storage) — comportamento pré-A1.2, sem consumidor
  // conhecido, mantido por compatibilidade.
  if (media?.url) {
    const url = String(media.url);
    return {
      resolved: {
        deliverUrl: url,
        persistMedia: {
          bucket: null,
          path: null,
          url,
          kind,
          mime: mimeType,
          filename,
          caption: caption || null,
          ...pickMediaExtras(media),
        },
        contentLabel,
        effectiveCaption,
      },
      error: null,
      status: 200,
    };
  }

  return { resolved: null, error: 'media_requires_path_or_url', status: 400 };
}

interface OutboundSendResult {
  ok: boolean;
  status: number;
  error?: string;
  message?: Record<string, unknown> | null;
  deliveryWarning?: string | null;
}

/**
 * Caminho ÚNICO de envio outbound — usado pela action `send` (agente na UI) e
 * pelo `dispatch-scheduled` (fila platform_crm_scheduled_messages). Semântica
 * IDÊNTICA ao send original: valida conversa → (auto-assign) → persiste em
 * platform_crm_messages → entrega via Cloud API quando channel='whatsapp' →
 * atualiza metadata (wamid | delivery failed) → broadcast `new_message`.
 *
 * `assumeConversation`: auto-assign + status human_active (comportamento do
 * send de agente). O dispatcher passa true quando a linha tem created_by (quem
 * agendou assume a conversa no disparo — mesmo efeito de ele ter enviado na
 * hora); sem created_by não há a quem atribuir e o status não é mexido.
 *
 * Broadcast `new_message` acontece AQUI (a UI só escuta broadcast, nunca
 * postgres_changes em messages) — `clientTempId` opcional entra no payload
 * para o front substituir a bolha otimista.
 */
async function performOutboundSend(
  supabase: any,
  opts: {
    conversationId: string;
    content: string;
    senderId: string | null;
    media?: OutboundMediaInput | null;
    replyToMessageId?: string | null;
    extraMetadata?: Record<string, unknown> | null;
    assumeConversation: boolean;
    clientTempId?: string | null;
  },
): Promise<OutboundSendResult> {
  const { data: conversation, error: convError } = await supabase
    .from('platform_crm_conversations')
    .select('id, assigned_to, status, channel, visitor_phone, visitor_whatsapp')
    .eq('id', opts.conversationId)
    .single();

  if (convError || !conversation) {
    return { ok: false, status: 404, error: 'Conversation not found' };
  }

  // Resolve mídia ANTES de persistir — payload inválido/objeto inexistente
  // devolve erro estruturado sem sujar o histórico da conversa.
  let resolvedMedia: ResolvedOutboundMedia | null = null;
  if (opts.media) {
    const { resolved, error: mediaErr, status } = await resolveOutboundMedia(
      supabase,
      opts.media,
      opts.content,
    );
    if (mediaErr || !resolved) {
      return { ok: false, status, error: mediaErr ?? 'invalid_media' };
    }
    resolvedMedia = resolved;
  }

  // Auto-assign if not assigned — atendente único: limpa IA (1:1 com o send).
  if (opts.assumeConversation && opts.senderId && !conversation.assigned_to) {
    await supabase
      .from('platform_crm_conversations')
      .update({
        assigned_to: opts.senderId,
        status: 'human_active',
        current_agent_id: null,
      })
      .eq('id', opts.conversationId);
  }

  const insertData: Record<string, unknown> = {
    conversation_id: opts.conversationId,
    direction: 'outbound',
    sender_type: 'agent',
    sender_id: opts.senderId,
    content: resolvedMedia ? resolvedMedia.contentLabel : (opts.content ?? ''),
  };
  if (opts.replyToMessageId) {
    insertData.reply_to_message_id = opts.replyToMessageId;
  }
  if (resolvedMedia) {
    // Espelha o shape do INBOUND (platform-meta-whatsapp-webhook): content_type
    // CRU (image|audio|video|document) + wa_type no metadata — a UI renderiza
    // enviado e recebido pelo mesmo caminho.
    insertData.content_type = resolvedMedia.persistMedia.kind;
    insertData.metadata = {
      media: resolvedMedia.persistMedia,
      wa_type: resolvedMedia.persistMedia.kind,
      delivery_status: 'sent',
    };
  } else {
    insertData.metadata = { delivery_status: 'sent' };
  }
  // Merge optional audit metadata. Nunca sobrepõe campos críticos.
  if (opts.extraMetadata && typeof opts.extraMetadata === 'object') {
    const safeExtra: Record<string, unknown> = { ...opts.extraMetadata };
    delete safeExtra.media;
    delete safeExtra.delivery_status;
    delete safeExtra.wa_type;
    insertData.metadata = { ...(insertData.metadata as Record<string, unknown>), ...safeExtra };
  }

  const { data: message, error: msgError } = await supabase
    .from('platform_crm_messages')
    .insert(insertData)
    .select('*')
    .single();

  if (msgError) {
    console.error('[platform-webchat-inbox] send insert error:', msgError);
    return { ok: false, status: 500, error: 'Failed to send message' };
  }

  // Update conversation — human_active só quando o envio é um ato de agente.
  await supabase
    .from('platform_crm_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      ...(opts.assumeConversation ? { status: 'human_active' } : {}),
    })
    .eq('id', opts.conversationId);

  // Entrega no canal externo: WhatsApp (Cloud API, número de vendas).
  let finalMessage = message;
  let deliveryWarning: string | null = null;
  if (conversation.channel === 'whatsapp') {
    const dest = conversation.visitor_whatsapp ?? conversation.visitor_phone ?? '';
    const { wamid, error: deliveryError, errorDetail } = await deliverViaWhatsAppCloud(
      supabase,
      dest,
      String(opts.content ?? ''),
      resolvedMedia
        ? {
            kind: resolvedMedia.persistMedia.kind,
            url: resolvedMedia.deliverUrl,
            caption: resolvedMedia.effectiveCaption || null,
            filename: resolvedMedia.persistMedia.filename,
          }
        : null,
    );
    const deliveryMeta = wamid
      ? { ...(message.metadata ?? {}), wamid, delivery_status: 'sent', channel: 'whatsapp_cloud' }
      : {
          ...(message.metadata ?? {}),
          delivery_status: 'failed',
          delivery_error: deliveryError,
          delivery_error_detail: errorDetail,
        };
    const { data: updated } = await supabase
      .from('platform_crm_messages')
      .update({ metadata: deliveryMeta })
      .eq('id', message.id)
      .select('*')
      .single();
    if (updated) finalMessage = updated;
    if (!wamid) {
      deliveryWarning = deliveryError ?? 'entrega falhou';
      console.error('[platform-webchat-inbox] WhatsApp NÃO entregue:', deliveryError);
    }
  }

  // Broadcast — SEMPRE, inclusive com delivery failed (a bolha mostra o estado).
  const broadcastPayload = opts.clientTempId
    ? { ...finalMessage, client_temp_id: opts.clientTempId }
    : finalMessage;
  await broadcastToConversation(supabase, opts.conversationId, 'new_message', broadcastPayload);

  return { ok: true, status: 200, message: broadcastPayload, deliveryWarning };
}

/** Máximo de agendadas processadas por tick (cron roda a cada minuto). */
const DISPATCH_SCHEDULED_DEFAULT_LIMIT = 20;
const DISPATCH_SCHEDULED_MAX_LIMIT = 50;

/** Linha presa em 'sending' além disso = dispatch morto no meio → 'failed' SEM
 *  reenvio (não dá pra provar que a Meta não recebeu; duplicar mensagem de
 *  venda é pior que pedir um resend manual). */
const DISPATCH_STALE_SENDING_MINUTES = 10;

/**
 * ACTION dispatch-scheduled — drena a fila platform_crm_scheduled_messages.
 * Auth própria (roda ANTES do gate global): bearer SERVICE_ROLE (cron pg_cron)
 * OU JWT super_admin (disparo manual). Claim atômico por linha
 * (pending→sending condicionado a status='pending' — padrão do
 * platform-campaign-dispatcher), envio pelo MESMO caminho do send.
 */
async function handleDispatchScheduled(
  req: Request,
  supabase: any,
  serviceRoleKey: string,
  bodyParsed: any,
): Promise<Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (token !== serviceRoleKey) {
    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      serviceRoleKey,
      bodyParsed,
    );
    if (errorResponse) return errorResponse;
    if (!user) return json({ error: 'Invalid token' }, 401);
  }

  const limit = Math.min(
    Math.max(Number(bodyParsed?.limit) || DISPATCH_SCHEDULED_DEFAULT_LIMIT, 1),
    DISPATCH_SCHEDULED_MAX_LIMIT,
  );
  const nowIso = new Date().toISOString();

  // 0) Sweep de órfãs: 'sending' presa >10min = tick anterior morreu no meio.
  //    Marca failed com motivo explícito — NUNCA reenvia automaticamente.
  const staleCutoff = new Date(Date.now() - DISPATCH_STALE_SENDING_MINUTES * 60_000).toISOString();
  const { data: staled } = await supabase
    .from('platform_crm_scheduled_messages')
    .update({
      status: 'failed',
      error:
        `dispatch interrompido (sending há mais de ${DISPATCH_STALE_SENDING_MINUTES}min) — ` +
        'não reenviado automaticamente para evitar duplicação; verifique a conversa e reagende se preciso',
    })
    .eq('status', 'sending')
    .lt('dispatched_at', staleCutoff)
    .select('id');
  if (staled?.length) {
    console.warn(
      '[platform-webchat-inbox] dispatch-scheduled: órfãs marcadas failed:',
      staled.map((s: { id: string }) => s.id),
    );
  }

  // 1) Candidatas vencidas.
  const { data: due, error: dueErr } = await supabase
    .from('platform_crm_scheduled_messages')
    .select('id')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  if (dueErr) {
    console.error('[platform-webchat-inbox] dispatch-scheduled list error:', dueErr);
    return json({ error: 'Failed to list scheduled messages', details: dueErr.message }, 500);
  }
  if (!due?.length) {
    return json({ processed: 0, sent: 0, failed: 0, stale_failed: staled?.length ?? 0 });
  }

  // 2) Claim atômico por linha: UPDATE ... WHERE id=X AND status='pending'.
  //    Linha pega por outro tick concorrente não retorna — nunca envia 2x.
  const claimed: Record<string, unknown>[] = [];
  for (const row of due) {
    const { data: got, error: claimErr } = await supabase
      .from('platform_crm_scheduled_messages')
      .update({ status: 'sending', dispatched_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('*');
    if (claimErr) {
      console.error('[platform-webchat-inbox] dispatch-scheduled claim error:', row.id, claimErr);
      continue;
    }
    if (got?.length) claimed.push(got[0]);
  }

  // 3) Envio — mesmo caminho do send. Falha de entrega = linha 'failed' com o
  //    motivo (a MENSAGEM fica persistida na conversa com delivery_status
  //    failed; o resend manual recupera sem duplicar a fila).
  let sentCount = 0;
  let failedCount = 0;
  const results: Array<Record<string, unknown>> = [];
  for (const sched of claimed) {
    let result: OutboundSendResult;
    const schedContent = String(sched.content ?? '');
    const schedMedia = (sched.media as OutboundMediaInput | null) ?? null;
    if (!schedContent.trim() && !schedMedia) {
      // Linha inválida (sem texto nem mídia) — falha SEM criar bolha vazia.
      result = { ok: false, status: 400, error: 'empty_scheduled_message: sem content e sem media' };
    } else {
      try {
        result = await performOutboundSend(supabase, {
          conversationId: String(sched.conversation_id),
          content: schedContent,
          senderId: (sched.created_by as string) ?? null,
          media: schedMedia,
          extraMetadata: { scheduled_message_id: sched.id, origin: 'scheduled' },
          assumeConversation: !!sched.created_by,
        });
      } catch (e) {
        result = { ok: false, status: 500, error: String(e).slice(0, 300) };
      }
    }

    if (result.ok && !result.deliveryWarning) {
      await supabase
        .from('platform_crm_scheduled_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', sched.id);
      sentCount++;
      results.push({ id: sched.id, status: 'sent', message_id: result.message?.id ?? null });
    } else {
      const reason = result.ok
        ? `whatsapp_delivery_failed: ${result.deliveryWarning} (message_id=${String(result.message?.id ?? '—')})`
        : String(result.error ?? 'unknown_error');
      await supabase
        .from('platform_crm_scheduled_messages')
        .update({ status: 'failed', error: reason.slice(0, 500) })
        .eq('id', sched.id);
      failedCount++;
      console.error('[platform-webchat-inbox] dispatch-scheduled falhou:', sched.id, reason);
      results.push({ id: sched.id, status: 'failed', error: reason.slice(0, 300) });
    }
  }

  return json({
    processed: claimed.length,
    sent: sentCount,
    failed: failedCount,
    stale_failed: staled?.length ?? 0,
    results,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');

    // Allow action via JSON body too (supabase.functions.invoke style) — 1:1 com o original.
    let bodyParsed: any = {};
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      try {
        bodyParsed = await req.clone().json();
      } catch (_) {
        /* no body or invalid json */
      }
    }
    if (!action && typeof bodyParsed?.action === 'string') {
      action = bodyParsed.action;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ACTION interna: dispatcher da fila de agendadas — auth PRÓPRIA (bearer
    // SERVICE_ROLE do cron OU JWT super_admin), roda antes do gate global
    // porque o cron não tem usuário nem actorUserId.
    if (action === 'dispatch-scheduled' && req.method === 'POST') {
      return await handleDispatchScheduled(req, supabase, supabaseKey, bodyParsed);
    }

    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      supabaseKey,
      bodyParsed,
    );
    if (errorResponse) return errorResponse;
    if (!user) return json({ error: 'Invalid token' }, 401);

    // ACTION: Get single conversation with messages
    if (action === 'conversation') {
      const conversationId = url.searchParams.get('id') || bodyParsed?.id;

      if (!conversationId) {
        return json({ error: 'Conversation ID is required' }, 400);
      }

      const [convRes, msgsRes] = await Promise.all([
        supabase
          .from('platform_crm_conversations')
          .select('*')
          .eq('id', conversationId)
          .maybeSingle(),
        supabase
          .from('platform_crm_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (convRes.error) {
        console.error('[platform-webchat-inbox] conversation query error:', conversationId, convRes.error);
        return json({ error: 'Failed to load conversation', details: convRes.error.message }, 500);
      }
      if (msgsRes.error) {
        console.error('[platform-webchat-inbox] messages query error:', conversationId, msgsRes.error);
      }

      const conversation: any = convRes.data;
      if (!conversation) {
        return json({ error: 'Conversation not found' }, 404);
      }

      // Hidrata o lead de forma defensiva (falha vira null, nunca derruba a conversa)
      if (conversation.lead_id) {
        const { data: lead } = await supabase
          .from('platform_crm_leads')
          .select('id, name, email, phone, temperature')
          .eq('id', conversation.lead_id)
          .maybeSingle();
        conversation.leads = lead || null;
      } else {
        conversation.leads = null;
      }

      const messages = (msgsRes.data || []).reverse();

      // Reset unread count em background (não bloqueia a resposta)
      supabase
        .from('platform_crm_conversations')
        .update({ unread_count_agents: 0 })
        .eq('id', conversationId)
        .then(() => {}, () => {});

      return json({ conversation, messages });
    }

    // ACTION: Assign conversation (take ownership)
    if (action === 'assign' && req.method === 'POST') {
      const conversationId = bodyParsed?.conversation_id;

      if (!conversationId) {
        return json({ error: 'Conversation ID is required' }, 400);
      }

      const { data: conversation, error: checkError } = await supabase
        .from('platform_crm_conversations')
        .select('assigned_to, status')
        .eq('id', conversationId)
        .single();

      if (checkError || !conversation) {
        return json({ error: 'Conversation not found' }, 404);
      }

      // Assign conversation (allow reassignment) — atendente único: limpa IA
      const { error: updateError } = await supabase
        .from('platform_crm_conversations')
        .update({
          assigned_to: user.id,
          status: 'human_active',
          current_agent_id: null,
        })
        .eq('id', conversationId);

      if (updateError) {
        return json({ error: 'Failed to assign - may already be taken' }, 409);
      }

      return json({ success: true });
    }

    // ACTION: Send message as agent (com broadcast `new_message`)
    // Payload: { conversation_id|conversationId, content, media?, reply_to_message_id?,
    //            metadata?, client_temp_id? } — media = { bucket:'platform-crm-media',
    //            path, mimeType, kind:'image'|'audio'|'video'|'document', filename?,
    //            caption? } (novo, via storage) OU { url, kind } (legado).
    if (action === 'send' && req.method === 'POST') {
      const body = bodyParsed || {};
      const conversationId = body.conversation_id ?? body.conversationId;

      // Aceita texto puro OU mídia. Se vier mídia, content pode ser '' (caption).
      const hasMedia =
        body.media && typeof body.media === 'object' &&
        (body.media.path || body.media.url) && body.media.kind;
      if (!conversationId || (!body.content && !hasMedia)) {
        return json({ error: 'conversation_id and content (or media) are required' }, 400);
      }

      const result = await performOutboundSend(supabase, {
        conversationId: String(conversationId),
        content: String(body.content ?? ''),
        senderId: user.id,
        media: hasMedia ? (body.media as OutboundMediaInput) : null,
        replyToMessageId: body.reply_to_message_id ?? null,
        extraMetadata:
          body.metadata && typeof body.metadata === 'object' ? body.metadata : null,
        assumeConversation: true,
        clientTempId: body.client_temp_id ?? null,
      });

      if (!result.ok || !result.message) {
        return json({ error: result.error ?? 'Failed to send message' }, result.status);
      }

      return json({
        message: result.message,
        ...(result.deliveryWarning ? { delivery_warning: result.deliveryWarning } : {}),
      });
    }

    // ACTION: Close conversation
    if (action === 'close' && req.method === 'POST') {
      const body = bodyParsed || {};

      if (!body.conversation_id) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      const closingOutcome: string | null = body.closing_outcome ?? null;
      const closingReason: string | null = body.closing_reason ?? null;
      const closingValueRaw = body.closing_value;
      const closingValue: number | null =
        closingValueRaw === null || closingValueRaw === undefined || closingValueRaw === ''
          ? null
          : Number(closingValueRaw);
      const stageId: string | null = body.stage_id ?? null;

      // Carrega conversa para descobrir o lead vinculado
      const { data: convRow } = await supabase
        .from('platform_crm_conversations')
        .select('id, lead_id, assigned_to, visitor_name')
        .eq('id', body.conversation_id)
        .maybeSingle();

      if (!convRow) {
        return json({ error: 'Conversation not found' }, 404);
      }

      const { error } = await supabase
        .from('platform_crm_conversations')
        .update({ status: 'closed' })
        .eq('id', body.conversation_id);

      if (error) {
        return json({ error: 'Failed to close conversation' }, 500);
      }

      // Pós-processamento: nota interna + mover lead no pipeline + nota + deal
      if (closingOutcome || closingReason) {
        try {
          // 1) Move lead para o estágio escolhido
          let stageName: string | null = null;
          if (stageId && convRow.lead_id) {
            const { data: stageRow } = await supabase
              .from('platform_crm_pipeline_stages')
              .select('id, name')
              .eq('id', stageId)
              .maybeSingle();
            if (stageRow?.id) {
              stageName = stageRow.name ?? null;
              await supabase
                .from('platform_crm_leads')
                .update({
                  current_stage_id: stageRow.id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', convRow.lead_id);

              // Auditoria (não-fatal)
              try {
                await supabase.from('platform_crm_lead_stage_history').insert({
                  lead_id: convRow.lead_id,
                  stage_id: stageRow.id,
                });
              } catch (_) { /* ignore */ }
            }
          }

          const outcomeLabel =
            closingOutcome === 'won' ? 'Ganho ✅'
            : closingOutcome === 'lost' ? 'Perdido ❌'
            : closingOutcome === 'no_deal' ? 'Sem negócio'
            : closingOutcome === 'other' ? 'Outro'
            : '—';

          const noteLines = [
            `🗂️ Conversa encerrada — Resultado: ${outcomeLabel}`,
            stageName ? `📊 Estágio: ${stageName}` : null,
            closingValue !== null && !isNaN(closingValue)
              ? `💰 Valor: R$ ${closingValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : null,
            closingReason ? `📝 Motivo: ${closingReason}` : null,
          ].filter(Boolean);

          // Desfecho SEMPRE registrado como nota interna da conversa (a tabela de
          // conversas da plataforma não tem colunas closing_* — adaptação anotada).
          await supabase.from('platform_crm_conversation_notes').insert({
            conversation_id: body.conversation_id,
            user_id: user.id,
            content: noteLines.join('\n'),
          });

          if (convRow.lead_id) {
            await supabase.from('platform_crm_lead_notes').insert({
              lead_id: convRow.lead_id,
              author_id: user.id,
              content: noteLines.join('\n'),
            });

            // Atualiza valor no lead se informado
            if (closingValue !== null && !isNaN(closingValue) && closingValue > 0) {
              await supabase
                .from('platform_crm_leads')
                .update({ deal_value: closingValue })
                .eq('id', convRow.lead_id);
            }

            // Move/atualiza deal mais recente do lead conforme resultado
            if (closingOutcome === 'won' || closingOutcome === 'lost') {
              const newStatus = closingOutcome === 'won' ? 'won' : 'lost';
              const { data: dealRow } = await supabase
                .from('platform_crm_deals')
                .select('id')
                .eq('lead_id', convRow.lead_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (dealRow?.id) {
                const dealUpdate: Record<string, unknown> = {
                  status: newStatus,
                  closed_at: new Date().toISOString(),
                };
                if (closingValue !== null && !isNaN(closingValue) && closingValue > 0) {
                  dealUpdate.deal_value = closingValue;
                }
                await supabase.from('platform_crm_deals').update(dealUpdate).eq('id', dealRow.id);
              }
            }
          }
        } catch (e) {
          console.error('[close] post-processing error', e);
        }
      }

      return json({ success: true });
    }

    // ACTION: Accept ticket (com takeover — todo usuário da plataforma é super_admin)
    if (action === 'accept' && req.method === 'POST') {
      const conversationId = bodyParsed?.conversation_id;

      if (!conversationId) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      const { data: convRow } = await supabase
        .from('platform_crm_conversations')
        .select('id, status, assigned_to, lead_id')
        .eq('id', conversationId)
        .maybeSingle();

      if (!convRow) {
        return json({ error: 'Conversation not found' }, 404);
      }

      // No original, admins podem assumir conversa de outro agente (takeover).
      // Na plataforma todo usuário autorizado é super_admin ⇒ takeover permitido.
      const previousAssignee = convRow.assigned_to;

      // Update conversation — atendente único: limpa IA
      const { error: upErr } = await supabase
        .from('platform_crm_conversations')
        .update({
          assigned_to: user.id,
          status: 'human_active',
          accepted_at: new Date().toISOString(),
          accepted_by: user.id,
          current_agent_id: null,
          needs_human: false,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (upErr) {
        console.error('[platform-webchat-inbox] accept update error:', upErr);
        return json({ error: 'Failed to accept ticket', details: upErr.message }, 500);
      }

      // System message
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      const sysMsg = previousAssignee && previousAssignee !== user.id
        ? `👮 ${profileRow?.full_name || 'Admin'} assumiu o atendimento`
        : `✋ ${profileRow?.full_name || 'Agente'} aceitou o atendimento`;
      const { data: sysMessage } = await supabase
        .from('platform_crm_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender_type: 'bot',
          content: sysMsg,
        })
        .select('*')
        .single();
      if (sysMessage) {
        await broadcastToConversation(supabase, conversationId, 'new_message', sysMessage);
      }

      // Vincular lead à carteira do vendedor que aceitou (se ainda não tiver dono)
      if (convRow.lead_id) {
        try {
          const { data: leadRow } = await supabase
            .from('platform_crm_leads')
            .select('id, assigned_to')
            .eq('id', convRow.lead_id)
            .maybeSingle();

          if (leadRow && !leadRow.assigned_to) {
            await supabase
              .from('platform_crm_leads')
              .update({ assigned_to: user.id, updated_at: new Date().toISOString() })
              .eq('id', leadRow.id);

            await supabase.from('platform_crm_lead_notes').insert({
              lead_id: leadRow.id,
              author_id: user.id,
              content: `Lead vinculado a ${profileRow?.full_name || 'agente'} ao aceitar atendimento`,
            });
          }

          // Garante que o lead entre no pipeline (primeiro estágio) — idempotente
          await ensurePlatformLeadInPipeline(supabase, convRow.lead_id);
        } catch (e) {
          console.warn('[platform-webchat-inbox] accept lead link non-fatal:', (e as Error).message);
        }
      }

      return json({ success: true, status: 'human_active' });
    }

    // ACTION: Reopen a closed conversation
    if (action === 'reopen' && req.method === 'POST') {
      const body = bodyParsed || {};

      if (!body.conversation_id) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      const { data: conv } = await supabase
        .from('platform_crm_conversations')
        .select('assigned_to, status')
        .eq('id', body.conversation_id)
        .single();

      if (!conv) {
        return json({ error: 'Conversation not found' }, 404);
      }

      // Reopening a closed conversation puts it back into the human queue
      // and clears the previous assignment so any agent can pick it up.
      const newStatus = 'waiting_human';

      await supabase
        .from('platform_crm_conversations')
        .update({
          status: newStatus,
          current_agent_id: null,
          assigned_to: null,
          needs_human: false,
        })
        .eq('id', body.conversation_id);

      // Insert system message
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const { data: sysMessage } = await supabase
        .from('platform_crm_messages')
        .insert({
          conversation_id: body.conversation_id,
          direction: 'outbound',
          sender_type: 'bot',
          content: `📋 Conversa reaberta por ${profileRow?.full_name || 'agente'}`,
        })
        .select('*')
        .single();
      if (sysMessage) {
        await broadcastToConversation(supabase, body.conversation_id, 'new_message', sysMessage);
      }

      return json({ success: true, status: newStatus });
    }

    // ACTION: Return conversation to queue
    if (action === 'return-to-queue' && req.method === 'POST') {
      const body = bodyParsed || {};

      if (!body.conversation_id) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      await supabase
        .from('platform_crm_conversations')
        .update({
          assigned_to: null,
          status: 'waiting_human',
          needs_human: true,
        })
        .eq('id', body.conversation_id);

      return json({ success: true });
    }

    // ACTION: Resume conversation (force status to human_active)
    if (action === 'resume' && req.method === 'POST') {
      const body = bodyParsed || {};

      if (!body.conversation_id) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      await supabase
        .from('platform_crm_conversations')
        .update({
          assigned_to: user.id,
          status: 'human_active',
        })
        .eq('id', body.conversation_id);

      return json({ success: true });
    }

    // ACTION: Link to lead (vincula ou cria platform_crm_lead a partir do visitante)
    if (action === 'link-lead' && req.method === 'POST') {
      const body = bodyParsed || {};

      if (!body.conversation_id) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      const { data: conversation, error: convError } = await supabase
        .from('platform_crm_conversations')
        .select('*')
        .eq('id', body.conversation_id)
        .single();

      if (convError || !conversation) {
        return json({ error: 'Conversation not found' }, 404);
      }

      let leadId = body.lead_id;

      // If no lead_id provided, create new lead
      if (!leadId) {
        const { data: newLead, error: leadError } = await supabase
          .from('platform_crm_leads')
          .insert({
            name: conversation.visitor_name || 'Visitante Web Chat',
            phone: conversation.visitor_phone || conversation.visitor_whatsapp || null,
            lead_channel: conversation.channel || 'web_chat',
            source: 'Chat da Plataforma',
            assigned_to: conversation.assigned_to || user.id,
          })
          .select()
          .single();

        if (leadError) {
          console.error('Error creating lead:', leadError);
          return json({ error: 'Failed to create lead' }, 500);
        }

        leadId = newLead.id;
      }

      // Link conversation to lead
      const { error: updateError } = await supabase
        .from('platform_crm_conversations')
        .update({ lead_id: leadId })
        .eq('id', body.conversation_id);

      if (updateError) {
        return json({ error: 'Failed to link lead' }, 500);
      }

      // Get the linked lead
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('*')
        .eq('id', leadId)
        .single();

      // Broadcast: notifica clientes que o detalhe da conversa mudou
      await broadcastToConversation(supabase, body.conversation_id, 'conversation_updated', {
        lead_id: leadId,
      });

      return json({ success: true, lead });
    }

    // ACTION: Edit message
    if (action === 'edit-message' && req.method === 'POST') {
      const body = bodyParsed || {};
      if (!body.message_id || !body.new_content) {
        return json({ error: 'message_id and new_content are required' }, 400);
      }

      const { data: origMsg } = await supabase
        .from('platform_crm_messages')
        .select('content, sender_id, sender_type, conversation_id, metadata')
        .eq('id', body.message_id)
        .single();

      if (!origMsg) {
        return json({ error: 'Message not found' }, 404);
      }

      // Only allow editing own agent messages
      if (origMsg.sender_type !== 'agent' || origMsg.sender_id !== user.id) {
        return json({ error: 'Can only edit your own messages' }, 403);
      }

      // Colunas original_content/edited_at não existem em platform_crm_messages —
      // histórico de edição vai para metadata (adaptação anotada; sem migration).
      const baseMeta = (origMsg.metadata as Record<string, unknown>) || {};
      const { error: updateError } = await supabase
        .from('platform_crm_messages')
        .update({
          content: body.new_content,
          metadata: {
            ...baseMeta,
            original_content: origMsg.content,
            edited_at: new Date().toISOString(),
          },
        })
        .eq('id', body.message_id);

      if (updateError) {
        return json({ error: 'Failed to edit message' }, 500);
      }

      return json({ success: true });
    }

    // ACTION: Delete message (soft delete)
    if (action === 'delete-message' && req.method === 'POST') {
      const body = bodyParsed || {};
      if (!body.message_id) {
        return json({ error: 'message_id is required' }, 400);
      }

      const { data: origMsg } = await supabase
        .from('platform_crm_messages')
        .select('sender_id, sender_type, conversation_id')
        .eq('id', body.message_id)
        .single();

      if (!origMsg) {
        return json({ error: 'Message not found' }, 404);
      }

      // Only allow deleting agent/bot messages
      if (origMsg.sender_type === 'visitor') {
        return json({ error: 'Cannot delete visitor messages' }, 403);
      }

      await supabase
        .from('platform_crm_messages')
        .update({ is_deleted: true })
        .eq('id', body.message_id);

      return json({ success: true });
    }

    // ACTION: Star/unstar message
    if (action === 'star-message' && req.method === 'POST') {
      const body = bodyParsed || {};
      if (!body.message_id) {
        return json({ error: 'message_id is required' }, 400);
      }

      const { data: msg } = await supabase
        .from('platform_crm_messages')
        .select('is_starred')
        .eq('id', body.message_id)
        .single();

      if (!msg) {
        return json({ error: 'Message not found' }, 404);
      }

      await supabase
        .from('platform_crm_messages')
        .update({ is_starred: !msg.is_starred })
        .eq('id', body.message_id);

      return json({ success: true, is_starred: !msg.is_starred });
    }

    // ACTION: Forward message to another conversation
    if (action === 'forward-message' && req.method === 'POST') {
      const body = bodyParsed || {};
      if (!body.message_id || !body.target_conversation_id) {
        return json({ error: 'message_id and target_conversation_id are required' }, 400);
      }

      const { data: origMsg } = await supabase
        .from('platform_crm_messages')
        .select('content')
        .eq('id', body.message_id)
        .single();

      if (!origMsg) {
        return json({ error: 'Message not found' }, 404);
      }

      // Verify target conversation exists
      const { data: targetConv } = await supabase
        .from('platform_crm_conversations')
        .select('id, channel')
        .eq('id', body.target_conversation_id)
        .single();

      if (!targetConv) {
        return json({ error: 'Target conversation not found' }, 404);
      }

      // Create forwarded message (coluna forwarded_from_message_id não existe na
      // plataforma — referência vai para metadata; adaptação anotada).
      const { data: fwdMsg } = await supabase
        .from('platform_crm_messages')
        .insert({
          conversation_id: body.target_conversation_id,
          direction: 'outbound',
          sender_type: 'agent',
          sender_id: user.id,
          content: origMsg.content,
          metadata: { forwarded_from_message_id: body.message_id },
        })
        .select('*')
        .single();

      // Update target conversation last_message_at
      await supabase
        .from('platform_crm_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', body.target_conversation_id);

      // Broadcast na conversa de destino — sem isso o front (que só escuta
      // broadcast, nunca postgres_changes em messages) não veria a mensagem.
      if (fwdMsg) {
        await broadcastToConversation(
          supabase,
          body.target_conversation_id,
          'new_message',
          fwdMsg,
        );
      }

      return json({ success: true, message: fwdMsg });
    }

    // ACTION: Resend — reentrega uma mensagem outbound que falhou.
    // Só age em mensagens com metadata.delivery_status='failed' (idempotente: uma
    // mensagem já entregue nunca é reenviada). Reusa o Cloud API sender e atualiza
    // o metadata in-place (sem criar mensagem nova), depois faz broadcast para a
    // bolha refletir o novo estado (sent/failed).
    if (action === 'resend' && req.method === 'POST') {
      const body = bodyParsed || {};
      if (!body.message_id) {
        return json({ error: 'message_id is required' }, 400);
      }

      const { data: msg, error: msgErr } = await supabase
        .from('platform_crm_messages')
        .select('id, conversation_id, direction, content, content_type, metadata')
        .eq('id', body.message_id)
        .maybeSingle();

      if (msgErr || !msg) {
        return json({ error: 'Message not found' }, 404);
      }
      if (msg.direction !== 'outbound') {
        return json({ error: 'Only outbound messages can be resent' }, 400);
      }

      const meta = (msg.metadata as Record<string, any>) || {};
      if (meta.delivery_status !== 'failed') {
        // Não reenvia o que não falhou — evita duplicar entregas.
        return json(
          { error: 'Message is not in a failed state', delivery_status: meta.delivery_status ?? null },
          409,
        );
      }

      // Descobre canal/destino pela conversa.
      const { data: conv, error: convErr } = await supabase
        .from('platform_crm_conversations')
        .select('id, channel, visitor_phone, visitor_whatsapp')
        .eq('id', msg.conversation_id)
        .maybeSingle();

      if (convErr || !conv) {
        return json({ error: 'Conversation not found' }, 404);
      }
      if (conv.channel !== 'whatsapp') {
        return json({ error: 'Resend disponível apenas para WhatsApp por ora' }, 400);
      }

      const dest = conv.visitor_whatsapp ?? conv.visitor_phone ?? '';
      const media = meta.media && typeof meta.media === 'object' ? meta.media : null;
      const { wamid, error: deliveryError, errorDetail } = await deliverViaWhatsAppCloud(
        supabase,
        dest,
        String(msg.content ?? ''),
        media,
      );

      const newMeta = wamid
        ? {
            ...meta,
            wamid,
            delivery_status: 'sent',
            channel: 'whatsapp_cloud',
            resent_at: new Date().toISOString(),
            // limpa o erro anterior ao ter sucesso. USAR null (não undefined):
            // o metadata é persistido via JSON, e JSON.stringify DROPA chaves
            // undefined — o que deixaria o delivery_error velho (herdado de
            // ...meta) intacto no banco. null sobrescreve de verdade.
            delivery_error: null,
            delivery_error_detail: null,
          }
        : {
            ...meta,
            delivery_status: 'failed',
            delivery_error: deliveryError,
            delivery_error_detail: errorDetail,
            resent_at: new Date().toISOString(),
          };

      const { data: updated } = await supabase
        .from('platform_crm_messages')
        .update({ metadata: newMeta })
        .eq('id', msg.id)
        .select('*')
        .single();

      const finalMessage = updated ?? { ...msg, metadata: newMeta };

      // Broadcast para a conversa: o front escuta `new_message` e deduplica por id,
      // então uma re-emissão da MESMA mensagem (id igual) atualiza a bolha existente.
      await broadcastToConversation(supabase, msg.conversation_id, 'new_message', finalMessage);

      if (!wamid) {
        console.error('[platform-webchat-inbox] resend NÃO entregue:', deliveryError);
        return json(
          { message: finalMessage, delivery_warning: deliveryError ?? 'entrega falhou' },
          200,
        );
      }
      return json({ success: true, message: finalMessage });
    }

    // ACTION: Set product — vincula/limpa o produto da conversa.
    // A coluna `product_id` existe em platform_crm_conversations e é lida pelo
    // sales-brain para escolher persona/playbook. product_id=null limpa o override.
    // (No CRM da plataforma o LEAD não tem product_id — vínculo só na conversa.)
    if (action === 'set-product' && req.method === 'POST') {
      const body = bodyParsed || {};
      const conversationId = body.conversation_id;
      const productId = body.product_id ?? null; // null = limpar

      if (!conversationId) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      const { data: conv, error: convErr } = await supabase
        .from('platform_crm_conversations')
        .select('id')
        .eq('id', conversationId)
        .maybeSingle();

      if (convErr || !conv) {
        return json({ error: 'Conversation not found' }, 404);
      }

      // Se um produto foi passado, valida que existe (RLS super_admin já isola).
      if (productId) {
        const { data: prod } = await supabase
          .from('platform_crm_products')
          .select('id')
          .eq('id', productId)
          .maybeSingle();
        if (!prod) {
          return json({ error: 'Invalid product' }, 400);
        }
      }

      const { error: upErr } = await supabase
        .from('platform_crm_conversations')
        .update({ product_id: productId })
        .eq('id', conversationId);

      if (upErr) {
        console.error('[platform-webchat-inbox] set-product update error:', upErr);
        return json({ error: upErr.message }, 500);
      }

      // Notifica clientes em realtime (mesmo evento que link-lead usa p/ detalhe).
      await broadcastToConversation(supabase, conversationId, 'conversation_updated', {
        product_id: productId,
      });

      return json({ success: true, product_id: productId });
    }

    // ACTION: Activate bot — DEVOLVE a conversa à IA (Duda).
    // Alterna status→bot_active, limpa o atendente (assigned_to/current_agent_id) e
    // acorda o sales-brain (que só age em bot_active) para reconectar com o lead.
    // É o botão "assumir/devolver" que o Marcelo mais sente falta — este é o lado
    // "devolver pra IA"; o lado "assumir manualmente" já é accept/assign/resume.
    if (action === 'activate-bot' && req.method === 'POST') {
      const body = bodyParsed || {};
      if (!body.conversation_id) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      const { data: conv, error: convErr } = await supabase
        .from('platform_crm_conversations')
        .select('id, status, channel')
        .eq('id', body.conversation_id)
        .maybeSingle();

      if (convErr || !conv) {
        return json({ error: 'Conversation not found' }, 404);
      }

      const { error: upErr } = await supabase
        .from('platform_crm_conversations')
        .update({
          status: 'bot_active',
          assigned_to: null,
          current_agent_id: null,
          needs_human: false,
        })
        .eq('id', body.conversation_id);

      if (upErr) {
        console.error('[platform-webchat-inbox] activate-bot update error:', upErr);
        return json({ error: 'Failed to activate bot', details: upErr.message }, 500);
      }

      // System message (nome do agente que devolveu à IA).
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      const { data: sysMessage } = await supabase
        .from('platform_crm_messages')
        .insert({
          conversation_id: body.conversation_id,
          direction: 'outbound',
          sender_type: 'bot',
          content: `🤖 IA reativada por ${profileRow?.full_name || 'agente'} — atendimento devolvido à Duda`,
        })
        .select('*')
        .single();
      if (sysMessage) {
        await broadcastToConversation(supabase, body.conversation_id, 'new_message', sysMessage);
      }

      // Notifica a mudança de status/dono no detalhe.
      await broadcastToConversation(supabase, body.conversation_id, 'conversation_updated', {
        status: 'bot_active',
        assigned_to: null,
      });

      // Acorda o cérebro para (opcionalmente) reengajar. Gates ficam no brain.
      triggerSalesBrain(body.conversation_id);

      return json({ success: true, status: 'bot_active' });
    }

    // ACTION: AI reactivate — reengajamento contextual SEM trocar de dono.
    // Não altera o status (a conversa pode seguir em bot_active); apenas acorda o
    // sales-brain para gerar/entregar uma mensagem de reativação. Se a conversa
    // estiver com humano (human_active/waiting_human), o próprio brain faz skip —
    // por isso, para um reengajamento efetivo, a UI só oferece isto quando a IA
    // está atendendo (senão o caminho é activate-bot).
    if (action === 'ai-reactivate' && req.method === 'POST') {
      const body = bodyParsed || {};
      if (!body.conversation_id) {
        return json({ error: 'conversation_id is required' }, 400);
      }

      const { data: conv, error: convErr } = await supabase
        .from('platform_crm_conversations')
        .select('id, status')
        .eq('id', body.conversation_id)
        .maybeSingle();

      if (convErr || !conv) {
        return json({ error: 'Conversation not found' }, 404);
      }

      // Acorda o cérebro (fire-and-forget). O brain decide se gera algo conforme
      // seus próprios gates (bot_active, whatsapp, sem mensagem recente do bot).
      triggerSalesBrain(body.conversation_id);

      return json({ success: true, triggered: true, status: conv.status });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Error in platform-webchat-inbox:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
