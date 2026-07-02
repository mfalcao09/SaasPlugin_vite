// ============================================================================
// platform-webchat-api — lado PÚBLICO do webchat do CRM de PLATAFORMA.
//
// Porte 1:1 do `webchat-api` do CRM Vendus, DESACOPLADO do tenant:
//   webchat_widgets        → platform_crm_webchat_widgets (valida public_key)
//   webchat_agent_configs  → platform_crm_webchat_agent_configs (por widget_id)
//   webchat_conversations  → platform_crm_conversations (SEM organization_id)
//   webchat_messages       → platform_crm_messages
//   leads                  → platform_crm_leads
//   profiles/notifications → user_roles(super_admin) + platform_crm_notifications
//
// Diferenças estruturais (single-tenant, schema platform):
//   • SEM organization_id em toda parte — valida o public_key do widget e segue.
//   • platform_crm_conversations não tem widget_id/visitor_email/utm_* →
//     email e UTMs são persistidos no LEAD (platform_crm_leads tem as colunas).
//   • Fluxos (chat_flows) e Cérebro do Produto não existem no escopo de
//     plataforma → caminhos de flow do original ficam de fora.
//   • Broadcast realtime: canal `platform-conversation:{id}` / evento
//     `new_message` (exatamente o que usePlatformCrmConversations.ts escuta).
//
// Roda com SERVICE_ROLE (padrão do original) → RLS não bloqueia.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  platformCorsHeaders as corsHeaders,
  broadcastPlatformNewMessage,
} from "../_shared/platform-crm-webchat.ts";
import { ensurePlatformLeadInPipeline } from "../_shared/platform-crm-pipeline.ts";

