// platform-meta-whatsapp-webhook — receptor inbound da WhatsApp Cloud API
// (Meta) para o CRM de PLATAFORMA (número de VENDAS — funil autopilot, F1).
//
// Peça que faltava do porte Vendus: `platform-meta-whatsapp-connect` já emite
// webhook_url apontando para cá (`.../platform-meta-whatsapp-webhook/{connection_id}`)
// e o verify_token, mas o receptor não existia — mensagem recebida caía no
// vazio (bloqueador A1 da auditoria autopilot).
//
// Contratos:
//   * GET  → verificação do Meta Console (hub.challenge), por connection.
//   * POST → assinatura X-Hub-Signature-256 (HMAC do app_secret, timing-safe)
//     validada sobre o corpo CRU antes de qualquer processamento; inválida = 401.
//   * Idempotência por wamid: checagem + índice único parcial
//     uq_platform_crm_messages_wamid (re-entregas do Meta não duplicam).
//   * Persistência no padrão do webchat de plataforma: conversa
//     (channel='whatsapp', visitor_id='wa:<numero>') + lead (dedupe por
//     telefone) + mensagem inbound + broadcast realtime pro inbox.
//   * Meta exige resposta <5s e re-entrega em não-200: erro de processamento
//     loga e devolve 200 (retry não conserta bug e o wamid protege); só falha
//     de autenticação devolve 4xx.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/meta-graph.ts';
import { ensurePlatformLeadInPipeline } from '../_shared/platform-crm-pipeline.ts';
import { broadcastPlatformNewMessage } from '../_shared/platform-crm-webchat.ts';
import { type CtwaReferral, ctwaUtm, parseCtwaReferral } from '../_shared/ctwa-attribution.ts';

type Json = Record<string, unknown>;

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** `.../platform-meta-whatsapp-webhook/{connection_id}` → connection_id. */
function connectionIdFromPath(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return last && last !== 'platform-meta-whatsapp-webhook' ? last : null;
}

/** Extrai texto exibível de qualquer tipo de mensagem da Cloud API. */
function extractContent(msg: Json): { content: string; contentType: string } {
  const type = String(msg['type'] ?? 'unknown');
  const pick = (o: unknown, k: string) =>
    (o && typeof o === 'object' ? (o as Json)[k] : undefined);

  switch (type) {
    case 'text':
      return { content: String(pick(msg['text'], 'body') ?? ''), contentType: 'text' };
    case 'image':
    case 'video':
    case 'document':
    case 'audio':
    case 'sticker': {
      const media = msg[type] as Json | undefined;
      const label = String(media?.['caption'] ?? media?.['filename'] ?? `[${type}]`);
      return { content: label, contentType: type };
    }
    case 'interactive': {
      const inter = msg['interactive'] as Json | undefined;
      const reply = (inter?.['button_reply'] ?? inter?.['list_reply']) as Json | undefined;
      return { content: String(reply?.['title'] ?? '[interativo]'), contentType: 'text' };
    }
    case 'button':
      return { content: String(pick(msg['button'], 'text') ?? '[botão]'), contentType: 'text' };
    case 'location': {
      const loc = msg['location'] as Json | undefined;
      return {
        content: `[localização] ${loc?.['latitude'] ?? '?'},${loc?.['longitude'] ?? '?'}`,
        contentType: 'location',
      };
    }
    case 'reaction':
      return { content: String(pick(msg['reaction'], 'emoji') ?? '[reação]'), contentType: 'reaction' };
    default:
      return { content: `[${type}]`, contentType: type };
  }
}

/** Fallback de produto (slug fixo) para conexões SEM product_id cadastrado.
 *  A regra canônica (A1.3) é herdar `product_id` DA CONEXÃO por onde a
 *  mensagem entrou (platform_crm_whatsapp_meta_connections.product_id);
 *  este resolve só cobre conexões antigas ainda não vinculadas a produto.
 *  Non-fatal: sem produto cadastrado, conversa/lead seguem sem product_id. */
async function resolveDefaultProductId(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('platform_crm_products')
      .select('id')
      .eq('slug', 'nexvybeauty')
      .limit(1)
      .maybeSingle();
    return (data?.id as string) ?? null;
  } catch (e) {
    console.warn('[platform-meta-whatsapp-webhook] resolveDefaultProductId (non-fatal):', e);
    return null;
  }
}

