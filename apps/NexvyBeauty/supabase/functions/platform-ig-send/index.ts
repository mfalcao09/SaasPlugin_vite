// platform-ig-send — envio OUTBOUND de Instagram (DM, comment reply, private
// reply, like) via Meta Graph API, para o CRM de PLATAFORMA (super_admin),
// PRODUCT-SCOPED.
//
// PORTE do `instagram-send` do Vendus V5, DESACOPLADO do tenant:
//   Fonte (V5): oficial-vendus-v5/supabase/functions/instagram-send/index.ts
//
// Remaps aplicados vs. V5:
//   * instagram_connections      → platform_crm_instagram_connections
//     (SEM organization_id; cols usadas: id, fb_page_id,
//      page_access_token_encrypted, status).
//   * webchat_conversations      → platform_crm_conversations
//     (o remetente IG NÃO tem coluna própria: mora em visitor_id='ig:<IGSID>';
//      a conexão da conversa em instagram_connection_id — igual ao inbox de
//      plataforma platform-instagram-webhook).
//   * webchat_messages           → platform_crm_messages
//     (outbound: direction='outbound', sender_type='agent', content_type no
//      vocabulário do inbox de plataforma — 'document' em vez de 'file').
//   * instagram_comment_replies  → platform_crm_instagram_comment_replies
//     (dedup por comentário, connection-scoped — UNIQUE(connection_id,comment_id)).
//   * is_within_24h_window       → platform_crm_is_within_24h_window(p_conversation_id).
//   * org-status guard (assertOrgActive) — REMOVIDO (não há tenant na plataforma).
//   * broadcast realtime         → broadcastPlatformNewMessage (mesmo do inbox).
//
// AUTH (super_admin OU service-role interno):
//   * Bearer == SERVICE_ROLE_KEY → chamada interna (executor/webhook). Sem gate
//     de super_admin (server-to-server). actorUserId/created_by no body é
//     opcional (vira sender_id da mensagem outbound quando presente).
//   * Bearer == JWT → precisa ser super_admin (authenticatePlatformAgent).
//
// Endpoints Graph (idênticos ao V5 — fidelidade 1:1):
//   dm/private_reply/media  → POST /{fb_page_id}/messages
//   comment_reply           → POST /{comment_id}/replies?message=...
//   like_comment            → POST /{comment_id}/likes
//
// Envio ANTES da persistência (falha não suja o histórico) — igual ao B1 da
// plataforma e ao meta-whatsapp-send.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { broadcastPlatformNewMessage } from '../_shared/platform-crm-webchat.ts';

