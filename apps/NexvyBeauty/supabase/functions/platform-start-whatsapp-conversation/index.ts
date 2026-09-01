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
// ⚠️ RAMO EVOLUTION (PR-BDR-7): o dropdown do inbox mistura conexões Meta com
//   instâncias Evolution — ids de tabelas DIFERENTES. Quando o connection_id não
//   existe em platform_crm_whatsapp_meta_connections, procura em
//   platform_crm_evolution_instances; achando, delega o envio pra
//   `platform-whatsapp-qr-send` e cria a conversa com a IDENTIDADE do
//   platform-whatsapp-qr-webhook (channel 'whatsapp_evolution',
//   visitor_id 'wa_evo:<digits>', wa_qr_instance_id) — é essa tripla que
//   faz o webhook reencontrar a conversa em vez de abrir outra. Em nenhuma das
//   duas tabelas → 404 connection_not_found, como antes.
//   A POSSE, porém, segue a regra da linha 17 e NÃO o webhook: caminho humano
//   assume (human_active + assigned_to), porque um agente clicou "Iniciar
//   Conversa"; o webhook fica sem dono porque lá não há dono a registrar.
//
// NOTA: helpers de lead/conversa são deliberadamente locais (não _shared) —
//   mesmo precedente do par webhook/inbox; esta função não toca arquivos
//   existentes.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import {
  WA_QR_CHANNEL_CANONICAL,
  WA_QR_CHANNELS,
  waQrVisitorId,
  waQrVisitorIdsForLookup,
} from '../_shared/platform-wa-qr-identity.ts';
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

// ─── Instância Evolution (canal não-oficial — OUTRA tabela) ─────────────────

interface EvolutionInstance {
  id: string;
  name: string | null;
  product_id: string | null;
  status: string | null;
}

/** O dropdown do inbox mistura conexões Meta (platform_crm_whatsapp_meta_
 *  connections) com instâncias Evolution (platform_crm_evolution_instances) —
 *  ids de TABELAS diferentes (PlatformCrmStartConversationDialog.tsx:84-88 manda
 *  o id CRU em connection_id). Só é consultada quando o id NÃO existe na tabela
 *  Meta; o ramo Meta segue intocado. */