/** Lead por telefone (dedupe) ou cria — espelho do auto-create do webchat. */
async function ensureLead(
  supabase: ReturnType<typeof getServiceClient>,
  fromDigits: string,
  profileName: string | null,
  productId: string | null,
): Promise<string | null> {
  try {
    const phonePlus = `+${fromDigits}`;
    const { data: existing } = await supabase
      .from('platform_crm_leads')
      .select('id')
      .or(`phone.eq.${fromDigits},phone.eq.${phonePlus}`)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const { data: created, error } = await supabase
      .from('platform_crm_leads')
      .insert({
        name: profileName || `WhatsApp ${phonePlus}`,
        phone: phonePlus,
        source: 'whatsapp',
        lead_channel: 'whatsapp',
        // Só no INSERT: lead existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select('id')
      .single();
    if (error) {
      console.error('[platform-meta-whatsapp-webhook] auto-create lead failed (non-fatal):', error);
      return null;
    }
    return (created?.id as string) ?? null;
  } catch (e) {
    console.error('[platform-meta-whatsapp-webhook] ensureLead error (non-fatal):', e);
    return null;
  }
}

/** Conversa aberta do visitante ou cria (channel='whatsapp'). Reabre fechada
 *  como bot_active: o número de vendas é atendido pelos agentes IA. */
async function ensureConversation(
  supabase: ReturnType<typeof getServiceClient>,
  fromDigits: string,
  profileName: string | null,
  productId: string | null,
  connectionId: string,
): Promise<Json | null> {
  const visitorId = `wa:${fromDigits}`;
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
        status: 'bot_active',
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
        visitor_name: profileName,
        visitor_phone: `+${fromDigits}`,
        visitor_whatsapp: `+${fromDigits}`,
        channel: 'whatsapp',
        status: 'bot_active',
        needs_human: false,
        meta_connection_id: connectionId,
        // Só no INSERT: conversa existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select()
      .single();
    if (error) {
      console.error('[platform-meta-whatsapp-webhook] create conversation failed:', error);
      return null;
    }
    conversation = created as Json;
  }

  // Canal-por-conversa (A1.3): conversa existente ganha o vínculo com a conexão
  // por onde a mensagem entrou e herda product_id da conexão APENAS quando ainda
  // não tem produto (atribuição manual nunca é sobrescrita). Recém-criadas já
  // nascem com os dois campos — patch vira no-op.
  const channelPatch: Json = {};
  if (conversation['meta_connection_id'] !== connectionId) {
    channelPatch['meta_connection_id'] = connectionId;
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
      console.error('[platform-meta-whatsapp-webhook] channel patch failed (non-fatal):', patchError);
    } else {
      Object.assign(conversation, channelPatch);
    }
  }

  if (!conversation['lead_id']) {
    const leadId = await ensureLead(supabase, fromDigits, profileName, productId);
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

/** G1 — captura de atribuição CTWA. Se a mensagem veio de anúncio (referral),
 *  grava first-touch no lead (source='ctwa' + utm + metadata.referral, SÓ se o
 *  lead ainda não foi atribuído), registra a linha durável em ads_attribution
 *  (dedup por conversa+clid) e emite a jornada meta_ctwa_received. Non-fatal:
 *  qualquer erro loga e NÃO derruba o processamento da mensagem (o caminho
 *  orgânico e a captura de anúncio nunca competem). */
async function captureCtwaAttribution(
  supabase: ReturnType<typeof getServiceClient>,
  conversation: Json,
  referral: CtwaReferral,
  connectionId: string,
): Promise<void> {
  const leadId = (conversation['lead_id'] as string | null) ?? null;
  const conversationId = String(conversation['id']);
  const productId = (conversation['product_id'] as string | null) ?? null;

  // 1) First-touch no lead: só carimba se ainda não há atribuição (utm_source null).
  if (leadId) {
    try {
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('id, utm_source, metadata')
        .eq('id', leadId)
        .maybeSingle();
      if (lead && !lead['utm_source']) {
        const meta = (lead['metadata'] as Json | null) ?? {};
        await supabase
          .from('platform_crm_leads')
          .update({
            source: 'ctwa',
            ...ctwaUtm(referral),
            metadata: { ...meta, referral: referral.raw, ctwa_clid: referral.ctwa_clid },
          })
          .eq('id', leadId)
          .is('utm_source', null); // race-safe: não sobrescreve atribuição concorrente
      }
    } catch (e) {
      console.error('[platform-meta-whatsapp-webhook] ctwa lead stamp (non-fatal):', e);
    }
  }

  // 2) ads_attribution — linha durável por click (dedup por conversa+clid no índice).
  //    product_id é NOT NULL: só insere quando a conexão resolveu produto.
  if (productId) {
    try {
      const { error } = await supabase.from('ads_attribution').insert({
        product_id: productId,
        lead_id: leadId,
        conversation_id: conversationId,
        connection_id: connectionId,
        ctwa_clid: referral.ctwa_clid,
        source_id: referral.source_id,
        source_type: referral.source_type,
        source_url: referral.source_url,
        headline: referral.headline,
        body: referral.body,
        media_type: referral.media_type,
        ctwa_channel: 'whatsapp',
        raw: referral.raw,
      });
      // 23505 = re-entrega do mesmo click (índice único parcial) → ok.
      if (error && !String(error.code).includes('23505')) {
        console.error('[platform-meta-whatsapp-webhook] ads_attribution insert (non-fatal):', error);
      }
    } catch (e) {
      console.error('[platform-meta-whatsapp-webhook] ads_attribution (non-fatal):', e);
    }
  }

  // 3) Jornada — meta_ctwa_received (categoria 'origin', evento #2 do funil).
  if (productId && leadId) {
    try {
      await supabase.rpc('pcrm_log_journey_event', {
        p_product: productId,
        p_lead: leadId,
        p_type: 'meta_ctwa_received',
        p_category: 'origin',
        p_channel: 'whatsapp',
        p_source: 'ctwa',
        p_title: referral.headline ?? 'Lead veio de anúncio (CTWA)',
        p_payload: referral.raw,
        p_conversation: conversationId,
      });
    } catch (e) {
      console.error('[platform-meta-whatsapp-webhook] journey meta_ctwa_received (non-fatal):', e);
    }
  }
}

/** Uma mensagem inbound: dedupe por wamid → conversa/lead → insert → broadcast.
 *  Retorna o id da conversa quando a mensagem foi persistida E a conversa está
 *  bot_active — é o sinal para o gatilho do cérebro de vendas (F2). */
async function processInboundMessage(
  supabase: ReturnType<typeof getServiceClient>,
  connectionId: string,
  value: Json,
  msg: Json,
  defaultProductId: string | null,
): Promise<string | null> {
  const wamid = String(msg['id'] ?? '');
  const fromDigits = String(msg['from'] ?? '').replace(/\D/g, '');
  if (!wamid || !fromDigits) return null;

  const { data: dupe } = await supabase
    .from('platform_crm_messages')
    .select('id')
    .eq('metadata->>wamid', wamid)
    .limit(1)
    .maybeSingle();
  if (dupe) return null;

  const contacts = (value['contacts'] as Json[] | undefined) ?? [];
  const profileName =
    contacts.length > 0
      ? String((contacts[0]?.['profile'] as Json | undefined)?.['name'] ?? '') || null
      : null;

  const conversation = await ensureConversation(supabase, fromDigits, profileName, defaultProductId, connectionId);
  if (!conversation) return null;

  // G1 — atribuição CTWA: se a mensagem veio de anúncio Click-to-WhatsApp,
  // captura referral/ctwa_clid → lead + ads_attribution + jornada. Non-fatal;
  // mensagem sem referral (orgânica) segue o caminho intocado.
  const ctwaReferral = parseCtwaReferral(msg);
  if (ctwaReferral) {
    await captureCtwaAttribution(supabase, conversation, ctwaReferral, connectionId);
  }

  const { content, contentType } = extractContent(msg);
  const metadata = (value['metadata'] as Json | undefined) ?? {};

  const { data: inserted, error } = await supabase
    .from('platform_crm_messages')
    .insert({
      conversation_id: conversation['id'],
      direction: 'inbound',
      sender_type: 'visitor',
      content,
      content_type: contentType,
      metadata: {
        wamid,
        channel: 'whatsapp_cloud',
        connection_id: connectionId,
        from: fromDigits,
        phone_number_id: metadata['phone_number_id'] ?? null,
        wa_timestamp: msg['timestamp'] ?? null,
        wa_type: msg['type'] ?? null,
        ...(ctwaReferral ? { referral: ctwaReferral.raw } : {}),
      },
    })
    .select()
    .single();
  if (error) {
    // 23505 = corrida entre re-entregas resolvida pelo índice único (ok).
    if (!String(error.code).includes('23505')) {
      console.error('[platform-meta-whatsapp-webhook] insert message failed:', error);
    }
    return null;
  }

  await supabase
    .from('platform_crm_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      ...(profileName && !conversation['visitor_name'] ? { visitor_name: profileName } : {}),
    })
    .eq('id', conversation['id']);

  await broadcastPlatformNewMessage(supabase, String(conversation['id']), inserted as Json);

  // Só conversa em atendimento da IA aciona o cérebro (humano assumiu = IA cala).
  return conversation['status'] === 'bot_active' ? String(conversation['id']) : null;
}

/** Statuses (sent/delivered/read/failed) → metadata da mensagem outbound. */
async function processStatus(
  supabase: ReturnType<typeof getServiceClient>,
  status: Json,
): Promise<void> {
  const wamid = String(status['id'] ?? '');
  const newStatus = String(status['status'] ?? '');
  if (!wamid || !newStatus) return;

  const { data: row } = await supabase
    .from('platform_crm_messages')
    .select('id, metadata')
    .eq('metadata->>wamid', wamid)
    .limit(1)
    .maybeSingle();
  if (!row) return;

  const merged = {
    ...((row.metadata as Json) ?? {}),
    status: newStatus,
    status_timestamp: status['timestamp'] ?? null,
    ...(newStatus === 'failed' ? { status_errors: status['errors'] ?? null } : {}),
  };
  await supabase.from('platform_crm_messages').update({ metadata: merged }).eq('id', row.id);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const connectionId = connectionIdFromPath(url);
  const supabase = getServiceClient();

  // ── GET: verificação do Meta Console ──────────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (!connectionId) return new Response('missing connection id', { status: 404 });

    const { data: conn } = await supabase
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, webhook_verify_token')
      .eq('id', connectionId)
      .maybeSingle();

    if (
      mode === 'subscribe' &&
      conn?.webhook_verify_token &&
      token === conn.webhook_verify_token
    ) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!connectionId) return new Response('missing connection id', { status: 404 });

  // ── POST: assinatura sobre o corpo CRU antes de tudo ───────────────────────
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  const { data: conn } = await supabase
    .from('platform_crm_whatsapp_meta_connections')
    .select('id, app_secret_encrypted, status, product_id')
    .eq('id', connectionId)
    .maybeSingle();
  if (!conn) return new Response('unknown connection', { status: 404 });

  try {
    const appSecret = await decryptSecret(conn.app_secret_encrypted as string);
    const expected = `sha256=${await hmacSha256Hex(appSecret, rawBody)}`;
    if (!signature || !timingSafeEqual(expected, signature)) {
      console.warn('[platform-meta-whatsapp-webhook] assinatura inválida — descartando');
      return new Response('invalid signature', { status: 401 });
    }
  } catch (e) {
    console.error('[platform-meta-whatsapp-webhook] falha ao validar assinatura:', e);
    return new Response('signature validation error', { status: 401 });
  }

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return new Response('bad json', { status: 200 });
  }

  try {
    let sawMessage = false;
    // Conversas bot_active que receberam inbound nesta entrega → gatilho do cérebro.
    const convsForBrain = new Set<string>();
    // Resolvido no máximo 1x por invocação (memo), e só se houver mensagem.
    let defaultProductId: string | null | undefined;
    const entries = (payload['entry'] as Json[] | undefined) ?? [];
    for (const entry of entries) {
      const changes = (entry['changes'] as Json[] | undefined) ?? [];
      for (const change of changes) {
        const field = String(change['field'] ?? '');
        const value = change['value'] as Json | undefined;
        if (!value) continue;

        if (field === 'messages') {
          for (const s of (value['statuses'] as Json[] | undefined) ?? []) {
            await processStatus(supabase, s);
          }
          for (const m of (value['messages'] as Json[] | undefined) ?? []) {
            sawMessage = true;
            if (defaultProductId === undefined) {
              // Herança canônica (A1.3): product_id vem DA CONEXÃO por onde a
              // mensagem entrou; slug fixo é só fallback p/ conexão sem produto.
              defaultProductId = (conn.product_id as string | null) ??
                (await resolveDefaultProductId(supabase));
            }
            const brainConvId = await processInboundMessage(supabase, connectionId, value, m, defaultProductId);
            if (brainConvId) convsForBrain.add(brainConvId);
          }
        } else if (field === 'message_template_status_update') {
          // Sincronização fina fica com platform-meta-whatsapp-templates-sync;
          // aqui só registramos o evento.
          console.log('[platform-meta-whatsapp-webhook] template status:', JSON.stringify(value));
        }
      }
    }

    if (sawMessage) {
      await supabase
        .from('platform_crm_whatsapp_meta_connections')
        .update({ last_health_check_at: new Date().toISOString(), last_error: null })
        .eq('id', connectionId);
    }

    // ── Gatilho do cérebro de vendas (F2) ────────────────────────────────
    // Fire-and-forget: a resposta 200 ao Meta NÃO espera o LLM. O brain só
    // age em conversa bot_active (revalida lá) e tem dedupe próprio.
    const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
    for (const convId of convsForBrain) {
      const call = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/platform-sales-brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-brain-secret': brainSecret },
        body: JSON.stringify({ conversation_id: convId }),
      }).then(async (r) => {
        if (!r.ok) console.error('[platform-meta-whatsapp-webhook] brain retornou', r.status, (await r.text()).slice(0, 200));
      }).catch((e) => console.error('[platform-meta-whatsapp-webhook] brain fetch error:', e));
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(call);
      else await call;
    }
  } catch (e) {
    // Nunca 5xx aqui: o Meta re-entregaria um payload que quebra por bug de
    // código. O wamid garante que nada se perde de forma silenciosa duplicada.
    console.error('[platform-meta-whatsapp-webhook] processing error:', e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
