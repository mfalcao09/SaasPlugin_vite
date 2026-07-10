// platform-meta-whatsapp-send — envia TEMPLATE HSM aprovado via WhatsApp Cloud
// API no CRM de PLATAFORMA (super_admin). Paridade com o modo template do
// `meta-whatsapp-send` do V5, DESACOPLADO do tenant (SEM organization_id).
//
// Contratos aceitos (a edge atende os DOIS chamadores):
//   Modo A (contrato da onda, paridade V5 direta):
//     POST { conversation_id?, to?, template_name, language, components?, connection_id? }
//   Modo B (o que PlatformCrmSendTemplateDialog.tsx JÁ envia — shape do V5):
//     POST { conversation_id?, to?, connection_id?, type: 'template',
//            template: { template_id, variable_mapping?, lead_id? } }
//     → components são montados aqui a partir do variable_mapping ({{n}} do
//       corpo/header TEXT do template sincronizado).
//
// Fluxo:
//   1. resolve conexão (explicit || meta_connection_id da conversa || ativa
//      mais recente) — precisa estar `active` com phone_number_id+token
//   2. valida o template em platform_crm_whatsapp_meta_templates (tabela
//      sincronizada pelo platform-meta-whatsapp-templates-sync): precisa
//      EXISTIR na conexão e estar APPROVED — erro claro se não
//   3. cria/reusa conversa quando só `to` veio (mesmo caminho do
//      platform-start-whatsapp-conversation: visitor_id='wa:<digits>' + lead
//      dedupe por telefone + pipeline)
//   4. envia payload type:'template' na Cloud API /{phone_number_id}/messages
//   5. persiste outbound com content LEGÍVEL (corpo do template com variáveis
//      substituídas; fallback "[template] nome") e metadata
//      { wamid, template_name, ... } + broadcast `new_message`
//
// Envio ANTES da persistência (falha não suja o histórico) — mesmo desenho do B1.
// Esta edge é SÓ template HSM: texto livre/mídia moram no platform-webchat-inbox.
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

/** Erro no shape que o PlatformCrmSendTemplateDialog espera ({error, message}). */
function jsonError(error: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ error, message, ...extra }, status);
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
      console.error('[platform-meta-whatsapp-send] connection fetch error:', error.message);
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
    console.error('[platform-meta-whatsapp-send] active connection fetch error:', error.message);
    return { conn: null, reason: 'connection_lookup_failed' };
  }
  if (!conn) return { conn: null, reason: 'no_active_connection' };
  return { conn, reason: null };
}

// ─── Lead + conversa (mesmo caminho do platform-start-whatsapp-conversation) ─

async function ensureLeadByPhone(
  supabase: any,
  digits: string,
  productId: string | null,
  userId: string,
): Promise<string | null> {
  try {
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
        ...(productId ? { product_id: productId } : {}),
      })
      .select('id')
      .single();
    if (error) {
      console.error('[platform-meta-whatsapp-send] create lead failed (non-fatal):', error.message);
      return null;
    }
    return (created?.id as string) ?? null;
  } catch (e) {
    console.error('[platform-meta-whatsapp-send] ensureLeadByPhone error (non-fatal):', e);
    return null;
  }
}

async function ensureConversation(
  supabase: any,
  digits: string,
  connectionId: string,
  productId: string | null,
  leadId: string | null,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const visitorId = `wa:${digits}`;
  const { data: rows } = await supabase
    .from('platform_crm_conversations')
    .select('*')
    .eq('visitor_id', visitorId)
    .order('created_at', { ascending: false })
    .limit(1);
  let conversation = (rows?.[0] as Record<string, unknown>) ?? null;

  if (conversation) {
    // Reuso: template costuma ser re-engajamento — NÃO muda status/dono da
    // conversa (diferente do start, que é um ato explícito de assumir).
    // Só o patch de canal A1.3 (conexão usada; product_id se ainda não tem).
    const patch: Record<string, unknown> = {};
    if (conversation['meta_connection_id'] !== connectionId) {
      patch['meta_connection_id'] = connectionId;
    }
    if (!conversation['product_id'] && productId) patch['product_id'] = productId;
    if (!conversation['lead_id'] && leadId) patch['lead_id'] = leadId;
    if (Object.keys(patch).length > 0) {
      const { data: updated, error } = await supabase
        .from('platform_crm_conversations')
        .update(patch)
        .eq('id', conversation['id'])
        .select('*')
        .single();
      if (error) {
        console.error('[platform-meta-whatsapp-send] conversation patch failed (non-fatal):', error.message);
      } else if (updated) {
        conversation = updated as Record<string, unknown>;
      }
    }
    return conversation;
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
    console.error('[platform-meta-whatsapp-send] create conversation failed:', error.message);
    return null;
  }
  return created as Record<string, unknown>;
}

