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
//   é client-side via RLS).
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
//     Conversas `channel='instagram'` (DMs entradas pelo platform-instagram-
//     webhook) são ENTREGUES via Graph DM (deliverViaInstagram — POST
//     /{fb_page_id}/messages com page token, node IDÊNTICO ao instagram-send
//     do Vendus V5) pelo MESMO caminho único (performOutboundSend + resend).
//     ig_mid no metadata espelha o inbound; fora da janela 24h a Graph recusa
//     → delivery_status='failed' + delivery_error_detail (resend recupera
//     quando o cliente reabrir a janela). Caption em attachment NÃO existe no
//     IG (só WhatsApp) — fica persistida, não entregue.
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
// ONDA-2b/INBOX-EDGE (2026-07-10) — 3 capacidades ADITIVAS (contratos antigos intactos):
//   * trigger-flow { conversation_id, flow_id } → carrega platform_crm_chat_flows,
//     acha o 1º passo "enviável" (message/buttons/video) a partir de start_block_id
//     e ENTREGA pelo caminho único do send (performOutboundSend; Cloud API quando
//     whatsapp) como sender_type='bot'. Estado do fluxo persistido na conversa em
//     `orchestrator_state` jsonb (coluna por migration PARALELA) com fallback à
//     coluna `metadata` e, na ausência de ambas, console.warn (a 1ª msg já saiu).
//     Execução dos passos SEGUINTES = fase futura (o estado guarda o ponteiro).
//   * ai-reactivate ESTENDIDO { agent_id?, objective?, mode?, extra_context? }:
//     payload legado ({conversation_id}) = comportamento IDÊNTICO ao anterior
//     (acorda o platform-sales-brain, fire-and-forget). mode='direct' gera UMA
//     mensagem AQUI na edge (persona = platform_crm_agent_configs.persona_prompt
//     quando agent_id vier + objective + extra_context + últimas 20 msgs; gateway
//     env AI_API_KEY/AI_GATEWAY_URL — mesmo transporte do platform-sales-copilot)
//     e entrega via performOutboundSend como bot (ato explícito do operador,
//     independe dos gates do brain). mode='conversational' (default) mantém o
//     fluxo do brain; os campos extras são REPASSADOS no POST (`reactivation`) —
//     o brain de hoje os ignora; consumo é extensão futura dele.
//   * followup-ai-draft { conversation_id, objective? } → rascunho RICO
//     { draft, summary, strategy, strategy_label, warnings } SEM enviar nada
//     (consumidor: PlatformCrmFollowupAIDialog; espelho do followup-ai-draft do
//     Vendus v5, adaptado às tabelas platform_crm_* e ao gateway da plataforma).
//   * accept ganha `sector_id?` opcional (A1): valida o setor (400 se inexistente)
//     e o enforcement de membros — setor COM membros e aceitante fora deles →
//     403 {error:'usuario nao pertence ao setor', sector_name}; setor SEM membros
//     cadastrados = aberto (sem bloqueio). sector_id persistido na conversa em
//     update SEPARADO best-effort (coluna por migration paralela — ausência nunca
//     derruba o aceite). Transferências (accept/assign que mudam o dono) são
//     registradas em platform_crm_conversation_transfers (insert best-effort —
//     tabela por migration paralela; falha vira console.warn).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { ensurePlatformLeadInPipeline } from '../_shared/platform-crm-pipeline.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE, graphFetch, GraphError } from '../_shared/meta-graph.ts';

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
 * Conversa de Instagram? Detecção deliberadamente redundante (channel OU
 * visitor_id com prefixo 'ig:' OU vínculo com conexão IG) — conversa antiga
 * sem alguma das marcas ainda entrega. Guarda dura: `channel='whatsapp'`
 * NUNCA cai aqui (o caminho Cloud API tem precedência e fica intacto).
 */
function isInstagramConversation(conv: {
  channel?: string | null;
  visitor_id?: string | null;
  instagram_connection_id?: string | null;
}): boolean {
  if (conv?.channel === 'whatsapp') return false;
  return (
    conv?.channel === 'instagram' ||
    String(conv?.visitor_id ?? '').startsWith('ig:') ||
    !!conv?.instagram_connection_id
  );
}

/**
 * Entrega uma mensagem outbound numa DM do Instagram — semântica COPIADA do
 * `instagram-send` do Vendus V5: POST /{fb_page_id}/messages (page access
 * token da conexão; node é a PÁGINA, não /me nem o ig_business_account_id),
 * body { recipient:{id:IGSID}, messaging_type:'RESPONSE', message:{...} }.
 * IGSID = visitor_id sem o prefixo 'ig:'. Retorna o message_id da Graph
 * (ig_mid) — mesmo campo de idempotência do inbound (metadata->>ig_mid).
 *
 * Conexão: a da conversa (canal-por-conversa, A1.3); fallback: a única
 * `active` mais recente (mono-connection, mesmo padrão do WhatsApp acima).
 *
 * Janela 24h: SEM pré-check aqui — a RPC platform_crm_is_within_24h_window é
 * consumida pelo FRONT como aviso; no edge, fora da janela a Graph recusa
 * (code 10 / subcode 2018278) e o erro vai ESTRUTURADO pro
 * delivery_error_detail, igual ao padrão WhatsApp (mensagem persiste como
 * failed; resend recupera quando o cliente reabrir a janela).
 *
 * Mídia: attachment { type, payload:{ url, is_reusable:false } } — kinds do
 * inbox (image|audio|video|document) mapeados pro vocabulário do IG
 * (document→file). O IG NÃO aceita caption em attachment (diferente do
 * WhatsApp) — caption fica só no metadata persistido, nunca é entregue.
 */
