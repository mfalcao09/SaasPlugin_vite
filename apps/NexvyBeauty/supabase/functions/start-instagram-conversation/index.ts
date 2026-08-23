// start-instagram-conversation — "+" Nova conversa no inbox do tenant (Instagram Login).
// verify_jwt=true (default). Identidade: IGSID / @username. Sem visitor_phone.
// Envio (se houver IGSID + mensagem) via graph.instagram.com/me/messages.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import {
  buildConversationMetadata,
  parseInstagramIdentity,
  postInstagramLoginMessage,
} from '../_shared/instagram-login-inbox.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ ok: false, error: 'Unauthorized' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();
    if (!profile?.organization_id) return json({ ok: false, error: 'No organization' }, 400);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const identity = parseInstagramIdentity({
      igsid: typeof body.ig_user_id === 'string' ? body.ig_user_id : null,
      username: typeof body.username === 'string' ? body.username : null,
      name: typeof body.lead_name === 'string' ? body.lead_name : null,
    });
    if (!identity) {
      return json({
        ok: false,
        created: false,
        error: 'Informe o Instagram user id ou o @username.',
      }, 400);
    }

    const requestedConnId = typeof body.connection_id === 'string' ? body.connection_id : null;
    let connQuery = supabase
      .from('instagram_login_connections')
      .select('id, organization_id, access_token_encrypted, status, username, instagram_user_id')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    if (requestedConnId) {
      connQuery = supabase
        .from('instagram_login_connections')
        .select('id, organization_id, access_token_encrypted, status, username, instagram_user_id')
        .eq('organization_id', profile.organization_id)
        .eq('id', requestedConnId)
        .eq('status', 'active')
        .limit(1);
    }
    const { data: conns } = await connQuery;
    const conn = conns?.[0];
    if (!conn) {
      return json({
        ok: false,
        created: false,
        error: 'Nenhuma conexão Instagram Comercial ativa.',
      }, 422);
    }

    const initialMessage = typeof body.initial_message === 'string'
      ? body.initial_message.trim()
      : '';

    if (initialMessage && !identity.igsid) {
      return json({
        ok: false,
        created: false,
        error: 'Para enviar a primeira Direct informe o Instagram user id (IGSID), não só o @username.',
      }, 400);
    }

    if (initialMessage && identity.igsid) {
      let accessToken = '';
      try {
        accessToken = await decryptSecret(String(conn.access_token_encrypted ?? ''));
      } catch (e) {
        console.error('[start-instagram-conversation] decrypt failed:', e);
        return json({ ok: false, created: false, error: 'Falha ao ler o token da conexão Instagram.' }, 500);
      }
      const sent = await postInstagramLoginMessage({
        accessToken,
        recipientId: identity.igsid,
        text: initialMessage,
      });
      if (!sent.ok) {
        console.error('[start-instagram-conversation] send blocked create:', sent.error);
        return json({
          ok: false,
          created: false,
          error: 'Não foi possível enviar a Direct. Confira a conexão Instagram e a janela de 24h.',
        });
      }
    }

    const { data: existing } = await supabase
      .from('webchat_conversations')
      .select('id, status')
      .eq('organization_id', profile.organization_id)
      .eq('channel', 'instagram')
      .eq('visitor_id', identity.visitorId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('webchat_conversations')
        .update({ assigned_user_id: user.id, status: 'human_active', closed_at: null })
        .eq('id', existing[0].id);

      if (initialMessage) {
        await supabase.from('webchat_messages').insert({
          conversation_id: existing[0].id,
          content: initialMessage,
          sender_type: 'agent',
          direction: 'outbound',
          sender_id: user.id,
          metadata: {
            channel: 'instagram',
            instagram_login_connection_id: conn.id,
            delivery_status: 'sent',
          },
        });
      }
      return json({ ok: true, conversation_id: existing[0].id, is_new: false });
    }

    const { data: widget } = await supabase
      .from('webchat_widgets')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const leadId = typeof body.lead_id === 'string' ? body.lead_id : null;
    const conversationData: Record<string, unknown> = {
      organization_id: profile.organization_id,
      visitor_id: identity.visitorId,
      channel: 'instagram',
      status: 'human_active',
      assigned_user_id: user.id,
      visitor_phone: null,
      visitor_name: identity.displayName,
      metadata: buildConversationMetadata(conn.id, identity),
    };
    if (widget?.id) conversationData.widget_id = widget.id;
    if (leadId) conversationData.lead_id = leadId;

    const { data: newConv, error: insertError } = await supabase
      .from('webchat_conversations')
      .insert(conversationData)
      .select('id')
      .single();

    if (insertError || !newConv) {
      console.error('[start-instagram-conversation] insert failed:', insertError);
      return json({ ok: false, created: false, error: 'Não foi possível criar a conversa.' }, 500);
    }

    if (initialMessage) {
      await supabase.from('webchat_messages').insert({
        conversation_id: newConv.id,
        content: initialMessage,
        sender_type: 'agent',
        direction: 'outbound',
        sender_id: user.id,
        metadata: {
          channel: 'instagram',
          instagram_login_connection_id: conn.id,
          delivery_status: 'sent',
        },
      });
    }

    return json({ ok: true, conversation_id: newConv.id, is_new: true });
  } catch (e) {
    console.error('[start-instagram-conversation]', e);
    return json({ ok: false, created: false, error: 'Erro interno' }, 500);
  }
});
