import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SubmitRequest {
  form_id: string;
  responses: Record<string, unknown>;
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

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    const { form_id, responses, tracking = {} }: SubmitRequest = await req.json();

    if (!form_id) {
      return new Response(JSON.stringify({ error: 'form_id is required' }), {
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

    // 1. Fetch form with product
    const { data: form, error: formError } = await supabase
      .from('forms')
      .select('*, products(*)')
      .eq('id', form_id)
      .eq('status', 'active')
      .single();

    if (formError || !form) {
      console.error('Form not found:', formError);
      return new Response(JSON.stringify({ error: 'Form not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch form blocks for scoring and mapping
    const { data: blocks } = await supabase
      .from('form_blocks')
      .select('*')
      .eq('form_id', form_id)
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


    // 3. Create a map of block ID to label for readable responses
    const blockLabels: Record<string, string> = {};
    for (const block of blocks || []) {
      if (block.label) {
        blockLabels[block.id] = block.label;
      }
    }

    // 4. Transform responses to use labels instead of UUIDs
    const responsesWithLabels: Record<string, unknown> = {};
    for (const [blockId, value] of Object.entries(responses)) {
      const label = blockLabels[blockId] || blockId;
      responsesWithLabels[label] = value;
    }

    // 5. Calculate score and collect tags
    let totalScore = 0;
    const legacyTagNames: string[] = [];           // legacy apply_tags strings
    const addTagIds = new Set<string>();           // resolved CRM tag IDs to assign
    const removeTagIds = new Set<string>();        // CRM tag IDs to remove
    let finalStageId: string | null = null;        // last set_stage_id wins
    let finalTemperature: string | null = null;    // last set_temperature wins
    const customFields: Record<string, unknown> = {};
    const leadData: Record<string, string> = {};

    // Helper: evaluate a `when` condition against a response value
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

      // Static score
      if (block.score_value) totalScore += block.score_value;

      // Legacy score_rules
      if (block.score_rules && Array.isArray(block.score_rules)) {
        for (const rule of block.score_rules) {
          if (rule.value !== undefined && responseValue === rule.value) totalScore += rule.score || 0;
          else if (rule.min !== undefined && typeof responseValue === 'number') {
            if (responseValue >= rule.min && (!rule.max || responseValue <= rule.max)) totalScore += rule.score || 0;
          }
        }
      }

      // Legacy apply_tags (string names)
      if (block.apply_tags && Array.isArray(block.apply_tags)) legacyTagNames.push(...block.apply_tags);

      // Lead field mapping
      if (block.maps_to && answered) {
        leadData[block.maps_to] = block.block_type === 'phone'
          ? normalizePhoneDigits(responseValue)
          : String(responseValue);
      }

      // ----- Phase 2: CRM automations from block_settings.crm -----
      const crm = (block.block_settings || {}).crm || {};

      // Custom field
      if (crm.custom_field_key && answered) {
        customFields[String(crm.custom_field_key)] = responseValue;
      }

      // Always-on actions when block was answered
      if (answered) {
        (crm.add_tag_ids || []).forEach((id: string) => addTagIds.add(id));
        if (crm.set_stage_id) finalStageId = crm.set_stage_id;
        if (crm.set_temperature) finalTemperature = crm.set_temperature;
      }

      // Conditional automations
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

    // Form-level submit tags (applied on every submission)
    const submitTagIds: string[] = Array.isArray((form.settings as any)?.submit_tag_ids)
      ? (form.settings as any).submit_tag_ids.filter((x: unknown) => typeof x === 'string' && x)
      : [];
    submitTagIds.forEach((id) => addTagIds.add(id));

    // Resolve legacy tag names → IDs (lookup or create within org)
    if (legacyTagNames.length > 0) {
      const uniq = Array.from(new Set(legacyTagNames.map((t) => t.trim()).filter(Boolean)));
      const { data: existing } = await supabase
        .from('lead_tags')
        .select('id, name')
        .eq('organization_id', form.organization_id)
        .in('name', uniq);
      const byName = new Map((existing || []).map((t: any) => [t.name.toLowerCase(), t.id]));
      for (const name of uniq) {
        const id = byName.get(name.toLowerCase());
        if (id) {
          addTagIds.add(id);
        } else {
          const { data: created } = await supabase
            .from('lead_tags')
            .insert({ organization_id: form.organization_id, name, color: '#6B7280' })
            .select('id')
            .single();
          if (created?.id) addTagIds.add(created.id);
        }
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
              .from('forms')
              .update({
                round_robin_config: {
                  ...config,
                  current_index: (config.current_index + 1) % config.users.length,
                },
              })
              .eq('id', form_id);
          }
        }
        break;

      case 'manual':
      default:
        break;
    }

    // 5. Get first pipeline stage as fallback
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('product_id', form.product_id)
      .order('order_index')
      .limit(1)
      .single();

    const targetStageId = finalStageId || firstStage?.id || null;
    const targetTemperature = finalTemperature || form.default_temperature || 'warm';

    // 6. Upsert lead — match by email/phone within org
    let leadId: string | null = null;
    const settings = form.settings || {};

    if (settings.auto_create_lead !== false) {
      // Try to find an existing lead by email OR by phone (matching only digits,
      // since stored phones may be formatted like "(48) 99652-0589")
      let existingLead: any = null;
      const phoneDigits = leadData.phone ? normalizePhoneDigits(leadData.phone) : '';
      // Last 9 digits are enough to find candidates regardless of stored format
      const phoneSuffix = phoneDigits.length >= 9 ? phoneDigits.slice(-9) : phoneDigits;

      if (leadData.email || phoneSuffix) {
        // Fetch candidates: exact email match OR phone containing the suffix
        let query = supabase
          .from('leads')
          .select('*')
          .eq('organization_id', form.organization_id)
          .order('created_at', { ascending: false })
          .limit(20);

        const orClauses: string[] = [];
        if (leadData.email) orClauses.push(`email.eq.${leadData.email}`);
        if (phoneSuffix) orClauses.push(`phone.ilike.%${phoneSuffix}%`);
        query = query.or(orClauses.join(','));

        const { data: found } = await query;
        // Confirm phone match by comparing digit-only strings
        existingLead = (found || []).find((l: any) => {
          if (leadData.email && l.email && l.email.toLowerCase() === leadData.email.toLowerCase()) return true;
          if (phoneDigits && l.phone && normalizePhoneDigits(l.phone) === phoneDigits) return true;
          return false;
        }) || null;
      }


      const mergedMetadata = {
        ...(existingLead?.metadata || {}),
        form_id: form.id,
        form_name: form.name,
        form_responses: { ...((existingLead?.metadata || {}).form_responses || {}), ...responsesWithLabels },
        form_score: totalScore,
        custom_fields: {
          ...(((existingLead?.metadata || {}).custom_fields) || {}),
          ...customFields,
        },
      };

      if (existingLead) {
        const patch: Record<string, unknown> = {
          name: leadData.name || existingLead.name,
          email: leadData.email || existingLead.email,
          phone: leadData.phone || existingLead.phone,
          company: leadData.company || existingLead.company,
          position: leadData.position || existingLead.position,
          notes: leadData.notes || existingLead.notes,
          temperature: targetTemperature,
          metadata: mergedMetadata,
        };
        if (targetStageId) patch.current_stage_id = targetStageId;

        const { data: updated, error: updateError } = await supabase
          .from('leads')
          .update(patch)
          .eq('id', existingLead.id)
          .select()
          .single();
        if (updateError) console.error('Error updating lead:', updateError);
        leadId = (updated?.id as string) || existingLead.id;
      } else {
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .insert({
            organization_id: form.organization_id,
            product_id: form.product_id,
            name: leadData.name || leadData.email || 'Lead sem nome',
            email: leadData.email || null,
            phone: leadData.phone || null,
            company: leadData.company || null,
            position: leadData.position || null,
            notes: leadData.notes || null,
            temperature: targetTemperature,
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
            .from('lead_tag_assignments')
            .upsert(rows, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true });
          if (tagErr) console.warn('[form-submit] tag assign error:', tagErr.message);
        }
        if (removeTagIds.size > 0) {
          await supabase
            .from('lead_tag_assignments')
            .delete()
            .eq('lead_id', leadId)
            .in('tag_id', Array.from(removeTagIds));
        }

        // Auto Dispatch only on brand-new leads without assignee
        if (!existingLead && useAutoDispatch && squad_id) {
          try {
            const { data: assignedUserId } = await supabase.rpc('distribute_lead', {
              p_lead_id: leadId,
              p_squad_id: squad_id,
              p_organization_id: form.organization_id,
              p_product_id: form.product_id,
            });
            console.log(`[AutoDispatch] Lead ${leadId} -> User ${assignedUserId || 'queued'}`);
          } catch (e) {
            console.warn('[AutoDispatch] Distribution failed:', e);
          }
        }

        // Interaction record
        await supabase
          .from('interactions')
          .insert({
            lead_id: leadId,
            channel: 'other',
            direction: 'inbound',
            content: `Formulário preenchido: ${form.name}`,
            metadata: {
              type: 'form_submission',
              form_id: form.id,
              score: totalScore,
              applied_tag_ids: Array.from(addTagIds),
              stage_id: targetStageId,
              temperature: targetTemperature,
            },
          });


        // Auto-enroll in post-submit cadence (fire-and-forget)
        if ((form as any).post_cadence_id) {
          try {
            const supabaseUrl2 = Deno.env.get('SUPABASE_URL')!;
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            fetch(`${supabaseUrl2}/functions/v1/cadence-enroll`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({
                cadence_id: (form as any).post_cadence_id,
                lead_ids: [leadId],
                source: 'form',
                source_ref: { form_id: form.id, form_name: form.name },
              }),
            }).catch((e) => console.error('[form-submit] cadence-enroll non-fatal:', e));
          } catch (e) {
            console.error('[form-submit] cadence-enroll wrap non-fatal:', e);
          }
        }
      }
    }


    // 8. Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .insert({
        form_id,
        lead_id: leadId,
        responses: responsesWithLabels,
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

    // 8. Increment form submission count
    await supabase.rpc('increment_form_submissions_count', { p_form_id: form_id });

    // 9. Return success with redirect URL if configured
    const theme = form.theme || {};
    
    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission?.id,
        lead_id: leadId,
        score: totalScore,
        redirect_url: theme.redirect_url || null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in form-submit:', error);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