interface InitRequest {
  /** public_key do widget (`wc_...`) — identificador público do embed. */
  widget_key?: string;
  /** Compat com o shape do original: aceita também o id/key em widget_id. */
  widget_id?: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  current_page_url?: string;
  referrer_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

interface SendMessageRequest {
  conversation_id: string;
  content: string;
  visitor_id: string;
  visitor_name?: string;
  /** Opcional: public_key do widget para resolver o agent_config. */
  widget_key?: string;
}

interface HandoffRequest {
  conversation_id: string;
  visitor_id: string;
}

const DEFAULT_HANDOFF_MESSAGE =
  'Estou transferindo você para um atendente. Aguarde um momento.';
const DEFAULT_FALLBACK_MESSAGE =
  'Desculpe, estou com dificuldades técnicas. Posso transferir você para um atendente?';

/** UUID v4 check — o lookup de widget aceita public_key OU id. */
function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Valida o widget público. Onde o original resolvia a org pelo widget,
 * aqui só valida o public_key contra `platform_crm_webchat_widgets` e segue.
 */
async function findActiveWidget(supabase: any, keyOrId: string) {
  const base = supabase
    .from('platform_crm_webchat_widgets')
    .select('*')
    .eq('is_active', true);
  const { data, error } = isUuid(keyOrId)
    ? await base.eq('id', keyOrId).maybeSingle()
    : await base.eq('public_key', keyOrId).maybeSingle();
  if (error) console.error('[platform-webchat-api] widget lookup error:', error);
  return data ?? null;
}

/** Agent config do widget (1:1 com o join webchat_agent_configs do original). */
async function findAgentConfig(supabase: any, widgetId: string) {
  const { data } = await supabase
    .from('platform_crm_webchat_agent_configs')
    .select('*')
    .eq('widget_id', widgetId)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Resolve widget + agent_config para o `send`/`handoff`.
 * platform_crm_conversations não tem widget_id → usa o widget_key do body
 * quando enviado; senão cai no primeiro widget ativo (single-tenant).
 */
async function resolveWidgetConfig(supabase: any, widgetKey?: string) {
  let widget: any = null;
  if (widgetKey) {
    widget = await findActiveWidget(supabase, widgetKey);
  }
  if (!widget) {
    const { data } = await supabase
      .from('platform_crm_webchat_widgets')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    widget = data ?? null;
  }
  const agentConfig = widget ? await findAgentConfig(supabase, widget.id) : null;
  return { widget, agentConfig };
}

/**
 * Notifica os super admins (1:1 com o insert em `notifications` para todos os
 * profiles da org no original — aqui o "time" é quem tem role super_admin).
 */
async function notifySuperAdmins(supabase: any, conversation: any) {
  try {
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'super_admin');

    if (admins && admins.length > 0) {
      const notifications = admins.map((a: { user_id: string }) => ({
        user_id: a.user_id,
        title: 'Nova conversa aguardando atendimento',
        message: `Visitante ${conversation.visitor_name || 'anônimo'} solicitou atendimento humano`,
        type: 'opportunity',
        action_url: '/admin?section=crm-inbox',
      }));
      await supabase.from('platform_crm_notifications').insert(notifications);
    }
  } catch (e) {
    console.error('[platform-webchat-api] notify super admins failed (non-fatal):', e);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ACTION: Initialize or get existing conversation
    if (action === 'init' && req.method === 'POST') {
      const body: InitRequest = await req.json();
      const widgetKey = body.widget_key || body.widget_id;

      if (!widgetKey || !body.visitor_id) {
        return new Response(
          JSON.stringify({ error: 'widget_key and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Valida o public_key contra platform_crm_webchat_widgets e segue.
      const widget = await findActiveWidget(supabase, widgetKey);
      if (!widget) {
        return new Response(
          JSON.stringify({ error: 'Widget not found or inactive' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const agentConfig = await findAgentConfig(supabase, widget.id);
      const collectBeforeChat = agentConfig?.collect_before_chat !== false;
      const settings = (widget.settings ?? {}) as Record<string, any>;

      // Try to find existing conversation (including closed ones).
      // Sem widget_id na tabela de plataforma → lookup só por visitor_id.
      const { data: existingConversations } = await supabase
        .from('platform_crm_conversations')
        .select('*')
        .eq('visitor_id', body.visitor_id)
        .order('created_at', { ascending: false })
        .limit(1);

      let conversation = existingConversations?.[0] || null;

      if (conversation) {
        // If conversation exists but is closed, reopen it back to the human
        // queue (1:1 com o original — sem os campos de orchestrator, que não
        // existem no schema de plataforma).
        if (conversation.status === 'closed') {
          console.log('[platform-webchat-api] Reopening closed conversation → back to human queue:', conversation.id);
          const { data: reopened, error: reopenError } = await supabase
            .from('platform_crm_conversations')
            .update({
              status: 'waiting_human',
              current_agent_id: null,
              assigned_to: null,
              needs_human: true,
              accepted_at: null,
              accepted_by: null,
            })
            .eq('id', conversation.id)
            .select()
            .single();

          if (reopenError) {
            console.error('Error reopening conversation:', reopenError);
          } else {
            conversation = reopened;
          }
        }
        // Otherwise, use the existing active conversation as-is
      } else {
        // Create new conversation only if none exists
        console.log('[platform-webchat-api] Creating new conversation for visitor:', body.visitor_id);

        // NOTE: status fica `bot_active` para o bot responder; a inbox de
        // plataforma exibe `bot_active` na aba "Agentes" até um humano aceitar.
        const { data: newConv, error: createError } = await supabase
          .from('platform_crm_conversations')
          .insert({
            visitor_id: body.visitor_id,
            visitor_name: body.visitor_name ?? null,
            visitor_phone: body.visitor_phone ?? null,
            channel: 'webchat',
            status: 'bot_active',
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating conversation:', createError);
          return new Response(
            JSON.stringify({ error: 'Failed to create conversation', details: createError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        conversation = newConv;

        // ===== AUTO-CREATE LEAD =====
        // Toda conversa nova vira um lead imediatamente — sem vinculação manual.
        // Se já existir lead pelo email/telefone, reaproveita. Email e UTMs
        // vivem no LEAD (platform_crm_conversations não tem essas colunas).
        try {
          let existingLeadId: string | null = null;
          if (body.visitor_email || body.visitor_phone) {
            const orFilters: string[] = [];
            if (body.visitor_email) orFilters.push(`email.eq.${body.visitor_email}`);
            if (body.visitor_phone) orFilters.push(`phone.eq.${body.visitor_phone}`);
            const { data: existingLead } = await supabase
              .from('platform_crm_leads')
              .select('id')
              .or(orFilters.join(','))
              .limit(1)
              .maybeSingle();
            existingLeadId = existingLead?.id || null;
          }

          let leadId = existingLeadId;
          if (!leadId) {
            const visitorShort = String(body.visitor_id || '').slice(-6) || 'novo';
            const { data: newLead, error: leadErr } = await supabase
              .from('platform_crm_leads')
              .insert({
                name: body.visitor_name || `Visitante #${visitorShort}`,
                email: body.visitor_email || null,
                phone: body.visitor_phone || null,
                source: 'webchat',
                lead_channel: 'webchat',
                landing_page: body.current_page_url || null,
                referrer_url: body.referrer_url || null,
                utm_source: body.utm_source || null,
                utm_medium: body.utm_medium || null,
                utm_campaign: body.utm_campaign || null,
                utm_content: body.utm_content || null,
                utm_term: body.utm_term || null,
              })
              .select('id')
              .single();
            if (leadErr) {
              console.error('[platform-webchat-api] auto-create lead failed (non-fatal):', leadErr);
            } else {
              leadId = newLead?.id || null;
              console.log('[platform-webchat-api] auto-created lead:', leadId);
            }
          }

          if (leadId) {
            await supabase
              .from('platform_crm_conversations')
              .update({ lead_id: leadId })
              .eq('id', conversation.id);
            conversation.lead_id = leadId;
            // Posiciona o lead no primeiro estágio do pipeline (idempotente).
            await ensurePlatformLeadInPipeline(supabase, leadId);
          }
        } catch (e) {
          console.error('[platform-webchat-api] auto-create lead error (non-fatal):', e);
        }

        // Only send greeting if NOT collecting data first and it's a new
        // conversation (sem chat_flows no escopo de plataforma).
        if (!collectBeforeChat && agentConfig?.greeting_message) {
          const { data: greetingMsg } = await supabase
            .from('platform_crm_messages')
            .insert({
              conversation_id: conversation.id,
              direction: 'outbound',
              sender_type: 'bot',
              content: agentConfig.greeting_message,
            })
            .select()
            .single();
          await broadcastPlatformNewMessage(supabase, conversation.id, greetingMsg);
        }
      }

      // Get messages for this conversation
      const { data: messages } = await supabase
        .from('platform_crm_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      // Shape 1:1 com o original — campos visuais vêm de widget.settings
      // (a tabela de plataforma não materializa colunas de cor/posição).
      return new Response(
        JSON.stringify({
          widget: {
            id: widget.id,
            name: widget.name,
            public_key: widget.public_key,
            primary_color: settings.primary_color ?? null,
            secondary_color: settings.secondary_color ?? null,
            welcome_message: widget.welcome_message,
            placeholder_text: settings.placeholder_text ?? null,
            position: settings.position ?? null,
            avatar_url: settings.avatar_url ?? null,
            collect_email: settings.collect_email ?? true,
            collect_phone: settings.collect_phone ?? false,
            collect_name: settings.collect_name ?? true,
            collect_before_chat: agentConfig?.collect_before_chat !== false,
            product_name: null,
          },
          agent: agentConfig ? {
            name: agentConfig.agent_name,
            avatar_url: agentConfig.agent_avatar_url,
          } : null,
          conversation,
          messages: messages || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Send message from visitor
    if (action === 'send' && req.method === 'POST') {
      const body: SendMessageRequest = await req.json();

      if (!body.conversation_id || !body.content || !body.visitor_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id, content, and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify conversation exists and belongs to visitor
      const { data: conversation, error: convError } = await supabase
        .from('platform_crm_conversations')
        .select('*')
        .eq('id', body.conversation_id)
        .eq('visitor_id', body.visitor_id)
        .single();

      if (convError || !conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Save visitor message
      const { data: message, error: msgError } = await supabase
        .from('platform_crm_messages')
        .insert({
          conversation_id: body.conversation_id,
          direction: 'inbound',
          sender_type: 'visitor',
          content: body.content,
        })
        .select()
        .single();

      if (msgError) {
        return new Response(
          JSON.stringify({ error: 'Failed to save message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Realtime: a inbox de plataforma escuta esse broadcast (dedup por id).
      await broadcastPlatformNewMessage(supabase, body.conversation_id, message);

      // Update conversation last_message_at and unread count
      await supabase
        .from('platform_crm_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          unread_count_agents: (conversation.unread_count_agents ?? 0) + 1,
        })
        .eq('id', body.conversation_id);

      // If bot is active, generate AI response
      let botResponse = null;
      if (conversation.status === 'bot_active') {
        // Sem widget_id na conversa → resolve config via widget_key ou 1º ativo.
        const { agentConfig } = await resolveWidgetConfig(supabase, body.widget_key);

        if (agentConfig) {
          // Check for handoff triggers
          const triggers = agentConfig.handoff_triggers || [];
          const messageLower = body.content.toLowerCase();
          const shouldHandoff = triggers.some((trigger: string) =>
            messageLower.includes(trigger.toLowerCase())
          );

          if (shouldHandoff && agentConfig.auto_handoff_enabled) {
            // Trigger handoff
            await supabase
              .from('platform_crm_conversations')
              .update({ status: 'waiting_human', needs_human: true })
              .eq('id', body.conversation_id);

            // Send handoff message
            const { data: handoffMsg } = await supabase
              .from('platform_crm_messages')
              .insert({
                conversation_id: body.conversation_id,
                direction: 'outbound',
                sender_type: 'bot',
                content: agentConfig.handoff_message || DEFAULT_HANDOFF_MESSAGE,
              })
              .select()
              .single();

            botResponse = handoffMsg;
            await broadcastPlatformNewMessage(supabase, body.conversation_id, handoffMsg);

            // Create notification for agents (super admins da plataforma)
            await notifySuperAdmins(supabase, conversation);
          } else {
            // Call AI to generate response
            try {
              console.log('[platform-webchat-api] Calling platform-webchat-bot for conversation:', body.conversation_id);

              // Use visitor_name from request body first, then fall back to conversation data
              const visitorName = body.visitor_name || conversation.visitor_name || '';

              const aiResponse = await fetch(`${supabaseUrl}/functions/v1/platform-webchat-bot`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  conversation_id: body.conversation_id,
                  message: body.content,
                  visitor_name: visitorName,
                  agent_config: {
                    ...agentConfig,
                    temperature: agentConfig.temperature ?? 0.7,
                    max_tokens: agentConfig.max_tokens ?? 500,
                    persona_style: agentConfig.persona_style || 'friendly',
                  },
                }),
              });

              console.log('[platform-webchat-api] platform-webchat-bot response status:', aiResponse.status);

              if (aiResponse.ok) {
                const aiData = await aiResponse.json();
                console.log('[platform-webchat-api] Bot response received:', aiData.message?.id || 'no id');
                botResponse = aiData.message;
              } else {
                const errorText = await aiResponse.text();
                console.error('[platform-webchat-api] Bot API error:', aiResponse.status, errorText);
                throw new Error(`Bot returned ${aiResponse.status}: ${errorText}`);
              }
            } catch (error) {
              console.error('[platform-webchat-api] Error calling AI:', error);
              // Send fallback message
              const { data: fallbackMsg } = await supabase
                .from('platform_crm_messages')
                .insert({
                  conversation_id: body.conversation_id,
                  direction: 'outbound',
                  sender_type: 'bot',
                  content: agentConfig.fallback_message || DEFAULT_FALLBACK_MESSAGE,
                })
                .select()
                .single();

              botResponse = fallbackMsg;
              await broadcastPlatformNewMessage(supabase, body.conversation_id, fallbackMsg);
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          message,
          botResponse,
          conversationStatus: conversation.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Get messages
    if (action === 'messages' && req.method === 'GET') {
      const conversationId = url.searchParams.get('conversation_id');
      const visitorId = url.searchParams.get('visitor_id');

      if (!conversationId || !visitorId) {
        return new Response(
          JSON.stringify({ error: 'conversation_id and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify conversation belongs to visitor
      const { data: conversation } = await supabase
        .from('platform_crm_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('visitor_id', visitorId)
        .single();

      if (!conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: messages } = await supabase
        .from('platform_crm_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      return new Response(
        JSON.stringify({ messages: messages || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Request handoff to human
    if (action === 'handoff' && req.method === 'POST') {
      const body: HandoffRequest & { widget_key?: string } = await req.json();

      if (!body.conversation_id || !body.visitor_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify and update conversation
      const { data: conversation, error: convError } = await supabase
        .from('platform_crm_conversations')
        .select('*')
        .eq('id', body.conversation_id)
        .eq('visitor_id', body.visitor_id)
        .single();

      if (convError || !conversation) {
        return new Response(
          JSON.stringify({ error: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update status
      await supabase
        .from('platform_crm_conversations')
        .update({ status: 'waiting_human', needs_human: true })
        .eq('id', body.conversation_id);

      // Send handoff message
      const { agentConfig } = await resolveWidgetConfig(supabase, body.widget_key);
      const { data: handoffMsg } = await supabase
        .from('platform_crm_messages')
        .insert({
          conversation_id: body.conversation_id,
          direction: 'outbound',
          sender_type: 'bot',
          content: agentConfig?.handoff_message || DEFAULT_HANDOFF_MESSAGE,
        })
        .select()
        .single();

      await broadcastPlatformNewMessage(supabase, body.conversation_id, handoffMsg);

      // Create notifications (super admins da plataforma)
      await notifySuperAdmins(supabase, conversation);

      return new Response(
        JSON.stringify({
          success: true,
          message: handoffMsg,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: Update visitor info
    if (action === 'update-visitor' && req.method === 'POST') {
      const body = await req.json();

      if (!body.conversation_id || !body.visitor_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id and visitor_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updateData: Record<string, string> = {};
      if (body.visitor_name) updateData.visitor_name = body.visitor_name;
      if (body.visitor_phone) updateData.visitor_phone = body.visitor_phone;

      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from('platform_crm_conversations')
          .update(updateData)
          .eq('id', body.conversation_id)
          .eq('visitor_id', body.visitor_id);

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to update visitor info' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // visitor_email não existe em platform_crm_conversations → persiste no lead.
      if (body.visitor_email) {
        try {
          const { data: conv } = await supabase
            .from('platform_crm_conversations')
            .select('lead_id')
            .eq('id', body.conversation_id)
            .eq('visitor_id', body.visitor_id)
            .maybeSingle();
          if (conv?.lead_id) {
            await supabase
              .from('platform_crm_leads')
              .update({ email: body.visitor_email })
              .eq('id', conv.lead_id)
              .is('email', null);
          }
        } catch (e) {
          console.error('[platform-webchat-api] lead email update failed (non-fatal):', e);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in platform-webchat-api:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
