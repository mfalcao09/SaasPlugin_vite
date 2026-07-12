// platform-form-submit — runtime PÚBLICO dos formulários de captação da PLATAFORMA
// (super-admin / CRM do grupo). Porte product-scoped do form-submit do tenant
// (.vendus-src-reference/supabase/functions/form-submit), trocando organization_id
// por product_id e as tabelas tenant (forms/form_blocks/leads/...) pelas
// platform_crm_* (SEM organization_id).
//
// É PÚBLICA (submissão de lead externo): NÃO exige super_admin. Usa SERVICE_ROLE
// internamente (as tabelas platform_crm_* têm RLS super_admin-only, sem policy
// anon), então tanto o carregamento do form (action:'load') quanto a gravação do
// lead passam por esta edge — o frontend anônimo nunca toca as tabelas direto
// (§11.1: minimizar superfície no client).
//
// Diferenças estruturais vs. o tenant (schema platform_crm_*):
//   * platform_crm_leads NÃO tem coluna `score` nem `sector_id` → score e setor
//     vão para metadata.
//   * platform_crm_lead_tags é platform-wide (sem organization_id) → tags legadas
//     resolvidas globalmente.
//   * platform_crm_distribute_lead(p_lead_id, p_squad_id) — 2 args.
//   * SEM tabela de interactions, SEM post_cadence, SEM manual-outreach edge →
//     esses efeitos colaterais do tenant são preservados em metadata quando fazem
//     sentido, e omitidos quando não há destino no schema da plataforma.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type FormOptionAction =
  | { type: 'redirect'; url: string; new_tab?: boolean }
  | { type: 'add_tags'; tag_ids: string[] }
  | { type: 'start_ai_agent'; agent_id: string }
  | { type: 'start_ai_outreach'; agent_id: string; objective?: string }
  | { type: 'open_calendar'; event_type_id: string; ask_email?: boolean }
  | { type: 'assign_sector'; sector_id: string }
  | { type: 'assign_user'; user_id: string; as?: 'human' | 'closer' | 'sdr' }
  | { type: 'go_to_block'; target_block_id: string }
  | {
      type: 'set_custom_field';
      field_key: string;
      value_source: 'option_label' | 'option_value' | 'static';
      static_value?: string;
      _value?: string;
    };

interface SelectedOption {
  block_id: string;
  block_label: string;
  option_value: string;
  option_label: string;
  triggered_actions: string[];
}

interface SubmitRequest {
  action?: 'load' | 'submit';
  form_id?: string;
  slug?: string;
  responses?: Record<string, unknown>;
  selected_actions?: FormOptionAction[];
  selected_options?: SelectedOption[];
  tracking?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    referrer_url?: string;
    landing_page?: string;
    user_agent?: string;
  };
}

// ------------------------------------------------------------
// Rate-limit básico por IP (best-effort, in-memory por instância).
// Janela deslizante simples: no máx. N eventos por IP na janela.
// ------------------------------------------------------------
const RL_WINDOW_MS = 60_000;
const RL_MAX = 20;
const rlBuckets = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (rlBuckets.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_MAX) {
    rlBuckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  rlBuckets.set(ip, arr);
  return false;
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return (xff.split(',')[0] || '').trim() || req.headers.get('x-real-ip') || 'unknown';
}