// ─── Template: montagem de components + content legível ─────────────────────

/** Números {{n}} presentes num texto de componente, ordenados. */
function extractPlaceholders(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) found.add(Number(m[1]));
  return Array.from(found).sort((a, b) => a - b);
}

/**
 * Monta os components de ENVIO a partir do variable_mapping (Modo B).
 * Cobre BODY e HEADER de texto — os casos dos templates da plataforma.
 * HEADER de mídia (IMAGE/VIDEO/DOCUMENT) não tem mídia configurável na tabela
 * da plataforma → o caller detecta antes (MISSING_HEADER_MEDIA).
 */
function buildComponentsFromMapping(
  tplComponents: unknown,
  mapping: Record<string, string>,
): unknown[] {
  const out: unknown[] = [];
  const comps = Array.isArray(tplComponents) ? tplComponents : [];
  for (const comp of comps) {
    const type = String((comp as any)?.type ?? '').toUpperCase();
    const text = typeof (comp as any)?.text === 'string' ? (comp as any).text : '';
    const nums = extractPlaceholders(text);
    if (nums.length === 0) continue;
    const parameters = nums.map((n) => ({
      type: 'text',
      text: String(mapping?.[String(n)] ?? ''),
    }));
    if (type === 'BODY') out.push({ type: 'body', parameters });
    else if (type === 'HEADER') out.push({ type: 'header', parameters });
  }
  return out;
}

/** HEADER de mídia (format != TEXT) exige mídia que a plataforma não armazena. */
function templateNeedsHeaderMedia(tplComponents: unknown): boolean {
  const comps = Array.isArray(tplComponents) ? tplComponents : [];
  const header = comps.find((c: any) => String(c?.type ?? '').toUpperCase() === 'HEADER');
  const format = String((header as any)?.format ?? 'TEXT').toUpperCase();
  return !!header && format !== 'TEXT';
}

/**
 * Content LEGÍVEL persistido na conversa: corpo do template com as variáveis
 * substituídas; sem corpo, "[template] nome — var1, var2".
 */
function renderTemplateContent(
  templateName: string,
  tplComponents: unknown,
  sentComponents: unknown,
): string {
  try {
    const comps = Array.isArray(tplComponents) ? tplComponents : [];
    const body = comps.find((c: any) => String(c?.type ?? '').toUpperCase() === 'BODY');
    let text = typeof (body as any)?.text === 'string' ? (body as any).text : '';

    const sent = Array.isArray(sentComponents) ? sentComponents : [];
    const sentBody = sent.find((c: any) => String(c?.type ?? '').toLowerCase() === 'body');
    const params = Array.isArray((sentBody as any)?.parameters) ? (sentBody as any).parameters : [];
    const values: string[] = params.map((p: any) =>
      typeof p?.text === 'string'
        ? p.text
        : String(p?.currency?.fallback_value ?? p?.date_time?.fallback_value ?? ''),
    );

    if (text) {
      values.forEach((v, i) => {
        text = text.replaceAll(`{{${i + 1}}}`, v ?? '');
      });
      return text;
    }
    const filled = values.filter(Boolean);
    return `[template] ${templateName}${filled.length ? ` — ${filled.join(', ')}` : ''}`;
  } catch (_) {
    return `[template] ${templateName}`;
  }
}

// ─── Entrega Cloud API (template) ────────────────────────────────────────────

interface GraphSendResult {
  wamid: string | null;
  error: string | null;
  code: number | null;
  subcode: number | null;
  fbtrace_id: string | null;
  http_status: number | null;
}

