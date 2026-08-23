// instagram-login-webhook — inbound Direct do Instagram Login (tenant app.*).
//
// graph.instagram.com / object=instagram. NÃO é Page, NÃO é platform-instagram-webhook.
// GET público (hub.challenge). POST assinado (X-Hub-Signature-256 + INSTAGRAM_LOGIN_APP_SECRET).
// Gateway: verify_jwt=false. Auth real = HMAC. Sem Authorization da Meta.
//
// Persistência: webchat_conversations.channel='instagram' ligada a
// instagram_login_connections (metadata.instagram_login_connection_id).
// Identidade: IGSID / @username. Sem visitor_phone.
//
// Subscribe no App Dashboard: ver tasks/INSTAGRAM-LOGIN-WEBHOOK-SUBSCRIBE-2026-08-23.md
// (tester basta; Live não é exigido nesta fase).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { loadInstagramLoginApp } from '../_shared/instagram-login-oauth.ts';
import {
  buildConversationMetadata,
  extractInboundDms,
  instagramLoginGraphBase,
  matchVerifyChallenge,
  parseInstagramIdentity,
  verifyInstagramLoginSignature,
  type InstagramIdentity,
  type InstagramInboundDm,
} from '../_shared/instagram-login-inbox.ts';

type Json = Record<string, unknown>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function connectionIdFromPath(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return UUID_RE.test(last) ? last : null;
}

const IG_KIND_MAP: Record<string, 'image' | 'audio' | 'video' | 'document'> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'document',
  story_mention: 'image',
  ig_reel: 'video',
};

async function fetchSenderProfile(
  accessToken: string | null,
  senderId: string,
): Promise<{ name: string | null; username: string | null }> {
  if (!accessToken || !senderId) return { name: null, username: null };
  try {
    const u = new URL(`${instagramLoginGraphBase()}/${encodeURIComponent(senderId)}`);
    u.searchParams.set('fields', 'name,username');
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({})) as { name?: string; username?: string };
    if (!res.ok) return { name: null, username: null };
    return {
      name: typeof json.name === 'string' ? json.name : null,
      username: typeof json.username === 'string' ? json.username : null,
    };
  } catch {
    return { name: null, username: null };
  }
}