// Campos de bloco seguros para expor ao cliente no `load` (sem scoring/automação).
function toPublicBlock(b: Record<string, any>) {
  const bs = { ...((b.block_settings || {}) as Record<string, any>) };
  // Remove internals de scoring/automação — o cálculo é 100% server-side.
  delete bs.crm;
  delete bs.score_yes;
  delete bs.score_no;
  delete bs.score_per_point;
  return {
    id: b.id,
    form_id: b.form_id,
    order_index: b.order_index,
    block_type: b.block_type,
    label: b.label,
    description: b.description,
    placeholder: b.placeholder,
    required: b.required,
    options: b.options ?? [],
    logic_rules: b.logic_rules ?? [],
    validation: b.validation ?? {},
    block_settings: bs,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SubmitRequest = await req.json();
    const {
      action = 'submit',
      form_id,
      slug,
      responses = {},
      tracking = {},
      selected_actions = [],
      selected_options = [],
    } = body;

    // ========================================================
    // ACTION: load — carrega form ativo + blocos (presentation-safe).
    // Substitui a leitura direta das tabelas pelo cliente (RLS fechada p/ anon).
    // ========================================================
    if (action === 'load') {
      if (!slug && !form_id) {
        return new Response(JSON.stringify({ error: 'slug or form_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let q = supabase.from('platform_crm_forms').select('*').eq('status', 'active');
      q = form_id ? q.eq('id', form_id) : q.eq('slug', slug!);
      const { data: form, error: formError } = await q.maybeSingle();
      if (formError || !form) {
        return new Response(JSON.stringify({ error: 'Form not found or inactive' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: blocks } = await supabase
        .from('platform_crm_form_blocks')
        .select('*')
        .eq('form_id', form.id)
        .order('order_index');

      // Incrementa views (best-effort, service_role).
      await supabase
        .from('platform_crm_forms')
        .update({ views_count: (form.views_count || 0) + 1 })
        .eq('id', form.id);

      return new Response(
        JSON.stringify({
          form: {
            id: form.id,
            name: form.name,
            description: form.description,
            slug: form.slug,
            status: form.status,
            theme: form.theme || {},
            settings: form.settings || {},
            custom_scripts: form.custom_scripts || { header: '', footer: '' },
            default_temperature: form.default_temperature || 'warm',
            views_count: form.views_count || 0,
            submissions_count: form.submissions_count || 0,
          },
          blocks: (blocks || []).map(toPublicBlock),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ========================================================
    // ACTION: submit — porte 1:1 do form-submit do tenant (product-scoped).
    // ========================================================
    const ip = clientIp(req);
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!form_id && !slug) {
      return new Response(JSON.stringify({ error: 'form_id or slug is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helpers
    const normalizePhoneDigits = (raw: unknown): string => {
      let d = String(raw ?? '').replace(/\D/g, '');
      if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
      return d;
    };
    const isValidBRPhone = (raw: unknown): boolean => {
      const d = normalizePhoneDigits(raw);
      return d.length === 10 || d.length === 11;
    };
    const isEmpty = (v: unknown) =>
      v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

    // 1. Fetch form (por id OU slug), ativo. product-scoped via form.product_id.
    let formQ = supabase.from('platform_crm_forms').select('*').eq('status', 'active');
    formQ = form_id ? formQ.eq('id', form_id) : formQ.eq('slug', slug!);
    const { data: form, error: formError } = await formQ.maybeSingle();

    if (formError || !form) {
      console.error('Form not found:', formError);
      return new Response(JSON.stringify({ error: 'Form not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resolvedFormId = form.id as string;

    // 2. Fetch form blocks for scoring and mapping
    const { data: blocks } = await supabase
      .from('platform_crm_form_blocks')
      .select('*')
      .eq('form_id', resolvedFormId)
      .order('order_index');

    // 2.1 Server-side validation: required + phone/email format
    const missing: string[] = [];
    let invalidPhoneLabel: string | null = null;
    let invalidEmailLabel: string | null = null;
    const skipTypes = new Set([
      'welcome_screen', 'end_screen', 'image', 'video_upload',
      'video_embed', 'carousel', 'divider', 'hidden_field',
      'conditional', 'score', 'tag',
    ]);
    for (const b of blocks || []) {
      if (skipTypes.has(b.block_type)) continue;
      const v = responses?.[b.id];
      const empty = isEmpty(v);
      if (b.required && empty) {
        missing.push(b.label || b.id);
        continue;
      }
      if (!empty && b.block_type === 'phone' && !isValidBRPhone(v)) {
        invalidPhoneLabel = b.label || 'WhatsApp';
      }
      if (!empty && b.block_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) {
        invalidEmailLabel = b.label || 'E-mail';
      }
    }
    if (missing.length) {
      return new Response(JSON.stringify({ error: `Campos obrigatórios não respondidos: ${missing.join(', ')}`, missing }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (invalidPhoneLabel) {
      return new Response(JSON.stringify({ error: `WhatsApp inválido em "${invalidPhoneLabel}". Use DDD + número.` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (invalidEmailLabel) {
      return new Response(JSON.stringify({ error: `E-mail inválido em "${invalidEmailLabel}".` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Map block ID → label for readable responses
    const blockLabels: Record<string, string> = {};
    for (const block of blocks || []) {
      if (block.label) blockLabels[block.id] = block.label;
    }

    // 4. Transform responses to use labels instead of UUIDs
    const responsesWithLabels: Record<string, unknown> = {};
    for (const [blockId, value] of Object.entries(responses)) {
      const label = blockLabels[blockId] || blockId;
      responsesWithLabels[label] = value;
    }

    // 5. Calculate score and collect tags
    let totalScore = 0;
    const legacyTagNames: string[] = [];
    const addTagIds = new Set<string>();
    const removeTagIds = new Set<string>();
    let finalStageId: string | null = null;
    let finalTemperature: string | null = null;
    const customFields: Record<string, unknown> = {};
    const leadData: Record<string, string> = {};

    const matchWhen = (
      when: { operator: string; value?: unknown } | undefined,
      value: unknown,
    ): boolean => {
      if (!when || when.operator === 'any') return value !== undefined && value !== null && value !== '';
      const v = value;
      const target = when.value;
      switch (when.operator) {
        case 'equals':
          if (Array.isArray(v)) return v.map(String).includes(String(target));
          return String(v ?? '') === String(target ?? '');
        case 'contains':
          if (Array.isArray(v)) return v.map(String).some((x) => x.includes(String(target ?? '')));
          return String(v ?? '').toLowerCase().includes(String(target ?? '').toLowerCase());
        case 'gte':
          return Number(v) >= Number(target);
        case 'lte':
          return Number(v) <= Number(target);
        default:
          return false;
      }
    };

    for (const block of blocks || []) {
      const responseValue = responses[block.id];
      const answered = responseValue !== undefined && responseValue !== null && responseValue !== '';

      if (block.score_value) totalScore += block.score_value;

      if (block.score_rules && Array.isArray(block.score_rules)) {
        for (const rule of block.score_rules) {
          if (rule.value !== undefined && responseValue === rule.value) totalScore += rule.score || 0;
          else if (rule.min !== undefined && typeof responseValue === 'number') {
            if (responseValue >= rule.min && (!rule.max || responseValue <= rule.max)) totalScore += rule.score || 0;
          }
        }
      }

      const bs = (block.block_settings || {}) as Record<string, any>;
      if (answered) {
        if (block.block_type === 'select' || block.block_type === 'multi_select') {
          const opts = Array.isArray(block.options) ? (block.options as any[]) : [];
          const chosenValues = Array.isArray(responseValue)
            ? responseValue.map((v: any) => String(v))
            : [String(responseValue)];
          for (const opt of opts) {
            if (chosenValues.includes(String(opt?.value)) && Number.isFinite(Number(opt?.score))) {
              totalScore += Number(opt.score) || 0;
            }
          }
        } else if (block.block_type === 'yes_no') {
          const v = String(responseValue).toLowerCase();
          const isYes = v === 'true' || v === 'sim' || v === 'yes' || v === '1';
          const isNo = v === 'false' || v === 'não' || v === 'nao' || v === 'no' || v === '0';
          if (isYes && Number.isFinite(Number(bs.score_yes))) totalScore += Number(bs.score_yes) || 0;
          if (isNo && Number.isFinite(Number(bs.score_no))) totalScore += Number(bs.score_no) || 0;
        } else if (block.block_type === 'scale') {
          const per = Number(bs.score_per_point);
          const val = Number(responseValue);
          if (Number.isFinite(per) && Number.isFinite(val)) totalScore += per * val;
        }
      }

      if (block.apply_tags && Array.isArray(block.apply_tags)) legacyTagNames.push(...block.apply_tags);

      if (block.maps_to && answered) {
        leadData[block.maps_to] = block.block_type === 'phone'
          ? normalizePhoneDigits(responseValue)
          : String(responseValue);
      }

      const crm = (block.block_settings || {}).crm || {};

      if (crm.custom_field_key && answered) {
        customFields[String(crm.custom_field_key)] = responseValue;
      }

      if (answered) {
        (crm.add_tag_ids || []).forEach((id: string) => addTagIds.add(id));
        if (crm.set_stage_id) finalStageId = crm.set_stage_id;
        if (crm.set_temperature) finalTemperature = crm.set_temperature;
      }

      if (Array.isArray(crm.automations)) {
        for (const rule of crm.automations) {
          if (!matchWhen(rule.when, responseValue)) continue;
          (rule.add_tag_ids || []).forEach((id: string) => addTagIds.add(id));
          (rule.remove_tag_ids || []).forEach((id: string) => removeTagIds.add(id));
          if (rule.set_stage_id) finalStageId = rule.set_stage_id;
          if (rule.set_temperature) finalTemperature = rule.set_temperature;
          if (rule.add_score) totalScore += rule.add_score;
        }
      }
    }

    // Form-level submit tags
    const submitTagIds: string[] = Array.isArray((form.settings as any)?.submit_tag_ids)
      ? (form.settings as any).submit_tag_ids.filter((x: unknown) => typeof x === 'string' && x)
      : [];
    submitTagIds.forEach((id) => addTagIds.add(id));

    // Resolve legacy tag names → IDs (platform_crm_lead_tags é platform-wide: sem org).
    if (legacyTagNames.length > 0) {
      const uniq = Array.from(new Set(legacyTagNames.map((t) => t.trim()).filter(Boolean)));
      const { data: existing } = await supabase
        .from('platform_crm_lead_tags')
        .select('id, name')
        .in('name', uniq);
      const byName = new Map((existing || []).map((t: any) => [t.name.toLowerCase(), t.id]));
      for (const name of uniq) {
        const id = byName.get(name.toLowerCase());
        if (id) {
          addTagIds.add(id);
        } else {
          const { data: created } = await supabase
            .from('platform_crm_lead_tags')
            .insert({ name, color: '#6B7280' })
            .select('id')
            .single();
          if (created?.id) addTagIds.add(created.id);
        }
      }
    }

    // 3.b Heurística: recuperar name/email/phone por label/response key.
    const matchLabel = (label: string, keywords: string[]) => {
      const l = (label || '').toLowerCase();
      return keywords.some((k) => l.includes(k));
    };
    const findByLabelOrResponseKey = (keywords: string[], typeMatch?: (t: string) => boolean): string | null => {
      const b = (blocks || []).find((b: any) => {
        const okType = typeMatch ? typeMatch(b.block_type) : true;
        return okType && matchLabel(b.label, keywords) && responses[b.id];
      });
      if (b) return String(responses[b.id]);
      const key = Object.keys(responses).find((k) => matchLabel(k, keywords));
      return key && responses[key] != null ? String(responses[key]) : null;
    };
    if (!leadData.name) {
      const v = findByLabelOrResponseKey(['nome', 'name'], (t) => ['short_text', 'long_text', 'text', 'textarea'].includes(t));
      if (v) leadData.name = v.trim();
    }
    if (!leadData.email) {
      const v = findByLabelOrResponseKey(['email', 'e-mail'], (t) => t === 'email' || t === 'short_text' || t === 'text');
      if (v) leadData.email = v.trim();
    }
    if (!leadData.phone) {
      const v = findByLabelOrResponseKey(['whatsapp', 'telefone', 'phone', 'celular'], (t) => t === 'phone' || t === 'short_text' || t === 'text');
      if (v) leadData.phone = normalizePhoneDigits(v);
    }

    // ---- Per-option actions (selected_actions from the client) ----
    let overrideRedirectUrl: string | null = null;
    let overrideRedirectNewTab = false;
    let actionAgentId: string | null = null;
    let actionSectorId: string | null = null;
    let actionAssignedUserId: string | null = null;
    let actionSdrId: string | null = null;
    let actionCloserId: string | null = null;
    let outreachAgentId: string | null = null;
    let outreachObjective: string | null = null;

    for (const a of selected_actions || []) {
      if (!a || typeof a !== 'object') continue;
      switch (a.type) {
        case 'add_tags':
          (a.tag_ids || []).forEach((id) => id && addTagIds.add(id));
          break;
        case 'assign_sector':
          if (a.sector_id) actionSectorId = a.sector_id;
          break;
        case 'assign_user':
          if (a.user_id) {
            if (a.as === 'sdr') actionSdrId = a.user_id;
            else if (a.as === 'closer') actionCloserId = a.user_id;
            else actionAssignedUserId = a.user_id;
          }
          break;
        case 'start_ai_agent':
          if (a.agent_id) actionAgentId = a.agent_id;
          break;
        case 'start_ai_outreach':
          if (a.agent_id) {
            outreachAgentId = a.agent_id;
            outreachObjective = a.objective || null;
          }
          break;
        case 'redirect':
          if (a.url) {
            overrideRedirectUrl = a.url;
            overrideRedirectNewTab = !!a.new_tab;
          }
          break;
        // open_calendar: sem slug público por-usuário no schema da plataforma
        // (booking_event_types não expõe user booking_slug) → ação reconhecida,
        // sem resolução de redirect. go_to_block é client-side.
        case 'set_custom_field':
          if (a.field_key) {
            const v = a._value !== undefined
              ? a._value
              : (a.value_source === 'static' ? (a.static_value ?? '') : '');
            if (v !== '' && v !== undefined && v !== null) {
              customFields[a.field_key] = v;
            }
          }
          break;
      }
    }

    // 4. Determine lead distribution
    let assigned_to: string | null = null;
    let squad_id: string | null = form.assigned_squad_id;
    let useAutoDispatch = false;

    switch (form.distribution_rule) {
      case 'user':
        assigned_to = form.assigned_user_id;
        break;
      case 'squad':
        squad_id = form.assigned_squad_id;
        useAutoDispatch = true;
        break;
      case 'round_robin':
        if (form.assigned_squad_id) {
          squad_id = form.assigned_squad_id;
          useAutoDispatch = true;
        } else {
          const config = form.round_robin_config || { users: [], current_index: 0 };
          if (config.users && config.users.length > 0) {
            assigned_to = config.users[config.current_index % config.users.length];
            await supabase
              .from('platform_crm_forms')
              .update({
                round_robin_config: {
                  ...config,
                  current_index: (config.current_index + 1) % config.users.length,
                },
              })
              .eq('id', resolvedFormId);
          }
        }
        break;
      case 'manual':
      default:
        break;
    }

    if (actionAssignedUserId) {
      assigned_to = actionAssignedUserId;
      useAutoDispatch = false;
    }

    // 5. First pipeline stage as fallback (product-scoped)
    const { data: firstStage } = await supabase
      .from('platform_crm_pipeline_stages')
      .select('id')
      .eq('product_id', form.product_id)
      .order('order_index')
      .limit(1)
      .maybeSingle();

    const targetStageId = finalStageId || firstStage?.id || null;

    // Temperature thresholds from form settings
    const thresholds = (form.settings as any)?.temperature_thresholds;
    const warmMin = Number(thresholds?.warm_min);
    const hotMin = Number(thresholds?.hot_min);
    const classifyByScore = (score: number): string | null => {
      if (!Number.isFinite(warmMin) || !Number.isFinite(hotMin)) return null;
      if (score >= hotMin) return 'hot';
      if (score >= warmMin) return 'warm';
      return 'cold';
    };
    // 6. Upsert lead — match by email/phone (product-scoped via product_id)
    let leadId: string | null = null;
    const settings = form.settings || {};

    if (settings.auto_create_lead !== false) {
      let existingLead: any = null;
      const phoneDigits = leadData.phone ? normalizePhoneDigits(leadData.phone) : '';
      const phoneSuffix = phoneDigits.length >= 9 ? phoneDigits.slice(-9) : phoneDigits;

      if (leadData.email || phoneSuffix) {
        let query = supabase
          .from('platform_crm_leads')
          .select('*')
          .eq('product_id', form.product_id)
          .order('created_at', { ascending: false })
          .limit(20);

        const orClauses: string[] = [];
        if (leadData.email) orClauses.push(`email.eq.${leadData.email}`);
        if (phoneSuffix) orClauses.push(`phone.ilike.%${phoneSuffix}%`);
        query = query.or(orClauses.join(','));

        const { data: found } = await query;
        existingLead = (found || []).find((l: any) => {
          if (leadData.email && l.email && l.email.toLowerCase() === leadData.email.toLowerCase()) return true;
          if (phoneDigits && l.phone && normalizePhoneDigits(l.phone) === phoneDigits) return true;
          return false;
        }) || null;
      }

      // platform_crm_leads NÃO tem coluna `score` → acumula via metadata.form_score.
      const previousScore = Number((existingLead as any)?.metadata?.form_score) || 0;
      const accumulatedScore = previousScore + totalScore;
      const accumulatedTemperature =
        finalTemperature || classifyByScore(accumulatedScore) || form.default_temperature || 'warm';

      const mergedMetadata: Record<string, unknown> = {
        ...(existingLead?.metadata || {}),
        form_id: form.id,
        form_name: form.name,
        form_responses: { ...((existingLead?.metadata || {}).form_responses || {}), ...responsesWithLabels },
        form_score: accumulatedScore,
        form_selected_options: selected_options,
        custom_fields: {
          ...(((existingLead?.metadata || {}).custom_fields) || {}),
          ...customFields,
        },
      };
      // Sem coluna sector_id/agent na platform_crm_leads → preservados em metadata.
      if (actionSectorId) mergedMetadata.sector_id = actionSectorId;
      if (actionAgentId) mergedMetadata.assigned_agent_id = actionAgentId;
      if (outreachAgentId) {
        mergedMetadata.pending_outreach = {
          agent_id: outreachAgentId,
          objective: outreachObjective || `Continuar a conversa do formulário "${form.name}".`,
        };
      }

      if (existingLead) {
        const patch: Record<string, unknown> = {
          name: leadData.name || existingLead.name,
          email: leadData.email || existingLead.email,
          phone: leadData.phone || existingLead.phone,
          company: leadData.company || existingLead.company,
          position: leadData.position || existingLead.position,
          notes: leadData.notes || existingLead.notes,
          temperature: accumulatedTemperature,
          metadata: mergedMetadata,
        };
        if (targetStageId) patch.current_stage_id = targetStageId;
        if (actionAssignedUserId) patch.assigned_to = actionAssignedUserId;
        if (actionSdrId) patch.sdr_id = actionSdrId;
        if (actionCloserId) patch.closer_id = actionCloserId;

        const { data: updated, error: updateError } = await supabase
          .from('platform_crm_leads')
          .update(patch)
          .eq('id', existingLead.id)
          .select()
          .single();
        if (updateError) console.error('Error updating lead:', updateError);
        leadId = (updated?.id as string) || existingLead.id;
      } else {
        const { data: lead, error: leadError } = await supabase
          .from('platform_crm_leads')
          .insert({
            product_id: form.product_id,
            name: leadData.name || leadData.email || 'Lead sem nome',
            email: leadData.email || null,
            phone: leadData.phone || null,
            company: leadData.company || null,
            position: leadData.position || null,
            notes: leadData.notes || null,
            temperature: accumulatedTemperature,
            lead_origin: 'form',
            lead_channel: 'website',
            source: `Formulário: ${form.name}`,
            current_stage_id: targetStageId,
            assigned_to,
            squad_id,
            utm_source: tracking.utm_source || null,
            utm_medium: tracking.utm_medium || null,
            utm_campaign: tracking.utm_campaign || null,
            utm_term: tracking.utm_term || null,
            utm_content: tracking.utm_content || null,
            referrer_url: tracking.referrer_url || null,
            landing_page: tracking.landing_page || null,
            metadata: mergedMetadata,
            ...(actionSdrId ? { sdr_id: actionSdrId } : {}),
            ...(actionCloserId ? { closer_id: actionCloserId } : {}),
          })
          .select()
          .single();

        if (leadError) {
          console.error('Error creating lead:', leadError);
        } else {
          leadId = lead?.id || null;
        }
      }

      if (leadId) {
        // Apply tags
        if (addTagIds.size > 0) {
          const rows = Array.from(addTagIds).map((tagId) => ({
            lead_id: leadId,
            tag_id: tagId,
            source: 'form',
          }));
          const { error: tagErr } = await supabase
            .from('platform_crm_lead_tag_assignments')
            .upsert(rows, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true });
          if (tagErr) console.warn('[platform-form-submit] tag assign error:', tagErr.message);
        }
        if (removeTagIds.size > 0) {
          await supabase
            .from('platform_crm_lead_tag_assignments')
            .delete()
            .eq('lead_id', leadId)
            .in('tag_id', Array.from(removeTagIds));
        }

        // Auto Dispatch only on brand-new leads with a squad
        if (!existingLead && useAutoDispatch && squad_id) {
          try {
            const { data: assignedUserId } = await supabase.rpc('platform_crm_distribute_lead', {
              p_lead_id: leadId,
              p_squad_id: squad_id,
            });
            console.log(`[AutoDispatch] Lead ${leadId} -> User ${assignedUserId || 'queued'}`);
          } catch (e) {
            console.warn('[AutoDispatch] Distribution failed:', e);
          }
        }
      }
    }

    // 8. Submission record — embed selected_options under __meta
    const submissionResponses = {
      ...responsesWithLabels,
      __meta: { selected_options },
    };
    const { data: submission, error: submissionError } = await supabase
      .from('platform_crm_form_submissions')
      .insert({
        form_id: resolvedFormId,
        lead_id: leadId,
        responses: submissionResponses,
        total_score: totalScore,
        tags: Array.from(addTagIds),
        utm_source: tracking.utm_source || null,
        utm_medium: tracking.utm_medium || null,
        utm_campaign: tracking.utm_campaign || null,
        utm_term: tracking.utm_term || null,
        utm_content: tracking.utm_content || null,
        referrer_url: tracking.referrer_url || null,
        landing_page: tracking.landing_page || null,
        user_agent: tracking.user_agent || null,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Error creating submission:', submissionError);
      throw submissionError;
    }

    // Increment submissions_count (best-effort, service_role).
    await supabase
      .from('platform_crm_forms')
      .update({ submissions_count: (form.submissions_count || 0) + 1 })
      .eq('id', resolvedFormId);

    // 9. Success + redirect (per-option redirect > theme redirect)
    const theme = form.theme || {};
    const finalRedirect = overrideRedirectUrl || theme.redirect_url || null;

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission?.id,
        lead_id: leadId,
        score: totalScore,
        redirect_url: finalRedirect,
        redirect_new_tab: overrideRedirectUrl ? overrideRedirectNewTab : false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in platform-form-submit:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
