import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SubmitRequest {
  funnel_id: string;
  channel: 'chat' | 'form' | 'widget';
  responses: Record<string, unknown>;
  collected_data: Record<string, string>;
  quiz_score?: number;
  quiz_tags?: string[];
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

// Variable name mapping to lead fields
const VARIABLE_TO_LEAD_FIELD: Record<string, string> = {
  'name': 'name',
  'nome': 'name',
  'email': 'email',
  'e-mail': 'email',
  'phone': 'phone',
  'telefone': 'phone',
  'whatsapp': 'phone',
  'celular': 'phone',
  'company': 'company',
  'empresa': 'company',
  'cpf': 'cpf',
  'position': 'position',
  'cargo': 'position',
};

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

    const { funnel_id, channel, responses, collected_data, tracking = {}, quiz_score, quiz_tags }: SubmitRequest = await req.json();

    if (!funnel_id) {
      return new Response(JSON.stringify({ error: 'funnel_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch funnel with product
    const { data: funnel, error: funnelError } = await supabase
      .from('capture_funnels')
      .select('*, products(*)')
      .eq('id', funnel_id)
      .eq('status', 'active')
      .single();

    if (funnelError || !funnel) {
      console.error('Funnel not found:', funnelError);
      return new Response(JSON.stringify({ error: 'Funnel not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse flow blocks and calculate score/tags
    const flowBlocks = (funnel.flow_blocks || []) as Array<{
      id: string;
      type: string;
      data: {
        score_value?: number;
        apply_tags?: string[];
        variable_name?: string;
      };
    }>;

    let totalScore = 0;
    const tags: string[] = [...(funnel.default_tags || [])];

    // Calculate scores and collect tags from blocks (fallback)
    for (const block of flowBlocks) {
      if (block.data?.score_value) {
        totalScore += block.data.score_value;
      }
      if (block.data?.apply_tags) {
        tags.push(...block.data.apply_tags);
      }
    }

    // ─── Fase 4: prioriza score/tags reais coletados em runtime (quiz) ───
    if (typeof quiz_score === 'number') totalScore = quiz_score;
    if (Array.isArray(quiz_tags) && quiz_tags.length) {
      tags.push(...quiz_tags);
    }

    // ─── Fase 4: regras pós-quiz (temperatura por threshold) ───
    const postActions: any = funnel.post_quiz_actions || {};
    const hotThreshold = Number(postActions.hot_threshold ?? 70);
    const warmThreshold = Number(postActions.warm_threshold ?? 40);
    let computedTemperature: string = funnel.default_temperature || 'warm';
    if (typeof quiz_score === 'number') {
      if (totalScore >= hotThreshold) computedTemperature = 'hot';
      else if (totalScore >= warmThreshold) computedTemperature = 'warm';
      else computedTemperature = 'cold';
    }

    // 3. Map collected_data to lead fields
    const leadData: Record<string, string> = {};
    
    for (const [variable, value] of Object.entries(collected_data)) {
      const normalizedVar = variable.toLowerCase().trim();
      const leadField = VARIABLE_TO_LEAD_FIELD[normalizedVar];
      
      if (leadField && value) {
        leadData[leadField] = String(value);
      }
    }

    // 4. Determine lead distribution
    let assigned_to: string | null = null;
    let squad_id: string | null = funnel.assigned_squad_id;

    switch (funnel.distribution_rule) {
      case 'user':
        assigned_to = funnel.assigned_user_id;
        break;

      case 'squad':
        squad_id = funnel.assigned_squad_id;
        break;

      case 'round_robin':
        const config = funnel.round_robin_config || { users: [], current_index: 0 };
        if (config.users && config.users.length > 0) {
          assigned_to = config.users[config.current_index % config.users.length];
          
          // Update round robin index
          await supabase
            .from('capture_funnels')
            .update({
              round_robin_config: {
                ...config,
                current_index: (config.current_index + 1) % config.users.length,
              },
            })
            .eq('id', funnel_id);
        }
        break;

      case 'manual':
      default:
        // Lead enters without assignment
        break;
    }

    // 5. Get first pipeline stage for the product
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('product_id', funnel.product_id)
      .order('order_index')
      .limit(1)
      .single();

    // 6. Create lead in CRM
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        organization_id: funnel.organization_id,
        product_id: funnel.product_id,
        name: leadData.name || leadData.email || 'Lead sem nome',
        email: leadData.email || null,
        phone: leadData.phone || null,
        company: leadData.company || null,
        position: leadData.position || null,
        temperature: computedTemperature,
        lead_origin: 'funnel',
        lead_channel: channel,
        source: `Funil: ${funnel.name}`,
        current_stage_id: firstStage?.id || null,
        assigned_to,
        squad_id,
        utm_source: tracking.utm_source || null,
        utm_medium: tracking.utm_medium || null,
        utm_campaign: tracking.utm_campaign || null,
        utm_term: tracking.utm_term || null,
        utm_content: tracking.utm_content || null,
        referrer_url: tracking.referrer_url || null,
        landing_page: tracking.landing_page || null,
        metadata: {
          funnel_id: funnel.id,
          funnel_name: funnel.name,
          funnel_channel: channel,
          collected_data,
          responses,
          score: totalScore,
          tags: [...new Set(tags)],
        },
      })
      .select()
      .single();

    if (leadError) {
      console.error('Error creating lead:', leadError);
      return new Response(
        JSON.stringify({ error: 'Failed to create lead', details: leadError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 7. Create interaction for funnel completion
    await supabase
      .from('interactions')
      .insert({
        lead_id: lead.id,
        channel: channel === 'chat' ? 'chat' : 'other',
        direction: 'inbound',
        content: `Funil concluído: ${funnel.name} (${channel})`,
        metadata: {
          type: 'funnel_completion',
          funnel_id: funnel.id,
          channel,
          score: totalScore,
        },
      });

    // ─── Fase 4: Integrações pós-quiz (tags, cadência, agente IA) ───
    try {
      // 7.1 Aplicar tags configuradas + tags coletadas em runtime
      const applyTagIds: string[] = Array.isArray(postActions.apply_tag_ids) ? postActions.apply_tag_ids : [];
      const runtimeTagNames: string[] = Array.isArray(quiz_tags) ? quiz_tags.filter(Boolean) : [];

      // Resolver tags por nome (cria se necessário)
      const resolvedTagIds = new Set<string>(applyTagIds);
      if (runtimeTagNames.length) {
        const { data: existingTags } = await supabase
          .from('lead_tags')
          .select('id, name')
          .eq('organization_id', funnel.organization_id)
          .in('name', runtimeTagNames);
        const existingByName = new Map((existingTags || []).map((t: any) => [t.name.toLowerCase(), t.id]));

        for (const name of runtimeTagNames) {
          const key = name.toLowerCase();
          if (existingByName.has(key)) {
            resolvedTagIds.add(existingByName.get(key)!);
          } else {
            const { data: created } = await supabase
              .from('lead_tags')
              .insert({
                organization_id: funnel.organization_id,
                name,
                is_automatic: true,
                color: '#6366f1',
              })
              .select('id')
              .single();
            if (created?.id) resolvedTagIds.add(created.id);
          }
        }
      }

      if (resolvedTagIds.size) {
        const assignments = Array.from(resolvedTagIds).map((tag_id) => ({
          lead_id: lead.id,
          tag_id,
          source: 'flow' as const,
        }));
        await supabase.from('lead_tag_assignments').upsert(assignments, { onConflict: 'lead_id,tag_id' });
      }

      // 7.2 Enrolar em cadência inteligente
      if (funnel.post_quiz_cadence_id) {
        fetch(`${supabaseUrl}/functions/v1/cadence-enroll`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            cadence_id: funnel.post_quiz_cadence_id,
            lead_ids: [lead.id],
            source: 'quiz',
            source_ref: { funnel_id: funnel.id, score: totalScore },
          }),
        }).catch((e) => console.error('[funnel-submit] cadence-enroll error:', e));
      }

      // 7.3 Vincular agente de IA (para próxima interação inbound)
      if (funnel.post_quiz_agent_id) {
        await supabase
          .from('leads')
          .update({
            metadata: {
              funnel_id: funnel.id,
              funnel_name: funnel.name,
              funnel_channel: channel,
              collected_data,
              responses,
              score: totalScore,
              tags: [...new Set(tags)],
              quiz_agent_id: funnel.post_quiz_agent_id,
              quiz_temperature: computedTemperature,
            },
          })
          .eq('id', lead.id);

        await supabase.from('interactions').insert({
          lead_id: lead.id,
          channel: 'system',
          direction: 'inbound',
          content: `Agente IA vinculado para follow-up pós-quiz (score ${totalScore}, ${computedTemperature}).`,
          metadata: { type: 'quiz_agent_link', agent_id: funnel.post_quiz_agent_id },
        });
      }

      // 7.4 Notificar dono do lead
      if (postActions.notify_owner && (assigned_to || squad_id)) {
        await supabase.from('admin_notifications').insert({
          organization_id: funnel.organization_id,
          user_id: assigned_to,
          type: 'lead_quiz_completed',
          title: `Novo lead pelo quiz: ${lead.name}`,
          message: `Score: ${totalScore} (${computedTemperature}). Funil: ${funnel.name}.`,
          metadata: { lead_id: lead.id, funnel_id: funnel.id, score: totalScore },
        }).select().maybeSingle();
      }
    } catch (postErr) {
      console.error('[funnel-submit] Fase 4 post-actions error:', postErr);
    }

    // 8. Update funnel analytics
    await supabase.rpc('increment_funnel_leads', {
      p_funnel_id: funnel.id,
      p_channel: channel,
    });

    // 8.5 Fire webhooks configured as 'on_complete' (now we have lead_id)
    try {
      const webhookBlocks = flowBlocks.filter((b: any) => 
        b.type === 'webhook' && 
        b?.data?.webhook_config?.url &&
        (b?.data?.webhook_config?.trigger === 'on_complete')
      );
      
      for (const wb of webhookBlocks) {
        // Fire-and-forget per webhook (don't block lead creation response)
        fetch(`${supabaseUrl}/functions/v1/funnel-execute-webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            funnel_id: funnel.id,
            block_id: wb.id,
            collected_data,
            responses,
            lead_id: lead.id,
            tracking,
            trigger_source: 'on_complete',
          }),
        }).catch(e => console.error('[funnel-submit] on_complete webhook error:', e));
      }
    } catch (e) {
      console.error('[funnel-submit] error firing on_complete webhooks:', e);
    }

    // 9. Get theme for redirect URL
    const theme = funnel.theme || {};

    console.log(`Lead created from funnel ${funnel.name} via ${channel}:`, lead.id);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        score: totalScore,
        tags: [...new Set(tags)],
        temperature: computedTemperature,
        cadence_enrolled: !!funnel.post_quiz_cadence_id,
        agent_linked: !!funnel.post_quiz_agent_id,
        redirect_url: theme.redirect_url || null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in funnel-submit:', error);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
