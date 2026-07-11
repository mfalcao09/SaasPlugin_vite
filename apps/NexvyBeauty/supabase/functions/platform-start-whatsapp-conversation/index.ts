// platform-start-whatsapp-conversation — inicia conversa WhatsApp OUTBOUND no
// CRM de PLATAFORMA (super_admin). Paridade com `start-whatsapp-conversation`
// do V5, DESACOPLADO do tenant (tabelas platform_crm_*, SEM organization_id).
//
// Contrato: POST { phone: string, message: string, connection_id?: string,
//                  product_id?: string, lead_id?: string }
//   → { ok: true, conversation_id, message_id, wamid, lead_id, is_new_conversation }
//
// Fluxo:
//   1. normaliza telefone BR (normalizePhoneBR — 55+DDD+9+8 dígitos)
//   2. resolve conexão Meta ativa (connection_id explícito || ativa mais
//      recente — mesmo critério mono-connection do platform-webchat-inbox)
//   3. cria/reusa lead por telefone (dedupe por variantes BR, espelho do
//      ensureLead do platform-meta-whatsapp-webhook) + ensurePlatformLeadInPipeline
//   4. cria/reusa conversa (visitor_id='wa:<digits>', channel='whatsapp',
//      meta_connection_id, product_id herdado da conexão — A1.3). Agente que
//      inicia ASSUME a conversa (assigned_to + human_active, 1:1 com o V5).
//   5. envia TEXTO livre via Cloud API /{phone_number_id}/messages
//   6. persiste outbound (mesmo shape do send do platform-webchat-inbox:
//      metadata wamid/channel/connection_id) + broadcast `new_message`
//
// ⚠️ Janela 24h: fora de sessão o texto livre FALHA (Graph code 131047).
//   O envio roda ANTES da persistência (não suja o histórico com bolha
//   falhada); o erro volta estruturado { error:'OUT_OF_WINDOW', code,
//   needs_template: true, conversation_id } — o FRONT decide oferecer
//   template (platform-meta-whatsapp-send).
//
// NOTA: helpers de lead/conversa são deliberadamente locais (não _shared) —
//   mesmo precedente do par webhook/inbox; esta função não toca arquivos
//   existentes.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE } from '../_shared/meta-graph.ts';
import { normalizePhoneBR, phoneVariantsBR } from '../_shared/phone.ts';
import { ensurePlatformLeadInPipeline } from '../_shared/platform-crm-pipeline.ts';
import { broadcastPlatformNewMessage } from '../_shared/platform-crm-webchat.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Conexão Meta ativa ──────────────────────────────────────────────────────

interface MetaConnection {
  id: string;
  phone_number_id: string | null;
  access_token_encrypted: string | null;
  status: string;
  product_id: string | null;
}

async function resolveActiveMetaConnection(
  supabase: any,
  connectionId: string | null,
): Promise<{ conn: MetaConnection | null; reason: string | null }> {
  const cols = 'id, phone_number_id, access_token_encrypted, status, product_id';
  if (connectionId) {
    const { data: conn, error } = await supabase
      .from('platform_crm_whatsapp_meta_connections')
      .select(cols)
      .eq('id', connectionId)
      .maybeSingle();
    if (error) {
      console.error('[platform-start-whatsapp-conversation] connection fetch error:', error.message);
      return { conn: null, reason: 'connection_lookup_failed' };
    }
    if (!conn) return { conn: null, reason: 'connection_not_found' };
    if (conn.status !== 'active') return { conn: null, reason: `connection_status_${conn.status}` };
    return { conn, reason: null };
  }

  const { data: conn, error } = await supabase
    .from('platform_crm_whatsapp_meta_connections')
    .select(cols)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[platform-start-whatsapp-conversation] active connection fetch error:', error.message);
    return { conn: null, reason: 'connection_lookup_failed' };
  }
  if (!conn) return { conn: null, reason: 'no_active_connection' };
  return { conn, reason: null };
}

// ─── Lead (dedupe por telefone, espelho do webhook) ──────────────────────────

async function ensureLeadByPhone(
  supabase: any,
  digits: string,
  productId: string | null,
  userId: string,
): Promise<string | null> {
  try {
    // Variantes com/sem DDI, com/sem 9º dígito, com/sem '+' — cobre leads
    // criados pelo webhook (+55...) e cadastros manuais.
    const variants = new Set<string>(phoneVariantsBR(digits));
    for (const v of phoneVariantsBR(digits)) variants.add(`+${v}`);
    variants.add(`+${digits}`);
    const list = Array.from(variants).map((v) => `"${v}"`).join(',');

    const { data: existing } = await supabase
      .from('platform_crm_leads')
      .select('id')
      .or(`phone.in.(${list})`)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id as string;

    const phonePlus = `+${digits}`;
    const { data: created, error } = await supabase
      .from('platform_crm_leads')
      .insert({
        name: `WhatsApp ${phonePlus}`,
        phone: phonePlus,
        source: 'whatsapp',
        lead_channel: 'whatsapp',
        assigned_to: userId,
        // Só no INSERT: lead existente nunca tem product_id sobrescrito.
        ...(productId ? { product_id: productId } : {}),
      })
      .select('id')
      .single();
    if (error) {
      console.error('[platform-start-whatsapp-conversation] create lead failed (non-fatal):', error.message);
      return null;
    }
    return (created?.id as string) ?? null;
  } catch (e) {
    console.error('[platform-start-whatsapp-conversation] ensureLeadByPhone error (non-fatal):', e);
    return null;
  }
}

