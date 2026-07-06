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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

/**
 * Entrega uma mensagem outbound no WhatsApp Cloud API (número de VENDAS).
 * Mono-connection por ora: usa a connection `active` mais recente. Retorna o
 * wamid para casar com os statuses (sent/delivered/read) do webhook.
 */
async function deliverViaWhatsAppCloud(
  supabase: any,
  toPhone: string,
  content: string,
  media?: { kind: string; url: string } | null,
): Promise<{ wamid: string | null; error: string | null }> {
  try {
    const { data: conn } = await supabase
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, phone_number_id, access_token_encrypted')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conn?.access_token_encrypted || !conn?.phone_number_id) {
      return { wamid: null, error: 'no_active_connection' };
    }
    const token = await decryptSecret(conn.access_token_encrypted as string);
    const to = String(toPhone ?? '').replace(/\D/g, '');
    if (!to) return { wamid: null, error: 'no_destination_phone' };

    let payload: Record<string, unknown>;
    if (media?.url && media?.kind) {
      const typeMap: Record<string, string> = {
        image: 'image', audio: 'audio', video: 'video', document: 'document', sticker: 'image',
      };
      const waType = typeMap[media.kind] ?? 'document';
      payload = {
        messaging_product: 'whatsapp', to, type: waType,
        [waType]: waType === 'image' || waType === 'video'
          ? { link: media.url, ...(content ? { caption: content } : {}) }
          : { link: media.url },
      };
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
      const msg = data?.error?.message ?? `graph ${res.status}`;
      console.error('[platform-webchat-inbox] entrega WhatsApp falhou:', msg);
      return { wamid: null, error: String(msg).slice(0, 300) };
    }
    return { wamid: data?.messages?.[0]?.id ?? null, error: null };
  } catch (e) {
    console.error('[platform-webchat-inbox] entrega WhatsApp exception:', e);
    return { wamid: null, error: String(e).slice(0, 300) };
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
    if (action === 'send' && req.method === 'POST') {
      const body = bodyParsed || {};

      // Aceita texto puro OU mídia. Se vier mídia, content pode ser '' (caption).
      const hasMedia = body.media && typeof body.media === 'object' && body.media.url && body.media.kind;
      if (!body.conversation_id || (!body.content && !hasMedia)) {
        return json({ error: 'conversation_id and content (or media) are required' }, 400);
      }

      const { data: conversation, error: convError } = await supabase
        .from('platform_crm_conversations')
        .select('id, assigned_to, status, channel, visitor_phone, visitor_whatsapp')
        .eq('id', body.conversation_id)
        .single();

      if (convError || !conversation) {
        return json({ error: 'Conversation not found' }, 404);
      }

      // Auto-assign if not assigned — atendente único: limpa IA
      if (!conversation.assigned_to) {
        await supabase
          .from('platform_crm_conversations')
          .update({
            assigned_to: user.id,
            status: 'human_active',
            current_agent_id: null,
          })
          .eq('id', body.conversation_id);
      }

      // Save message with optional reply_to + media metadata
      const insertData: Record<string, unknown> = {
        conversation_id: body.conversation_id,
        direction: 'outbound',
        sender_type: 'agent',
        sender_id: user.id,
        content: body.content ?? '',
      };
      if (body.reply_to_message_id) {
        insertData.reply_to_message_id = body.reply_to_message_id;
      }
      if (hasMedia) {
        // Normaliza kind do front-end para os valores aceitos por content_type.
        const kindToContentType: Record<string, string> = {
          image: 'image',
          audio: 'audio',
          video: 'video',
          document: 'file',
          sticker: 'image',
        };
        insertData.content_type = kindToContentType[body.media.kind] ?? 'file';
        insertData.metadata = { media: body.media, delivery_status: 'sent' };
      } else {
        insertData.metadata = { delivery_status: 'sent' };
      }
      // Merge optional audit metadata passed by the client.
      // Nunca sobrepõe campos críticos (media, delivery_status).
      if (body.metadata && typeof body.metadata === 'object') {
        const safeExtra = { ...body.metadata };
        delete safeExtra.media;
        delete safeExtra.delivery_status;
        insertData.metadata = { ...(insertData.metadata as any), ...safeExtra };
      }

      const { data: message, error: msgError } = await supabase
        .from('platform_crm_messages')
        .insert(insertData)
        .select('*')
        .single();

      if (msgError) {
        console.error('[platform-webchat-inbox] send insert error:', msgError);
        return json({ error: 'Failed to send message' }, 500);
      }

      // Update conversation
      await supabase
        .from('platform_crm_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          status: 'human_active',
        })
        .eq('id', body.conversation_id);

      // Entrega no canal externo: WhatsApp (Cloud API, número de vendas).
      // A mensagem já está persistida — a entrega atualiza o metadata com o
      // wamid (sucesso) ou delivery_status='failed' + motivo (ex.: janela 24h).
      let finalMessage = message;
      if (conversation.channel === 'whatsapp') {
        const dest = conversation.visitor_whatsapp ?? conversation.visitor_phone ?? '';
        const { wamid, error: deliveryError } = await deliverViaWhatsAppCloud(
          supabase,
          dest,
          String(body.content ?? ''),
          hasMedia ? body.media : null,
        );
        const deliveryMeta = wamid
          ? { ...(message.metadata ?? {}), wamid, delivery_status: 'sent', channel: 'whatsapp_cloud' }
          : { ...(message.metadata ?? {}), delivery_status: 'failed', delivery_error: deliveryError };
        const { data: updated } = await supabase
          .from('platform_crm_messages')
          .update({ metadata: deliveryMeta })
          .eq('id', message.id)
          .select('*')
          .single();
        if (updated) finalMessage = updated;
        if (!wamid) {
          console.error('[platform-webchat-inbox] WhatsApp NÃO entregue:', deliveryError);
        }
      }

      // Broadcast message to all listeners on this conversation channel.
      // Inclui `client_temp_id` (se enviado) para o frontend conseguir substituir
      // a bolha otimista pela mensagem real, evitando duplicação visual.
      const broadcastPayload = body.client_temp_id
        ? { ...finalMessage, client_temp_id: body.client_temp_id }
        : finalMessage;
      await broadcastToConversation(supabase, body.conversation_id, 'new_message', broadcastPayload);

      return json({
        message: broadcastPayload,
        ...(conversation.channel === 'whatsapp' && (finalMessage.metadata as any)?.delivery_status === 'failed'
          ? { delivery_warning: (finalMessage.metadata as any)?.delivery_error ?? 'entrega falhou' }
          : {}),
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
      const { wamid, error: deliveryError } = await deliverViaWhatsAppCloud(
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
          }
        : { ...meta, delivery_status: 'failed', delivery_error: deliveryError, resent_at: new Date().toISOString() };

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
