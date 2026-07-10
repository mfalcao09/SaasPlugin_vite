// platform-instagram-webhook — receptor inbound de DMs do Instagram (Meta Graph,
// object='instagram') para o CRM de PLATAFORMA.
//
// Porte do `instagram-webhook` do Vendus V5 (estrutura 1:1: handshake GET por
// conexão, HMAC X-Hub-Signature-256, parsing de entry[].messaging[], resolução
// da conexão por path com fallback por entry.id, mídia com fallback pra URL do
// CDN), DESACOPLADO do tenant:
//   * Tabelas: platform_crm_instagram_connections / platform_crm_conversations /
//     platform_crm_messages / platform_crm_leads (SEM organization_id).
//   * URL: `.../platform-instagram-webhook/{connection_id}` — exatamente a que
//     `platform-instagram-draft` já emite no wizard. Fallback: resolve pela
//     entry.id (= ig_business_account_id) entre conexões ativas, igual V5.
//   * Persistência no padrão do inbox de plataforma (espelho do
//     platform-meta-whatsapp-webhook): conversa channel='instagram' com
//     visitor_id='ig:<IGSID>' (IGSID é escopado por conta IG — isola caixas),
//     lead auto-criado + pipeline, mensagem inbound, broadcast realtime.
//   * Canal-por-conversa (A1.3): instagram_connection_id na conversa e
//     product_id herdado DA CONEXÃO (nunca sobrescreve atribuição manual).
//   * Idempotência por mid (metadata->>ig_mid) — mesmo padrão do wamid.
//   * NÃO portado do V5 (lógica do tenant): instagram_webhook_logs,
//     instagram_flows/ig-flow-executor (automações ManyChat), invocação do
//     webchat-bot e transcrição via process-media-message (exigem organization
//     do salão). Gatilho de IA do inbox de plataforma é decisão à parte.
//   * Meta exige resposta <5s e re-entrega em não-200: erro de processamento
//     loga e devolve 200 (o ig_mid protege contra duplicação); só falha de
//     autenticação (assinatura) devolve 4xx.
//   * object!=='instagram' (ex.: 'page' = Messenger) devolve 200 e ignora —
//     o V5 também não tratava Messenger; DM de Messenger fica fora por ora.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE, hmacSha256Hex, timingSafeEqual } from '../_shared/meta-graph.ts';
import { ensurePlatformLeadInPipeline } from '../_shared/platform-crm-pipeline.ts';
import { broadcastPlatformNewMessage } from '../_shared/platform-crm-webchat.ts';

type Json = Record<string, unknown>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `.../platform-instagram-webhook/{connection_id}` → connection_id (UUID). */
function connectionIdFromPath(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return UUID_RE.test(last) ? last : null;
}

// ─── Conteúdo/mídia (estrutura do V5, sem transcrição) ──────────────────────

const IG_KIND_MAP: Record<string, 'image' | 'audio' | 'video' | 'document'> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'document',
  story_mention: 'image',
  ig_reel: 'video',
};

const IG_LABEL_BY_KIND: Record<string, string> = {
  audio: '[áudio]',
  image: '[imagem]',
  video: '[vídeo]',
  document: '[arquivo]',
};

function guessExt(mime: string, type: string): string {
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg')) return '.mp3';
  if (type === 'image') return '.jpg';
  if (type === 'video') return '.mp4';
  if (type === 'audio') return '.mp3';
  return '';
}

/** Baixa o attachment do CDN da Meta e guarda no bucket `instagram-media`
 *  (path `platform/{connection_id}/{mid}.<ext>` — sem organization, é a caixa
 *  da plataforma). Retorna signed URL de 7 dias. Falha (ex.: bucket ausente)
 *  lança — o caller degrada pra URL do CDN, igual V5. */
async function downloadAndStoreMedia(
  supabase: ReturnType<typeof getServiceClient>,
  connectionId: string,
  mid: string,
  url: string,
  type: string,
): Promise<{ url: string | null; path: string; mime: string; size: number }> {
  const bin = await fetch(url);
  if (!bin.ok) throw new Error(`download ${bin.status}`);
  const buf = new Uint8Array(await bin.arrayBuffer());
  const ct = bin.headers.get('content-type') ?? 'application/octet-stream';
  const path = `platform/${connectionId}/${mid}${guessExt(ct, type)}`;
  const { error } = await supabase.storage
    .from('instagram-media')
    .upload(path, buf, { contentType: ct, upsert: true });
  if (error) throw error;
  const { data: signed } = await supabase.storage
    .from('instagram-media')
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  return { url: signed?.signedUrl ?? null, path, mime: ct, size: buf.byteLength };
}

/** Extrai content/content_type/metadata de uma DM (texto, attachment, reação).
 *  Espelho do extractContent do V5 — content_type no vocabulário do inbox de
 *  plataforma ('document' em vez de 'file'; reação = 'reaction' como no Meta). */
