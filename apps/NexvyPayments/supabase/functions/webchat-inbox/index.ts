import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');

    // Allow action via JSON body too (supabase.functions.invoke style)
    let bodyJson: any = null;
    if (!action && req.method !== 'GET' && req.method !== 'OPTIONS') {
      try {
        const cloned = req.clone();
        bodyJson = await cloned.json();
        if (bodyJson && typeof bodyJson.action === 'string') {
          action = bodyJson.action;
        }
      } catch (_) { /* no body or invalid json */ }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth user from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    // Decodifica o JWT localmente (sem round-trip HTTP). Evita IDLE_TIMEOUT
    // quando o endpoint /auth/v1/jwks fica lento ou indisponível.
    let user: { id: string; email: string } | null = null;
    try {
      const payloadB64 = token.split('.')[1];
      if (payloadB64) {
        const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(padded + '==='.slice(0, (4 - padded.length % 4) % 4));
        const claims = JSON.parse(json);
        const exp = typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
        if (claims.sub && (!exp || exp > Date.now())) {
          user = { id: claims.sub as string, email: (claims.email as string) || '' };
        }
      }
    } catch (_) { /* token inválido */ }

    if (!user?.id) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parallelize profile + roles fetch (was sequential, ~2 round-trips)
    // Retry on transient 502/network errors from Postgrest (Cloudflare upstream)
    const fetchWithRetry = async <T>(fn: () => Promise<T>, label: string): Promise<T> => {
      let lastErr: any;
      for (let i = 0; i < 3; i++) {
        try {
          const res: any = await fn();
          // Postgrest returns HTML string in error.message on Cloudflare 502
          if (res?.error && typeof res.error.message === 'string' && res.error.message.includes('<!DOCTYPE html>')) {
            lastErr = new Error(`${label}: upstream 502`);
            await new Promise(r => setTimeout(r, 200 * (i + 1)));
            continue;
          }
          return res;
        } catch (e) {
          lastErr = e;
          await new Promise(r => setTimeout(r, 200 * (i + 1)));
        }
      }
      throw lastErr;
    };

    let profile: any = null;
    let roles: any = null;
    try {
      const [pRes, rRes]: any = await Promise.all([
        fetchWithRetry(() => supabase.from('profiles').select('organization_id').eq('id', user!.id).single(), 'profiles'),
        fetchWithRetry(() => supabase.from('user_roles').select('role').eq('user_id', user!.id), 'user_roles'),
      ]);
      profile = pRes?.data;
      roles = rRes?.data;
    } catch (e) {
      console.error('[webchat-inbox] DB unavailable (upstream):', (e as Error).message);
      return new Response(
        JSON.stringify({ error: 'Backend temporarily unavailable. Please retry.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const isSuperAdmin = roles?.some((r: any) => r.role === 'super_admin') || false;

    if (!profile?.organization_id && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'User has no organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orgId = profile?.organization_id || null;

    // Helper para parsear listas de UUID/strings via querystring (vírgula-separada).
    // Suporta valores especiais: __none__ (sem produto/setor), unassigned (sem atendente).
    const parseIdList = (raw: string | null): { ids: string[] | null; includeNone: boolean; includeUnassigned: boolean } => {
      if (!raw) return { ids: null, includeNone: false, includeUnassigned: false };
      const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
      const includeNone = parts.includes('__none__');
      const includeUnassigned = parts.includes('unassigned');
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const ids = parts.filter(p => UUID_RE.test(p));
      return { ids: ids.length ? ids : null, includeNone, includeUnassigned };
    };

    // ACTION: List conversations (via RPC: filtros + permissões aplicados no SQL)
    if (action === 'conversations') {
      const tabRaw = (url.searchParams.get('tab') || 'attending').toLowerCase();
      const tab = ['attending', 'waiting', 'resolved', 'all'].includes(tabRaw) ? tabRaw : 'attending';

      const { ids: productIds, includeNone: includeNoProduct } = parseIdList(url.searchParams.get('product_ids'));
      const { ids: sectorIds, includeNone: includeNoSector } = parseIdList(url.searchParams.get('sector_ids'));
      const { ids: assignedUserIds, includeUnassigned } = parseIdList(url.searchParams.get('assigned_user_ids'));
      const { ids: tagIds } = parseIdList(url.searchParams.get('tag_ids'));
      const channel = url.searchParams.get('channel');
      const search = url.searchParams.get('search');
      const cursor = url.searchParams.get('cursor');
      const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
      const limit = Math.max(1, Math.min(isFinite(limitRaw) ? limitRaw : 50, 200));

      const { data: rows, error } = await supabase.rpc('inbox_list_conversations', {
        p_user_id: user.id,
        p_tab: tab,
        p_product_ids: productIds,
        p_include_no_product: includeNoProduct,
        p_sector_ids: sectorIds,
        p_include_no_sector: includeNoSector,
        p_assigned_user_ids: assignedUserIds,
        p_include_unassigned: includeUnassigned,
        p_tag_ids: tagIds,
        p_channel: channel || null,
        p_search: search || null,
        p_cursor_last_message_at: cursor || null,
        p_limit: limit,
      });

      if (error) {
        console.error('[webchat-inbox] inbox_list_conversations error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch conversations', detail: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reagrupa em formato compatível com o frontend (objetos aninhados).
      const conversations = (rows || []).map((r: any) => ({
        id: r.id,
        organization_id: r.organization_id,
        widget_id: r.widget_id,
        visitor_id: r.visitor_id,
        lead_id: r.lead_id,
        product_id: r.product_id,
        assigned_user_id: r.assigned_user_id,
        current_agent_id: r.current_agent_id,
        sector_id: r.sector_id,
        evolution_instance_id: r.evolution_instance_id,
        status: r.status,
        channel: r.channel,
        needs_human: r.needs_human,
        last_message_at: r.last_message_at,
        unread_count_agents: r.unread_count_agents,
        created_at: r.created_at,
        updated_at: r.updated_at,
        closed_at: r.closed_at,
        visitor_name: r.visitor_name,
        visitor_email: r.visitor_email,
        visitor_phone: r.visitor_phone,
        visitor_avatar_url: r.visitor_avatar_url,
        visitor_whatsapp: r.visitor_whatsapp,
        accepted_at: r.accepted_at,
        accepted_by: r.accepted_by,
        // Última mensagem real da conversa (vinda do histórico via RPC)
        last_message: r.last_message_content ?? null,
        last_message_metadata: r.last_message_metadata ?? null,
        last_message_sender_type: r.last_message_sender_type ?? null,
        last_message_created_at: r.last_message_created_at ?? null,
        webchat_widgets: r.widget_id
          ? { name: r.widget_name, primary_color: r.widget_primary_color, product_id: r.widget_product_id }
          : null,
        profiles: r.assigned_user_id
          ? { id: r.assigned_user_id, full_name: r.assigned_user_name, avatar_url: r.assigned_user_avatar }
          : null,
        current_agent: r.current_agent_id
          ? { id: r.current_agent_id, name: r.current_agent_name, avatar_url: r.current_agent_avatar }
          : null,
        sectors: r.sector_id
          ? { id: r.sector_id, name: r.sector_name, color: r.sector_color }
          : null,
        leads: r.lead_id
          ? { id: r.lead_id, name: r.lead_name, email: r.lead_email, phone: r.lead_phone, product_id: r.lead_product_id }
          : null,
        product: r.effective_product_id
          ? { id: r.effective_product_id, name: r.effective_product_name }
          : null,
      }));

      const missingLastMessage = conversations.filter((c: any) =>
        c.last_message_at && !String(c.last_message || '').trim()
      );

      if (missingLastMessage.length > 0) {
        const fallbackByConversation = new Map<string, any>();
        const chunkSize = 10;

        for (let i = 0; i < missingLastMessage.length; i += chunkSize) {
          const chunk = missingLastMessage.slice(i, i + chunkSize);
          const fallbackResults = await Promise.all(
            chunk.map(async (conversation: any) => {
              const { data, error } = await supabase
                .from('webchat_messages')
                .select('conversation_id, content, metadata, sender_type, created_at')
                .eq('conversation_id', conversation.id)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (error) {
                console.warn('[webchat-inbox] last message fallback failed:', conversation.id, error.message);
                return null;
              }

              return data;
            }),
          );

          for (const message of fallbackResults) {
            if (message?.conversation_id) fallbackByConversation.set(message.conversation_id, message);
          }
        }

        for (const conversation of conversations as any[]) {
          const fallback = fallbackByConversation.get(conversation.id);
          if (!fallback) continue;
          conversation.last_message = fallback.content ?? null;
          conversation.last_message_metadata = fallback.metadata ?? null;
          conversation.last_message_sender_type = fallback.sender_type ?? null;
          conversation.last_message_created_at = fallback.created_at ?? null;
          conversation.last_message_at = fallback.created_at ?? conversation.last_message_at;
        }
      }

      const nextCursor = conversations.length === limit
        ? conversations[conversations.length - 1].last_message_at
        : null;

      return new Response(
        JSON.stringify({ conversations, next_cursor: nextCursor }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Conversation counts per tab (mesmos filtros, exceto status/tab)
    if (action === 'conversation_counts') {
      const { ids: productIds, includeNone: includeNoProduct } = parseIdList(url.searchParams.get('product_ids'));
      const { ids: sectorIds, includeNone: includeNoSector } = parseIdList(url.searchParams.get('sector_ids'));
      const { ids: assignedUserIds, includeUnassigned } = parseIdList(url.searchParams.get('assigned_user_ids'));
      const { ids: tagIds } = parseIdList(url.searchParams.get('tag_ids'));
      const channel = url.searchParams.get('channel');
      const search = url.searchParams.get('search');

      const { data: countRows, error } = await supabase.rpc('inbox_count_conversations', {
        p_user_id: user.id,
        p_product_ids: productIds,
        p_include_no_product: includeNoProduct,
        p_sector_ids: sectorIds,
        p_include_no_sector: includeNoSector,
        p_assigned_user_ids: assignedUserIds,
        p_include_unassigned: includeUnassigned,
        p_tag_ids: tagIds,
        p_channel: channel || null,
        p_search: search || null,
      });

      if (error) {
        console.error('[webchat-inbox] inbox_count_conversations error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch counts', detail: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const c = (countRows && countRows[0]) || { attending: 0, waiting: 0, resolved: 0 };
      return new Response(
        JSON.stringify({
          attending: Number(c.attending) || 0,
          waiting: Number(c.waiting) || 0,
          resolved: Number(c.resolved) || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Get single conversation with messages
    if (action === 'conversation') {
      const conversationId = url.searchParams.get('id');

      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: 'Conversation ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1) Carrega a conversa SEM joins (evita falhas por relacionamento ambíguo)
      const convQuery = supabase
        .from('webchat_conversations')
        .select('*')
        .eq('id', conversationId);
      // Super admin pode acessar conversas de qualquer organização
      if (orgId) convQuery.eq('organization_id', orgId);

      const [convRes, msgsRes] = await Promise.all([
        convQuery.maybeSingle(),
        supabase
          .from('webchat_messages')
          .select('id, conversation_id, content, content_type, sender_type, sender_id, message_type, video_url, metadata, created_at, reply_to_message_id, edited_at, original_content, is_deleted, is_starred, buttons, forwarded_from_message_id, profiles:sender_id(id, full_name, avatar_url), reply_to:reply_to_message_id(id, content, sender_type)')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(200)
      ]);

      // Erro real de banco != "não encontrado". Loga e devolve 500 com causa clara.
      if (convRes.error) {
        console.error('[webchat-inbox] conversation query error:', conversationId, convRes.error);
        return new Response(
          JSON.stringify({ error: 'Failed to load conversation', details: convRes.error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (msgsRes.error) {
        console.error('[webchat-inbox] messages query error:', conversationId, msgsRes.error);
      }

      const conversation: any = convRes.data;
      if (!conversation) {
        // Pode ser que exista mas esteja fora do escopo do usuário. Verifica sem filtro de org.
        const probe = await supabase
          .from('webchat_conversations')
          .select('id')
          .eq('id', conversationId)
          .maybeSingle();
        if (probe.data) {
          return new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sector-based gate (não-admin): mesma regra usada na listagem
      if (!isSuperAdmin) {
        const [{ data: userRoles }, { data: userPerms }, { data: userSectorRows }] = await Promise.all([
          supabase.from('user_roles').select('role').eq('user_id', user.id),
          supabase.from('user_permissions').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('sector_members').select('sector_id').eq('user_id', user.id),
        ]);
        const isAdmin = userRoles?.some((r: any) => r.role === 'admin' || r.role === 'super_admin') || false;
        if (!isAdmin) {
          const userSectorIds: string[] = (userSectorRows || []).map((r: any) => r.sector_id);
          const canViewQueue = !!userPerms?.view_queue_conversations;
          const canViewOtherUsers = !!userPerms?.view_other_users_conversations;
          const canViewOtherQueues = !!userPerms?.view_other_queues_conversations;
          const canViewUnassignedSector = !!userPerms?.view_unassigned_sector_tickets;

          let allowed = false;
          if (conversation.assigned_user_id === user.id) allowed = true;
          else if (!conversation.sector_id) allowed = canViewUnassignedSector;
          else if (!userSectorIds.includes(conversation.sector_id)) allowed = canViewOtherQueues;
          else if (!conversation.assigned_user_id) allowed = canViewQueue;
          else allowed = canViewOtherUsers;

          if (!allowed) {
            return new Response(
              JSON.stringify({ error: 'Forbidden' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }

      // 2) Hidrata joins de forma defensiva (qualquer falha vira null em vez de derrubar a conversa)
      const [widgetRes, assignedRes, agentRes, leadRes, sectorRes, productOverrideRes] = await Promise.all([
        conversation.widget_id
          ? supabase.from('webchat_widgets').select('id, name, primary_color, product_id, products(id, name)').eq('id', conversation.widget_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        conversation.assigned_user_id
          ? supabase.from('profiles').select('id, full_name, avatar_url').eq('id', conversation.assigned_user_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        conversation.current_agent_id
          ? supabase.from('product_agents').select('id, name, avatar_url').eq('id', conversation.current_agent_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        conversation.lead_id
          ? supabase.from('leads').select('id, name, email, phone, product_id, temperature').eq('id', conversation.lead_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        conversation.sector_id
          ? supabase.from('sectors').select('id, name, color').eq('id', conversation.sector_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        conversation.product_id
          ? supabase.from('products').select('id, name').eq('id', conversation.product_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      conversation.webchat_widgets = widgetRes?.data || null;
      conversation.profiles = assignedRes?.data || null;
      conversation.current_agent = agentRes?.data || null;
      conversation.leads = leadRes?.data || null;
      conversation.sectors = sectorRes?.data || null;

      // Produto efetivo: override manual da conversa > produto do lead vinculado > produto do widget
      const effectiveProduct =
        productOverrideRes?.data
          || (leadRes?.data?.product_id ? { id: leadRes.data.product_id, name: null } : null)
          || (widgetRes?.data?.products as any)
          || (widgetRes?.data?.product_id ? { id: widgetRes.data.product_id, name: widgetRes.data.name } : null);
      conversation.product = effectiveProduct;

      const messages = (msgsRes.data || []).reverse();

      // Reset unread count em background (não bloqueia a resposta)
      supabase
        .from('webchat_conversations')
        .update({ unread_count_agents: 0 })
        .eq('id', conversationId)
        .then(() => {}, () => {});

      return new Response(
        JSON.stringify({ conversation, messages }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Assign conversation (take ownership)
    if (action === 'assign' && req.method === 'POST') {
      const body = await req.json();
      const conversationId = body.conversation_id;

      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: 'Conversation ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if conversation is not already assigned (optimistic locking)
      const { data: conversation, error: checkError } = await supabase
        .from('webchat_conversations')
        .select('assigned_user_id, status')
        .eq('id', conversationId)
        .eq('organization_id', orgId)
        .single();

      if (checkError || !conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log previous assignee if transferring
      const previousAssignee = conversation.assigned_user_id;

      // Assign conversation (allow reassignment) — atendente único: limpa IA
      const { error: updateError } = await supabase
        .from('webchat_conversations')
        .update({
          assigned_user_id: user.id,
          status: 'human_active',
          closed_at: null,
          first_response_at: conversation.status === 'waiting_human' ? new Date().toISOString() : undefined,
          current_agent_id: null,
        })
        .eq('id', conversationId);

      if (updateError) {
        // If update failed, someone else may have taken it
        return new Response(
          JSON.stringify({ error: 'Failed to assign - may already be taken' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log assignment event
      await supabase.from('webchat_assignment_events').insert({
        conversation_id: conversationId,
        from_user_id: previousAssignee || null,
        to_user_id: user.id,
        action: previousAssignee ? 'transferred' : 'assigned',
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Send message as agent
    if (action === 'send' && req.method === 'POST') {
      const body = await req.json();

      // Aceita texto puro OU mídia. Se vier mídia, content pode ser '' (caption).
      const hasMedia = body.media && typeof body.media === 'object' && body.media.url && body.media.kind;
      if (!body.conversation_id || (!body.content && !hasMedia)) {
        return new Response(
          JSON.stringify({ error: 'conversation_id and content (or media) are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify agent has access to conversation
      const { data: conversation, error: convError } = await supabase
        .from('webchat_conversations')
        .select('id, assigned_user_id, status, channel, visitor_phone, evolution_instance_id')
        .eq('id', body.conversation_id)
        .eq('organization_id', orgId)
        .single();

      if (convError || !conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Auto-assign if not assigned — atendente único: limpa IA
      if (!conversation.assigned_user_id) {
        await supabase
          .from('webchat_conversations')
          .update({ 
            assigned_user_id: user.id,
            status: 'human_active',
            current_agent_id: null,
          })
          .eq('id', body.conversation_id);

        await supabase.from('webchat_assignment_events').insert({
          conversation_id: body.conversation_id,
          to_user_id: user.id,
          action: 'auto_assigned',
        });
      }

      // Save message with optional reply_to + media metadata
      const insertData: Record<string, unknown> = {
        conversation_id: body.conversation_id,
        direction: 'outbound',
        sender_type: 'agent',
        sender_id: user.id,
        content: body.content || '',
      };
      if (body.reply_to_message_id) {
        insertData.reply_to_message_id = body.reply_to_message_id;
      }
      if (hasMedia) {
        insertData.content_type = body.media.kind;
        insertData.metadata = { media: body.media };
      }

      const { data: message, error: msgError } = await supabase
        .from('webchat_messages')
        .insert(insertData)
        .select('*, profiles:sender_id(id, full_name, avatar_url)')
        .single();

      if (msgError) {
        return new Response(
          JSON.stringify({ error: 'Failed to send message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update conversation
      await supabase
        .from('webchat_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          status: 'human_active',
        })
        .eq('id', body.conversation_id);

      // If channel is whatsapp, route via Evolution Go
      if (conversation.channel === 'whatsapp' && conversation.visitor_phone) {
        try {
          let phone = conversation.visitor_phone.replace(/\D/g, '');
          if (!phone.startsWith('55')) phone = '55' + phone;

          // Auto-resolve evolution_instance_id se ainda não vinculada
          let evoInstanceId = conversation.evolution_instance_id as string | null;
          if (!evoInstanceId) {
            const { data: inst } = await supabase
              .from('evolution_instances')
              .select('id')
              .eq('organization_id', orgId)
              .eq('status', 'connected')
              .order('is_default', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (inst?.id) {
              evoInstanceId = inst.id;
              await supabase
                .from('webchat_conversations')
                .update({ evolution_instance_id: inst.id })
                .eq('id', body.conversation_id);
              console.log('[webchat-inbox] Auto-resolved Evolution instance:', inst.id);
            }
          }

          if (evoInstanceId) {
            console.log('[webchat-inbox] Routing via Evolution Go - phone:', phone, 'instance_id:', evoInstanceId, 'message_id:', message.id, 'has_media:', hasMedia);

            // Monta payload conforme o tipo (mídia x texto)
            let evoBody: Record<string, unknown>;
            if (hasMedia) {
              const m = body.media;
              // TODOS os tipos de mídia (audio, image, video, document, sticker) usam /send/media.
              // O servidor Evolution Go não expõe /send/audio — áudio precisa ir como media com type=audio.
              evoBody = {
                organization_id: orgId,
                instance_id: evoInstanceId,
                type: 'media',
                to: phone,
                payload: {
                  type: m.kind === 'sticker' ? 'image' : m.kind, // Evolution não tem sticker dedicado, manda como image
                  url: m.url,
                  mimetype: m.mime || (m.kind === 'audio' ? 'audio/ogg' : undefined),
                  fileName: m.filename || (m.kind === 'audio' ? `audio-${Date.now()}.ogg` : undefined),
                  caption: m.kind === 'audio' ? undefined : (body.content || m.caption || undefined),
                },
              };
            } else {
              evoBody = {
                organization_id: orgId,
                instance_id: evoInstanceId,
                type: 'text',
                to: phone,
                payload: { text: body.content },
              };
            }

            const { data: sendData, error: sendErr } = await supabase.functions.invoke('evolution-send', { body: evoBody });
            const sendOk = !sendErr && (sendData as any)?.ok !== false;
            if (!sendOk) {
              console.error('[webchat-inbox] evolution-send FAILED:', JSON.stringify({ sendErr, sendData }).slice(0, 500));
              // Mark message as failed delivery — preserva metadata.media existente
              const baseMeta = (insertData.metadata as Record<string, unknown>) || {};
              await supabase
                .from('webchat_messages')
                .update({
                  metadata: {
                    ...baseMeta,
                    delivery_status: 'failed',
                    error: sendErr?.message || (sendData as any)?.body || 'Unknown error',
                    failed_at: new Date().toISOString(),
                  },
                })
                .eq('id', message.id);
            } else {
              console.log('[webchat-inbox] Sent via Evolution Go:', JSON.stringify(sendData).slice(0, 200));
            }
          } else {
            // Sem instância Evolution conectada — marca falha visível
            console.error('[webchat-inbox] No connected Evolution instance for org', orgId);
            const baseMeta = (insertData.metadata as Record<string, unknown>) || {};
            await supabase
              .from('webchat_messages')
              .update({
                metadata: {
                  ...baseMeta,
                  delivery_status: 'failed',
                  error: 'Nenhuma instância WhatsApp conectada. Conecte uma instância em Configurações → WhatsApp.',
                  failed_at: new Date().toISOString(),
                },
              })
              .eq('id', message.id);
          }
        } catch (sendError) {
          console.error('[webchat-inbox] WhatsApp send error (non-fatal):', sendError);
        }
      }

      // Broadcast message to all listeners on this conversation channel.
      // Inclui `client_temp_id` (se enviado) para o frontend conseguir substituir
      // a bolha otimista pela mensagem real, evitando duplicação visual.
      const broadcastPayload = body.client_temp_id
        ? { ...message, client_temp_id: body.client_temp_id }
        : message;
      try {
        const channel = supabase.channel(`conversation:${body.conversation_id}`);
        await channel.send({
          type: 'broadcast',
          event: 'new_message',
          payload: broadcastPayload,
        });
        await supabase.removeChannel(channel);
      } catch (broadcastError) {
        console.error('Broadcast error (non-fatal):', broadcastError);
      }

      return new Response(
        JSON.stringify({ message: broadcastPayload }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Close conversation
    if (action === 'close' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('webchat_conversations')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', body.conversation_id)
        .eq('organization_id', orgId);

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to close conversation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Accept ticket (with mandatory sector + admin takeover support)
    if (action === 'accept' && req.method === 'POST') {
      const body = bodyJson || (await req.json());
      const conversationId = body.conversation_id;
      const sectorId = body.sector_id || null;
      const force = body.force === true; // admin takeover from another agent or from AI

      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Roles & sectors
      const [{ data: convRow }, { data: rolesRow }, { data: sectorRows }] = await Promise.all([
        supabase
          .from('webchat_conversations')
          .select('id, organization_id, status, sector_id, assigned_user_id')
          .eq('id', conversationId)
          .maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', user.id),
        supabase.from('sector_members').select('sector_id').eq('user_id', user.id),
      ]);

      if (!convRow) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (orgId && convRow.organization_id !== orgId) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isAdminAccept = (rolesRow || []).some((r: any) => r.role === 'admin' || r.role === 'super_admin');
      const userSectorIds: string[] = (sectorRows || []).map((r: any) => r.sector_id);

      // If conversation is already attended by another user, only admins (or force) can take it over.
      if (
        convRow.assigned_user_id &&
        convRow.assigned_user_id !== user.id &&
        !isAdminAccept &&
        !force
      ) {
        return new Response(
          JSON.stringify({ error: 'Conversation already assigned to another agent' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sector validation — fallback to org's default sector if missing
      let finalSectorId = sectorId || convRow.sector_id || null;
      if (!finalSectorId) {
        const { data: defaultSector } = await supabase
          .from('sectors')
          .select('id')
          .eq('organization_id', convRow.organization_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        finalSectorId = defaultSector?.id || null;
      }
      if (!finalSectorId) {
        return new Response(
          JSON.stringify({ error: 'Nenhum setor configurado para esta organização. Crie um setor antes de aceitar conversas.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!isAdminAccept && !userSectorIds.includes(finalSectorId)) {
        return new Response(
          JSON.stringify({ error: 'You are not a member of this sector' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const previousAssignee = convRow.assigned_user_id;

      // Update conversation — atendente único: limpa IA
      const { error: upErr } = await supabase
        .from('webchat_conversations')
        .update({
          assigned_user_id: user.id,
          sector_id: finalSectorId,
          status: 'human_active',
          accepted_at: new Date().toISOString(),
          accepted_by: user.id,
          current_agent_id: null,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (upErr) {
        console.error('[webchat-inbox] accept update error:', upErr);
        return new Response(
          JSON.stringify({ error: 'Failed to accept ticket', details: upErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Audit event
      await supabase.from('webchat_assignment_events').insert({
        conversation_id: conversationId,
        from_user_id: previousAssignee || null,
        to_user_id: user.id,
        action: previousAssignee && previousAssignee !== user.id ? 'taken_over_by_admin' : 'accepted',
      });

      // System message
      const [{ data: profile }, { data: sector }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
        supabase.from('sectors').select('name').eq('id', finalSectorId).maybeSingle(),
      ]);
      const sysMsg = previousAssignee && previousAssignee !== user.id
        ? `👮 ${profile?.full_name || 'Admin'} assumiu o atendimento — setor ${sector?.name || ''}`
        : `✋ ${profile?.full_name || 'Agente'} aceitou o atendimento — setor ${sector?.name || ''}`;
      await supabase.from('webchat_messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'bot',
        content: sysMsg,
      });

      return new Response(
        JSON.stringify({ success: true, status: 'human_active', sector_id: finalSectorId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Reopen a closed conversation
    if (action === 'reopen' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: conv } = await supabase
        .from('webchat_conversations')
        .select('assigned_user_id, status')
        .eq('id', body.conversation_id)
        .eq('organization_id', orgId)
        .single();

      if (!conv) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reopening a closed conversation puts it back into the human queue
      // and clears the previous assignment so any sector member can pick it up.
      const newStatus = 'waiting_human';

      await supabase
        .from('webchat_conversations')
        .update({
          status: newStatus,
          closed_at: null,
          orchestrator_state: 'triagem',
          orchestrator_context: null,
          orchestrator_question_count: 0,
          current_agent_id: null,
          assigned_user_id: null,
          needs_human: false,
        })
        .eq('id', body.conversation_id);

      // Log event
      await supabase.from('webchat_assignment_events').insert({
        conversation_id: body.conversation_id,
        to_user_id: user.id,
        action: 'reopened',
      });

      // Insert system message
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      await supabase.from('webchat_messages').insert({
        conversation_id: body.conversation_id,
        direction: 'outbound',
        sender_type: 'bot',
        content: `📋 Conversa reaberta por ${profile?.full_name || 'agente'}`,
      });

      return new Response(
        JSON.stringify({ success: true, status: newStatus }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Return conversation to queue
    if (action === 'return-to-queue' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('webchat_conversations')
        .update({
          assigned_user_id: null,
          status: 'waiting_human',
        })
        .eq('id', body.conversation_id)
        .eq('organization_id', orgId);

      await supabase.from('webchat_assignment_events').insert({
        conversation_id: body.conversation_id,
        from_user_id: user.id,
        action: 'returned_to_queue',
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Resume conversation (force status to human_active)
    if (action === 'resume' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('webchat_conversations')
        .update({
          assigned_user_id: user.id,
          status: 'human_active',
        })
        .eq('id', body.conversation_id)
        .eq('organization_id', orgId);

      await supabase.from('webchat_assignment_events').insert({
        conversation_id: body.conversation_id,
        to_user_id: user.id,
        action: 'resumed',
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Link to lead
    if (action === 'link-lead' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get conversation details
      const { data: conversation, error: convError } = await supabase
        .from('webchat_conversations')
        .select('*')
        .eq('id', body.conversation_id)
        .eq('organization_id', orgId)
        .single();

      if (convError || !conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let leadId = body.lead_id;

      // If no lead_id provided, create new lead
      if (!leadId) {
        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert({
            organization_id: orgId,
            name: conversation.visitor_name || conversation.visitor_email || 'Visitante Web Chat',
            email: conversation.visitor_email,
            phone: conversation.visitor_phone,
            lead_channel: 'webchat',
            source: 'Chat do Site',
            landing_page: conversation.current_page_url,
            referrer_url: conversation.referrer_url,
            utm_source: conversation.utm_source,
            utm_medium: conversation.utm_medium,
            utm_campaign: conversation.utm_campaign,
            utm_content: conversation.utm_content,
            utm_term: conversation.utm_term,
            assigned_to: conversation.assigned_user_id || user.id,
          })
          .select()
          .single();

        if (leadError) {
          console.error('Error creating lead:', leadError);
          return new Response(
            JSON.stringify({ error: 'Failed to create lead' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        leadId = newLead.id;
      }

      // Link conversation to lead
      const { error: updateError } = await supabase
        .from('webchat_conversations')
        .update({ lead_id: leadId })
        .eq('id', body.conversation_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Failed to link lead' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get the linked lead
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      // Se a conversa ainda não tem produto definido e o lead tem, herda automaticamente.
      if (lead?.product_id && !conversation.product_id) {
        await supabase
          .from('webchat_conversations')
          .update({ product_id: lead.product_id })
          .eq('id', body.conversation_id);
      }

      // Broadcast: notifica clientes que o detalhe da conversa mudou
      try {
        const ch = supabase.channel(`conversation:${body.conversation_id}`);
        await ch.send({ type: 'broadcast', event: 'conversation_updated', payload: { lead_id: leadId } });
      } catch (e) {
        console.error('[link-lead] broadcast failed (non-fatal):', e);
      }

      return new Response(
        JSON.stringify({ success: true, lead }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Set conversation product (override manual pelo atendente)
    if (action === 'set-product' && req.method === 'POST') {
      const body = bodyJson || await req.json();
      const conversationId = body.conversation_id;
      const productId = body.product_id ?? null; // permite null = limpar override

      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Garante que a conversa pertence à org do usuário
      const { data: conv, error: convErr } = await supabase
        .from('webchat_conversations')
        .select('id, organization_id, lead_id')
        .eq('id', conversationId)
        .maybeSingle();

      if (convErr || !conv) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (conv.organization_id !== orgId) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Se foi passado product_id, valida que pertence à org
      if (productId) {
        const { data: prod } = await supabase
          .from('products')
          .select('id, organization_id')
          .eq('id', productId)
          .maybeSingle();
        if (!prod || prod.organization_id !== orgId) {
          return new Response(
            JSON.stringify({ error: 'Invalid product' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { error: upErr } = await supabase
        .from('webchat_conversations')
        .update({ product_id: productId })
        .eq('id', conversationId);

      if (upErr) {
        return new Response(
          JSON.stringify({ error: upErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Se há lead vinculado, propaga o produto pro lead também (mantém consistência do CRM).
      if (productId && conv.lead_id) {
        await supabase
          .from('leads')
          .update({ product_id: productId })
          .eq('id', conv.lead_id);
      }

      // Notifica clientes em realtime
      try {
        const ch = supabase.channel(`conversation:${conversationId}`);
        await ch.send({ type: 'broadcast', event: 'conversation_updated', payload: { product_id: productId } });
        supabase.removeChannel(ch);
      } catch (_) { /* best-effort */ }

      return new Response(
        JSON.stringify({ success: true, product_id: productId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Activate bot (AI takes over with context)
    if (action === 'activate-bot' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get conversation with widget info
      const { data: conv } = await supabase
        .from('webchat_conversations')
        .select('*, webchat_widgets(product_id)')
        .eq('id', body.conversation_id)
        .eq('organization_id', orgId)
        .single();
      
      const isWhatsApp = conv?.channel === 'whatsapp';
      const isiChatToken = Deno.env.get('ISICHAT_TOKEN');

      if (!conv) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update status to bot_active
      await supabase
        .from('webchat_conversations')
        .update({ status: 'bot_active' })
        .eq('id', body.conversation_id);

      // Get user's profile name
      const { data: agentProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      // Insert system message
      await supabase.from('webchat_messages').insert({
        conversation_id: body.conversation_id,
        direction: 'outbound',
        sender_type: 'bot',
        content: `📋 Bot ativado por ${agentProfile?.full_name || 'agente'}`,
      });

      // Log event
      await supabase.from('webchat_assignment_events').insert({
        conversation_id: body.conversation_id,
        from_user_id: user.id,
        action: 'bot_activated',
      });

      // Trigger bot to send a strategic message based on context
      const productId = conv.webchat_widgets?.product_id;
      if (productId) {
        // Get agent config
        const { data: agentConfig } = await supabase
          .from('webchat_agent_configs')
          .select('*')
          .eq('widget_id', conv.widget_id)
          .maybeSingle();

        if (agentConfig) {
          try {
            // Call webchat-bot internally to generate contextual message
            const botUrl = `${supabaseUrl}/functions/v1/webchat-bot`;
            const botResponse = await fetch(botUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                conversation_id: body.conversation_id,
                message: '[SISTEMA] O agente humano ativou o bot. Analise o histórico da conversa e envie uma mensagem estratégica para reconectar com o lead, considerando todo o contexto anterior.',
                product_id: productId,
                visitor_name: conv.visitor_name,
                agent_config: {
                  agent_name: agentConfig.agent_name || 'Assistente',
                  system_prompt: agentConfig.system_prompt || '',
                  sales_prompt: agentConfig.sales_prompt,
                  knowledge_base: agentConfig.knowledge_base,
                  faq: agentConfig.faq || [],
                  fallback_message: agentConfig.fallback_message || 'Olá! Como posso ajudar?',
                  temperature: agentConfig.temperature ?? 0.7,
                  max_tokens: agentConfig.max_tokens ?? 500,
                  persona_style: agentConfig.persona_style || 'friendly',
                  use_product_brain: agentConfig.use_product_brain ?? true,
                },
              }),
            });

            // For external channels (WhatsApp, Instagram, Facebook), send the bot response via the appropriate API
            const isExternalChannel = ['whatsapp', 'instagram', 'facebook'].includes(conv.channel || '');
            if (isExternalChannel && botResponse.ok) {
              try {
                const botData = await botResponse.json();
                // Prefer chunks (natural multi-part messaging) over single content
                const chunks: string[] = Array.isArray(botData?.chunks) && botData.chunks.length > 0
                  ? botData.chunks.filter((c: any) => typeof c === 'string' && c.trim().length > 0)
                  : (botData?.message?.content
                      ? [String(botData.message.content)]
                      : (botData?.response ? [String(botData.response)] : []));

                if (chunks.length > 0 && conv.visitor_phone && conv.channel === 'whatsapp') {
                  // Use unified evolution-send (resolves the org's default/correct instance)
                  for (let i = 0; i < chunks.length; i++) {
                    const text = chunks[i];
                    try {
                      const sendRes = await fetch(`${supabaseUrl}/functions/v1/evolution-send`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${supabaseKey}`,
                          apikey: supabaseKey,
                        },
                        body: JSON.stringify({
                          organization_id: orgId,
                          instance_id: (conv as any).evolution_instance_id || null,
                          type: 'text',
                          to: conv.visitor_phone,
                          payload: { text },
                        }),
                      });
                      const sendBody = await sendRes.text();
                      console.log('[webchat-inbox] activate-bot send chunk', i + 1, '/', chunks.length, 'status:', sendRes.status, 'body:', sendBody.slice(0, 200));
                    } catch (sendErr) {
                      console.error('[webchat-inbox] activate-bot send exception:', sendErr);
                    }
                    if (i < chunks.length - 1) {
                      await new Promise((r) => setTimeout(r, 1200));
                    }
                  }
                } else if (chunks.length === 0) {
                  console.warn('[webchat-inbox] activate-bot: bot returned no content to deliver');
                }
              } catch (sendError) {
                console.error('[webchat-inbox] External send error (non-fatal):', sendError);
              }
            } else if (!botResponse.ok) {
              const errText = await botResponse.text();
              console.error('[webchat-inbox] Bot response error:', botResponse.status, errText);
            } else {
              // WebChat channel - consume response body to prevent resource leak
              await botResponse.text();
            }
          } catch (botError) {
            console.error('[webchat-inbox] Bot activation error (non-fatal):', botError);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: AI Reactivate - Send contextual reactivation message without changing status
    if (action === 'ai-reactivate' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get conversation with widget info
      const { data: conv } = await supabase
        .from('webchat_conversations')
        .select('*, webchat_widgets(product_id)')
        .eq('id', body.conversation_id)
        .eq('organization_id', orgId)
        .single();

      if (!conv) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get last 20 messages for context
      const { data: historyMessages } = await supabase
        .from('webchat_messages')
        .select('content, direction, sender_type, created_at')
        .eq('conversation_id', body.conversation_id)
        .order('created_at', { ascending: false })
        .limit(20);

      const hasHistory = historyMessages && historyMessages.length > 0;
      const visitorName = conv.visitor_name || 'cliente';
      const productId = conv.webchat_widgets?.product_id;

      let reactivationMessage: string;

      if (hasHistory && productId) {
        // Use AI to generate contextual reactivation message
        // Find the best agent for this product
        let agentId: string | null = null;
        const { data: defaultAgent } = await supabase
          .from('product_agents')
          .select('id')
          .eq('product_id', productId)
          .eq('is_default', true)
          .eq('is_active', true)
          .maybeSingle();

        if (defaultAgent) {
          agentId = defaultAgent.id;
        } else {
          const { data: firstAgent } = await supabase
            .from('product_agents')
            .select('id')
            .eq('product_id', productId)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          if (firstAgent) agentId = firstAgent.id;
        }

        // Build history summary
        const historyReversed = [...historyMessages].reverse();
        const historySummary = historyReversed.map(m => {
          const role = m.sender_type === 'visitor' ? visitorName : 'Agente';
          return `${role}: ${m.content}`;
        }).join('\n');

        try {
          const botUrl = `${supabaseUrl}/functions/v1/webchat-bot`;
          const botResponse = await fetch(botUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              conversation_id: body.conversation_id,
              message: `[SISTEMA] Você é um agente de reativação. Analise o histórico abaixo e envie UMA mensagem curta e estratégica para retomar a conversa com ${visitorName}. Seja natural, faça referência ao último assunto discutido e inclua uma pergunta aberta para reengajar. NÃO se apresente novamente. NÃO repita informações já fornecidas.\n\nHistórico:\n${historySummary}`,
              product_id: productId,
              visitor_name: visitorName,
              agent_id: agentId,
            }),
          });

          if (botResponse.ok) {
            const botData = await botResponse.json();
            reactivationMessage = botData.message?.content || botData.response || `Olá ${visitorName}! Percebi que não avançamos na nossa conversa. Ainda posso te ajudar?`;
          } else {
            await botResponse.text();
            reactivationMessage = `Olá ${visitorName}! Percebi que não avançamos na nossa conversa. Ainda posso te ajudar? 😊`;
          }
        } catch (botError) {
          console.error('[ai-reactivate] Bot error:', botError);
          reactivationMessage = `Olá ${visitorName}! Percebi que não avançamos na nossa conversa. Ainda posso te ajudar? 😊`;
        }
      } else {
        // No history - send default reactivation message
        reactivationMessage = `Olá ${visitorName}! Percebi que você demonstrou interesse em nossa solução, mas não avançamos na conversa. Você ainda tem interesse? Posso te enviar a demonstração pra você testar! 😊`;
      }

      // Save message as bot outbound (status stays the same)
      await supabase.from('webchat_messages').insert({
        conversation_id: body.conversation_id,
        direction: 'outbound',
        sender_type: 'bot',
        content: reactivationMessage,
      });

      // Update last_message_at
      await supabase
        .from('webchat_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', body.conversation_id);

      // Send via external channel if needed (use unified evolution-send for WhatsApp)
      const isExternalChannel = ['whatsapp', 'instagram', 'facebook'].includes(conv.channel || '');
      if (isExternalChannel && conv.visitor_phone && conv.channel === 'whatsapp') {
        try {
          const sendRes = await fetch(`${supabaseUrl}/functions/v1/evolution-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
            },
            body: JSON.stringify({
              organization_id: orgId,
              instance_id: (conv as any).evolution_instance_id || null,
              type: 'text',
              to: conv.visitor_phone,
              payload: { text: reactivationMessage },
            }),
          });
          const sendBody = await sendRes.text();
          console.log('[ai-reactivate] evolution-send status:', sendRes.status, 'body:', sendBody.slice(0, 200));
        } catch (sendError) {
          console.error('[ai-reactivate] External send error (non-fatal):', sendError);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: reactivationMessage }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Trigger a chat flow in a conversation
    if (action === 'trigger-flow' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id || !body.flow_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id and flow_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch flow
      const { data: flow } = await supabase
        .from('chat_flows')
        .select('*')
        .eq('id', body.flow_id)
        .eq('organization_id', orgId)
        .single();

      if (!flow) {
        return new Response(
          JSON.stringify({ error: 'Flow not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Set flow execution state on conversation
      await supabase
        .from('webchat_conversations')
        .update({
          current_flow_id: body.flow_id,
          current_block_id: flow.start_block_id,
          flow_variables: {},
        })
        .eq('id', body.conversation_id);

      // Insert system message
      await supabase.from('webchat_messages').insert({
        conversation_id: body.conversation_id,
        direction: 'outbound',
        sender_type: 'bot',
        content: `📋 Fluxo "${flow.name}" iniciado`,
      });

      return new Response(
        JSON.stringify({ success: true, flow_name: flow.name }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Edit message
    if (action === 'edit-message' && req.method === 'POST') {
      const body = await req.json();
      if (!body.message_id || !body.new_content) {
        return new Response(
          JSON.stringify({ error: 'message_id and new_content are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get original message
      const { data: origMsg } = await supabase
        .from('webchat_messages')
        .select('content, sender_id, sender_type, conversation_id')
        .eq('id', body.message_id)
        .single();

      if (!origMsg) {
        return new Response(
          JSON.stringify({ error: 'Message not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Only allow editing own agent messages
      if (origMsg.sender_type !== 'agent' || origMsg.sender_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Can only edit your own messages' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateError } = await supabase
        .from('webchat_messages')
        .update({
          content: body.new_content,
          original_content: origMsg.content,
          edited_at: new Date().toISOString(),
        })
        .eq('id', body.message_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: 'Failed to edit message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sync edit to WhatsApp - send corrective message
      const { data: editConv } = await supabase
        .from('webchat_conversations')
        .select('channel, visitor_phone, organization_id, evolution_instance_id')
        .eq('id', origMsg.conversation_id)
        .single();

      if (editConv?.channel === 'whatsapp' && editConv.visitor_phone) {
        try {
          let phone = editConv.visitor_phone.replace(/\D/g, '');
          if (!phone.startsWith('55')) phone = '55' + phone;
          const correctionMessage = `*Correção:* ${body.new_content}`;
          await supabase.functions.invoke('evolution-send', {
            body: {
              organization_id: orgId,
              instance_id: (editConv as any).evolution_instance_id || undefined,
              type: 'text',
              to: phone,
              payload: { text: correctionMessage },
            },
          });
        } catch (sendError) {
          console.error('[edit-message] WhatsApp sync error (non-fatal):', sendError);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Delete message (soft delete)
    if (action === 'delete-message' && req.method === 'POST') {
      const body = await req.json();
      if (!body.message_id) {
        return new Response(
          JSON.stringify({ error: 'message_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: origMsg } = await supabase
        .from('webchat_messages')
        .select('sender_id, sender_type, conversation_id')
        .eq('id', body.message_id)
        .single();

      if (!origMsg) {
        return new Response(
          JSON.stringify({ error: 'Message not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Only allow deleting agent/bot messages from same org
      if (origMsg.sender_type === 'visitor') {
        return new Response(
          JSON.stringify({ error: 'Cannot delete visitor messages' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('webchat_messages')
        .update({ is_deleted: true })
        .eq('id', body.message_id);

      // Propaga o delete em tempo real pros inboxes abertos (mesmo canal do new_message).
      try {
        await supabase.channel(`conversation:${origMsg.conversation_id}`).send({
          type: 'broadcast',
          event: 'message_deleted',
          payload: { id: body.message_id, conversation_id: origMsg.conversation_id },
        });
      } catch (e) {
        console.error('[delete-message] broadcast failed (non-fatal):', e);
      }

      // Sync delete to WhatsApp - send notification
      const { data: delConv } = await supabase
        .from('webchat_conversations')
        .select('channel, visitor_phone, organization_id, evolution_instance_id')
        .eq('id', origMsg.conversation_id)
        .single();

      if (delConv?.channel === 'whatsapp' && delConv.visitor_phone) {
        try {
          let phone = delConv.visitor_phone.replace(/\D/g, '');
          if (!phone.startsWith('55')) phone = '55' + phone;
          const deleteNotification = '⚠️ Uma mensagem anterior foi removida pelo atendente.';
          await supabase.functions.invoke('evolution-send', {
            body: {
              organization_id: orgId,
              instance_id: (delConv as any).evolution_instance_id || undefined,
              type: 'text',
              to: phone,
              payload: { text: deleteNotification },
            },
          });
        } catch (sendError) {
          console.error('[delete-message] WhatsApp sync error (non-fatal):', sendError);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Star/unstar message
    if (action === 'star-message' && req.method === 'POST') {
      const body = await req.json();
      if (!body.message_id) {
        return new Response(
          JSON.stringify({ error: 'message_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: msg } = await supabase
        .from('webchat_messages')
        .select('is_starred')
        .eq('id', body.message_id)
        .single();

      if (!msg) {
        return new Response(
          JSON.stringify({ error: 'Message not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('webchat_messages')
        .update({ is_starred: !msg.is_starred })
        .eq('id', body.message_id);

      return new Response(
        JSON.stringify({ success: true, is_starred: !msg.is_starred }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Forward message to another conversation
    if (action === 'forward-message' && req.method === 'POST') {
      const body = await req.json();
      if (!body.message_id || !body.target_conversation_id) {
        return new Response(
          JSON.stringify({ error: 'message_id and target_conversation_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: origMsg } = await supabase
        .from('webchat_messages')
        .select('content')
        .eq('id', body.message_id)
        .single();

      if (!origMsg) {
        return new Response(
          JSON.stringify({ error: 'Message not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify target conversation belongs to same org
      const { data: targetConv } = await supabase
        .from('webchat_conversations')
        .select('id, channel, visitor_phone, evolution_instance_id')
        .eq('id', body.target_conversation_id)
        .eq('organization_id', orgId)
        .single();

      if (!targetConv) {
        return new Response(
          JSON.stringify({ error: 'Target conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create forwarded message
      const { data: fwdMsg } = await supabase
        .from('webchat_messages')
        .insert({
          conversation_id: body.target_conversation_id,
          direction: 'outbound',
          sender_type: 'agent',
          sender_id: user.id,
          content: origMsg.content,
          forwarded_from_message_id: body.message_id,
        })
        .select('*, profiles:sender_id(id, full_name, avatar_url)')
        .single();

      // Update target conversation last_message_at
      await supabase
        .from('webchat_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', body.target_conversation_id);

      // Send via WhatsApp if target is whatsapp channel
      if (targetConv.channel === 'whatsapp' && targetConv.visitor_phone) {
        try {
          let phone = targetConv.visitor_phone.replace(/\D/g, '');
          if (!phone.startsWith('55')) phone = '55' + phone;
          await supabase.functions.invoke('evolution-send', {
            body: {
              organization_id: orgId,
              instance_id: (targetConv as any).evolution_instance_id || undefined,
              type: 'text',
              to: phone,
              payload: { text: origMsg.content },
            },
          });
        } catch (sendError) {
          console.error('[forward-message] WhatsApp send error:', sendError);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: fwdMsg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in webchat-inbox:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
