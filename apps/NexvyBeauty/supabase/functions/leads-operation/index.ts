// Operações horizontais da Nova Prospecção Ativa.
// A UI não escreve tabelas diretamente. Pré-seleção é a única operação desta
// primeira versão que altera o eixo vertical, sempre via CAS do lead_state.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  authenticatePlatformAgent,
  platformCrmCorsHeaders as corsHeaders,
} from '../_shared/platform-crm-auth.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OP_TYPES = new Set(['enrichment', 'preselection', 'handoff', 'triage_review']);
const ACTIVE_STATUSES = new Set(['queued', 'running']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function safeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);
  const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const productId = String(body?.product_id ?? '').trim();
  const action = String(body?.action ?? 'create').trim();
  if (!validUuid(productId)) return json({ error: 'product_id invalido (UUID)' }, 400);

  if (action === 'cancel') {
    const operationId = String(body?.operation_id ?? '').trim();
    if (!validUuid(operationId)) return json({ error: 'operation_id invalido' }, 400);
    const { data, error } = await sb.from('platform_crm_lead_operations')
      .update({ status: 'cancelled', finished_at: new Date().toISOString(), error: null })
      .eq('id', operationId)
      .eq('product_id', productId)
      .in('status', ['queued', 'running'])
      .select('id, status, operation_type, lead_id, extracted_lead_id')
      .maybeSingle();
    if (error) return json({ error: 'falha ao cancelar operação' }, 500);
    if (!data) return json({ error: 'operação não encontrada ou já encerrada' }, 409);
    return json({ ok: true, operation: data });
  }

  if (action !== 'create') return json({ error: 'action invalida' }, 400);
  const operationType = String(body?.operation_type ?? '').trim();
  if (!OP_TYPES.has(operationType)) return json({ error: 'operation_type invalido' }, 400);

  const leadId = body?.lead_id == null ? null : String(body.lead_id).trim();
  const extractedLeadId = body?.extracted_lead_id == null ? null : String(body.extracted_lead_id).trim();
  if (!validUuid(leadId) && !validUuid(extractedLeadId)) {
    return json({ error: 'informe lead_id ou extracted_lead_id' }, 400);
  }
  if (leadId && !validUuid(leadId)) return json({ error: 'lead_id invalido' }, 400);
  if (extractedLeadId && !validUuid(extractedLeadId)) return json({ error: 'extracted_lead_id invalido' }, 400);

  const idempotencyKey = String(body?.idempotency_key ?? '').trim().slice(0, 180);
  if (!idempotencyKey) return json({ error: 'idempotency_key obrigatoria' }, 400);
  const payload = safeJsonObject(body?.payload);

  // Confirma escopo do alvo antes de criar a operação.
  if (leadId) {
    const { data, error } = await sb.from('platform_crm_leads')
      .select('id, product_id')
      .eq('id', leadId)
      .eq('product_id', productId)
      .maybeSingle();
    if (error) return json({ error: 'falha ao validar lead' }, 500);
    if (!data) return json({ error: 'lead fora do produto' }, 404);
  }
  if (extractedLeadId) {
    const { data, error } = await sb.from('platform_crm_extracted_leads')
      .select('id, product_id, imported_to_lead_id')
      .eq('id', extractedLeadId)
      .eq('product_id', productId)
      .maybeSingle();
    if (error) return json({ error: 'falha ao validar perfil' }, 500);
    if (!data) return json({ error: 'perfil fora do produto' }, 404);
  }

  const { data: existing, error: existingError } = await sb.from('platform_crm_lead_operations')
    .select('*')
    .eq('product_id', productId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existingError) return json({ error: 'falha ao consultar idempotência' }, 500);
  if (existing) return json({ ok: true, idempotent: true, operation: existing });

  const { data: operation, error: insertError } = await sb.from('platform_crm_lead_operations')
    .insert({
      product_id: productId,
      lead_id: leadId,
      extracted_lead_id: extractedLeadId,
      operation_type: operationType,
      status: 'queued',
      source_module: 'nova_prospeccao',
      target_module: payload.target_module ?? null,
      requested_by: user?.id ?? null,
      idempotency_key: idempotencyKey,
      payload,
    })
    .select('*')
    .single();
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced } = await sb.from('platform_crm_lead_operations')
        .select('*').eq('product_id', productId).eq('idempotency_key', idempotencyKey).maybeSingle();
      return raced ? json({ ok: true, idempotent: true, operation: raced }) : json({ error: 'operação duplicada' }, 409);
    }
    return json({ error: 'falha ao criar operação' }, 500);
  }

  if (operationType === 'preselection') {
    if (!leadId) {
      await sb.from('platform_crm_lead_operations').update({ status: 'failed', finished_at: new Date().toISOString(), error: 'preselection_requires_lead_id' }).eq('id', operation.id);
      return json({ error: 'preselection exige lead_id' }, 400);
    }
    const { data: state, error: stateError } = await sb.from('platform_crm_lead_state')
      .select('version, derived_stage, facts')
      .eq('lead_id', leadId).eq('product_id', productId).maybeSingle();
    if (stateError || !state) {
      await sb.from('platform_crm_lead_operations').update({ status: 'failed', finished_at: new Date().toISOString(), error: 'lead_state_not_found' }).eq('id', operation.id);
      return json({ error: 'estado do lead não encontrado' }, 409);
    }
    if (state.derived_stage !== 'db' && state.derived_stage !== 'preselected') {
      await sb.from('platform_crm_lead_operations').update({ status: 'failed', finished_at: new Date().toISOString(), error: `invalid_vertical_stage:${state.derived_stage}` }).eq('id', operation.id);
      return json({ error: 'lead não está elegível para pré-seleção', stage: state.derived_stage }, 409);
    }
    if (state.derived_stage === 'db') {
      const { data: cas, error: casError } = await sb.rpc('platform_crm_lead_state_cas_patch', {
        p_lead_id: leadId,
        p_product_id: productId,
        p_expected_version: Number(state.version) || 0,
        p_patch: { derived_stage: 'preselected' },
      });
      if (casError || !cas?.ok) {
        await sb.from('platform_crm_lead_operations').update({ status: 'failed', finished_at: new Date().toISOString(), error: casError?.message ?? 'state_cas_conflict' }).eq('id', operation.id);
        return json({ error: 'conflito ao pré-selecionar lead' }, 409);
      }
    }
    const { data: done, error: doneError } = await sb.from('platform_crm_lead_operations')
      .update({ status: 'succeeded', started_at: new Date().toISOString(), finished_at: new Date().toISOString(), result: { derived_stage: 'preselected' } })
      .eq('id', operation.id).select('*').single();
    if (doneError) return json({ error: 'pré-seleção aplicada, mas operação não foi fechada' }, 500);
    return json({ ok: true, operation: done });
  }

  if (operationType === 'enrichment') {
    const handlesQuery = sb.from('platform_crm_extracted_leads')
      .select('handle')
      .eq('product_id', productId)
      .is('telefone', null)
      .is('whatsapp_link', null)
      .not('handle', 'is', null)
      .limit(200);
    const { data: profiles, error: profilesError } = extractedLeadId
      ? await handlesQuery.eq('id', extractedLeadId)
      : await handlesQuery.eq('imported_to_lead_id', leadId);
    const handles = (profiles ?? [])
      .map((row: any) => String(row.handle ?? '').trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
    if (profilesError || !handles.length) {
      await sb.from('platform_crm_lead_operations').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: profilesError?.message ?? 'no_enrichment_handles',
      }).eq('id', operation.id);
      return json({ error: 'nenhum perfil elegível para enriquecimento' }, 409);
    }

    const internalResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/leads-import-handles`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_id: productId, handles, actorUserId: user?.id ?? null }),
      },
    );
    const internalData = await internalResponse.json().catch(() => ({}));
    if (!internalResponse.ok || internalData?.error) {
      await sb.from('platform_crm_lead_operations').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: String(internalData?.error ?? `enrichment_start_${internalResponse.status}`).slice(0, 500),
      }).eq('id', operation.id);
      return json({ error: 'falha ao iniciar enriquecimento', detail: internalData?.error ?? null }, 502);
    }

    const { data: running, error: runningError } = await sb.from('platform_crm_lead_operations')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        result: { handles_count: handles.length, extraction_id: internalData.extraction_id ?? null, run_id: internalData.run_id ?? null },
      })
      .eq('id', operation.id)
      .select('*')
      .single();
    if (runningError) return json({ error: 'enriquecimento iniciado, mas operação não foi atualizada' }, 500);
    return json({ ok: true, operation: running });
  }

  return json({ ok: true, operation });
});