async function resolveEvolutionInstance(
  supabase: any,
  instanceId: string,
): Promise<EvolutionInstance | null> {
  const { data, error } = await supabase
    .from('platform_crm_wa_qr_instances')
    .select('id, name, product_id, status')
    .eq('id', instanceId)
    .maybeSingle();
  if (error) {
    console.error(
      '[platform-start-whatsapp-conversation] evolution instance fetch error:',
      JSON.stringify({ instance_id: instanceId, message: error.message }),
    );
    return null;
  }
  return (data as EvolutionInstance) ?? null;
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

// ─── Conversa Evolution (shape ESPELHADO do webhook) ────────────────────────

/** Cria/reusa a conversa do canal Evolution.
 *
 *  IDENTIDADE espelhada de platform-whatsapp-qr-webhook/index.ts:395-411
 *  (`ensureConversation`): visitor_id 'wa_evo:<digits>', visitor_phone/whatsapp
 *  com '+', channel 'whatsapp_evolution', needs_human false,
 *  wa_qr_instance_id. Essa paridade é OBRIGATÓRIA: o webhook reencontra a
 *  conversa por (visitor_id, channel, wa_qr_instance_id) — webhook:369-376.
 *  Divergir em qualquer um dos três faria a resposta da lead abrir uma SEGUNDA
 *  conversa.
 *
 *  POSSE diverge do webhook DE PROPÓSITO: aqui um humano clicou "Iniciar
 *  Conversa", então quem inicia ASSUME (status 'human_active' + assigned_to) —
 *  regra do cabeçalho deste arquivo, 1:1 com o ramo Meta (:243-244). O webhook
 *  usa 'waiting_human' sem dono porque lá chega mensagem de desconhecido e não
 *  há ninguém a registrar. São situações diferentes, não uma inconsistência.
 *  Prospectivo: quando o cérebro atender 'whatsapp_evolution' (gate em
 *  status='bot_active'), conversa iniciada por humano em 'human_active' não é
 *  assumida pelo bot — que é o certo.
 *
 *  LIMITAÇÃO CONHECIDA: a reabertura de 'closed' abaixo espelha webhook:379-393,
 *  que ZERA assigned_to (webhook:388). Ou seja, conversa reaberta perde o dono —
 *  comportamento do webhook, mantido aqui de propósito para não criar um
 *  terceiro estado. */
async function ensureEvolutionConversation(
  supabase: any,
  digits: string,
  instanceId: string,
  productId: string | null,
  leadId: string | null,
  userId: string,
): Promise<{ conversation: Record<string, unknown> | null; isNew: boolean }> {
  const visitorId = waQrVisitorId(digits);
  const visitorIds = waQrVisitorIdsForLookup(digits);
  const { data: rows, error: selectError } = await supabase
    .from('platform_crm_conversations')
    .select('*')
    .in('visitor_id', visitorIds)
    .in('channel', [...WA_QR_CHANNELS])
    .eq('wa_qr_instance_id', instanceId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (selectError) {
    console.error(
      '[platform-start-whatsapp-conversation] evolution conversation lookup failed:',
      JSON.stringify({ visitor_id: visitorId, instance_id: instanceId, message: selectError.message }),
    );
    return { conversation: null, isNew: false };
  }
  let conversation = (rows?.[0] as Record<string, unknown>) ?? null;

  if (conversation) {
    const patch: Record<string, unknown> = {};
    // Reabertura ESPELHADA do webhook:379-393 — inclusive o assigned_to: null
    // (webhook:388). Limitação conhecida e deliberada: conversa reaberta perde
    // o dono. Divergir aqui criaria um terceiro estado.
    if (conversation['status'] === 'closed') {
      patch['status'] = 'waiting_human';
      patch['needs_human'] = false;
      patch['accepted_at'] = null;
      patch['accepted_by'] = null;
      patch['assigned_to'] = null;
    }
    // Só quando ainda não tem: atribuição manual nunca é sobrescrita (A1.3).
    if (!conversation['product_id'] && productId) patch['product_id'] = productId;
    if (!conversation['lead_id'] && leadId) patch['lead_id'] = leadId;
    if (Object.keys(patch).length === 0) return { conversation, isNew: false };

    const { data: updated, error } = await supabase
      .from('platform_crm_conversations')
      .update(patch)
      .eq('id', conversation['id'])
      .select('*')
      .single();
    if (error) {
      console.error(
        '[platform-start-whatsapp-conversation] evolution conversation patch failed:',
        JSON.stringify({ conversation_id: conversation['id'], message: error.message }),
      );
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
      channel: WA_QR_CHANNEL_CANONICAL,
      // Quem inicia ASSUME (cabeçalho :17, ramo Meta :243-244) — diverge do
      // webhook de propósito; ver docblock desta função.
      status: 'human_active',
      assigned_to: userId,
      needs_human: false,
      wa_qr_instance_id: instanceId,
      ...(productId ? { product_id: productId } : {}),
      ...(leadId ? { lead_id: leadId } : {}),
    })
    .select('*')
    .single();
  if (error) {
    console.error(
      '[platform-start-whatsapp-conversation] create evolution conversation failed:',
      JSON.stringify({ visitor_id: visitorId, instance_id: instanceId, message: error.message }),
    );
    return { conversation: null, isNew: false };
  }
  return { conversation: created as Record<string, unknown>, isNew: true };
}

// ─── Entrega Evolution (delega pra platform-whatsapp-qr-send) ─────────────────

interface EvolutionSendResult {
  messageId: string | null;
  error: string | null;
  status: number | null;
}

/** Delega o envio pra `platform-whatsapp-qr-send` (SendBody: product_id,
 *  instance_id, type, to, payload) — mesma invocação do motor de cold outreach
 *  em platform-cold-outreach/index.ts:383-385. O client é service-role, então o
 *  Bearer bate com o gate "interno only" daquela função. */
async function sendTextViaEvolution(
  supabase: any,
  productId: string,
  instanceId: string,
  toDigits: string,
  text: string,
): Promise<EvolutionSendResult> {
  try {
    const { data, error } = await supabase.functions.invoke('platform-whatsapp-qr-send', {
      body: {
        product_id: productId,
        instance_id: instanceId,
        type: 'text',
        to: toDigits,
        payload: { text },
      },
    });
    if (error) {
      return { messageId: null, error: String(error?.message ?? error).slice(0, 300), status: null };
    }
    // Envelope da platform-whatsapp-qr-send: { ok, status, body } (index.ts:49,147).
    const res = data as { ok?: boolean; status?: number; body?: any } | null;
    if (!res || res.ok !== true) {
      return {
        messageId: null,
        error: JSON.stringify(res ?? null).slice(0, 300),
        status: typeof res?.status === 'number' ? res.status : null,
      };
    }
    const rawId = res.body?.key?.id;
    return {
      messageId: rawId ? String(rawId) : null,
      error: null,
      status: typeof res.status === 'number' ? res.status : 200,
    };
  } catch (e) {
    return { messageId: null, error: String(e).slice(0, 300), status: null };
  }
}

// ─── Ramo Evolution: fluxo completo (lead → conversa → envio → persistência) ─

async function startViaEvolution(
  supabase: any,
  instance: EvolutionInstance,
  digits: string,
  message: string,
  productIdInput: string | null,
  leadIdInput: string | null,
  userId: string,
): Promise<Response> {
  // platform-whatsapp-qr-send resolve a instância por (id, product_id) —
  // index.ts:80-82. Sem product_id na instância o envio é impossível.
  if (!instance.product_id) {
    console.error(
      '[platform-start-whatsapp-conversation] evolution instance sem product_id:',
      JSON.stringify({ instance_id: instance.id, name: instance.name }),
    );
    return json(
      { error: 'instance_product_missing', detail: 'instância Evolution sem product_id' },
      422,
    );
  }
  // O SEND usa o product da instância (senão platform-whatsapp-qr-send devolve
  // 404). O product da CONVERSA segue a precedência A1.3 do ramo Meta.
  const sendProductId = instance.product_id;
  const effectiveProductId = productIdInput || instance.product_id;

  // 1) Lead — mesma resolução do ramo Meta (helpers reaproveitados).
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
    leadId = await ensureLeadByPhone(supabase, digits, effectiveProductId, userId);
  }
  if (leadId) await ensurePlatformLeadInPipeline(supabase, leadId);

  // 2) Conversa (shape do webhook)
  const { conversation, isNew } = await ensureEvolutionConversation(
    supabase,
    digits,
    instance.id,
    effectiveProductId,
    leadId,
    userId,
  );
  if (!conversation) return json({ error: 'conversation_create_failed' }, 500);
  const conversationId = String(conversation['id']);

  // 3) Envia ANTES de persistir — igual ao ramo Meta, falha de entrega não
  //    suja o histórico com bolha falhada.
  const sendResult = await sendTextViaEvolution(
    supabase,
    sendProductId,
    instance.id,
    digits,
    message,
  );
  if (sendResult.error) {
    console.error(
      '[platform-start-whatsapp-conversation] entrega Evolution falhou:',
      JSON.stringify({
        conversation_id: conversationId,
        instance_id: instance.id,
        instance_status: instance.status,
        http_status: sendResult.status,
        message: sendResult.error,
      }),
    );
    return json(
      {
        error: 'delivery_failed',
        detail: sendResult.error,
        channel: WA_QR_CHANNEL_CANONICAL,
        needs_template: false,
        conversation_id: conversationId,
        lead_id: leadId,
      },
      422,
    );
  }

  // 4) Persiste outbound — metadata espelhada do webhook (:540-548), que dedupa
  //    o eco do aparelho por conteúdo recente (webhook:521-529).
  const { data: messageRow, error: msgError } = await supabase
    .from('platform_crm_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'outbound',
      sender_type: 'agent',
      sender_id: userId,
      content: message,
      content_type: 'text',
      metadata: {
        evolution_message_id: sendResult.messageId,
        wa_qr_instance_id: instance.id,
        delivery_status: 'sent',
        channel: WA_QR_CHANNEL_CANONICAL,
        origin: 'start_conversation',
      },
    })
    .select('*')
    .single();

  if (msgError) {
    // Já entregue na Evolution — devolver erro induziria reenvio (duplicação).
    console.error(
      '[platform-start-whatsapp-conversation] persist Evolution failed (mensagem JÁ entregue):',
      JSON.stringify({ conversation_id: conversationId, message: msgError.message }),
    );
    return json({
      ok: true,
      conversation_id: conversationId,
      message_id: null,
      wamid: sendResult.messageId,
      lead_id: leadId,
      is_new_conversation: isNew,
      channel: WA_QR_CHANNEL_CANONICAL,
      persist_warning: 'mensagem entregue mas não persistida — verifique os logs',
    });
  }

  const { error: touchError } = await supabase
    .from('platform_crm_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (touchError) {
    console.error(
      '[platform-start-whatsapp-conversation] last_message_at update failed (não-fatal):',
      JSON.stringify({ conversation_id: conversationId, message: touchError.message }),
    );
  }

  await broadcastPlatformNewMessage(supabase, conversationId, messageRow as Record<string, unknown>);

  return json({
    ok: true,
    conversation_id: conversationId,
    message_id: messageRow.id,
    wamid: sendResult.messageId,
    lead_id: leadId,
    is_new_conversation: isNew,
    channel: WA_QR_CHANNEL_CANONICAL,
  });
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

    // 1b) RAMO EVOLUTION — o id da instância Evolution NUNCA está na tabela Meta,
    //     então cai aqui como 'connection_not_found'. SÓ esse reason desvia:
    //     'connection_lookup_failed', 'connection_status_*' e 'no_active_connection'
    //     seguem byte-idênticos ao comportamento anterior, e conexão Meta
    //     ENCONTRADA nunca chega neste bloco.
    if (!conn && reason === 'connection_not_found' && connectionIdInput) {
      const instance = await resolveEvolutionInstance(supabase, connectionIdInput);
      if (instance) {
        return await startViaEvolution(
          supabase,
          instance,
          digits,
          message,
          productIdInput,
          leadIdInput,
          user.id,
        );
      }
      // Não é Meta nem Evolution → cai no 404 connection_not_found de sempre.
      console.error(
        '[platform-start-whatsapp-conversation] connection_id em nenhuma das duas tabelas:',
        JSON.stringify({ connection_id: connectionIdInput }),
      );
    }

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
