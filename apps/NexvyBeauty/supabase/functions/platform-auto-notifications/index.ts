// Porte 1:1 do auto-notifications do CRM Vendus -> platform_crm (super-admin). Nao construir inspirado.
//
// Mapeamentos aplicados (tableMappings + orgScopingRule + sharedImports + authNote):
//   * auto_notification_settings   -> platform_crm_auto_notification_settings
//   * notification_logs            -> platform_crm_notification_logs
//   * notifications                -> platform_crm_notifications
//   * leads                        -> platform_crm_leads
//   * pipeline_stages              -> platform_crm_pipeline_stages
//       (FK leads_current_stage_id_fkey -> platform_crm_leads_current_stage_id_fkey)
//   * sales_goals                  -> platform_crm_sales_goals
//   * commissions                  -> platform_crm_commissions
//   * deals                        -> platform_crm_deals
//   * products / product_id        -> __NO_EQUIVALENT__ (nao existe platform_crm_products;
//       platform_crm_sales_goals e platform_crm_commissions NAO tem product_id;
//       platform_crm_notifications NAO tem product_id). Ver blocos marcados
//       "// TODO: sem equivalente platform_crm" abaixo. Fallbacks originais
//       ('Geral' / '') preservados.
//   * orgScopingRule: platform_crm_* NAO tem organization_id — removidos TODOS os
//       filtros `.eq('organization_id', ...)` e os campos organization_id dos inserts.
//       Consequencia: auto_notification_settings vira efetivamente singleton
//       (o loop `for (const settings of allSettings)` do original e preservado 1:1).
//   * sharedImports: createClient direto -> createPlatformServiceClient
//       (_shared/platform-crm-audience.ts); corsHeaders -> platformCrmCorsHeaders
//       (_shared/platform-crm-auth.ts).
//   * authNote: cron/interno = bearer SERVICE_ROLE; humano = JWT super_admin
//       (authenticatePlatformAgent, mesmo padrao de platform-cadence-tick).
//
// 🔒 ZERO tabela de tenant.

import { createPlatformServiceClient } from '../_shared/platform-crm-audience.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

interface AutoNotificationSettings {
  // orgScopingRule: platform_crm_auto_notification_settings NAO tem organization_id.
  stalled_lead_enabled: boolean;
  stalled_lead_days: number;
  goal_achieved_enabled: boolean;
  commission_approved_enabled: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createPlatformServiceClient();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json().catch(() => ({}));

    // authNote: Cron/interno = bearer SERVICE_ROLE key. Humano = JWT super_admin.
    const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (bearer !== serviceKey) {
      const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
      if (errorResponse) return errorResponse;
    }