function json(b: unknown, status = 200): Response {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** content_type do inbox de plataforma para uma mídia outbound. */
function mediaContentType(mediaType: string | undefined): string {
  switch (mediaType) {
    case 'image':
      return 'image';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    default:
      return 'document';
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  // ── AUTH: service-role interno (executor/webhook) OU super_admin JWT ───────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const bearer = authHeader.replace('Bearer ', '').trim();
  let actor: { id: string } | null = null;
  if (bearer === serviceRoleKey) {
    const actorId = (body?.actorUserId ?? body?.created_by) as string | undefined;
    if (actorId) actor = { id: String(actorId) };
  } else {
    const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
    if (errorResponse) return errorResponse;
    actor = user;
  }

  const {
    connection_id,
    conversation_id,
    recipient_id, // ig_sender_id (PSID)
    text,
    media, // { url, type: 'image'|'video'|'audio'|'file' }
    tag, // opcional: 'HUMAN_AGENT', etc.
    type, // 'dm' (default) | 'comment_reply' | 'private_reply' | 'like_comment'
    comment_id,
    quick_replies, // Array<{ title, payload }>
    buttons, // Array<{ title, payload }>
  } = body ?? {};

  const sendType: string = type || 'dm';

  // ── COMMENT REPLY (público) ────────────────────────────────────────────────
  if (sendType === 'comment_reply') {
    if (!connection_id || !comment_id || !text) {
      return json({ error: 'connection_id, comment_id e text são obrigatórios' }, 400);
    }
    const { data: conn } = await sb
      .from('platform_crm_instagram_connections')
      .select('id, page_access_token_encrypted')
      .eq('id', connection_id)
      .maybeSingle();
    if (!conn) return json({ error: 'connection not found' }, 404);
    try {
      const token = await decryptSecret(String(conn.page_access_token_encrypted ?? ''));
      const res = await graphFetch(
        `/${comment_id}/replies?message=${encodeURIComponent(String(text))}`,
        token,
        { method: 'POST' },
      );
      await sb.from('platform_crm_instagram_comment_replies').upsert(
        { connection_id, comment_id, replied_public: true },
        { onConflict: 'connection_id,comment_id' },
      );
      return json({ ok: true, comment_reply_id: (res as { id?: string })?.id ?? null });
    } catch (e) {
      const ge = e as GraphError;
      return json({ error: ge.graph?.message ?? String(e) }, ge.status ?? 500);
    }
  }

  // ── LIKE COMMENT ───────────────────────────────────────────────────────────
  if (sendType === 'like_comment') {
    if (!connection_id || !comment_id) {
      return json({ error: 'connection_id e comment_id são obrigatórios' }, 400);
    }
    const { data: conn } = await sb
      .from('platform_crm_instagram_connections')
      .select('id, page_access_token_encrypted')
      .eq('id', connection_id)
      .maybeSingle();
    if (!conn) return json({ error: 'connection not found' }, 404);
    try {
      const token = await decryptSecret(String(conn.page_access_token_encrypted ?? ''));
      await graphFetch(`/${comment_id}/likes`, token, { method: 'POST' });
      await sb.from('platform_crm_instagram_comment_replies').upsert(
        { connection_id, comment_id, liked: true },
        { onConflict: 'connection_id,comment_id' },
      );
      return json({ ok: true });
    } catch (e) {
      const ge = e as GraphError;
      return json({ error: ge.graph?.message ?? String(e) }, ge.status ?? 500);
    }
  }

  // ── DM / PRIVATE REPLY ─────────────────────────────────────────────────────
  let connId: string | null = connection_id ?? null;
  let toId: string | null = recipient_id ?? null;

  // Resolve conexão + destino pela conversa (o remetente IG mora em visitor_id).
  if (conversation_id && (!connId || !toId)) {
    const { data: conv } = await sb
      .from('platform_crm_conversations')
      .select('instagram_connection_id, visitor_id')
      .eq('id', conversation_id)
      .maybeSingle();
    if (!conv) return json({ error: 'conversation not found' }, 404);
    connId = connId ?? (conv.instagram_connection_id as string | null) ?? null;
    if (!toId) {
      const vid = String(conv.visitor_id ?? '');
      toId = vid.startsWith('ig:') ? vid.slice(3) : null;
    }
  }

  if (!connId) return json({ error: 'missing connection_id' }, 400);
  if (sendType !== 'private_reply' && !toId) return json({ error: 'missing recipient_id' }, 400);
  if (sendType === 'private_reply' && !comment_id) {
    return json({ error: 'private_reply requer comment_id' }, 400);
  }

  const { data: conn, error: connErr } = await sb
    .from('platform_crm_instagram_connections')
    .select('id, fb_page_id, page_access_token_encrypted, status')
    .eq('id', connId)
    .maybeSingle();
  if (connErr || !conn) return json({ error: 'connection not found' }, 404);
  if (conn.status !== 'active') return json({ error: 'connection inactive' }, 422);
  if (!conn.fb_page_id) return json({ error: 'connection sem fb_page_id' }, 422);

  // Janela 24h — só p/ DM em conversa existente sem message tag (igual V5).
  if (sendType === 'dm' && conversation_id && !tag) {
    const { data: within } = await sb.rpc('platform_crm_is_within_24h_window', {
      p_conversation_id: conversation_id,
    });
    if (within === false) {
      return json(
        {
          error: 'OUT_OF_WINDOW',
          message:
            'Fora da janela 24h do Instagram. Para responder, use uma message tag (ex: HUMAN_AGENT) ou aguarde o usuário enviar nova mensagem.',
        },
        422,
      );
    }
  }

  let token: string;
  try {
    token = await decryptSecret(String(conn.page_access_token_encrypted ?? ''));
  } catch (e) {
    console.error('[platform-ig-send] token decrypt failed:', String(e).slice(0, 200));
    return json({ error: 'falha ao decriptar o token da conexão' }, 500);
  }

  // payload — private_reply endereça pelo comment_id; dm pelo recipient.id.
  const payload: Record<string, unknown> = sendType === 'private_reply'
    ? { recipient: { comment_id: String(comment_id) } }
    : {
        recipient: { id: String(toId) },
        messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE',
        ...(tag ? { tag } : {}),
      };

  const message: Record<string, unknown> = {};
  if (media?.url) {
    message.attachment = {
      type: media.type ?? 'image',
      payload: { url: media.url, is_reusable: false },
    };
  } else {
    message.text = String(text ?? '');
  }
  if (Array.isArray(quick_replies) && quick_replies.length > 0) {
    message.quick_replies = quick_replies.slice(0, 13).map((q: Record<string, unknown>) => ({
      content_type: 'text',
      title: String(q.title ?? q.label ?? '').slice(0, 20),
      payload: String(q.payload ?? q.title ?? ''),
    }));
  }
  if (Array.isArray(buttons) && buttons.length > 0) {
    message.attachment = {
      type: 'template',
      payload: {
        template_type: 'button',
        text: String(text ?? '').slice(0, 640) || '.',
        buttons: buttons.slice(0, 3).map((b: Record<string, unknown>) => ({
          type: 'postback',
          title: String(b.title ?? b.label ?? '').slice(0, 20),
          payload: String(b.payload ?? b.title ?? ''),
        })),
      },
    };
    delete message.text;
  }
  payload.message = message;

  let res: { message_id?: string } | null = null;
  try {
    res = await graphFetch<{ message_id?: string }>(`/${conn.fb_page_id}/messages`, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const ge = e as GraphError;
    // Registra a falha na conversa (igual V5) — histórico não fica em branco.
    if (conversation_id) {
      await sb.from('platform_crm_messages').insert({
        conversation_id,
        direction: 'outbound',
        sender_type: 'agent',
        ...(actor?.id ? { sender_id: actor.id } : {}),
        content: text ?? '[mídia]',
        content_type: 'text',
        metadata: {
          channel: 'instagram',
          connection_id: connId,
          delivery_status: 'failed',
          send_type: sendType,
          error: ge.graph?.message ?? String(e),
        },
      });
    }
    return json({ error: ge.graph?.message ?? String(e) }, ge.status ?? 500);
  }

  const mid = res?.message_id ?? null;

  // private_reply → marca dedup
  if (sendType === 'private_reply' && comment_id) {
    await sb.from('platform_crm_instagram_comment_replies').upsert(
      { connection_id: connId, comment_id, replied_private: true },
      { onConflict: 'connection_id,comment_id' },
    );
  }

  // Persiste outbound + broadcast quando há conversa (DM/ai_takeover).
  if (conversation_id) {
    const { data: inserted, error: insErr } = await sb
      .from('platform_crm_messages')
      .insert({
        conversation_id,
        direction: 'outbound',
        sender_type: 'agent',
        ...(actor?.id ? { sender_id: actor.id } : {}),
        content: text ?? (media?.url ?? '[mídia]'),
        content_type: media?.url ? mediaContentType(media?.type) : 'text',
        metadata: {
          ig_message_id: mid,
          channel: 'instagram',
          connection_id: connId,
          delivery_status: 'sent',
          send_type: sendType,
          ...(media ? { media } : {}),
        },
      })
      .select('*')
      .single();
    if (insErr) {
      // DM JÁ entregue — erro aqui não deve induzir reenvio (idempotência).
      console.error('[platform-ig-send] persist failed (DM JÁ entregue):', insErr.message);
    } else {
      await sb
        .from('platform_crm_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation_id);
      await broadcastPlatformNewMessage(sb, String(conversation_id), inserted as Record<string, unknown>);
    }
  }

  return json({ ok: true, ig_message_id: mid });
});