// ─── Conversa (cria/reusa por visitor_id='wa:<digits>') ─────────────────────

async function ensureConversation(
  supabase: any,
  digits: string,
  connectionId: string,
  productId: string | null,
  leadId: string | null,
  userId: string,
): Promise<{ conversation: Record<string, unknown> | null; isNew: boolean }> {
  const visitorId = `wa:${digits}`;
  const { data: rows } = await supabase
    .from('platform_crm_conversations')
    .select('*')
    .eq('visitor_id', visitorId)
    .order('created_at', { ascending: false })
    .limit(1);
  let conversation = (rows?.[0] as Record<string, unknown>) ?? null;

  if (conversation) {
    // Reuso: quem inicia a conversa ASSUME (mesmo efeito do send do inbox) —
    // atendente único: limpa a IA. Patch de canal A1.3: conexão por onde o
    // agente escolheu falar; product_id só quando ainda não tem (atribuição
    // manual nunca é sobrescrita).
    const patch: Record<string, unknown> = {
      assigned_to: userId,
      status: 'human_active',
      current_agent_id: null,
      needs_human: false,
    };
    if (conversation['meta_connection_id'] !== connectionId) {
      patch['meta_connection_id'] = connectionId;
    }
    if (!conversation['product_id'] && productId) patch['product_id'] = productId;
    if (!conversation['lead_id'] && leadId) patch['lead_id'] = leadId;

    const { data: updated, error } = await supabase
      .from('platform_crm_conversations')
      .update(patch)
      .eq('id', conversation['id'])
      .select('*')
      .single();
    if (error) {
      console.error('[platform-start-whatsapp-conversation] conversation patch failed:', error.message);
    } else if (updated) {
      conversation = updated as Record<string, unknown>;
    }
    return { conversation, isNew: false };
  }

  const { data: created, error } = await supabase
    .from('platform_crm_conversations')
    .insert({
      visitor_id: visitorId,
      visitor_phone: `+${digits}`,
      visitor_whatsapp: `+${digits}`,
      channel: 'whatsapp',
      status: 'human_active',
      assigned_to: userId,
      needs_human: false,
      meta_connection_id: connectionId,
      ...(productId ? { product_id: productId } : {}),
      ...(leadId ? { lead_id: leadId } : {}),
    })
    .select('*')
    .single();
  if (error) {
    console.error('[platform-start-whatsapp-conversation] create conversation failed:', error.message);
    return { conversation: null, isNew: false };
  }
  return { conversation: created as Record<string, unknown>, isNew: true };
}

// ─── Entrega Cloud API (texto livre) ─────────────────────────────────────────

interface GraphSendResult {
  wamid: string | null;
  error: string | null;
  code: number | null;
  subcode: number | null;
  fbtrace_id: string | null;
  http_status: number | null;
}

async function sendTextViaCloudApi(
  phoneNumberId: string,
  token: string,
  toDigits: string,
  text: string,
): Promise<GraphSendResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toDigits,
        type: 'text',
        text: { body: text },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const graphErr = data?.error ?? {};
      return {
        wamid: null,
        error: String(graphErr?.message ?? `graph ${res.status}`).slice(0, 300),
        code: typeof graphErr?.code === 'number' ? graphErr.code : null,
        subcode: typeof graphErr?.error_subcode === 'number' ? graphErr.error_subcode : null,
        fbtrace_id: graphErr?.fbtrace_id ? String(graphErr.fbtrace_id) : null,
        http_status: res.status,
      };
    }
    return {
      wamid: data?.messages?.[0]?.id ?? null,
      error: null,
      code: null,
      subcode: null,
      fbtrace_id: null,
      http_status: res.status,
    };
  } catch (e) {
    return {
      wamid: null,
      error: String(e).slice(0, 300),
      code: null,
      subcode: null,
      fbtrace_id: null,
      http_status: null,
    };
  }
}