async function resolveConnection(
  supabase: ReturnType<typeof getServiceClient>,
  pathConnectionId: string | null,
  accountId: string,
): Promise<Json | null> {
  if (pathConnectionId) {
    const { data } = await supabase
      .from('instagram_login_connections')
      .select('*')
      .eq('id', pathConnectionId)
      .maybeSingle();
    if (data) return data as Json;
  }
  if (!accountId) return null;
  const { data } = await supabase
    .from('instagram_login_connections')
    .select('*')
    .eq('instagram_user_id', accountId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return (data as Json) ?? null;
}

async function ensureLead(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  identity: InstagramIdentity,
): Promise<string | null> {
  try {
    if (identity.igsid) {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('organization_id', orgId)
        .eq('metadata->>ig_sender_id', identity.igsid)
        .limit(1)
        .maybeSingle();
      if (existing?.id) return existing.id as string;
    }
    const { data: created, error } = await supabase
      .from('leads')
      .insert({
        organization_id: orgId,
        name: identity.displayName,
        phone: null,
        source: 'instagram',
        lead_channel: 'instagram',
        lead_origin: 'instagram',
        metadata: {
          ig_sender_id: identity.igsid,
          ...(identity.username ? { ig_username: identity.username } : {}),
        },
        score: 0,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[instagram-login-webhook] ensureLead failed (non-fatal):', error.message);
      return null;
    }
    return (created?.id as string) ?? null;
  } catch (e) {
    console.error('[instagram-login-webhook] ensureLead error (non-fatal):', e);
    return null;
  }
}

async function ensureConversation(
  supabase: ReturnType<typeof getServiceClient>,
  conn: Json,
  identity: InstagramIdentity,
): Promise<Json | null> {
  const orgId = String(conn['organization_id'] ?? '');
  const connectionId = String(conn['id'] ?? '');
  if (!orgId || !connectionId) return null;

  const { data: rows } = await supabase
    .from('webchat_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('channel', 'instagram')
    .eq('visitor_id', identity.visitorId)
    .order('created_at', { ascending: false })
    .limit(1);
  let conversation = (rows?.[0] as Json) ?? null;

  if (conversation && conversation['status'] === 'closed') {
    const { data: reopened, error } = await supabase
      .from('webchat_conversations')
      .update({
        status: 'waiting_human',
        needs_human: true,
        accepted_at: null,
        accepted_by: null,
        assigned_user_id: null,
        closed_at: null,
      })
      .eq('id', conversation['id'])
      .select()
      .single();
    if (!error && reopened) conversation = reopened as Json;
  }

  if (!conversation) {
    const { data: widget } = await supabase
      .from('webchat_widgets')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const leadId = await ensureLead(supabase, orgId, identity);
    const insert: Json = {
      organization_id: orgId,
      visitor_id: identity.visitorId,
      visitor_name: identity.displayName,
      visitor_phone: null,
      channel: 'instagram',
      status: 'waiting_human',
      needs_human: true,
      metadata: buildConversationMetadata(connectionId, identity),
    };
    if (widget?.id) insert['widget_id'] = widget.id;
    if (leadId) insert['lead_id'] = leadId;

    const { data: created, error } = await supabase
      .from('webchat_conversations')
      .insert(insert)
      .select()
      .single();
    if (error) {
      console.error('[instagram-login-webhook] create conversation failed:', error);
      return null;
    }
    conversation = created as Json;
  }

  const meta = {
    ...((conversation['metadata'] as Json | null) ?? {}),
    ...buildConversationMetadata(connectionId, identity),
  };
  const patch: Json = { metadata: meta };
  if (!conversation['visitor_name'] && identity.displayName) {
    patch['visitor_name'] = identity.displayName;
  }
  if (!conversation['lead_id']) {
    const leadId = await ensureLead(supabase, orgId, identity);
    if (leadId) patch['lead_id'] = leadId;
  }
  await supabase.from('webchat_conversations').update(patch).eq('id', conversation['id']);
  Object.assign(conversation, patch);
  return conversation;
}

function inboundContent(dm: InstagramInboundDm): { content: string; contentType: string; extra: Json } {
  if (dm.text) {
    return { content: dm.text, contentType: 'text', extra: { ig_type: 'text' } };
  }
  if (dm.attachmentType) {
    const kind = IG_KIND_MAP[dm.attachmentType] ?? 'document';
    const label = kind === 'image' ? '[imagem]'
      : kind === 'audio' ? '[áudio]'
      : kind === 'video' ? '[vídeo]'
      : `[${dm.attachmentType}]`;
    return {
      content: dm.attachmentUrl ?? label,
      contentType: kind,
      extra: {
        ig_type: dm.attachmentType,
        ...(dm.attachmentUrl ? { media: { url: dm.attachmentUrl, kind, cdn: true } } : {}),
      },
    };
  }
  return { content: '[mensagem]', contentType: 'text', extra: { ig_type: 'unknown' } };
}

async function handleDm(
  supabase: ReturnType<typeof getServiceClient>,
  conn: Json,
  accessToken: string | null,
  dm: InstagramInboundDm,
): Promise<void> {
  if (dm.isEcho) return;
  if (!dm.senderId) return;
  if (!dm.mid && !dm.text && !dm.attachmentType) return;

  if (dm.mid) {
    const { data: dupe } = await supabase
      .from('webchat_messages')
      .select('id')
      .eq('metadata->>ig_mid', dm.mid)
      .limit(1)
      .maybeSingle();
    if (dupe) return;
  }

  const profile = await fetchSenderProfile(accessToken, dm.senderId);
  const identity = parseInstagramIdentity({
    igsid: dm.senderId,
    username: profile.username,
    name: profile.name,
  });
  if (!identity) return;

  const conversation = await ensureConversation(supabase, conn, identity);
  if (!conversation) return;

  const { content, contentType, extra } = inboundContent(dm);
  const { data: inserted, error } = await supabase
    .from('webchat_messages')
    .insert({
      conversation_id: conversation['id'],
      direction: 'inbound',
      sender_type: 'visitor',
      content,
      content_type: contentType,
      metadata: {
        ig_mid: dm.mid || null,
        channel: 'instagram',
        instagram_login_connection_id: conn['id'],
        ig_sender_id: dm.senderId,
        ...(identity.username ? { ig_username: identity.username } : {}),
        ...extra,
      },
    })
    .select()
    .single();
  if (error) {
    if (!String(error.code).includes('23505')) {
      console.error('[instagram-login-webhook] insert message failed:', error);
    }
    return;
  }

  await supabase
    .from('webchat_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      needs_human: conversation['status'] === 'bot_active' ? conversation['needs_human'] : true,
      ...(identity.displayName && !conversation['visitor_name']
        ? { visitor_name: identity.displayName }
        : {}),
    })
    .eq('id', conversation['id']);

  try {
    const channel = supabase.channel(`conversation:${conversation['id']}`);
    await channel.send({
      type: 'broadcast',
      event: 'new_message',
      payload: inserted,
    });
    await supabase.removeChannel(channel);
  } catch (e) {
    console.error('[instagram-login-webhook] broadcast non-fatal:', e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const pathConnectionId = connectionIdFromPath(url);
  const supabase = getServiceClient();

  if (req.method === 'GET') {
    const expected = Deno.env.get('INSTAGRAM_LOGIN_WEBHOOK_VERIFY_TOKEN') ?? '';
    const result = matchVerifyChallenge({
      mode: url.searchParams.get('hub.mode'),
      token: url.searchParams.get('hub.verify_token'),
      challenge: url.searchParams.get('hub.challenge'),
      expectedToken: expected,
    });
    if (!result.ok) {
      console.warn('[instagram-login-webhook] verify reject', { status: result.status });
      return new Response('forbidden', { status: result.status });
    }
    return new Response(result.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  let appSecret = '';
  try {
    appSecret = loadInstagramLoginApp().app_secret;
  } catch (e) {
    console.error('[instagram-login-webhook] app secret ausente:', e);
    return new Response('misconfigured', { status: 500 });
  }

  const sigOk = await verifyInstagramLoginSignature(appSecret, rawBody, signature);
  if (!sigOk) {
    console.warn('[instagram-login-webhook] assinatura inválida — descartando');
    return new Response('invalid signature', { status: 401 });
  }

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return new Response('ok', { status: 200 });
  }

  if (payload['object'] !== 'instagram') {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const dms = extractInboundDms(payload);
  const tokenByConn = new Map<string, string | null>();

  try {
    for (const dm of dms) {
      try {
        const conn = await resolveConnection(supabase, pathConnectionId, dm.accountId);
        if (!conn) {
          console.warn('[instagram-login-webhook] no connection match', { entry_id: dm.accountId });
          continue;
        }
        const connId = String(conn['id']);
        if (!tokenByConn.has(connId)) {
          try {
            tokenByConn.set(
              connId,
              (await decryptSecret(String(conn['access_token_encrypted'] ?? ''))) || null,
            );
          } catch {
            tokenByConn.set(connId, null);
          }
        }
        await handleDm(supabase, conn, tokenByConn.get(connId) ?? null, dm);
      } catch (e) {
        console.error('[instagram-login-webhook] event error:', e);
      }
    }
  } catch (e) {
    console.error('[instagram-login-webhook] processing error:', e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