async function extractContent(
  supabase: ReturnType<typeof getServiceClient>,
  connectionId: string,
  msg: Json,
): Promise<{ content: string; contentType: string; extraMetadata: Json }> {
  if (msg['text']) {
    return { content: String(msg['text']), contentType: 'text', extraMetadata: { ig_type: 'text' } };
  }

  const atts = Array.isArray(msg['attachments']) ? (msg['attachments'] as Json[]) : [];
  if (atts.length > 0) {
    const a = atts[0] ?? {};
    const t = String(a['type'] ?? 'file');
    const url = String((a['payload'] as Json | undefined)?.['url'] ?? '') || null;
    const mid = String(msg['mid'] ?? '');

    let stored: Awaited<ReturnType<typeof downloadAndStoreMedia>> | null = null;
    if (url && mid) {
      try {
        stored = await downloadAndStoreMedia(supabase, connectionId, mid, url, t);
      } catch (e) {
        // Sem bucket/erro de download → degrada pra URL do CDN (expira ~dias).
        console.error('[platform-instagram-webhook] media store failed (non-fatal):', e);
      }
    }

    const kind = IG_KIND_MAP[t] ?? 'document';
    const extraMetadata: Json = {
      ig_type: t,
      attachments: atts,
      media: stored?.url
        ? { url: stored.url, kind, mime: stored.mime, storage_path: stored.path, size_bytes: stored.size }
        : (url ? { url, kind, cdn: true } : null),
    };
    return {
      content: stored?.url ? (IG_LABEL_BY_KIND[kind] ?? `[${t}]`) : (url ?? `[${t}]`),
      contentType: t === 'share' ? 'text' : kind,
      extraMetadata,
    };
  }

  const reaction = msg['reaction'] as Json | undefined;
  if (reaction) {
    return {
      content: String(reaction['emoji'] ?? '❤️'),
      contentType: 'reaction',
      extraMetadata: { ig_type: 'reaction', reaction },
    };
  }

  return { content: '[mensagem]', contentType: 'text', extraMetadata: { ig_type: 'unknown', raw: msg } };
}

// ─── Lead + conversa (espelho do platform-meta-whatsapp-webhook) ────────────

/** Lead por IGSID (dedupe em metadata->>ig_sender_id) ou cria. */
async function ensureLead(
  supabase: ReturnType<typeof getServiceClient>,
  senderId: string,
  visitorName: string | null,
  igUsername: string | null,
  productId: string | null,
): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from('platform_crm_leads')
      .select('id')
      .eq('metadata->>ig_sender_id', senderId)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
      .from('platform_crm_leads')
      .insert({
        name: visitorName || (igUsername ? `@${igUsername}` : `Instagram ${senderId.slice(-4)}`),
        source: 'instagram',
        lead_channel: 'instagram',
        metadata: { ig_sender_id: senderId, ...(igUsername ? { ig_username: igUsername } : {}) },
        // Só no INSERT: lead existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select('id')
      .single();
    if (error) {
      console.error('[platform-instagram-webhook] auto-create lead failed (non-fatal):', error);
      return null;
    }
    return (created?.id as string) ?? null;
  } catch (e) {
    console.error('[platform-instagram-webhook] ensureLead error (non-fatal):', e);
    return null;
  }
}

/** Conversa do visitante IG ou cria (channel='instagram'). Reabre fechada como
 *  bot_active — padrão do inbox de plataforma (o V5 criava conversa nova após
 *  "Resolvido"; aqui seguimos o meta-whatsapp-webhook: 1 conversa por visitante). */