/** Graph code 131047 = fora da janela 24h (re-engagement exige template HSM). */
const OUT_OF_WINDOW_CODE = 131047;

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));

    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      serviceRoleKey,
      body,
    );
    if (errorResponse) return errorResponse;
    if (!user) return json({ error: 'Invalid token' }, 401);

    const phone = String(body?.phone ?? '').trim();
    const message = String(body?.message ?? '').trim();
    const connectionIdInput = body?.connection_id ? String(body.connection_id) : null;
    const productIdInput = body?.product_id ? String(body.product_id) : null;
    const leadIdInput = body?.lead_id ? String(body.lead_id) : null;

    if (!phone || !message) {
      return json({ error: 'phone and message are required' }, 400);
    }

    const digits = normalizePhoneBR(phone);
    if (!digits) {
      return json({ error: 'invalid_phone', detail: `telefone inválido: '${phone}'` }, 400);
    }

    // 1) Conexão Meta ativa
    const { conn, reason } = await resolveActiveMetaConnection(supabase, connectionIdInput);
    if (!conn) {
      return json({ error: reason ?? 'no_active_connection' }, reason === 'connection_not_found' ? 404 : 422);
    }
    if (!conn.phone_number_id || !conn.access_token_encrypted) {
      return json({ error: 'connection_incomplete', detail: 'conexão sem phone_number_id ou access_token' }, 422);
    }

    // A1.3: product explícito > product da conexão
    const effectiveProductId = productIdInput || conn.product_id || null;

    // 2) Lead (explícito ou dedupe/cria por telefone) + pipeline
    let leadId: string | null = null;
    if (leadIdInput) {
      const { data: leadRow } = await supabase
        .from('platform_crm_leads')
        .select('id')
        .eq('id', leadIdInput)
        .maybeSingle();
      if (!leadRow?.id) return json({ error: 'lead_not_found' }, 404);
      leadId = leadRow.id as string;
    } else {
      leadId = await ensureLeadByPhone(supabase, digits, effectiveProductId, user.id);
    }
    if (leadId) await ensurePlatformLeadInPipeline(supabase, leadId);

    // 3) Conversa (cria/reusa)
    const { conversation, isNew } = await ensureConversation(
      supabase,
      digits,
      conn.id,
      effectiveProductId,
      leadId,
      user.id,
    );
    if (!conversation) {
      return json({ error: 'conversation_create_failed' }, 500);
    }
    const conversationId = String(conversation['id']);

    // 4) Envia ANTES de persistir — falha de entrega não suja o histórico.
    let token: string;
    try {
      token = await decryptSecret(conn.access_token_encrypted);
    } catch (e) {
      console.error('[platform-start-whatsapp-conversation] token decrypt failed:', String(e).slice(0, 200));
      return json({ error: 'token_decrypt_failed' }, 500);
    }

    const sendResult = await sendTextViaCloudApi(conn.phone_number_id, token, digits, message);
    if (!sendResult.wamid) {
      const needsTemplate = sendResult.code === OUT_OF_WINDOW_CODE;
      console.error(
        '[platform-start-whatsapp-conversation] entrega falhou:',
        JSON.stringify({
          conversation_id: conversationId,
          code: sendResult.code,
          subcode: sendResult.subcode,
          fbtrace_id: sendResult.fbtrace_id,
          http_status: sendResult.http_status,
          message: sendResult.error,
        }),
      );
      return json(
        {
          error: needsTemplate ? 'OUT_OF_WINDOW' : 'delivery_failed',
          detail: sendResult.error,
          code: sendResult.code,
          subcode: sendResult.subcode,
          fbtrace_id: sendResult.fbtrace_id,
          needs_template: needsTemplate,
          conversation_id: conversationId,
          lead_id: leadId,
        },
        422,
      );
    }

    // 5) Persiste outbound — mesmo shape do send do platform-webchat-inbox
    //    (metadata wamid/channel/connection_id; statuses do webhook casam por wamid).
    const { data: messageRow, error: msgError } = await supabase
      .from('platform_crm_messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'agent',
        sender_id: user.id,
        content: message,
        metadata: {
          wamid: sendResult.wamid,
          delivery_status: 'sent',
          channel: 'whatsapp_cloud',
          connection_id: conn.id,
          origin: 'start_conversation',
        },
      })
      .select('*')
      .single();

    if (msgError) {
      // A mensagem JÁ FOI entregue na Meta — devolver erro aqui induziria o
      // front a reenviar (duplicação). Loga alto e responde ok com warning.
      console.error('[platform-start-whatsapp-conversation] persist failed (mensagem JÁ entregue):', msgError.message);
      return json({
        ok: true,
        conversation_id: conversationId,
        message_id: null,
        wamid: sendResult.wamid,
        lead_id: leadId,
        is_new_conversation: isNew,
        persist_warning: 'mensagem entregue mas não persistida — verifique os logs',
      });
    }

    await supabase
      .from('platform_crm_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    await broadcastPlatformNewMessage(supabase, conversationId, messageRow as Record<string, unknown>);

    return json({
      ok: true,
      conversation_id: conversationId,
      message_id: messageRow.id,
      wamid: sendResult.wamid,
      lead_id: leadId,
      is_new_conversation: isNew,
    });
  } catch (e) {
    console.error('[platform-start-whatsapp-conversation] exception:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
