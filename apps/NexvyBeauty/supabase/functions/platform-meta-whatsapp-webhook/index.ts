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

/** Lead por telefone (dedupe) ou cria — espelho do auto-create do webchat. */
async function ensureLead(
  supabase: ReturnType<typeof createClient>,
  fromDigits: string,
  profileName: string | null,
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
  supabase: ReturnType<typeof createClient>,
  fromDigits: string,
  profileName: string | null,
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
      })
      .select()
      .single();
    if (error) {
      console.error('[platform-meta-whatsapp-webhook] create conversation failed:', error);
      return null;
    }
    conversation = created as Json;
  }

  if (!conversation['lead_id']) {
    const leadId = await ensureLead(supabase, fromDigits, profileName);
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

/** Uma mensagem inbound: dedupe por wamid → conversa/lead → insert → broadcast. */
async function processInboundMessage(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
  value: Json,
  msg: Json,
): Promise<void> {
  const wamid = String(msg['id'] ?? '');
  const fromDigits = String(msg['from'] ?? '').replace(/\D/g, '');
  if (!wamid || !fromDigits) return;

  const { data: dupe } = await supabase
    .from('platform_crm_messages')
    .select('id')
    .eq('metadata->>wamid', wamid)
    .limit(1)
    .maybeSingle();
  if (dupe) return;

  const contacts = (value['contacts'] as Json[] | undefined) ?? [];
  const profileName =
    contacts.length > 0
      ? String((contacts[0]?.['profile'] as Json | undefined)?.['name'] ?? '') || null
      : null;

  const conversation = await ensureConversation(supabase, fromDigits, profileName);
  if (!conversation) return;

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
      },
    })
    .select()
    .single();
  if (error) {
    // 23505 = corrida entre re-entregas resolvida pelo índice único (ok).
    if (!String(error.code).includes('23505')) {
      console.error('[platform-meta-whatsapp-webhook] insert message failed:', error);
    }
    return;
  }

  await supabase
    .from('platform_crm_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      ...(profileName && !conversation['visitor_name'] ? { visitor_name: profileName } : {}),
    })
    .eq('id', conversation['id']);

  await broadcastPlatformNewMessage(supabase, String(conversation['id']), inserted as Json);
}

/** Statuses (sent/delivered/read/failed) → metadata da mensagem outbound. */
async function processStatus(
  supabase: ReturnType<typeof createClient>,
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
    .select('id, app_secret_encrypted, status')
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
            await processInboundMessage(supabase, connectionId, value, m);
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