    // Get all auto notification settings
    const { data: allSettings, error: settingsError } = await supabase
      .from('platform_crm_auto_notification_settings')
      .select('*');

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw settingsError;
    }

    const results = {
      stalled_leads: 0,
      goals_achieved: 0,
      commissions_approved: 0,
      errors: [] as string[],
    };

    for (const settings of allSettings || []) {
      try {
        // 1. Process Stalled Leads
        if (settings.stalled_lead_enabled) {
          const stalledCount = await processStalledLeads(supabase, settings);
          results.stalled_leads += stalledCount;
        }

        // 2. Process Achieved Goals
        if (settings.goal_achieved_enabled) {
          const goalsCount = await processAchievedGoals(supabase, settings);
          results.goals_achieved += goalsCount;
        }

        // 3. Process Approved Commissions
        if (settings.commission_approved_enabled) {
          const commissionsCount = await processApprovedCommissions(supabase, settings);
          results.commissions_approved += commissionsCount;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // orgScopingRule: settings NAO tem organization_id — id preservado como identificador.
        console.error(`Error processing settings ${settings.id}:`, error);
        results.errors.push(`Settings ${settings.id}: ${errorMessage}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in platform-auto-notifications:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processStalledLeads(supabase: any, settings: AutoNotificationSettings): Promise<number> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - settings.stalled_lead_days);

  // Find leads without contact for X days
  // orgScopingRule: removido `.eq('organization_id', ...)`.
  const { data: stalledLeads, error } = await supabase
    .from('platform_crm_leads')
    .select(`
      id,
      name,
      assigned_to,
      last_contact_at,
      current_stage_id,
      platform_crm_pipeline_stages!platform_crm_leads_current_stage_id_fkey (is_won, is_lost)
    `)
    .not('assigned_to', 'is', null)
    .or(`last_contact_at.is.null,last_contact_at.lt.${daysAgo.toISOString()}`)
    .not('platform_crm_pipeline_stages.is_won', 'eq', true)
    .not('platform_crm_pipeline_stages.is_lost', 'eq', true);

  if (error) {
    console.error('Error fetching stalled leads:', error);
    return 0;
  }

  let notificationCount = 0;

  for (const lead of stalledLeads || []) {
    // Skip if lead stage is won or lost
    if (lead.platform_crm_pipeline_stages?.is_won || lead.platform_crm_pipeline_stages?.is_lost) continue;

    // Check if already notified today
    const { data: existingLog } = await supabase
      .from('platform_crm_notification_logs')
      .select('id')
      .eq('user_id', lead.assigned_to)
      .eq('notification_type', 'stalled_lead')
      .eq('reference_id', lead.id)
      .eq('reference_date', new Date().toISOString().split('T')[0])
      .maybeSingle();

    if (existingLog) continue;

    // Calculate days since last contact
    const daysSince = lead.last_contact_at
      ? Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24))
      : settings.stalled_lead_days + 1;

    // Create notification
    const { error: notifError } = await supabase
      .from('platform_crm_notifications')
      .insert({
        user_id: lead.assigned_to,
        type: 'urgency',
        title: `Lead parado: ${lead.name}`,
        message: `Sem contato há ${daysSince} dias. Que tal retomar a conversa?`,
        action_url: `/leads?highlight=${lead.id}`,
      });

    if (!notifError) {
      // Log to prevent duplicate
      // orgScopingRule: removido campo organization_id do insert.
      await supabase
        .from('platform_crm_notification_logs')
        .insert({
          user_id: lead.assigned_to,
          notification_type: 'stalled_lead',
          reference_id: lead.id,
        });
      notificationCount++;
    }
  }

  return notificationCount;
}

async function processAchievedGoals(supabase: any, settings: AutoNotificationSettings): Promise<number> {
  // Find goals that were just achieved (achieved_value >= target_value)
  const today = new Date();
  // orgScopingRule: removido `.eq('organization_id', ...)`.
  // TODO: sem equivalente platform_crm (products/product_id) — platform_crm_sales_goals
  //       NAO tem product_id e NAO existe platform_crm_products; select de
  //       `product_id, products (name)` do original omitido.
  const { data: achievedGoals, error } = await supabase
    .from('platform_crm_sales_goals')
    .select(`
      id,
      user_id,
      target_value,
      achieved_value,
      target_deals,
      achieved_deals
    `)
    .eq('is_active', true)
    .lte('period_start', today.toISOString())
    .gte('period_end', today.toISOString())
    .or('achieved_value.gte.target_value,achieved_deals.gte.target_deals');

  if (error) {
    console.error('Error fetching achieved goals:', error);
    return 0;
  }

  let notificationCount = 0;

  for (const goal of achievedGoals || []) {
    // Check if already notified
    const { data: existingLog } = await supabase
      .from('platform_crm_notification_logs')
      .select('id')
      .eq('user_id', goal.user_id)
      .eq('notification_type', 'goal_achieved')
      .eq('reference_id', goal.id)
      .maybeSingle();

    if (existingLog) continue;

    // TODO: sem equivalente platform_crm (products/product_id) — fallback original 'Geral' preservado.
    const productName = goal.products?.name || 'Geral';
    const valueFormatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(goal.achieved_value);

    // Create notification
    // TODO: sem equivalente platform_crm (products/product_id) — campo product_id do
    //       insert do original omitido (platform_crm_notifications NAO tem product_id).
    const { error: notifError } = await supabase
      .from('platform_crm_notifications')
      .insert({
        user_id: goal.user_id,
        type: 'opportunity',
        title: `🎉 Meta atingida: ${productName}!`,
        message: `Parabéns! Você alcançou ${valueFormatted} de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target_value)}!`,
        action_url: '/goals',
      });

    if (!notifError) {
      // orgScopingRule: removido campo organization_id do insert.
      await supabase
        .from('platform_crm_notification_logs')
        .insert({
          user_id: goal.user_id,
          notification_type: 'goal_achieved',
          reference_id: goal.id,
        });
      notificationCount++;
    }
  }

  return notificationCount;
}

async function processApprovedCommissions(supabase: any, settings: AutoNotificationSettings): Promise<number> {
  // Find recently approved commissions (within last hour, to catch recent approvals)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // orgScopingRule: removido `.eq('organization_id', ...)`.
  // TODO: sem equivalente platform_crm (products/product_id) — platform_crm_commissions
  //       NAO tem product_id e NAO existe platform_crm_products; select de
  //       `product_id, products (name)` do original omitido. Join deal->lead preservado.
  const { data: approvedCommissions, error } = await supabase
    .from('platform_crm_commissions')
    .select(`
      id,
      user_id,
      amount,
      deal_id,
      platform_crm_deals (
        lead_id,
        platform_crm_leads (name)
      )
    `)
    .eq('status', 'approved')
    .gte('approved_at', oneHourAgo);

  if (error) {
    console.error('Error fetching approved commissions:', error);
    return 0;
  }

  let notificationCount = 0;

  for (const commission of approvedCommissions || []) {
    // Check if already notified
    const { data: existingLog } = await supabase
      .from('platform_crm_notification_logs')
      .select('id')
      .eq('user_id', commission.user_id)
      .eq('notification_type', 'commission_approved')
      .eq('reference_id', commission.id)
      .maybeSingle();

    if (existingLog) continue;

    const amountFormatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(commission.amount);

    const leadName = commission.platform_crm_deals?.platform_crm_leads?.name || 'Cliente';
    // TODO: sem equivalente platform_crm (products/product_id) — fallback original '' preservado.
    const productName = commission.products?.name || '';

    // Create notification
    // TODO: sem equivalente platform_crm (products/product_id) — campo product_id do
    //       insert do original omitido (platform_crm_notifications NAO tem product_id).
    const { error: notifError } = await supabase
      .from('platform_crm_notifications')
      .insert({
        user_id: commission.user_id,
        type: 'opportunity',
        title: `💰 Comissão aprovada: ${amountFormatted}`,
        message: `Sua comissão de ${productName} (${leadName}) foi aprovada!`,
        action_url: '/financeiro',
      });

    if (!notifError) {
      // orgScopingRule: removido campo organization_id do insert.
      await supabase
        .from('platform_crm_notification_logs')
        .insert({
          user_id: commission.user_id,
          notification_type: 'commission_approved',
          reference_id: commission.id,
        });
      notificationCount++;
    }
  }

  return notificationCount;
}