async function deliverViaInstagram(
  supabase: any,
  conversation: {
    visitor_id?: string | null;
    instagram_connection_id?: string | null;
  },
  content: string,
  media?: { kind?: string | null; url?: string | null } | null,
): Promise<{
  igMid: string | null;
  connectionId: string | null;
  error: string | null;
  errorDetail: GraphDeliveryErrorDetail | null;
}> {
  let connectionId: string | null = null;
  try {
    let conn: Record<string, any> | null = null;
    if (conversation.instagram_connection_id) {
      const { data } = await supabase
        .from('platform_crm_instagram_connections')
        .select('id, fb_page_id, page_access_token_encrypted, status')
        .eq('id', conversation.instagram_connection_id)
        .maybeSingle();
      conn = data ?? null;
    }
    if (!conn) {
      const { data } = await supabase
        .from('platform_crm_instagram_connections')
        .select('id, fb_page_id, page_access_token_encrypted, status')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      conn = data ?? null;
    }
    if (!conn?.page_access_token_encrypted || !conn?.fb_page_id) {
      return { igMid: null, connectionId: null, error: 'no_active_instagram_connection', errorDetail: null };
    }
    connectionId = String(conn.id);
    if (conn.status !== 'active') {
      return { igMid: null, connectionId, error: 'instagram_connection_inactive', errorDetail: null };
    }

    const igsid = String(conversation.visitor_id ?? '').replace(/^ig:/, '').trim();
    if (!igsid) {
      return { igMid: null, connectionId, error: 'no_destination_igsid', errorDetail: null };
    }

    const token = await decryptSecret(String(conn.page_access_token_encrypted));

    const message: Record<string, unknown> = {};
    if (media?.url && media?.kind) {
      const igTypeMap: Record<string, string> = {
        image: 'image', audio: 'audio', video: 'video', document: 'file', sticker: 'image',
      };
      message.attachment = {
        type: igTypeMap[String(media.kind)] ?? 'file',
        payload: { url: String(media.url), is_reusable: false },
      };
    } else {
      message.text = String(content ?? '');
    }
    const payload = {
      recipient: { id: igsid },
      messaging_type: 'RESPONSE',
      message,
    };

    const res = await graphFetch<{ message_id?: string }>(
      `/${conn.fb_page_id}/messages`,
      token,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return { igMid: res?.message_id ?? null, connectionId, error: null, errorDetail: null };
  } catch (e) {
    if (e instanceof GraphError) {
      const detail: GraphDeliveryErrorDetail = {
        message: String(e.graph?.message ?? e.message).slice(0, 300),
        code: typeof e.graph?.code === 'number' ? e.graph.code : null,
        subcode: typeof e.graph?.error_subcode === 'number' ? e.graph.error_subcode : null,
        fbtrace_id: e.graph?.fbtrace_id ? String(e.graph.fbtrace_id) : null,
        http_status: e.status,
      };
      console.error('[platform-webchat-inbox] entrega Instagram falhou:', JSON.stringify(detail));
      return { igMid: null, connectionId, error: detail.message, errorDetail: detail };
    }
    console.error('[platform-webchat-inbox] entrega Instagram exception:', e);
    return { igMid: null, connectionId, error: String(e).slice(0, 300), errorDetail: null };
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
function triggerSalesBrain(conversationId: string, extra?: Record<string, unknown>): void {
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
      // `extra` (ONDA-2b): campos adicionais repassados ao brain — hoje ele lê só
      // conversation_id e IGNORA o resto (aditivo/forward-compatible por contrato).
      body: JSON.stringify({ conversation_id: conversationId, ...(extra ?? {}) }),
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
    /** ONDA-2b: quem "fala" na bolha. Default 'agent' (comportamento original —
     *  send do agente e dispatch-scheduled inalterados). 'bot' = fluxo/IA
     *  (trigger-flow, ai-reactivate direct) — mesma entrega, autor correto. */
    senderType?: 'agent' | 'bot';
  },
): Promise<OutboundSendResult> {
  const { data: conversation, error: convError } = await supabase
    .from('platform_crm_conversations')
    .select('id, assigned_to, status, channel, visitor_phone, visitor_whatsapp, visitor_id, instagram_connection_id')
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
    sender_type: opts.senderType ?? 'agent',
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

  // Entrega no canal externo: Instagram (Graph DM) — branch NOVO; os caminhos
  // whatsapp/webchat acima ficam intactos. Metadata espelha o INBOUND
  // (platform-instagram-webhook): ig_mid + channel:'instagram' + connection_id
  // — mesmo campo de idempotência (metadata->>ig_mid) e mesmo vocabulário que
  // a UI já lê nas mensagens recebidas.
  if (isInstagramConversation(conversation)) {
    const { igMid, connectionId, error: deliveryError, errorDetail } = await deliverViaInstagram(
      supabase,
      conversation,
      String(opts.content ?? ''),
      resolvedMedia
        ? { kind: resolvedMedia.persistMedia.kind, url: resolvedMedia.deliverUrl }
        : null,
    );
    const deliveryMeta = igMid
      ? {
          ...(finalMessage.metadata ?? {}),
          ig_mid: igMid,
          delivery_status: 'sent',
          channel: 'instagram',
          ...(connectionId ? { connection_id: connectionId } : {}),
        }
      : {
          ...(finalMessage.metadata ?? {}),
          delivery_status: 'failed',
          delivery_error: deliveryError,
          delivery_error_detail: errorDetail,
          ...(connectionId ? { connection_id: connectionId } : {}),
        };
    const { data: updated } = await supabase
      .from('platform_crm_messages')
      .update({ metadata: deliveryMeta })
      .eq('id', message.id)
      .select('*')
      .single();
    if (updated) finalMessage = updated;
    if (!igMid) {
      deliveryWarning = deliveryError ?? 'entrega falhou';
      console.error('[platform-webchat-inbox] Instagram NÃO entregue:', deliveryError);
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

// ─── ONDA-2b: helpers compartilhados (IA da plataforma / transcript / auditoria) ──

/** Modelo default das chamadas de IA desta edge (mesmo default do copilot). */
const INBOX_AI_DEFAULT_MODEL = 'google/gemini-2.5-flash';

/**
 * Chamada de IA da PLATAFORMA — mesmo transporte do platform-sales-copilot /
 * platform-sales-brain: gateway env-driven (AI_GATEWAY_URL, default OpenRouter)
 * com chave única AI_API_KEY (a plataforma não tem roteamento por organização —
 * o `_shared/ai-call.ts` é org-scoped e não se aplica aqui). Erro NUNCA engolido:
 * volta estruturado { ok:false, status, error } com status coerente (429/402/…).
 */
async function platformAiComplete(opts: {
  label: string;
  messages: Array<{ role: string; content: string }>;
  responseJson?: boolean;
  temperature?: number;
}): Promise<
  | { ok: true; content: string; model: string }
  | { ok: false; status: number; error: string }
> {
  const apiKey = Deno.env.get('AI_API_KEY') ?? '';
  if (!apiKey) {
    console.error(`[platform-webchat-inbox] ${opts.label}: AI_API_KEY não configurada.`);
    return { ok: false, status: 500, error: 'AI_API_KEY não configurada na plataforma.' };
  }
  const gatewayBase = (Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = Deno.env.get('AI_SALES_COPILOT_MODEL') ?? INBOX_AI_DEFAULT_MODEL;

  const payload: Record<string, unknown> = {
    model,
    messages: opts.messages,
    stream: false,
  };
  if (opts.responseJson) payload.response_format = { type: 'json_object' };
  if (typeof opts.temperature === 'number') payload.temperature = opts.temperature;

  const response = await fetch(`${gatewayBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`[platform-webchat-inbox] ${opts.label} AI gateway error:`, response.status, errText.slice(0, 300));
    if (response.status === 429) {
      return { ok: false, status: 429, error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' };
    }
    if (response.status === 402) {
      return { ok: false, status: 402, error: 'Créditos de IA esgotados. Adicione créditos na conta do gateway.' };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, error: 'Chave do gateway de IA (AI_API_KEY) inválida ou sem permissão.' };
    }
    return { ok: false, status: 502, error: `Erro do provedor de IA: ${errText.slice(0, 200) || response.statusText}` };
  }

  const completion = await response.json().catch(() => null);
  const content: string = completion?.choices?.[0]?.message?.content?.trim?.() ?? '';
  if (!content) {
    console.error(`[platform-webchat-inbox] ${opts.label} completion vazia:`, JSON.stringify(completion)?.slice(0, 300));
    return { ok: false, status: 502, error: 'O modelo não retornou conteúdo. Tente novamente.' };
  }
  return { ok: true, content, model };
}

/** Últimas N mensagens VIVAS da conversa, em ordem cronológica (asc). */
async function loadConversationTranscriptRows(
  supabase: any,
  conversationId: string,
  limit = 20,
): Promise<Array<Record<string, any>>> {
  const { data } = await supabase
    .from('platform_crm_messages')
    .select('content, sender_type, content_type, created_at')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (((data as Array<Record<string, any>>) ?? [])
    .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0))
    .reverse();
}

/** Transcript legível pro prompt — mesmo formato do followup-ai-draft do V5. */
function formatConversationTranscript(
  msgs: Array<Record<string, any>>,
  visitorLabel: string,
): string {
  return msgs
    .map((m) => {
      const who = m.sender_type === 'visitor'
        ? `[LEAD] ${visitorLabel}`
        : m.sender_type === 'agent'
          ? '[VENDEDOR]'
          : '[BOT]';
      const ct = m.content_type && m.content_type !== 'text' ? `(${m.content_type}) ` : '';
      return `${who}: ${ct}${String(m.content ?? '').slice(0, 400)}`;
    })
    .join('\n');
}

/**
 * A1: auditoria de transferência de atendimento. A tabela
 * `platform_crm_conversation_transfers` chega por migration PARALELA — insert
 * best-effort: ausência de tabela/coluna vira console.warn, NUNCA erro pro
 * chamador (o aceite/assign já aconteceu). Shape modelado no
 * `conversation_transfers` do tenant (from/to/created_by) + sector_id.
 */
async function recordConversationTransfer(
  supabase: any,
  entry: {
    conversation_id: string;
    from_user_id: string | null;
    to_user_id: string | null;
    sector_id?: string | null;
    created_by: string;
  },
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      conversation_id: entry.conversation_id,
      from_user_id: entry.from_user_id,
      to_user_id: entry.to_user_id,
      created_by: entry.created_by,
    };
    // Coluna real da tabela é `to_sector_id` (setor de destino) — não `sector_id`.
    // Sem o mapeamento correto o insert falhava e o evento de handoff nunca era
    // registrado quando havia setor, esvaziando a timeline de atendentes.
    if (entry.sector_id) row.to_sector_id = entry.sector_id;
    const { error } = await supabase.from('platform_crm_conversation_transfers').insert(row);
    if (error) {
      console.warn(
        '[platform-webchat-inbox] transferência não registrada (migration paralela pendente?):',
        error.message,
      );
    }
  } catch (e) {
    console.warn('[platform-webchat-inbox] transferência não registrada (exception):', e);
  }
}

// ─── ONDA-2b/B4: action trigger-flow ─────────────────────────────────────────

/** Guarda anti-loop na caminhada de blocos do fluxo. */
const FLOW_WALK_MAX_HOPS = 20;

/** Shape mínimo do bloco do FlowBuilder (jsonb `blocks` de
 *  platform_crm_chat_flows — ver src/types/chatFlow.ts: FlowBlock). */
interface FlowBlockLike {
  id?: string;
  type?: string;
  data?: Record<string, any>;
  next_block_id?: string | null;
}

/**
 * Renderiza o texto "enviável" de um bloco. Só message/buttons/video produzem
 * texto de abertura; input/delay/tag/handoff/ai_takeover não (executor completo
 * dos passos = fase futura). Botões viram lista numerada (entrega WhatsApp é
 * texto puro por ora — sem interactive buttons da Cloud API nesta onda).
 */
function renderFlowBlockText(block: FlowBlockLike): string | null {
  const data = block?.data ?? {};
  if (block.type === 'message') {
    const t = String(data.content ?? '').trim();
    return t || null;
  }
  if (block.type === 'buttons') {
    const base = String(data.content ?? '').trim();
    const labels = Array.isArray(data.buttons)
      ? data.buttons
          .map((b: Record<string, any>) => String(b?.label ?? '').trim())
          .filter((l: string) => l.length > 0)
          .map((l: string, i: number) => `${i + 1}) ${l}`)
      : [];
    const txt = [base, ...labels].filter(Boolean).join('\n');
    return txt || null;
  }
  if (block.type === 'video') {
    const url = String(data.video_url ?? '').trim();
    if (!url) return null;
    const title = String(data.video_title ?? '').trim();
    return title ? `${title}\n${url}` : url;
  }
  return null;
}

/**
 * Caminha do start_block_id (fallback: primeiro bloco do array) seguindo
 * next_block_id até achar o 1º bloco com texto enviável. Anti-loop por Set de
 * ids visitados + teto de hops.
 */
function pickFirstSendableFlowStep(
  blocks: FlowBlockLike[],
  startBlockId: string | null,
): { block: FlowBlockLike; text: string } | null {
  const byId = new Map<string, FlowBlockLike>();
  for (const b of blocks) {
    if (b && typeof b.id === 'string') byId.set(b.id, b);
  }
  let current: FlowBlockLike | undefined =
    (startBlockId ? byId.get(startBlockId) : undefined) ?? blocks[0];
  const seen = new Set<string>();
  let hops = 0;
  while (current && hops < FLOW_WALK_MAX_HOPS) {
    if (typeof current.id === 'string') {
      if (seen.has(current.id)) break; // loop no grafo — para
      seen.add(current.id);
    }
    const text = renderFlowBlockText(current);
    if (text) return { block: current, text };
    const nextId: string | null = current.next_block_id ?? null;
    current = nextId ? byId.get(nextId) : undefined;
    hops++;
  }
  return null;
}

/**
 * Persiste o estado do fluxo na conversa. Coluna canônica: `orchestrator_state`
 * jsonb (migration PARALELA — pode não existir ainda). Fallback: coluna
 * `metadata`. Sem ambas: console.warn e segue (a 1ª mensagem JÁ foi entregue —
 * o botão Fluxo disparou; só o ponteiro de continuação fica pendente).
 */
async function persistConversationFlowState(
  supabase: any,
  conversationId: string,
  state: Record<string, unknown>,
): Promise<'orchestrator_state' | 'metadata' | null> {
  const { error: e1 } = await (supabase.from('platform_crm_conversations') as any)
    .update({ orchestrator_state: { flow: state } })
    .eq('id', conversationId);
  if (!e1) return 'orchestrator_state';
  const { error: e2 } = await (supabase.from('platform_crm_conversations') as any)
    .update({ metadata: { orchestrator_flow: state } })
    .eq('id', conversationId);
  if (!e2) return 'metadata';
  console.warn(
    '[platform-webchat-inbox] trigger-flow: estado do fluxo NÃO persistido (colunas orchestrator_state/metadata ausentes?):',
    e1?.message,
    '|',
    e2?.message,
  );
  return null;
}

/**
 * ACTION trigger-flow — { conversation_id, flow_id } (contrato do
 * PlatformCrmSendFlowDialog). Execução MÍNIMA real: carrega o fluxo, acha o 1º
 * passo enviável e o ENTREGA pelo caminho único do send (Cloud API quando a
 * conversa é whatsapp; persistência + broadcast sempre), registrando o estado
 * na conversa. Nota deliberada: o V5 só gravava current_flow_id sem enviar nada
 * — aqui a spec da onda manda o botão Fluxo DISPARAR a 1ª mensagem de verdade.
 */
async function handleTriggerFlow(
  supabase: any,
  user: { id: string },
  body: Record<string, any>,
): Promise<Response> {
  const conversationId = body?.conversation_id;
  const flowId = body?.flow_id;
  if (!conversationId || !flowId) {
    return json({ error: 'conversation_id and flow_id are required' }, 400);
  }

  const { data: conv, error: convErr } = await supabase
    .from('platform_crm_conversations')
    .select('id, channel, status')
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return json({ error: 'Conversation not found' }, 404);
  }

  const { data: flow, error: flowErr } = await supabase
    .from('platform_crm_chat_flows')
    .select('id, name, blocks, start_block_id')
    .eq('id', flowId)
    .maybeSingle();
  if (flowErr || !flow) {
    return json({ error: 'Flow not found' }, 404);
  }

  const blocks = (Array.isArray(flow.blocks) ? flow.blocks : []) as FlowBlockLike[];
  const step = pickFirstSendableFlowStep(blocks, (flow.start_block_id as string | null) ?? null);
  if (!step) {
    return json(
      {
        error:
          'flow_has_no_sendable_first_step: o fluxo não tem bloco inicial com conteúdo enviável (message/buttons/video)',
      },
      422,
    );
  }

  // Marco interno na timeline (paridade V5) — não vai pro canal externo.
  const { data: sysMessage } = await supabase
    .from('platform_crm_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'outbound',
      sender_type: 'bot',
      content: `📋 Fluxo "${flow.name}" iniciado`,
    })
    .select('*')
    .single();
  if (sysMessage) {
    await broadcastToConversation(supabase, conversationId, 'new_message', sysMessage);
  }

  // 1ª mensagem do fluxo — MESMO caminho do send (entrega + persistência + broadcast).
  const result = await performOutboundSend(supabase, {
    conversationId: String(conversationId),
    content: step.text,
    senderId: null,
    senderType: 'bot',
    assumeConversation: false,
    extraMetadata: {
      origin: 'flow',
      flow_id: flowId,
      flow_block_id: step.block.id ?? null,
      triggered_by: user.id,
    },
  });
  if (!result.ok || !result.message) {
    return json({ error: result.error ?? 'Failed to send flow message' }, result.status);
  }

  const flowState = {
    flow_id: flowId,
    flow_name: flow.name,
    current_block_id: step.block.id ?? null,
    next_block_id: step.block.next_block_id ?? null,
    variables: {},
    status: 'active',
    started_at: new Date().toISOString(),
    started_by: user.id,
  };
  const statePersistedIn = await persistConversationFlowState(supabase, conversationId, flowState);

  return json({
    success: true,
    flow_id: flowId,
    flow_name: flow.name,
    message: result.message,
    state_persisted_in: statePersistedIn,
    ...(result.deliveryWarning ? { delivery_warning: result.deliveryWarning } : {}),
  });
}

// ─── ONDA-2b/B5: ai-reactivate estendido + followup-ai-draft ────────────────

/**
 * ACTION ai-reactivate — retrocompatível.
 * Payload: { conversation_id, agent_id?, objective?, mode?: 'direct'|'conversational',
 *            extra_context? }.
 *  - Sem campos novos → comportamento de HOJE, byte a byte: acorda o
 *    platform-sales-brain (fire-and-forget) e devolve {success,triggered,status}.
 *  - mode='conversational' (default) com campos novos → mesmo fluxo do brain; os
 *    extras vão no POST (campo `reactivation`) — o brain atual os ignora
 *    (consumo = extensão futura DELE; esta edge não toca o brain nesta onda).
 *  - mode='direct' → UMA mensagem gerada aqui (persona_prompt de
 *    platform_crm_agent_configs quando agent_id vier) e enviada como bot pelo
 *    caminho único do send. Ato explícito do operador: NÃO passa pelos gates de
 *    status do brain (funciona mesmo fora de bot_active).
 */
async function handleAiReactivate(
  supabase: any,
  user: { id: string },
  body: Record<string, any>,
): Promise<Response> {
  if (!body.conversation_id) {
    return json({ error: 'conversation_id is required' }, 400);
  }

  const { data: conv, error: convErr } = await supabase
    .from('platform_crm_conversations')
    .select('id, status, channel, visitor_name, lead_id')
    .eq('id', body.conversation_id)
    .maybeSingle();
  if (convErr || !conv) {
    return json({ error: 'Conversation not found' }, 404);
  }

  const agentId: string | null = body.agent_id ? String(body.agent_id) : null;
  const objective = String(body.objective ?? '').trim();
  const extraContext = String(body.extra_context ?? '').trim();
  const mode: 'direct' | 'conversational' = body.mode === 'direct' ? 'direct' : 'conversational';

  // Persona do pipeline ÚNICO da plataforma (agent_id explícito do operador).
  let persona: { id: string; name: string; persona_prompt: string | null } | null = null;
  if (agentId) {
    const { data: agentRow } = await supabase
      .from('platform_crm_agent_configs')
      .select('id, name, persona_prompt')
      .eq('id', agentId)
      .maybeSingle();
    if (!agentRow) {
      return json({ error: 'Agent not found', agent_id: agentId }, 404);
    }
    persona = agentRow as { id: string; name: string; persona_prompt: string | null };
  }

  if (mode !== 'direct') {
    // Comportamento atual (acorda o cérebro; gates ficam nele). Extras repassados.
    const extras = agentId || objective || extraContext
      ? {
          reactivation: {
            agent_id: agentId,
            objective: objective || null,
            extra_context: extraContext || null,
            requested_by: user.id,
          },
        }
      : undefined;
    triggerSalesBrain(String(body.conversation_id), extras);
    return json({ success: true, triggered: true, status: conv.status });
  }

  // mode='direct': gera e envia UMA mensagem única aqui na edge.
  const msgs = await loadConversationTranscriptRows(supabase, String(body.conversation_id), 20);
  let leadName: string | null = conv.visitor_name ?? null;
  if (!leadName && conv.lead_id) {
    const { data: lead } = await supabase
      .from('platform_crm_leads')
      .select('name')
      .eq('id', conv.lead_id)
      .maybeSingle();
    leadName = lead?.name ?? null;
  }
  const transcript = formatConversationTranscript(msgs, leadName ?? 'Cliente');

  const personaBlock = persona
    ? `Você é ${persona.name}.${persona.persona_prompt ? `\n${persona.persona_prompt}` : ''}`
    : 'Você é atendente de vendas por WhatsApp da plataforma NexvyBeauty.';
  const systemPrompt = `${personaBlock}
${objective ? `\nOBJETIVO DESTA REATIVAÇÃO: ${objective}` : ''}
${extraContext ? `\nCONTEXTO EXTRA DO OPERADOR:\n${extraContext}` : ''}

Sua tarefa: escrever UMA ÚNICA mensagem de reativação de WhatsApp para o cliente abaixo, retomando a conversa de onde parou.
Regras duras: pt-BR; máximo ~300 caracteres; tom humano e direto; no máximo 1 pergunta; sem listas, sem markdown, sem asteriscos; no máximo 1 emoji; NUNCA revele que é IA; NUNCA invente preços ou dados do produto.
Responda SOMENTE com o texto da mensagem, sem aspas nem comentários.`;
  const userPrompt = `CLIENTE: ${leadName ?? '-'}

HISTÓRICO DA CONVERSA (mais antiga → mais recente):
${transcript || '(sem mensagens)'}

Escreva agora a mensagem de reativação.`;

  const ai = await platformAiComplete({
    label: 'ai-reactivate-direct',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
  });
  if (!ai.ok) return json({ error: ai.error }, ai.status);

  const content = ai.content.slice(0, 1000);
  const result = await performOutboundSend(supabase, {
    conversationId: String(body.conversation_id),
    content,
    senderId: null,
    senderType: 'bot',
    assumeConversation: false,
    extraMetadata: {
      origin: 'ai-reactivate-direct',
      requested_by: user.id,
      ...(persona ? { agent_id: persona.id, agent_name: persona.name } : {}),
      ...(objective ? { objective } : {}),
    },
  });
  if (!result.ok || !result.message) {
    return json({ error: result.error ?? 'Failed to send reactivation message' }, result.status);
  }

  return json({
    success: true,
    mode: 'direct',
    message: result.message,
    model: ai.model,
    ...(result.deliveryWarning ? { delivery_warning: result.deliveryWarning } : {}),
  });
}

/** Estratégias do rascunho de follow-up (espelho do followup-ai-draft do V5). */
const FOLLOWUP_STRATEGY_LABEL: Record<string, string> = {
  reengage_silence: 'Retomar após silêncio',
  break_objection: 'Quebrar objeção',
  force_next_step: 'Forçar próximo passo',
  revive_interest: 'Reaquecer interesse',
  answer_pending_question: 'Responder dúvida pendente',
  propose_meeting: 'Propor reunião',
};

/**
 * ACTION followup-ai-draft — { conversation_id, objective? } → rascunho RICO
 * { draft, summary, strategy, strategy_label, warnings } SEM enviar nada (o
 * operador revisa no PlatformCrmFollowupAIDialog e envia pelo send normal).
 * Contexto = últimas ~20 msgs + lead (estágio/temperatura/notas) + produto.
 */
async function handleFollowupAiDraft(
  supabase: any,
  body: Record<string, any>,
): Promise<Response> {
  const conversationId = body?.conversation_id;
  if (!conversationId) {
    return json({ error: 'conversation_id is required' }, 400);
  }
  const objective = String(body?.objective ?? '').trim();

  const { data: conv, error: convErr } = await supabase
    .from('platform_crm_conversations')
    .select('id, lead_id, channel, status, product_id, visitor_name, visitor_phone')
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr || !conv) {
    return json({ error: 'Conversation not found' }, 404);
  }

  const msgs = await loadConversationTranscriptRows(supabase, String(conversationId), 20);

  // Lead + estágio + notas (tudo best-effort — falha vira contexto ausente).
  let lead: Record<string, any> | null = null;
  if (conv.lead_id) {
    const { data } = await supabase
      .from('platform_crm_leads')
      .select('id, name, email, phone, temperature, deal_value, current_stage_id')
      .eq('id', conv.lead_id)
      .maybeSingle();
    lead = (data as Record<string, any> | null) ?? null;
  }
  let stageName: string | null = null;
  if (lead?.current_stage_id) {
    const { data: stage } = await supabase
      .from('platform_crm_pipeline_stages')
      .select('name')
      .eq('id', lead.current_stage_id)
      .maybeSingle();
    stageName = stage?.name ?? null;
  }
  let notes: string[] = [];
  if (lead?.id) {
    const { data: n } = await supabase
      .from('platform_crm_lead_notes')
      .select('content')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(3);
    notes = ((n as Array<Record<string, any>>) ?? []).map((r) => String(r.content || '').slice(0, 200));
  }

  let productCtx = '';
  if (conv.product_id) {
    const { data: prod } = await supabase
      .from('platform_crm_products')
      .select('name, pitch_15s, differentials')
      .eq('id', conv.product_id)
      .maybeSingle();
    if (prod) {
      productCtx = `Produto: ${prod.name}. Pitch: ${prod.pitch_15s || '-'}. Diferenciais: ${
        Array.isArray(prod.differentials) ? prod.differentials.slice(0, 5).join('; ') : '-'
      }.`;
    }
  }

  const visitorName = conv.visitor_name || lead?.name || 'Cliente';
  const transcript = formatConversationTranscript(msgs, visitorName);
  const lastAgentSamples = msgs
    .filter((m) => m.sender_type === 'agent')
    .slice(-4)
    .map((m) => m.content)
    .filter(Boolean);

  const systemPrompt = `Você é um copywriter de vendas consultivas (SPIN). Vai escrever UMA mensagem de WhatsApp, FINGINDO ser o próprio vendedor, para reengajar um lead. JAMAIS revele que é IA. JAMAIS use clichês ("tudo bem?", "passando para saber", "como posso ajudar"). Máx 500 caracteres. Tom direto, humano, profissional, espelha o vocabulário do vendedor. Permitido no máx 1 emoji (opcional). Em português BR.
${objective ? `\nOBJETIVO DO VENDEDOR PARA ESTE FOLLOW-UP: ${objective}\n` : ''}
ESTRATÉGIAS POSSÍVEIS (escolha a melhor pro contexto):
- reengage_silence: lead sumiu há tempo, retomar sem cobrar.
- break_objection: lead levantou objeção (preço/tempo/dúvida) e ficou parado — endereçar.
- force_next_step: lead engajou, falta CTA pra avançar (proposta, reunião, link).
- revive_interest: lead esfriou — trazer prova/benefício novo.
- answer_pending_question: o lead fez pergunta sem resposta — responda e devolva CTA.
- propose_meeting: contexto pede agendamento → sugerir reunião curta (sem oferecer horários específicos no texto).

RESPONDA APENAS JSON VÁLIDO no formato:
{"summary":"resumo em 2-3 frases do estado real da conversa", "strategy":"<key>", "draft":"texto pronto pra enviar", "warnings":["..."]}`;

  const userPrompt = `CONTEXTO DO LEAD
Nome: ${visitorName}
Telefone: ${conv.visitor_phone || lead?.phone || '-'}
Estágio: ${stageName || '-'}
Temperatura: ${lead?.temperature ?? '-'}
Valor da oportunidade: ${lead?.deal_value ?? '-'}
${productCtx}
${notes.length ? `Notas recentes: ${notes.join(' | ')}` : ''}

ÚLTIMAS MENSAGENS DO VENDEDOR (para espelhar tom):
${lastAgentSamples.join('\n---\n') || '(sem amostras)'}

HISTÓRICO DA CONVERSA (mais antiga → mais recente):
${transcript || '(sem mensagens)'}

Devolva o JSON pedido. Nada além do JSON.`;

  const ai = await platformAiComplete({
    label: 'followup-ai-draft',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    responseJson: true,
    temperature: 0.7,
  });
  if (!ai.ok) return json({ error: ai.error }, ai.status);

  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(ai.content);
  } catch {
    const m = ai.content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        /* JSON irrecuperável — tratado abaixo pelo draft vazio */
      }
    }
  }

  const draft = String(parsed.draft ?? parsed.draft_message ?? '').trim().slice(0, 800);
  if (!draft) {
    console.error(
      '[platform-webchat-inbox] followup-ai-draft sem draft no JSON:',
      ai.content.slice(0, 300),
    );
    return json({ error: 'A IA não retornou rascunho válido. Tente novamente.' }, 502);
  }
  const summary = String(parsed.summary ?? '').trim().slice(0, 400);
  const strategy =
    typeof parsed.strategy === 'string' && parsed.strategy in FOLLOWUP_STRATEGY_LABEL
      ? parsed.strategy
      : 'reengage_silence';

  return json({
    success: true,
    draft,
    summary,
    strategy,
    strategy_label: FOLLOWUP_STRATEGY_LABEL[strategy],
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.slice(0, 5).map((w: unknown) => String(w))
      : [],
    model: ai.model,
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

      // A1 (ONDA-2b): auditoria de transferência quando o dono mudou (best-effort;
      // tabela platform_crm_conversation_transfers chega por migration paralela).
      if (conversation.assigned_to !== user.id) {
        await recordConversationTransfer(supabase, {
          conversation_id: conversationId,
          from_user_id: conversation.assigned_to ?? null,
          to_user_id: user.id,
          created_by: user.id,
        });
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

      // A1 (ONDA-2b): setor OPCIONAL no aceite — valida ANTES de tocar a conversa.
      // Enforcement: setor COM membros cadastrados exige que o aceitante seja um
      // deles; setor SEM membros = aberto (sem bloqueio). Falha de leitura dos
      // membros NÃO bloqueia o aceite (fail-open com warn — a fonte é migration
      // recente e indisponibilidade não pode travar atendimento em produção).
      const sectorId: string | null = bodyParsed?.sector_id ? String(bodyParsed.sector_id) : null;
      let sectorName: string | null = null;
      if (sectorId) {
        const { data: sectorRow } = await supabase
          .from('platform_crm_sectors')
          .select('id, name')
          .eq('id', sectorId)
          .maybeSingle();
        if (!sectorRow) {
          return json({ error: 'Invalid sector' }, 400);
        }
        sectorName = sectorRow.name ?? null;

        const { data: memberRows, error: memberErr } = await supabase
          .from('platform_crm_sector_members')
          .select('user_id')
          .eq('sector_id', sectorId);
        if (memberErr) {
          console.warn(
            '[platform-webchat-inbox] accept: leitura de membros do setor falhou — enforcement pulado:',
            memberErr.message,
          );
        } else {
          const members = (memberRows as Array<{ user_id: string }>) ?? [];
          if (members.length > 0 && !members.some((m) => m.user_id === user.id)) {
            return json({ error: 'usuario nao pertence ao setor', sector_name: sectorName }, 403);
          }
        }
      }

      // No original, admins podem assumir conversa de outro agente (takeover).
      // Na plataforma todo usuário autorizado é super_admin ⇒ takeover permitido.
      // `force` (contrato 7): sinal explícito de takeover vindo do AcceptTicketDialog.
      const forceTakeover = bodyParsed?.force === true;
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

      // A1: persiste o setor escolhido na conversa. UPDATE SEPARADO e best-effort
      // de propósito: a coluna sector_id chega por migration PARALELA — a ausência
      // dela não pode derrubar um aceite já efetivado.
      if (sectorId) {
        const { error: sectorErr } = await (supabase.from('platform_crm_conversations') as any)
          .update({ sector_id: sectorId })
          .eq('id', conversationId);
        if (sectorErr) {
          console.warn(
            '[platform-webchat-inbox] accept: sector_id não persistido (coluna por migration paralela?):',
            sectorErr.message,
          );
        }
      }

      // A1: auditoria de transferência (tabela por migration paralela; best-effort).
      // Registra quando o dono efetivamente mudou OU quando um setor foi definido.
      if (previousAssignee !== user.id || sectorId) {
        await recordConversationTransfer(supabase, {
          conversation_id: conversationId,
          from_user_id: previousAssignee ?? null,
          to_user_id: user.id,
          sector_id: sectorId,
          created_by: user.id,
        });
      }

      // System message
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      const isTakeover = forceTakeover || (!!previousAssignee && previousAssignee !== user.id);
      const sysMsg = isTakeover
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
    // mensagem já entregue nunca é reenviada). Reusa o sender do canal (Cloud API
    // no WhatsApp; Graph DM no Instagram) e atualiza o metadata in-place (sem
    // criar mensagem nova), depois faz broadcast para a bolha refletir o novo
    // estado (sent/failed).
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
        .select('id, channel, visitor_phone, visitor_whatsapp, visitor_id, instagram_connection_id')
        .eq('id', msg.conversation_id)
        .maybeSingle();

      if (convErr || !conv) {
        return json({ error: 'Conversation not found' }, 404);
      }

      // Instagram — reentrega via Graph DM (branch NOVO; o caminho WhatsApp
      // abaixo fica intacto). metadata.media persistido tem a URL pública
      // estável do bucket — entregável direto, mesmo padrão do resend WhatsApp.
      if (isInstagramConversation(conv)) {
        const igMedia = meta.media && typeof meta.media === 'object' ? meta.media : null;
        const { igMid, connectionId, error: deliveryError, errorDetail } = await deliverViaInstagram(
          supabase,
          conv,
          String(msg.content ?? ''),
          igMedia,
        );
        const newMeta = igMid
          ? {
              ...meta,
              ig_mid: igMid,
              delivery_status: 'sent',
              channel: 'instagram',
              ...(connectionId ? { connection_id: connectionId } : {}),
              resent_at: new Date().toISOString(),
              // null (não undefined) — mesmo motivo do caminho WhatsApp abaixo:
              // JSON.stringify dropa undefined e deixaria o erro velho no banco.
              delivery_error: null,
              delivery_error_detail: null,
            }
          : {
              ...meta,
              delivery_status: 'failed',
              delivery_error: deliveryError,
              delivery_error_detail: errorDetail,
              ...(connectionId ? { connection_id: connectionId } : {}),
              resent_at: new Date().toISOString(),
            };

        const { data: updated } = await supabase
          .from('platform_crm_messages')
          .update({ metadata: newMeta })
          .eq('id', msg.id)
          .select('*')
          .single();
        const finalIgMessage = updated ?? { ...msg, metadata: newMeta };
        await broadcastToConversation(supabase, msg.conversation_id, 'new_message', finalIgMessage);

        if (!igMid) {
          console.error('[platform-webchat-inbox] resend Instagram NÃO entregue:', deliveryError);
          return json(
            { message: finalIgMessage, delivery_warning: deliveryError ?? 'entrega falhou' },
            200,
          );
        }
        return json({ success: true, message: finalIgMessage });
      }

      if (conv.channel !== 'whatsapp') {
        return json({ error: 'Resend disponível apenas para WhatsApp e Instagram por ora' }, 400);
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
    // ONDA-2b: estendido com { agent_id?, objective?, mode?, extra_context? } —
    // payload legado ({conversation_id}) mantém o comportamento anterior byte a
    // byte (acorda o sales-brain, fire-and-forget; gates ficam nele). Detalhe e
    // mode='direct' (mensagem única gerada aqui) em handleAiReactivate.
    if (action === 'ai-reactivate' && req.method === 'POST') {
      return await handleAiReactivate(supabase, user, bodyParsed || {});
    }

    // ACTION: Trigger flow (ONDA-2b/B4) — dispara a 1ª mensagem do fluxo pelo
    // caminho único do send e registra o estado na conversa.
    if (action === 'trigger-flow' && req.method === 'POST') {
      return await handleTriggerFlow(supabase, user, bodyParsed || {});
    }

    // ACTION: Follow-up AI draft (ONDA-2b/B5) — rascunho rico SEM envio.
    if (action === 'followup-ai-draft' && req.method === 'POST') {
      return await handleFollowupAiDraft(supabase, bodyParsed || {});
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('Error in platform-webchat-inbox:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
