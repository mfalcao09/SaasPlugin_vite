// Porte 1:1 do webhook-receiver do CRM Vendus -> platform_crm (super-admin). Nao construir inspirado.
//
// ============================================================================
// platform-webhook-receiver — INBOUND de sistema externo para o CRM de
// PLATAFORMA (super_admin). Porte 1:1 do `webhook-receiver` do CRM Vendus,
// DESACOPLADO do tenant (SEM organization_id, SEM product_id).
//
// AUTENTICAÇÃO (crítico): este edge é chamado por um SISTEMA EXTERNO. NÃO usa
// JWT super_admin nem platform-crm-auth. A autenticação é feita pelo PRÓPRIO
// TOKEN do webhook — 1:1 com o original: webhook_id vem no path, e a validação
// é por `secret_key` (header X-Webhook-Secret) + `allowed_ips` da linha
// platform_crm_webhooks. O edge roda com SERVICE_ROLE (RLS super_admin-only não
// permitiria acesso anônimo). Ver bloco de validação em Deno.serve.
//
// ── Mapeamentos aplicados ───────────────────────────────────────────────────
//  Tabelas:
//   webhooks                 → platform_crm_webhooks
//   webhook_logs             → platform_crm_webhook_logs
//   webhook_sample_requests  → platform_crm_webhook_sample_requests
//   leads                    → platform_crm_leads
//   pipeline_stages          → platform_crm_pipeline_stages (SEM product_id;
//                              pipeline único global — filtro por product_id
//                              dropado; primeiro estágio por order_index)
//   lead_tags                → platform_crm_lead_tags (SEM organization_id)
//   lead_tag_assignments     → platform_crm_lead_tag_assignments
//   custom_fields            → platform_crm_custom_fields
//   notifications            → platform_crm_notifications
//   capture_funnels          → platform_crm_capture_funnels
//   webchat_widgets          → platform_crm_webchat_widgets
//   webchat_conversations    → platform_crm_conversations (schema REDUZIDO — ver notas)
//   webchat_messages         → platform_crm_messages
//   product_agents           → platform_crm_agent_configs (SÓ name + persona_prompt;
//                              SEM agent_type/primary_objective/tone_style/can_do/
//                              cannot_do/product_id — ver ai_agent_outreach)
//
//  RPCs:
//   increment_webhook_requests → platform_crm_increment_webhook_requests
//   distribute_lead            → __NO_EQUIVALENT__ (plataforma não tem a RPC de
//                                distribuição; branch preservado + comentado)
//
//  Scoping (orgScopingRule): TODO `organization_id` / `product_id` removido —
//   a plataforma é tenant-of-one global. Portanto a DEDUPE por telefone/email
//   não filtra mais por org, e não há `phone_normalized` (coluna inexistente em
//   platform_crm_leads) — dedupe por phone_normalized cai fora; email mantido.
//
//  Imports (_shared):
//   ../_shared/phone.ts (normalizePhoneBR)  → mantido 1:1 (helper genérico)
//   ../_shared/ai-router.ts (recordLovableUsage) → __NÃO PORTADO__: a plataforma
//     usa gateway env-driven (platform-crm-webchat.aiChatCompletions/aiModel) e
//     NÃO tem recordLovableUsage equivalente; chamada de registro de uso omitida.
//   Resend (email)  → __NO_EQUIVALENT__ direto: a plataforma envia email via
//     _shared/platform-email-send.ts (fila transacional por template do banco).
//     Como os branches send_email/send_email_to_seller do original dependem de
//     templates/organizations/profiles inexistentes na plataforma, os branches
//     são preservados mas marcados __NO_EQUIVALENT__ (ver cada case).
//
// ⚠️ AÇÕES COM INFRA AUSENTE NA PLATAFORMA (branch preservado + __NO_EQUIVALENT__):
//   - send_email / send_email_to_seller: dependem de email_templates,
//     organizations, profiles + Resend. Plataforma não tem essas tabelas.
//   - notify_whatsapp / ai_agent_outreach: dependem de integration_settings,
//     evolution_instances, profiles, ai_knowledge_base, ai_outreach_queue,
//     product_agents (campos ricos), evolution-send. Nenhum existe na plataforma.
//   - trigger_flow: capture_funnels → platform_crm_capture_funnels existe, mas o
//     envio WhatsApp (evolution_instances/evolution-send) e várias colunas de
//     platform_crm_conversations (widget_id/visitor_email/current_flow_id/
//     current_block_id/flow_source/sector_id/assigned_user_id/metadata) NÃO
//     existem. Branch preservado; envio e colunas ausentes sinalizados inline.
//
// 🔒 ZERO tabela de tenant.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizePhoneBR } from '../_shared/phone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookAction {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, any>;
}

// Flatten nested object to dot notation
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, fullPath));
      } else {
        result[fullPath] = value;
      }
    }
  }

  return result;
}

// Get value from flattened object using dot notation path
function getFieldValue(fields: Record<string, any>, path: string): any {
  return fields[path];
}

// Replace variables in template string
function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  // Remove any remaining unresolved variables
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

// Build smart variable map from lead data + template variables
function buildTemplateVariables(
  lead: { name?: string; email?: string; phone?: string },
  templateVars?: Array<{ name: string; description?: string }>,
  extraVars?: Record<string, string>
): Record<string, string> {
  const map: Record<string, string> = {};

  // Auto-resolve template variables by name heuristics
  if (templateVars && Array.isArray(templateVars)) {
    for (const v of templateVars) {
      const lower = v.name.toLowerCase();
      if (lower.includes('name') || lower.includes('nome')) {
        map[v.name] = lead.name || '';
      } else if (lower.includes('email')) {
        map[v.name] = lead.email || '';
      } else if (lower.includes('phone') || lower.includes('telefone') || lower.includes('fone')) {
        map[v.name] = lead.phone || '';
      }
    }
  }

  // Always set standard keys
  map['lead_name'] = lead.name || '';
  map['lead_email'] = lead.email || '';
  map['lead_phone'] = lead.phone || '';
  map['userName'] = lead.name || '';
  map['name'] = lead.name || '';
  map['nome'] = lead.name || '';
  map['email'] = lead.email || '';

  // Merge extras (e.g. organizationName)
  if (extraVars) Object.assign(map, extraVars);

  return map;
}