async function ensureConversation(
  supabase: ReturnType<typeof getServiceClient>,
  connectionId: string,
  senderId: string,
  visitorName: string | null,
  igUsername: string | null,
  productId: string | null,
): Promise<Json | null> {
  const visitorId = `ig:${senderId}`;
  const { data: rows } = await supabase
    .from('platform_crm_conversations')
    .select('*')
    .eq('visitor_id', visitorId)
    .order('created_at', { ascending: false })
    .limit(1);
  let conversation = (rows?.[0] as Json) ?? null;

  if (conversation && conversation['status'] === 'closed') {
    const { data: reopened, error } = await supabase
      .from('platform_crm_conversations')
      .update({
        status: 'waiting_human', // até existir send+brain por canal IG (era bot_active no V5)
        needs_human: false,
        accepted_at: null,
        accepted_by: null,
        assigned_to: null,
      })
      .eq('id', conversation['id'])
      .select()
      .single();
    if (!error && reopened) conversation = reopened as Json;
  }

  if (!conversation) {
    const { data: created, error } = await supabase
      .from('platform_crm_conversations')
      .insert({
        visitor_id: visitorId,
        visitor_name: visitorName ?? (igUsername ? `@${igUsername}` : `Instagram ${senderId.slice(-4)}`),
        channel: 'instagram',
        status: 'waiting_human', // até existir send+brain por canal IG (era bot_active no V5)
        needs_human: false,
        instagram_connection_id: connectionId,
        // Só no INSERT: conversa existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select()
      .single();
    if (error) {
      console.error('[platform-instagram-webhook] create conversation failed:', error);
      return null;
    }
    conversation = created as Json;
  }

  // Canal-por-conversa (A1.3): garante o vínculo com a conexão por onde a
  // mensagem entrou e herda product_id APENAS quando ainda não tem produto.
  const channelPatch: Json = {};
  if (conversation['instagram_connection_id'] !== connectionId) {
    channelPatch['instagram_connection_id'] = connectionId;
  }
  if (!conversation['product_id'] && productId) {
    channelPatch['product_id'] = productId;
  }
  if (Object.keys(channelPatch).length > 0) {
    const { error: patchError } = await supabase
      .from('platform_crm_conversations')
      .update(channelPatch)
      .eq('id', conversation['id']);
    if (patchError) {
      console.error('[platform-instagram-webhook] channel patch failed (non-fatal):', patchError);
    } else {
      Object.assign(conversation, channelPatch);
    }
  }

  if (!conversation['lead_id']) {
    const leadId = await ensureLead(supabase, senderId, visitorName, igUsername, productId);
    if (leadId) {
      await supabase
        .from('platform_crm_conversations')
        .update({ lead_id: leadId })
        .eq('id', conversation['id']);
      conversation['lead_id'] = leadId;
      await ensurePlatformLeadInPipeline(supabase, leadId);
    }
  }

  return conversation;
}

// ─── Evento de DM (entry[].messaging[]) ─────────────────────────────────────

/** Uma DM inbound: echo-skip → dedupe por mid → perfil → conversa/lead →
 *  insert → last_inbound_at da conexão → broadcast. Estrutura do V5. */
async function handleEvent(
  supabase: ReturnType<typeof getServiceClient>,
  conn: Json,
  pageToken: string | null,
  evt: Json,
): Promise<void> {
  const msg = (evt['message'] as Json | undefined) ?? {};
  // Echo = a própria conta enviou (via app ou caixa nativa) — não é inbound.
  if (msg['is_echo']) return;

  const senderId = String((evt['sender'] as Json | undefined)?.['id'] ?? '');
  if (!senderId) return;

  const mid = String(msg['mid'] ?? '');
  if (!mid && !msg['text'] && !msg['attachments'] && !msg['reaction']) return;

  // Idempotência por mid (padrão wamid): re-entregas do Meta não duplicam.
  if (mid) {
    const { data: dupe } = await supabase
      .from('platform_crm_messages')
      .select('id')
      .eq('metadata->>ig_mid', mid)
      .limit(1)
      .maybeSingle();
    if (dupe) return;
  }

  // Nome/username do remetente via Graph (best-effort, igual V5).
  let visitorName: string | null = null;
  let igUsername: string | null = null;
  if (pageToken) {
    try {
      const prof = await fetch(
        `${GRAPH_BASE}/${senderId}?fields=name,username&access_token=${encodeURIComponent(pageToken)}`,
      ).then((r) => r.json());
      visitorName = (prof?.name as string) ?? (prof?.username as string) ?? null;
      igUsername = (prof?.username as string) ?? null;
    } catch {
      /* best-effort */
    }
  }

  const connectionId = String(conn['id']);
  const productId = (conn['product_id'] as string | null) ?? null;

  const conversation = await ensureConversation(
    supabase, connectionId, senderId, visitorName, igUsername, productId,
  );
  if (!conversation) return;

  const { content, contentType, extraMetadata } = await extractContent(supabase, connectionId, msg);

  const { data: inserted, error } = await supabase
    .from('platform_crm_messages')
    .insert({
      conversation_id: conversation['id'],
      direction: 'inbound',
      sender_type: 'visitor',
      content,
      content_type: contentType,
      metadata: {
        ig_mid: mid || null,
        channel: 'instagram',
        connection_id: connectionId,
        ig_sender_id: senderId,
        ...(igUsername ? { ig_username: igUsername } : {}),
        ...extraMetadata,
      },
    })
    .select()
    .single();
  if (error) {
    // 23505 = corrida entre re-entregas resolvida por índice único (ok).
    if (!String(error.code).includes('23505')) {
      console.error('[platform-instagram-webhook] insert message failed:', error);
    }
    return;
  }

  await supabase
    .from('platform_crm_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      ...(visitorName && !conversation['visitor_name'] ? { visitor_name: visitorName } : {}),
    })
    .eq('id', conversation['id']);

  await supabase
    .from('platform_crm_instagram_connections')
    .update({ last_inbound_at: new Date().toISOString() })
    .eq('id', connectionId);

  await broadcastPlatformNewMessage(supabase, String(conversation['id']), inserted as Json);
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const pathConnectionId = connectionIdFromPath(url);
  const supabase = getServiceClient();

  // ── GET: verificação do Meta Console (hub.challenge), por conexão ─────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    // Compat: aceita ?conn= caso a URL antiga tenha sido colada (igual V5).
    const connId = pathConnectionId ?? url.searchParams.get('conn');
    if (mode !== 'subscribe' || !token || !challenge || !connId) {
      return new Response('bad request', { status: 400 });
    }

    const { data: conn } = await supabase
      .from('platform_crm_instagram_connections')
      .select('id, webhook_verify_token')
      .eq('id', connId)
      .maybeSingle();
    if (!conn || conn.webhook_verify_token !== token) {
      console.warn('[platform-instagram-webhook] verify reject', { has_path_id: !!pathConnectionId });
      return new Response('forbidden', { status: 403 });
    }

    await supabase
      .from('platform_crm_instagram_connections')
      .update({ webhook_subscribed_at: new Date().toISOString() })
      .eq('id', conn.id);
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return new Response('bad json', { status: 200 });
  }

  // Só DMs do Instagram. object='page' (Messenger) não é tratado — igual V5.
  if (payload['object'] !== 'instagram') {
    return new Response('ok', { status: 200 });
  }

  // Conexão do path (prioritária); fallback por entry.id entre ativas (V5).
  let resolvedConn: Json | null = null;
  if (pathConnectionId) {
    const { data } = await supabase
      .from('platform_crm_instagram_connections')
      .select('*')
      .eq('id', pathConnectionId)
      .maybeSingle();
    resolvedConn = (data as Json) ?? null;
  }

  // Caches por request: assinatura validada e page token por conexão.
  const signatureOkByConn = new Map<string, boolean>();
  const pageTokenByConn = new Map<string, string | null>();

  try {
    const entries = Array.isArray(payload['entry']) ? (payload['entry'] as Json[]) : [];
    for (const entry of entries) {
      let conn = resolvedConn;
      if (!conn) {
        const entryId = String(entry['id'] ?? '');
        if (!entryId) continue;
        const { data } = await supabase
          .from('platform_crm_instagram_connections')
          .select('*')
          .eq('ig_business_account_id', entryId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        conn = (data as Json) ?? null;
      }
      if (!conn) {
        console.warn('[platform-instagram-webhook] no connection match', { entry_id: entry['id'] });
        continue;
      }
      const connId = String(conn['id']);

      // Assinatura sobre o corpo CRU com o app_secret da conexão (timing-safe).
      // Inválida = 401 (padrão dos webhooks Meta da plataforma; V5 usava 403).
      let sigOk = signatureOkByConn.get(connId);
      if (sigOk === undefined) {
        try {
          const appSecret = await decryptSecret(String(conn['app_secret_encrypted'] ?? ''));
          const expected = `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
          sigOk = !!appSecret && signature.length > 0 && timingSafeEqual(expected, signature);
        } catch (e) {
          console.error('[platform-instagram-webhook] sig check error:', e);
          sigOk = false;
        }
        signatureOkByConn.set(connId, sigOk);
      }
      if (!sigOk) {
        console.warn('[platform-instagram-webhook] assinatura inválida — descartando');
        return new Response('invalid signature', { status: 401 });
      }

      if (!pageTokenByConn.has(connId)) {
        try {
          pageTokenByConn.set(
            connId,
            (await decryptSecret(String(conn['page_access_token_encrypted'] ?? ''))) || null,
          );
        } catch {
          pageTokenByConn.set(connId, null);
        }
      }
      const pageToken = pageTokenByConn.get(connId) ?? null;

      // DMs (entry[].messaging[]) — cada evento isolado em try/catch.
      const messaging = Array.isArray(entry['messaging']) ? (entry['messaging'] as Json[]) : [];
      for (const m of messaging) {
        try {
          await handleEvent(supabase, conn, pageToken, m);
        } catch (e) {
          console.error('[platform-instagram-webhook] event error:', e);
        }
      }

      // entry[].changes (comments/mentions) — no V5 alimentava as automações
      // ManyChat (instagram_flows); a plataforma não tem esse motor. Só loga.
      const changes = Array.isArray(entry['changes']) ? (entry['changes'] as Json[]) : [];
      for (const ch of changes) {
        console.log('[platform-instagram-webhook] change ignorado (sem automações):',
          String(ch['field'] ?? 'unknown'));
      }
    }
  } catch (e) {
    // Nunca 5xx aqui: o Meta re-entregaria payload que quebra por bug de
    // código; o ig_mid garante que nada duplica de forma silenciosa.
    console.error('[platform-instagram-webhook] processing error:', e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