async function sendTemplateViaCloudApi(
  phoneNumberId: string,
  token: string,
  toDigits: string,
  templateName: string,
  language: string,
  components: unknown[] | null,
): Promise<GraphSendResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toDigits,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          ...(components && components.length > 0 ? { components } : {}),
        },
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

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('method_not_allowed', 'method not allowed', 405);

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    const body = await req.json().catch(() => ({}));

    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      serviceRoleKey,
      body,
    );
    if (errorResponse) return errorResponse;
    if (!user) return jsonError('invalid_token', 'Invalid token', 401);

    // Esta edge é SÓ template HSM (texto/mídia livres = platform-webchat-inbox).
    const type = body?.type ? String(body.type) : 'template';
    if (type !== 'template') {
      return jsonError(
        'unsupported_type',
        `tipo '${type}' não suportado — esta edge envia apenas template HSM`,
        400,
      );
    }

    const conversationIdInput = body?.conversation_id ? String(body.conversation_id) : null;
    const toInput = body?.to ? String(body.to) : null;
    const connectionIdInput = body?.connection_id ? String(body.connection_id) : null;
    const tpl = body?.template && typeof body.template === 'object' ? body.template : {};

    // Modo A (top-level) OU Modo B (template.*)
    const templateId = tpl?.template_id ? String(tpl.template_id) : null;
    const templateNameInput = body?.template_name
      ? String(body.template_name)
      : (tpl?.name ? String(tpl.name) : null);
    const languageInput = body?.language
      ? String(body.language)
      : (tpl?.language ? String(tpl.language) : null);
    const explicitComponents = Array.isArray(body?.components)
      ? (body.components as unknown[])
      : (Array.isArray(tpl?.components) ? (tpl.components as unknown[]) : null);
    const variableMapping: Record<string, string> =
      tpl?.variable_mapping && typeof tpl.variable_mapping === 'object'
        ? tpl.variable_mapping
        : {};
    const leadIdInput = tpl?.lead_id ? String(tpl.lead_id) : (body?.lead_id ? String(body.lead_id) : null);

    if (!templateId && (!templateNameInput || !languageInput)) {
      return jsonError(
        'missing_template',
        'informe template_name + language (ou template.template_id)',
        400,
      );
    }
    if (!conversationIdInput && !toInput) {
      return jsonError('missing_destination', 'informe conversation_id ou to', 400);
    }

    // 1) Conversa (quando referenciada) — fonte de destino e de conexão default
    let conversation: Record<string, unknown> | null = null;
    if (conversationIdInput) {
      const { data: convRow, error: convErr } = await supabase
        .from('platform_crm_conversations')
        .select('*')
        .eq('id', conversationIdInput)
        .maybeSingle();
      if (convErr) {
        console.error('[platform-meta-whatsapp-send] conversation fetch error:', convErr.message);
        return jsonError('conversation_lookup_failed', 'falha ao carregar a conversa', 500);
      }
      if (!convRow) return jsonError('conversation_not_found', 'Conversa não encontrada', 404);
      conversation = convRow as Record<string, unknown>;
    }

    // 2) Destino
    const destRaw = toInput
      ?? (conversation?.['visitor_whatsapp'] as string | null)
      ?? (conversation?.['visitor_phone'] as string | null)
      ?? '';
    const digits = normalizePhoneBR(destRaw);
    if (!digits) {
      return jsonError('invalid_phone', `telefone de destino inválido: '${destRaw}'`, 400);
    }

    // 3) Conexão (explicit || da conversa || ativa mais recente)
    const { conn, reason } = await resolveActiveMetaConnection(
      supabase,
      connectionIdInput ?? ((conversation?.['meta_connection_id'] as string | null) ?? null),
    );
    if (!conn) {
      return jsonError(
        reason ?? 'no_active_connection',
        'Nenhuma conexão WhatsApp Cloud ativa disponível',
        reason === 'connection_not_found' ? 404 : 422,
      );
    }
    if (!conn.phone_number_id || !conn.access_token_encrypted) {
      return jsonError('connection_incomplete', 'conexão sem phone_number_id ou access_token', 422);
    }

    // 4) Template sincronizado — precisa existir E estar APPROVED
    let tplRow: any = null;
    if (templateId) {
      const { data } = await supabase
        .from('platform_crm_whatsapp_meta_templates')
        .select('id, connection_id, name, language, status, components')
        .eq('id', templateId)
        .maybeSingle();
      tplRow = data;
    } else {
      const { data } = await supabase
        .from('platform_crm_whatsapp_meta_templates')
        .select('id, connection_id, name, language, status, components')
        .eq('connection_id', conn.id)
        .eq('name', templateNameInput)
        .eq('language', languageInput)
        .maybeSingle();
      tplRow = data;
    }
    if (!tplRow) {
      return jsonError(
        'template_not_found',
        'Template não encontrado na tabela sincronizada — rode a sincronização (platform-meta-whatsapp-templates-sync) e confira nome/idioma/conexão',
        404,
      );
    }
    if (String(tplRow.status).toUpperCase() !== 'APPROVED') {
      return jsonError(
        'template_not_approved',
        `Template '${tplRow.name}' está '${tplRow.status}' — só templates APPROVED podem ser enviados`,
        422,
        { status_meta: tplRow.status },
      );
    }

    const templateName = String(tplRow.name);
    const templateLanguage = String(tplRow.language);

    // 5) Components de envio: explícitos (Modo A) > montados do mapping (Modo B)
    let sendComponents: unknown[] | null = explicitComponents;
    if (!sendComponents) {
      if (templateNeedsHeaderMedia(tplRow.components)) {
        return jsonError(
          'MISSING_HEADER_MEDIA',
          'Template com header de mídia (imagem/vídeo/documento) sem mídia configurada na plataforma — envie os components prontos ou use um template de texto',
          422,
        );
      }
      sendComponents = buildComponentsFromMapping(tplRow.components, variableMapping);
    }

    // 6) Conversa: cria/reusa quando só `to` veio (mesmo caminho do B1)
    const effectiveProductId = conn.product_id ?? null;
    let leadId: string | null = leadIdInput;
    if (!conversation) {
      if (!leadId) {
        leadId = await ensureLeadByPhone(supabase, digits, effectiveProductId, user.id);
      }
      if (leadId) await ensurePlatformLeadInPipeline(supabase, leadId);
      conversation = await ensureConversation(
        supabase,
        digits,
        conn.id,
        effectiveProductId,
        leadId,
        user.id,
      );
      if (!conversation) {
        return jsonError('conversation_create_failed', 'falha ao criar a conversa', 500);
      }
    }
    const conversationId = String(conversation['id']);

    // 7) Envia ANTES de persistir
    let token: string;
    try {
      token = await decryptSecret(conn.access_token_encrypted);
    } catch (e) {
      console.error('[platform-meta-whatsapp-send] token decrypt failed:', String(e).slice(0, 200));
      return jsonError('token_decrypt_failed', 'falha ao decriptar o token da conexão', 500);
    }

    const sendResult = await sendTemplateViaCloudApi(
      conn.phone_number_id,
      token,
      digits,
      templateName,
      templateLanguage,
      sendComponents,
    );
    if (!sendResult.wamid) {
      console.error(
        '[platform-meta-whatsapp-send] entrega falhou:',
        JSON.stringify({
          conversation_id: conversationId,
          template_name: templateName,
          code: sendResult.code,
          subcode: sendResult.subcode,
          fbtrace_id: sendResult.fbtrace_id,
          http_status: sendResult.http_status,
          message: sendResult.error,
        }),
      );
      return jsonError('delivery_failed', sendResult.error ?? 'entrega falhou', 422, {
        code: sendResult.code,
        subcode: sendResult.subcode,
        fbtrace_id: sendResult.fbtrace_id,
        conversation_id: conversationId,
      });
    }

    // 8) Persiste outbound com content legível + metadata {wamid, template_name}
    const content = renderTemplateContent(templateName, tplRow.components, sendComponents);
    const { data: messageRow, error: msgError } = await supabase
      .from('platform_crm_messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'agent',
        sender_id: user.id,
        content,
        metadata: {
          wamid: sendResult.wamid,
          template_name: templateName,
          template_language: templateLanguage,
          delivery_status: 'sent',
          channel: 'whatsapp_cloud',
          connection_id: conn.id,
          wa_type: 'template',
          origin: 'template_send',
        },
      })
      .select('*')
      .single();

    if (msgError) {
      // Template JÁ entregue — erro aqui induziria reenvio (duplicação).
      console.error('[platform-meta-whatsapp-send] persist failed (template JÁ entregue):', msgError.message);
      return json({
        ok: true,
        conversation_id: conversationId,
        message_id: null,
        wamid: sendResult.wamid,
        persist_warning: 'template entregue mas não persistido — verifique os logs',
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
      template_name: templateName,
      template_language: templateLanguage,
    });
  } catch (e) {
    console.error('[platform-meta-whatsapp-send] exception:', e);
    return jsonError('internal_error', e instanceof Error ? e.message : String(e), 500);
  }
});