// Adjust a date to the next valid business time
function adjustToBusinessHours(date: Date, startTime: string, endTime: string, businessDays: number[]): Date {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const target = new Date(date);

  // Max 14 days search to prevent infinite loop
  for (let i = 0; i < 14; i++) {
    const dayOfWeek = target.getDay();
    if (businessDays.includes(dayOfWeek)) {
      const h = target.getHours();
      const m = target.getMinutes();
      const currentMinutes = h * 60 + m;
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (currentMinutes < startMinutes) {
        target.setHours(startH, startM, 0, 0);
        return target;
      }
      if (currentMinutes < endMinutes) {
        return target; // within business hours
      }
    }
    // Move to next day at business start
    target.setDate(target.getDate() + 1);
    target.setHours(startH, startM, 0, 0);
  }
  return target;
}

// Generate default welcome email HTML
function generateWelcomeHtml(leadName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .header h1 { color: white; margin: 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Bem-vindo(a)!</h1>
        </div>
        <div class="content">
          <p>Olá <strong>${leadName}</strong>,</p>
          <p>Obrigado pelo seu interesse! Recebemos seus dados com sucesso.</p>
          <p>Em breve nossa equipe entrará em contato com você.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Generate seller notification email HTML
function generateSellerNotificationHtml(
  leadName: string,
  leadEmail: string,
  leadPhone: string,
  leadUrl: string,
  customMessage?: string
): string {
  const defaultMessage = customMessage
    ? replaceVariables(customMessage, {
        lead_name: leadName,
        lead_email: leadEmail || 'Não informado',
        lead_phone: leadPhone || 'Não informado',
        lead_url: leadUrl
      })
    : `Um novo lead foi recebido via webhook e atribuído a você.`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .header h1 { color: white; margin: 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .lead-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
        .lead-card h3 { margin-top: 0; color: #111; }
        .lead-info { margin: 10px 0; }
        .lead-info strong { color: #6366f1; }
        .button { display: inline-block; background: #6366f1; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 Novo Lead Recebido!</h1>
        </div>
        <div class="content">
          <p>${defaultMessage}</p>
          <div class="lead-card">
            <h3>${leadName}</h3>
            <div class="lead-info"><strong>Email:</strong> ${leadEmail || 'Não informado'}</div>
            <div class="lead-info"><strong>Telefone:</strong> ${leadPhone || 'Não informado'}</div>
          </div>
          <p style="text-align: center;">
            <a href="${leadUrl}" class="button">Ver Lead no CRM</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract webhook ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const webhookId = pathParts[pathParts.length - 1];

    console.log(`[Webhook] Received request for webhook: ${webhookId}`);

    if (!webhookId || webhookId === 'platform-webhook-receiver') {
      return new Response(
        JSON.stringify({ error: 'Webhook ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get request details
    const requestIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const requestHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      requestHeaders[key] = value;
    });

    // Parse request body — tolerante a múltiplos content-types
    let payload: Record<string, any> = {};
    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    try {
      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        formData.forEach((value, key) => {
          if (value instanceof File) {
            payload[key] = { filename: value.name, type: value.type, size: value.size };
          } else {
            // Suporta múltiplos valores no mesmo campo
            if (key in payload) {
              payload[key] = Array.isArray(payload[key]) ? [...payload[key], value] : [payload[key], value];
            } else {
              payload[key] = value;
            }
          }
        });
      } else {
        // Lê o corpo como texto e tenta inferir o formato
        const rawText = await req.text();
        const trimmed = rawText.trim();
        console.log(`[Webhook] content-type="${contentType}" body_len=${rawText.length}`);

        if (!trimmed) {
          payload = {};
        } else if (contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            payload = JSON.parse(trimmed);
          } catch {
            // fallback: tenta urlencoded antes de desistir
            try {
              const params = new URLSearchParams(trimmed);
              const obj: Record<string, any> = {};
              params.forEach((v, k) => { obj[k] = v; });
              payload = Object.keys(obj).length > 0 ? obj : { raw: rawText };
            } catch {
              payload = { raw: rawText };
            }
          }
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(trimmed);
          params.forEach((v, k) => { payload[k] = v; });
        } else {
          // text/plain ou sem content-type: tenta JSON, depois urlencoded
          try {
            payload = JSON.parse(trimmed);
          } catch {
            try {
              const params = new URLSearchParams(trimmed);
              const obj: Record<string, any> = {};
              params.forEach((v, k) => { obj[k] = v; });
              payload = Object.keys(obj).length > 0 ? obj : { raw: rawText };
            } catch {
              payload = { raw: rawText };
            }
          }
        }
      }
    } catch (e) {
      console.error('[Webhook] Failed to parse body:', e);
    }

    console.log(`[Webhook] Payload:`, JSON.stringify(payload).slice(0, 500));

    // Fetch webhook configuration
    const { data: webhook, error: webhookError } = await supabase
      .from('platform_crm_webhooks')
      .select('*')
      .eq('id', webhookId)
      .single();

    if (webhookError || !webhook) {
      console.log(`[Webhook] Webhook not found: ${webhookId}`);
      return new Response(
        JSON.stringify({ error: 'Webhook not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!webhook.is_active && !webhook.is_test_mode) {
      console.log(`[Webhook] Webhook is inactive: ${webhookId}`);
      return new Response(
        JSON.stringify({ error: 'Webhook is inactive' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── AUTENTICAÇÃO POR TOKEN DO WEBHOOK (não é JWT super_admin) ──────────────
    // Enforce secret_key when configured (header X-Webhook-Secret)
    if (webhook.secret_key) {
      const providedSecret = req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret');
      if (!providedSecret || providedSecret !== webhook.secret_key) {
        console.warn(`[Webhook] Invalid secret for webhook ${webhookId}`);
        return new Response(
          JSON.stringify({ error: 'Invalid webhook secret' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Enforce allowed_ips when configured
    if (Array.isArray(webhook.allowed_ips) && webhook.allowed_ips.length > 0) {
      const callerIp = (requestIp || '').split(',')[0].trim();
      const allowed = webhook.allowed_ips
        .map((ip: string) => (ip || '').trim())
        .filter(Boolean);
      if (!allowed.includes(callerIp)) {
        console.warn(`[Webhook] IP ${callerIp} not in allowlist for webhook ${webhookId}`);
        return new Response(
          JSON.stringify({ error: 'IP not allowed' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Flatten payload for field access
    const flatFields = flattenObject(payload);

    // Create log entry
    const { data: log, error: logError } = await supabase
      .from('platform_crm_webhook_logs')
      .insert({
        webhook_id: webhookId,
        request_method: req.method,
        request_headers: requestHeaders,
        request_body: payload,
        request_ip: requestIp,
        parsed_fields: flatFields,
        status: 'pending'
      })
      .select()
      .single();

    if (logError) {
      console.error('[Webhook] Error creating log:', logError);
    }

    // If test mode, save as sample and skip actions
    if (webhook.is_test_mode) {
      console.log(`[Webhook] Test mode - skipping actions`);

      // Save as sample request
      await supabase
        .from('platform_crm_webhook_sample_requests')
        .insert({
          webhook_id: webhookId,
          name: `Request ${new Date().toLocaleString('pt-BR')}`,
          request_body: payload,
          extracted_fields: flatFields
        });

      // Update log as skipped
      if (log) {
        await supabase
          .from('platform_crm_webhook_logs')
          .update({
            status: 'skipped',
            processing_time_ms: Date.now() - startTime
          })
          .eq('id', log.id);
      }

      // Increment counters
      await supabase.rpc('platform_crm_increment_webhook_requests', { p_webhook_id: webhookId });

      return new Response(
        JSON.stringify({ success: true, message: 'Test mode - request logged', log_id: log?.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute actions
    const actions = (webhook.actions as WebhookAction[]) || [];
    const actionsResults: Array<{ action: string; success: boolean; result?: any; error?: string }> = [];
    let leadId: string | null = null;

    for (const action of actions) {
      if (!action.enabled) continue;

      console.log(`[Webhook] Executing action: ${action.type}`);

      try {
        const result = await executeAction(
          supabase,
          action,
          flatFields,
          webhook,
          leadId
        );

        if (result.lead_id) {
          leadId = result.lead_id;
        }

        actionsResults.push({
          action: action.type,
          success: true,
          result
        });

        console.log(`[Webhook] Action ${action.type} completed successfully`);
      } catch (error: any) {
        console.error(`[Webhook] Action ${action.type} failed:`, error);
        actionsResults.push({
          action: action.type,
          success: false,
          error: error.message
        });
      }
    }

    // Update log with results
    const processingTime = Date.now() - startTime;
    const hasErrors = actionsResults.some(a => !a.success);

    if (log) {
      await supabase
        .from('platform_crm_webhook_logs')
        .update({
          status: hasErrors ? 'error' : 'success',
          actions_executed: actionsResults,
          lead_id: leadId,
          processing_time_ms: processingTime,
          error_message: hasErrors ? actionsResults.find(a => !a.success)?.error : null
        })
        .eq('id', log.id);
    }

    // Increment counters
    await supabase.rpc('platform_crm_increment_webhook_requests', { p_webhook_id: webhookId });

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        actions_executed: actionsResults.length,
        lead_id: leadId,
        processing_time_ms: processingTime
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Webhook] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Execute a single action
async function executeAction(
  supabase: any,
  action: WebhookAction,
  fields: Record<string, any>,
  webhook: any,
  existingLeadId: string | null
): Promise<{ lead_id?: string; [key: string]: any }> {
  const config = action.config || {};

  switch (action.type) {
    case 'create_lead': {
      const mappings = config.field_mappings || {};

      // Map incoming fields first so we can dedupe by phone/email
      const incomingName = mappings.name ? getFieldValue(fields, mappings.name) : null;
      const incomingEmail = mappings.email ? getFieldValue(fields, mappings.email) : null;
      const incomingPhone = mappings.phone ? getFieldValue(fields, mappings.phone) : null;
      const incomingCompany = mappings.company ? getFieldValue(fields, mappings.company) : null;

      // ---------- DEDUPE: try to find an existing lead ----------
      // orgScopingRule: SEM organization_id (plataforma global). E platform_crm_leads
      // NÃO tem coluna `phone_normalized` (gerada) — o original dedupava por ela;
      // aqui normalizamos em memória e comparamos o phone normalizado do incoming
      // contra os leads que tenham telefone. Preservamos a dedupe por EMAIL (1:1).
      const phoneNormalized = normalizePhoneBR(incomingPhone);
      const phoneDigits = incomingPhone ? String(incomingPhone).replace(/\D/g, '') : '';

      let existingLead: { id: string; name: string | null; email: string | null } | null = null;

      if (phoneNormalized) {
        // platform_crm_leads não tem phone_normalized; casamos normalizando em memória.
        // Mantém a INTENÇÃO da dedupe do original.
        const { data: byPhone } = await supabase
          .from('platform_crm_leads')
          .select('id, name, email, phone')
          .not('phone', 'is', null)
          .limit(1000);
        const match = (byPhone || []).find((l: any) => normalizePhoneBR(l.phone) === phoneNormalized);
        if (match) existingLead = { id: match.id, name: match.name, email: match.email };
      }

      if (!existingLead && incomingEmail) {
        const { data: byEmail } = await supabase
          .from('platform_crm_leads')
          .select('id, name, email')
          .ilike('email', String(incomingEmail).trim())
          .limit(1)
          .maybeSingle();
        if (byEmail) existingLead = byEmail;
      }

      if (existingLead) {
        // Reuse existing lead — refresh origin and update name with the latest cadastro
        // (keep phone untouched; email only fills if missing)
        const updateData: Record<string, any> = {
          lead_origin: `webhook:${webhook.name} (recompra)`,
        };
        // Always update name when a fresh, real name comes in (not the phone string itself)
        if (incomingName && String(incomingName).trim() && String(incomingName).trim() !== String(incomingPhone || '').trim()) {
          updateData.name = incomingName;
        } else if (!existingLead.name && incomingName) {
          updateData.name = incomingName;
        }
        if (!existingLead.email && incomingEmail) updateData.email = incomingEmail;
        if (incomingCompany) updateData.company = incomingCompany;

        const { error: updErr } = await supabase
          .from('platform_crm_leads')
          .update(updateData)
          .eq('id', existingLead.id);
        if (updErr) console.warn('[Webhook] Lead reuse update warning:', updErr.message);

        console.log(`[Webhook] Lead reused (existing): ${existingLead.id}`);
        return { lead_id: existingLead.id, reused: true };
      }

      // ---------- CREATE: no existing lead found ----------
      // orgScopingRule: organization_id / product_id removidos.
      const leadData: Record<string, any> = {
        source: 'webhook',
        lead_origin: `webhook:${webhook.name}`,
        lead_channel: 'api',
      };

      if (webhook.squad_id) {
        leadData.squad_id = webhook.squad_id;
      }

      // pipeline_stages → platform_crm_pipeline_stages: pipeline único global,
      // SEM product_id. Primeiro estágio por order_index.
      {
        const { data: firstStage } = await supabase
          .from('platform_crm_pipeline_stages')
          .select('id')
          .order('order_index', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstStage) {
          leadData.current_stage_id = firstStage.id;
          console.log(`[Webhook] Setting initial stage: ${firstStage.id}`);
        }
      }

      leadData.name = incomingName || incomingEmail || incomingPhone || 'Lead Webhook';
      if (incomingEmail) leadData.email = incomingEmail;
      if (incomingPhone) leadData.phone = incomingPhone;
      if (incomingCompany) leadData.company = incomingCompany;

      const { data: lead, error } = await supabase
        .from('platform_crm_leads')
        .insert(leadData)
        .select()
        .single();

      // Race-condition guard: no original havia UNIQUE(phone_normalized) por org.
      // platform_crm_leads NÃO tem esse índice único (nem phone_normalized), então
      // o erro 23505 não ocorre por essa via — o guard é preservado por fidelidade
      // de forma, mas na prática não dispara (dedupe já feita acima).
      if (error) {
        if ((error as any).code === '23505' && phoneNormalized) {
          const { data: raceLeads } = await supabase
            .from('platform_crm_leads')
            .select('id, phone')
            .not('phone', 'is', null)
            .limit(1000);
          const raceLead = (raceLeads || []).find((l: any) => normalizePhoneBR(l.phone) === phoneNormalized);
          if (raceLead) {
            console.log(`[Webhook] Lead reused after race (23505): ${raceLead.id}`);
            const raceUpdate: Record<string, any> = {
              lead_origin: `webhook:${webhook.name} (recompra)`,
            };
            if (incomingName && String(incomingName).trim() && String(incomingName).trim() !== String(incomingPhone || '').trim()) {
              raceUpdate.name = incomingName;
            }
            await supabase.from('platform_crm_leads').update(raceUpdate).eq('id', raceLead.id);
            return { lead_id: raceLead.id, reused: true, race: true };
          }
        }
        throw error;
      }

      if (lead && webhook.squad_id) {
        // distribute_lead → __NO_EQUIVALENT__: a plataforma não tem a RPC de
        // distribuição automática (nem os args p_organization_id/p_product_id).
        // TODO: sem equivalente platform_crm — auto-dispatch por squad indisponível.
        try {
          console.warn('[AutoDispatch] distribute_lead sem equivalente platform_crm — pulado');
          console.log(`[AutoDispatch] Webhook lead ${lead.id} -> squad ${webhook.squad_id} (queued sem RPC)`);
        } catch (e) {
          console.warn('[AutoDispatch] Webhook distribution failed:', e);
        }
      }

      return { lead_id: lead.id, created: true };
    }

    case 'update_lead': {
      if (!existingLeadId) {
        throw new Error('No lead to update');
      }

      const mappings = config.field_mappings || {};
      const updateData: Record<string, any> = {};

      if (mappings.name) updateData.name = getFieldValue(fields, mappings.name);
      if (mappings.email) updateData.email = getFieldValue(fields, mappings.email);
      if (mappings.phone) updateData.phone = getFieldValue(fields, mappings.phone);
      if (mappings.company) updateData.company = getFieldValue(fields, mappings.company);

      const { error } = await supabase
        .from('platform_crm_leads')
        .update(updateData)
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, updated: true };
    }

    case 'transfer_user': {
      if (!existingLeadId) throw new Error('No lead to transfer');
      if (!config.target_user_id) throw new Error('No target user specified');

      const { error } = await supabase
        .from('platform_crm_leads')
        .update({ assigned_to: config.target_user_id })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, transferred_to: config.target_user_id };
    }

    case 'transfer_squad': {
      if (!existingLeadId) throw new Error('No lead to transfer');
      if (!config.target_squad_id) throw new Error('No target squad specified');

      const { error } = await supabase
        .from('platform_crm_leads')
        .update({ squad_id: config.target_squad_id })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, transferred_to_squad: config.target_squad_id };
    }

    case 'transfer_sector': {
      if (!existingLeadId) throw new Error('No lead to transfer');
      if (!config.target_sector_id) throw new Error('No target sector specified');

      // platform_crm_leads NÃO tem coluna `sector_id` (setores da plataforma são
      // por conversa/membros, não no lead). __NO_EQUIVALENT__: o update original
      // falharia em runtime (coluna inexistente) — branch neutralizado com skip
      // explícito, sem tentar o update. NÃO inventar migration.
      // TODO: sem equivalente platform_crm — leads.sector_id ausente (transfer_sector).
      console.warn('[Webhook] transfer_sector sem equivalente platform_crm (leads.sector_id ausente) — pulado');
      return {
        lead_id: existingLeadId,
        skipped: true,
        reason: 'transfer_sector sem equivalente platform_crm (leads.sector_id ausente)',
      };
    }

    case 'move_stage': {
      if (!existingLeadId) throw new Error('No lead to move');
      if (!config.target_stage_id) throw new Error('No target stage specified');

      const { error } = await supabase
        .from('platform_crm_leads')
        .update({ current_stage_id: config.target_stage_id })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, moved_to_stage: config.target_stage_id };
    }

    case 'apply_tags': {
      if (!existingLeadId) throw new Error('No lead to tag');

      // orgScopingRule: SEM organization_id — lead_tags/lead_tag_assignments da
      // plataforma são globais. O lookup de organization_id do lead cai fora.
      let tagIds: string[] = Array.isArray(config.tag_ids) ? [...config.tag_ids] : [];

      // Compatibilidade: se vier nomes legados em config.tags, tenta resolver por nome (case-insensitive)
      if ((!tagIds || tagIds.length === 0) && Array.isArray(config.tags) && config.tags.length > 0) {
        const names = config.tags.map((s: string) => String(s).trim()).filter(Boolean);
        if (names.length > 0) {
          const { data: matched } = await supabase
            .from('platform_crm_lead_tags')
            .select('id, name');
          const lower = (s: string) => s.toLowerCase();
          const namesLower = new Set(names.map(lower));
          tagIds = (matched || [])
            .filter((t: any) => namesLower.has(lower(t.name)))
            .map((t: any) => t.id);
        }
      }

      if (!tagIds || tagIds.length === 0) {
        return { lead_id: existingLeadId, tags_applied: [], warning: 'Nenhuma etiqueta resolvida' };
      }

      const rows = tagIds.map((tid) => ({
        lead_id: existingLeadId,
        tag_id: tid,
        applied_by: null,
        source: 'webhook' as const,
      }));

      // Insert ignorando duplicate keys
      const { error } = await supabase
        .from('platform_crm_lead_tag_assignments')
        .upsert(rows, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true });

      if (error) throw error;
      return { lead_id: existingLeadId, tags_applied: tagIds };
    }

    case 'set_temperature': {
      if (!existingLeadId) throw new Error('No lead to update');
      if (!config.temperature) throw new Error('No temperature specified');

      const { error } = await supabase
        .from('platform_crm_leads')
        .update({ temperature: config.temperature })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, temperature_set: config.temperature };
    }

    case 'set_deal_value': {
      if (!existingLeadId) throw new Error('No lead to update');
      if (!config.value_field) throw new Error('No value field specified');

      const value = parseFloat(getFieldValue(fields, config.value_field)) || 0;

      const { error } = await supabase
        .from('platform_crm_leads')
        .update({ deal_value: value })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, deal_value_set: value };
    }

    case 'send_email': {
      if (!existingLeadId) throw new Error('No lead for email');

      // Get lead data (orgScopingRule: organization_id removido do select)
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('name, email, phone')
        .eq('id', existingLeadId)
        .single();

      if (!lead?.email) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Lead has no email' };
      }

      // __NO_EQUIVALENT__: o original resolvia `organizations.name` e usava
      // `email_templates` + Resend. A plataforma NÃO tem `organizations` nem
      // `email_templates` (o envio é por _shared/platform-email-send.ts com
      // template do banco `platform_email_templates` de slug fixo). Como o
      // contrato do original (template configurável por id + Resend from
      // onboarding@resend.dev) não existe aqui, o branch é preservado mas
      // não pode ser executado 1:1.
      // TODO: sem equivalente platform_crm — send_email (email_templates/organizations/Resend) indisponível.
      let orgName = 'Notificação';
      // organizations → __NO_EQUIVALENT__ (plataforma tenant-of-one, sem tabela).

      // Get email template if configured
      let subject = 'Obrigado pelo seu interesse!';
      let html = generateWelcomeHtml(lead.name || 'Cliente');

      if (config.email_template_id) {
        // email_templates → __NO_EQUIVALENT__ na plataforma.
        // TODO: sem equivalente platform_crm — email_templates indisponível.
        const template: any = null;

        if (template) {
          const vars = buildTemplateVariables(
            { name: lead.name, email: lead.email, phone: lead.phone },
            template.variables as Array<{ name: string; description?: string }>,
            { organizationName: orgName, organization: orgName }
          );
          subject = replaceVariables(template.subject, vars);
          html = replaceVariables(template.html_content, vars);
        }
      }

      // Also process custom subject if set
      if (config.email_subject) {
        const vars = buildTemplateVariables(
          { name: lead.name, email: lead.email, phone: lead.phone },
          undefined,
          { organizationName: orgName }
        );
        subject = replaceVariables(config.email_subject, vars);
      }

      // Send email via Resend → __NO_EQUIVALENT__ (plataforma usa fila
      // transacional em platform-email-send.ts, não Resend inline). Branch
      // preservado como skip explícito.
      // TODO: sem equivalente platform_crm — envio via Resend indisponível.
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) {
        console.error('[Webhook] RESEND_API_KEY not configured');
        return { lead_id: existingLeadId, skipped: true, reason: 'Email service not configured' };
      }

      // Sem cliente Resend portado — não há como enviar 1:1. Skip explícito.
      return {
        lead_id: existingLeadId,
        skipped: true,
        reason: 'send_email sem equivalente platform_crm (Resend/email_templates/organizations)',
        subject_preview: subject,
        html_len: html.length,
      };
    }

    case 'send_email_to_seller': {
      if (!existingLeadId) throw new Error('No lead for seller notification');

      // Get lead data with assigned seller
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('name, email, phone, assigned_to')
        .eq('id', existingLeadId)
        .single();

      if (!lead?.assigned_to) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Lead has no assigned seller' };
      }

      // __NO_EQUIVALENT__: o original lia `profiles` (email/full_name do vendedor)
      // e `organizations` (nome), enviando via Resend. Nenhuma dessas tabelas
      // existe na plataforma (o "profile" é auth.users; e-mail/nome não estão
      // num profiles espelhado). Branch preservado como skip explícito.
      // TODO: sem equivalente platform_crm — send_email_to_seller (profiles/organizations/Resend) indisponível.
      const seller = null as { email?: string; full_name?: string } | null; // profiles → __NO_EQUIVALENT__
      const org = null as { name?: string } | null;                          // organizations → __NO_EQUIVALENT__

      if (!seller?.email) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Seller has no email' };
      }

      const orgName = org?.name || 'CRM';

      // Build smart variables
      const vars = buildTemplateVariables(
        { name: lead.name, email: lead.email, phone: lead.phone },
        undefined,
        {
          organizationName: orgName,
          seller_name: seller.full_name || '',
          sellerName: seller.full_name || ''
        }
      );

      // Build email content
      const leadUrl = `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app')}/leads/${existingLeadId}`;

      const subject = config.email_subject
        ? replaceVariables(config.email_subject, vars)
        : `Novo lead recebido: ${lead.name || 'Lead'}`;

      const html = generateSellerNotificationHtml(
        lead.name || 'Lead',
        lead.email || '',
        lead.phone || '',
        leadUrl,
        config.email_message ? replaceVariables(config.email_message, vars) : undefined
      );

      // Send email via Resend → __NO_EQUIVALENT__ (ver send_email).
      // TODO: sem equivalente platform_crm — envio via Resend indisponível.
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) {
        console.error('[Webhook] RESEND_API_KEY not configured');
        return { lead_id: existingLeadId, skipped: true, reason: 'Email service not configured' };
      }

      return {
        lead_id: existingLeadId,
        skipped: true,
        reason: 'send_email_to_seller sem equivalente platform_crm (Resend/profiles/organizations)',
        subject_preview: subject,
        html_len: html.length,
      };
    }

    case 'notify_user': {
      if (!existingLeadId) {
        console.log('[Webhook] No lead for notification, skipping');
        return { skipped: true, reason: 'No lead for notification' };
      }

      // Get lead's assigned user
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('assigned_to, name')
        .eq('id', existingLeadId)
        .single();

      if (!lead?.assigned_to) {
        return { skipped: true, reason: 'No assigned user' };
      }

      // Create notification (notifications → platform_crm_notifications).
      // NOTA: platform_crm_notifications.type é enum platform_crm_notification_type
      // (default 'system'); o original usava type 'info' (não existe no enum). Para
      // não violar o enum, `type` é omitido (usa o default do schema).
      const { error } = await supabase
        .from('platform_crm_notifications')
        .insert({
          user_id: lead.assigned_to,
          title: 'Novo lead via Webhook',
          message: config.notification_message || `Lead ${lead.name} recebido via webhook`,
          action_url: `/leads/${existingLeadId}`
        });

      if (error) {
        console.error('[Webhook] Notification error:', error);
      }

      return { lead_id: existingLeadId, notified: lead.assigned_to };
    }

    case 'update_field': {
      if (!existingLeadId) throw new Error('No lead to update field');
      if (!config.custom_field_id) throw new Error('No custom field specified');
      if (!config.value_field) throw new Error('No value field specified');

      // Get custom field info (custom_fields → platform_crm_custom_fields)
      const { data: customField } = await supabase
        .from('platform_crm_custom_fields')
        .select('field_key, name')
        .eq('id', config.custom_field_id)
        .single();

      const fieldKey = customField?.field_key || config.custom_field_key;
      if (!fieldKey) throw new Error('Could not resolve field key');

      const fieldValue = getFieldValue(fields, config.value_field);

      // Get current lead metadata
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('metadata')
        .eq('id', existingLeadId)
        .single();

      const currentMetadata = lead?.metadata || {};
      const currentCustomFields = currentMetadata.custom_fields || {};

      const { error } = await supabase
        .from('platform_crm_leads')
        .update({
          metadata: {
            ...currentMetadata,
            custom_fields: {
              ...currentCustomFields,
              [fieldKey]: fieldValue
            }
          }
        })
        .eq('id', existingLeadId);

      if (error) throw error;
      return { lead_id: existingLeadId, field_updated: fieldKey, value: fieldValue };
    }

    case 'notify_whatsapp': {
      if (!existingLeadId) throw new Error('No lead to notify about');

      // __NO_EQUIVALENT__: o original resolvia provedor WhatsApp em
      // `integration_settings` (whatsapp_provider) e alvos em `profiles`
      // (phone). A plataforma NÃO tem `integration_settings` nem `profiles`,
      // e NÃO tem canal WhatsApp conectado. Branch inteiro preservado, mas as
      // consultas de infra ausente são substituídas por nulos + skip explícito.
      // TODO: sem equivalente platform_crm — notify_whatsapp (integration_settings/profiles/WhatsApp) indisponível.
      const wpSetting = null as { settings?: Record<string, unknown> } | null; // integration_settings → __NO_EQUIVALENT__

      const wpSettings = wpSetting?.settings as Record<string, unknown> | null;
      const wpProvider = (wpSettings?.provider as string) || 'isichat';
      const bcKey = (wpSettings?.botconversa_api_key as string) || Deno.env.get('BOTCONVERSA_API_KEY');
      const isichatToken = Deno.env.get('ISICHAT_TOKEN');

      if (wpProvider !== 'botconversa' && !isichatToken) {
        return { lead_id: existingLeadId, skipped: true, reason: 'No WhatsApp provider configured' };
      }

      // Get lead data for variable substitution
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('name, email, phone')
        .eq('id', existingLeadId)
        .single();

      const messageTemplate = config.whatsapp_message || 'Novo lead recebido: {{lead_name}}';
      const message = replaceVariables(messageTemplate, {
        lead_name: lead?.name || 'Lead',
        lead_phone: lead?.phone || 'Não informado',
        lead_email: lead?.email || 'Não informado',
      });

      // Determine target numbers
      const targetNumbers: string[] = [];
      const whatsappTarget = config.whatsapp_target || 'all_team';

      if (whatsappTarget === 'specific_number') {
        if (config.whatsapp_number) {
          targetNumbers.push(config.whatsapp_number);
        }
      } else if (whatsappTarget === 'specific_user') {
        if (config.whatsapp_user_id) {
          // profiles → __NO_EQUIVALENT__ (sem phone de usuário na plataforma).
          // TODO: sem equivalente platform_crm — profiles.phone indisponível.
          const profile = null as { phone?: string } | null;
          if (profile?.phone) {
            targetNumbers.push(profile.phone);
          }
        }
      } else {
        // all_team — o original buscava profiles.phone da organização.
        // profiles → __NO_EQUIVALENT__ (plataforma sem tabela profiles espelhada).
        // TODO: sem equivalente platform_crm — profiles (all_team) indisponível.
        const profiles = null as Array<{ phone?: string }> | null;

        if (profiles) {
          for (const p of profiles) {
            if (p.phone) targetNumbers.push(p.phone);
          }
        }
      }

      if (targetNumbers.length === 0) {
        return { lead_id: existingLeadId, skipped: true, reason: 'No target phone numbers found' };
      }

      // Send to each number via configured provider
      const results: { number: string; success: boolean; error?: string }[] = [];

      for (const number of targetNumbers) {
        try {
          let cleanNumber = number.replace(/\D/g, '');
          if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;

          if (wpProvider === 'botconversa' && bcKey) {
            const lookupResp = await fetch(
              `https://backend.botconversa.com.br/api/v1/webhook/subscriber/get_by_phone/${cleanNumber}/`,
              { headers: { 'API-KEY': bcKey } }
            );
            if (lookupResp.ok) {
              const sub = await lookupResp.json();
              const sendResp = await fetch(
                `https://backend.botconversa.com.br/api/v1/webhook/subscriber/${sub.id}/send_message/`,
                {
                  method: 'POST',
                  headers: { 'API-KEY': bcKey, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'text', value: message }),
                }
              );
              if (!sendResp.ok) {
                const errText = await sendResp.text();
                results.push({ number: cleanNumber, success: false, error: `HTTP ${sendResp.status}` });
              } else {
                results.push({ number: cleanNumber, success: true });
              }
            } else {
              results.push({ number: cleanNumber, success: false, error: 'Subscriber not found' });
            }
          } else if (isichatToken) {
            const resp = await fetch('https://api.isichat.com.br/api/messages/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${isichatToken}`,
              },
              body: JSON.stringify({ number: cleanNumber, body: message }),
            });
            if (!resp.ok) {
              const errText = await resp.text();
              results.push({ number: cleanNumber, success: false, error: `HTTP ${resp.status}` });
            } else {
              results.push({ number: cleanNumber, success: true });
            }
          }
        } catch (e: any) {
          console.error(`[Webhook/WhatsApp] Error sending to ${number}:`, e);
          results.push({ number, success: false, error: e.message });
        }
      }

      const sentCount = results.filter(r => r.success).length;
      return { lead_id: existingLeadId, whatsapp_sent_to: sentCount, results };
    }

    case 'ai_agent_outreach': {
      if (!existingLeadId) throw new Error('No lead for AI outreach');

      // __NO_EQUIVALENT__ (parcial): esta ação depende de MUITA infra que a
      // plataforma não tem:
      //   - product_agents (campos ricos: agent_type/primary_objective/tone_style/
      //     message_style/can_do/cannot_do/product_id) → platform_crm_agent_configs
      //     só tem name + persona_prompt.
      //   - ai_knowledge_base (brain) → não existe na plataforma.
      //   - integration_settings / evolution_instances / evolution-send /
      //     BotConversa / IsiChat → canal WhatsApp inexistente na plataforma.
      //   - ai_outreach_queue → não existe na plataforma (follow-up tracking).
      //   - webchat_conversations com colunas widget_id/visitor_email/metadata →
      //     platform_crm_conversations tem schema REDUZIDO.
      //   - recordLovableUsage → não portado (gateway env-driven sem recorder).
      // Branch preservado; execução real indisponível → skip explícito no topo.
      // TODO: sem equivalente platform_crm — ai_agent_outreach (product_agents rich/ai_knowledge_base/ai_outreach_queue/WhatsApp) indisponível.
      return {
        lead_id: existingLeadId,
        skipped: true,
        reason: 'ai_agent_outreach sem equivalente platform_crm (agente rico/knowledge/outreach_queue/WhatsApp ausentes)',
      };

      /* ---- CORPO ORIGINAL PRESERVADO (não executável na plataforma) ----
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        return { lead_id: existingLeadId, skipped: true, reason: 'LOVABLE_API_KEY not configured' };
      }

      // 1. Get lead data
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('name, email, phone, metadata, temperature, deal_value')
        .eq('id', existingLeadId)
        .single();

      let leadPhone = lead?.phone?.replace(/\D/g, '');
      if (!leadPhone) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Lead has no phone/whatsapp' };
      }
      if (!leadPhone.startsWith('55')) {
        leadPhone = '55' + leadPhone;
      }

      // 2. Get agent config (product_agents → platform_crm_agent_configs, campos ricos ausentes)
      const agentId = config.ai_agent_id;
      if (!agentId) throw new Error('No AI agent specified');

      const { data: agent } = await supabase
        .from('platform_crm_agent_configs')
        .select('*')
        .eq('id', agentId)
        .single();

      if (!agent) throw new Error('AI agent not found');

      // ai_knowledge_base → __NO_EQUIVALENT__
      // integration_settings / evolution_instances / evolution-send → __NO_EQUIVALENT__
      // webchat_conversations (widget_id/visitor_email/metadata) → colunas ausentes
      // ai_outreach_queue → __NO_EQUIVALENT__
      ------------------------------------------------------------------- */
    }

    case 'trigger_flow': {
      if (!existingLeadId) throw new Error('No lead to trigger flow for');
      const flowId = config.flow_id;
      const agentId = config.flow_agent_id || null;
      const channel = (config.flow_channel as 'whatsapp' | 'webchat') || 'whatsapp';
      const assignedUserId: string | null = config.flow_assigned_user_id || null;
      const sectorId: string | null = config.flow_sector_id || null;
      if (!flowId) throw new Error('flow_id is required');

      // 1. Carrega lead, funil e (opcionalmente) agente
      //    orgScopingRule: organization_id removido. capture_funnels →
      //    platform_crm_capture_funnels; product_agents → platform_crm_agent_configs.
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('name, email, phone')
        .eq('id', existingLeadId)
        .single();

      const { data: funnel } = await supabase
        .from('platform_crm_capture_funnels')
        .select('id, name, status, flow_blocks, start_block_id')
        .eq('id', flowId)
        .maybeSingle();
      if (!funnel) throw new Error('Funil não encontrado');
      // orgScopingRule: sem organization_id — checagem de "funil de outra org" cai fora.

      if (agentId) {
        const { data: agent } = await supabase
          .from('platform_crm_agent_configs')
          .select('id, name')
          .eq('id', agentId)
          .maybeSingle();
        if (!agent) throw new Error('Agente não encontrado');
        // orgScopingRule: sem organization_id — checagem de "agente de outra org" cai fora.
      }

      // 2. Determina o primeiro bloco
      const blocks: any[] = (funnel.flow_blocks as any[]) || [];
      const startBlockId: string | null = (funnel as any).start_block_id || blocks[0]?.id || null;
      const startBlock = blocks.find((b: any) => b.id === startBlockId) || blocks[0] || null;

      // 3. Telefone normalizado (BR)
      let leadPhone = (lead?.phone || '').replace(/\D/g, '');
      if (leadPhone && !leadPhone.startsWith('55')) leadPhone = '55' + leadPhone;

      if (channel === 'whatsapp' && !leadPhone) {
        return { lead_id: existingLeadId, skipped: true, reason: 'Lead sem telefone para WhatsApp' };
      }

      // 4. Resolve um widget ativo (webchat_widgets → platform_crm_webchat_widgets)
      //    NOTA: platform_crm_conversations NÃO tem coluna widget_id, então o
      //    widget não é usado na conversa; a resolução é mantida por fidelidade
      //    de fluxo mas o resultado não é escrito na conversa.
      let widgetRow = (await supabase
        .from('platform_crm_webchat_widgets')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()).data;

      if (!widgetRow?.id) {
        // platform_crm_webchat_widgets exige `public_key` (UNIQUE NOT NULL) —
        // adicionado no insert (o original não tinha essa coluna).
        const { data: createdWidget, error: createWidgetError } = await supabase
          .from('platform_crm_webchat_widgets')
          .insert({
            name: 'Outreach (automático)',
            public_key: `outreach-${crypto.randomUUID()}`,
            is_active: true,
          })
          .select('id')
          .single();
        if (createWidgetError || !createdWidget?.id) {
          throw new Error(`Falha ao criar widget interno de outreach: ${createWidgetError?.message || 'sem id'}`);
        }
        widgetRow = createdWidget;
      }

      // 5. Determina status inicial conforme atribuição (1:1)
      // - com agente IA  -> bot_active
      // - com vendedor   -> human_active (já aceito)
      // - sem nada       -> waiting_human (entra na fila do setor)
      let initialStatus: 'bot_active' | 'human_active' | 'waiting_human';
      if (agentId) initialStatus = 'bot_active';
      else if (assignedUserId) initialStatus = 'human_active';
      else initialStatus = 'waiting_human';

      // 6. Cria conversa com contexto do fluxo.
      //    platform_crm_conversations tem schema REDUZIDO: NÃO existem as colunas
      //    widget_id, visitor_email, current_flow_id, current_block_id,
      //    flow_completed, flow_source, sector_id, assigned_user_id, metadata,
      //    organization_id. Elas caem fora. Mapeamentos possíveis:
      //      assigned_user_id → assigned_to (auth.users)
      //      visitor_phone/visitor_name/current_agent_id/lead_id/status/channel → 1:1
      //    channel 'webchat' → 'web_chat' (default do schema da plataforma).
      //    TODO: sem equivalente platform_crm — colunas de fluxo/setor na conversa ausentes.
      const conversationPayload: Record<string, any> = {
        visitor_id: crypto.randomUUID(),
        visitor_name: lead?.name || 'Lead',
        visitor_phone: channel === 'whatsapp' ? leadPhone : null,
        channel: channel === 'whatsapp' ? 'whatsapp' : 'web_chat',
        status: initialStatus,
        lead_id: existingLeadId,
        current_agent_id: agentId,
        assigned_to: assignedUserId,
        accepted_at: assignedUserId ? new Date().toISOString() : null,
      };

      const { data: conversation, error: convErr } = await supabase
        .from('platform_crm_conversations')
        .insert(conversationPayload)
        .select()
        .single();
      if (convErr) throw new Error(`Falha ao criar conversa: ${convErr.message}`);

      // Se vendedor foi atribuído, refletir no lead também (Single Attendant trigger cuida do resto)
      if (assignedUserId) {
        await supabase
          .from('platform_crm_leads')
          .update({ assigned_to: assignedUserId })
          .eq('id', existingLeadId);
      }

      // 5. Se canal WhatsApp e bloco inicial é mensagem, o original enviava a
      //    primeira mensagem via Evolution Go (integration_settings/
      //    evolution_instances/evolution-send). __NO_EQUIVALENT__ na plataforma
      //    (sem canal WhatsApp). Preservamos a montagem da mensagem e a
      //    persistência no histórico (webchat_messages → platform_crm_messages),
      //    mas o ENVIO real fica indisponível (sinalizado).
      // TODO: sem equivalente platform_crm — envio WhatsApp (evolution_instances/evolution-send) indisponível.
      let firstMessageSent: string | null = null;
      if (channel === 'whatsapp' && startBlock) {
        const blockData = startBlock.data || {};
        let messageText: string =
          blockData.content ||
          blockData.message ||
          blockData.text ||
          blockData.greeting ||
          '';
        if (messageText && lead) {
          messageText = messageText
            .replace(/\{nome_lead\}/gi, lead.name || '')
            .replace(/\{name\}/gi, lead.name || '')
            .replace(/\{email\}/gi, lead.email || '')
            .replace(/\{phone\}/gi, lead.phone || '');
        }

        if (messageText) {
          // Envio via Evolution Go → __NO_EQUIVALENT__ (sem instâncias na
          // plataforma). O original abortava (throw) se não houvesse instância;
          // aqui, como o canal inexiste, apenas registramos a mensagem no
          // histórico (webchat_messages → platform_crm_messages) sem enviar.
          console.warn('[Webhook/TriggerFlow] envio WhatsApp indisponível na plataforma — mensagem só persistida no histórico');

          await supabase.from('platform_crm_messages').insert({
            conversation_id: conversation.id,
            content: messageText,
            sender_type: 'bot',
            direction: 'outbound',
          });
          firstMessageSent = messageText;
        }
      }

      console.log(`[Webhook/TriggerFlow] flow=${flowId} agent=${agentId} channel=${channel} conv=${conversation.id}`);

      return {
        lead_id: existingLeadId,
        flow_id: flowId,
        agent_id: agentId,
        channel,
        conversation_id: conversation.id,
        start_block_id: startBlock?.id || null,
        first_message_sent: firstMessageSent,
      };
    }

    default:
      console.log(`[Webhook] Unknown action type: ${action.type}`);
      return { skipped: true, reason: 'Unknown action type' };
  }
}
