import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REPORT_MODEL = 'google/gemini-2.5-flash';

interface SellerContext {
  profile: any;
  tasksToday: any[];
  overdueTasks: any[];
  stalledLeads: any[];
  hotLeads: any[];
  goalProgress: any[];
  pendingCadences: any[];
  recentDeals: any[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Mesma chave/gateway da evaluate-conversation (LLM-as-Judge) — comprovado em prod.
    const apiKey = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');

    const body = (await req.json().catch(() => ({}))) as any;

    // dry_run: gera o briefing de um contexto-amostra e RETORNA (sem gravar nada).
    // Serve pra verificar a IA sem disparar notificacao a vendedores reais.
    if (body?.dry_run) {
      const sample: SellerContext = {
        profile: { full_name: 'Marcelo (teste)' },
        tasksToday: [
          { title: 'Ligar pra Marina Lopes', priority: 'high', leads: { name: 'Marina Lopes' } },
          { title: 'Enviar proposta de pacote', priority: 'urgent', leads: { name: 'Studio Bella' } },
        ],
        overdueTasks: [{ title: 'Retornar orcamento', leads: { name: 'Juliana Ramos' } }],
        stalledLeads: [
          { name: 'Patricia Gomes', last_contact_at: new Date(Date.now() - 6 * 86400000).toISOString(), temperature: 'warm' },
          { name: 'Camila Souza', last_contact_at: new Date(Date.now() - 9 * 86400000).toISOString(), temperature: 'cold' },
        ],
        hotLeads: [{ name: 'Espaco Beleza Premium', company: 'rede 3 unidades' }],
        goalProgress: [{ target_value: 20000, achieved_value: 12500, products: { name: 'Plano Pro' } }],
        recentDeals: [{ leads: { name: 'Ana Silveira' }, deal_value: 397, products: { name: 'Plano Pro' } }],
        pendingCadences: [],
      };
      let mode = 'template';
      let report = generateTemplateReport(sample, 'Marcelo (teste)');
      if (apiKey) {
        const llm = await generateLLMReport(apiKey, sample, 'Marcelo (teste)');
        if (llm) { report = llm; mode = 'llm'; }
      }
      return new Response(
        JSON.stringify({ dry_run: true, apiKeyPresent: !!apiKey, mode, report }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get organizations with daily report enabled
    const { data: allSettings, error: settingsError } = await supabase
      .from('auto_notification_settings')
      .select('*')
      .eq('daily_report_enabled', true);

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw settingsError;
    }

    const results = {
      reports_generated: 0,
      emails_sent: 0,
      llm_reports: 0,
      errors: [] as string[],
    };

    for (const settings of allSettings || []) {
      try {
        const { data: sellers, error: sellersError } = await supabase
          .from('profiles')
          .select('id, full_name, email, organization_id')
          .eq('organization_id', settings.organization_id)
          .eq('is_active', true);

        if (sellersError) throw sellersError;

        for (const seller of sellers || []) {
          try {
            const { data: existingLog } = await supabase
              .from('notification_logs')
              .select('id')
              .eq('user_id', seller.id)
              .eq('notification_type', 'daily_report')
              .eq('reference_date', new Date().toISOString().split('T')[0])
              .maybeSingle();

            if (existingLog) continue;

            const context = await gatherSellerContext(supabase, seller.id, settings.organization_id);

            // LLM com fallback gracioso pro template atual.
            let usedLLM = false;
            let report = generateTemplateReport(context, seller.full_name);
            if (apiKey) {
              const llm = await generateLLMReport(apiKey, context, seller.full_name);
              if (llm) { report = llm; usedLLM = true; }
            }

            await supabase
              .from('notifications')
              .insert({
                user_id: seller.id,
                type: 'system',
                title: '☀️ Seu briefing do dia',
                message: report.summary,
                action_url: '/dashboard',
                metadata: { full_report: report.full, ai_generated: usedLLM },
              });

            await supabase
              .from('notification_logs')
              .insert({
                user_id: seller.id,
                organization_id: settings.organization_id,
                notification_type: 'daily_report',
                reference_id: seller.id,
              });

            results.reports_generated++;
            if (usedLLM) results.llm_reports++;

            if (settings.daily_report_send_email && seller.email) {
              const emailSent = await sendReportEmail(seller.email, seller.full_name, report);
              if (emailSent) results.emails_sent++;
            }
          } catch (sellerError: unknown) {
            const errorMessage = sellerError instanceof Error ? sellerError.message : 'Unknown error';
            console.error(`Error processing seller ${seller.id}:`, sellerError);
            results.errors.push(`Seller ${seller.id}: ${errorMessage}`);
          }
        }
      } catch (orgError: unknown) {
        const errorMessage = orgError instanceof Error ? orgError.message : 'Unknown error';
        console.error(`Error processing org ${settings.organization_id}:`, orgError);
        results.errors.push(`Org ${settings.organization_id}: ${errorMessage}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in daily-report-ai:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function gatherSellerContext(supabase: any, userId: string, orgId: string): Promise<SellerContext> {
  const today = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profileResult,
    tasksTodayResult,
    overdueTasksResult,
    stalledLeadsResult,
    hotLeadsResult,
    goalProgressResult,
    recentDealsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('tasks').select('*, leads(name)').eq('user_id', userId).gte('due_date', todayStart).lte('due_date', todayEnd).neq('status', 'completed'),
    supabase.from('tasks').select('*, leads(name)').eq('user_id', userId).lt('due_date', todayStart).neq('status', 'completed'),
    supabase.from('leads').select('id, name, last_contact_at, temperature, current_stage_id').eq('assigned_to', userId).eq('organization_id', orgId).lt('last_contact_at', threeDaysAgo).limit(10),
    supabase.from('leads').select('id, name, temperature, company').eq('assigned_to', userId).eq('organization_id', orgId).eq('temperature', 'hot').limit(5),
    supabase.from('sales_goals').select('*, products(name)').eq('user_id', userId).eq('is_active', true).lte('period_start', new Date().toISOString()).gte('period_end', new Date().toISOString()),
    supabase.from('deals').select('*, leads(name), products(name)').eq('seller_id', userId).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(5),
  ]);

  return {
    profile: profileResult.data,
    tasksToday: tasksTodayResult.data || [],
    overdueTasks: overdueTasksResult.data || [],
    stalledLeads: stalledLeadsResult.data || [],
    hotLeads: hotLeadsResult.data || [],
    goalProgress: goalProgressResult.data || [],
    recentDeals: recentDealsResult.data || [],
    pendingCadences: [],
  };
}

// ---- NOVO: relatorio por LLM (Gemini via gateway) com saida estruturada ----
async function generateLLMReport(apiKey: string, context: SellerContext, sellerName: string): Promise<{ summary: string; full: string } | null> {
  const firstName = (sellerName ?? '').split(' ')[0] || 'vendedor';
  const ctx = {
    vendedor: firstName,
    tarefas_hoje: (context.tasksToday || []).map((t: any) => ({ titulo: t.title, prioridade: t.priority, lead: t.leads?.name ?? null })),
    tarefas_atrasadas: (context.overdueTasks || []).map((t: any) => ({ titulo: t.title, lead: t.leads?.name ?? null })),
    leads_parados: (context.stalledLeads || []).map((l: any) => ({ nome: l.name, dias_sem_contato: l.last_contact_at ? Math.floor((Date.now() - new Date(l.last_contact_at).getTime()) / 86400000) : null, temperatura: l.temperature })),
    leads_quentes: (context.hotLeads || []).map((l: any) => ({ nome: l.name, empresa: l.company ?? null })),
    metas: (context.goalProgress || []).map((g: any) => ({ alvo: g.target_value, atingido: g.achieved_value, produto: g.products?.name ?? null })),
    negocios_recentes: (context.recentDeals || []).map((d: any) => ({ lead: d.leads?.name ?? null, valor: d.deal_value })),
  };

  const systemPrompt =
    'Voce e um coach de vendas que escreve o briefing matinal do vendedor de um salao de beleza/SaaS. ' +
    'Com base no contexto (tarefas, leads, metas, negocios), escreva um briefing MOTIVADOR, OBJETIVO e ACIONAVEL em portugues do Brasil. ' +
    'Foque no que move o ponteiro hoje: o que fazer primeiro e por que. Nao invente dados. Use no maximo ~180 palavras no campo full. ' +
    'Responda APENAS via tool call compose_briefing.';
  const userPrompt = `Contexto do vendedor (JSON):\n${JSON.stringify(ctx)}`;

  try {
    const resp = await fetch(
      `${Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: REPORT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'compose_briefing',
                description: 'Compoe o briefing matinal do vendedor.',
                parameters: {
                  type: 'object',
                  properties: {
                    summary: { type: 'string', description: 'Uma linha (<=120 chars) com emoji, para a notificacao push.' },
                    full: { type: 'string', description: 'Briefing completo, com secoes (Prioridades, Reativar, Leads quentes, Recomendacao). Texto markdown leve.' },
                  },
                  required: ['summary', 'full'],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: 'compose_briefing' } },
        }),
      },
    );
    if (!resp.ok) {
      console.error('daily-report LLM error', resp.status, await resp.text());
      return null;
    }
    const json = await resp.json();
    const tc = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return null;
    const parsed = JSON.parse(tc.function.arguments);
    if (!parsed?.summary || !parsed?.full) return null;
    return { summary: String(parsed.summary).slice(0, 220), full: String(parsed.full) };
  } catch (e) {
    console.error('daily-report LLM exception', e);
    return null;
  }
}

// ---- Fallback: template atual (renomeado de generateAIReport) ----
function generateTemplateReport(context: SellerContext, sellerName: string): { summary: string; full: string } {
  const firstName = (sellerName ?? '').split(' ')[0];

  const taskCount = context.tasksToday.length;
  const overdueCount = context.overdueTasks.length;
  const stalledCount = context.stalledLeads.length;
  const hotCount = context.hotLeads.length;

  let goalSummary = '';
  if (context.goalProgress.length > 0) {
    const goal = context.goalProgress[0];
    const progress = goal.target_value > 0 ? Math.round((goal.achieved_value / goal.target_value) * 100) : 0;
    const remaining = goal.target_value - goal.achieved_value;
    goalSummary = `Meta do mes: ${progress}% (faltam ${formatCurrency(remaining)})`;
  }

  const priorities: string[] = [];
  context.overdueTasks.slice(0, 2).forEach((task: any) => { priorities.push(`⚠️ Tarefa atrasada: ${task.title}`); });
  context.stalledLeads.slice(0, 2).forEach((lead: any) => {
    const daysSince = Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24));
    priorities.push(`Retomar contato com ${lead.name} (${daysSince} dias sem contato)`);
  });
  const highPriorityTasks = context.tasksToday.filter((t: any) => t.priority === 'high' || t.priority === 'urgent');
  highPriorityTasks.slice(0, 2).forEach((task: any) => { priorities.push(`${task.title}${task.leads?.name ? ` - ${task.leads.name}` : ''}`); });

  const summaryParts: string[] = [];
  if (taskCount > 0) summaryParts.push(`${taskCount} tarefa${taskCount > 1 ? 's' : ''} hoje`);
  if (overdueCount > 0) summaryParts.push(`${overdueCount} atrasada${overdueCount > 1 ? 's' : ''}`);
  if (stalledCount > 0) summaryParts.push(`${stalledCount} lead${stalledCount > 1 ? 's' : ''} precisa${stalledCount > 1 ? 'm' : ''} de atencao`);
  if (hotCount > 0) summaryParts.push(`${hotCount} lead${hotCount > 1 ? 's' : ''} quente${hotCount > 1 ? 's' : ''}`);

  const summary = summaryParts.length > 0 ? `📊 ${summaryParts.join(' • ')}` : 'Tudo em dia! Continue focado nas suas metas.';

  const fullReport = `☀️ Bom dia, ${firstName}!\n\n📊 RESUMO DO DIA\n${taskCount > 0 ? `• ${taskCount} tarefa${taskCount > 1 ? 's' : ''} para hoje` : '• Nenhuma tarefa agendada'}\n${overdueCount > 0 ? `• ⚠️ ${overdueCount} atrasada${overdueCount > 1 ? 's' : ''}` : ''}\n${stalledCount > 0 ? `• ${stalledCount} lead${stalledCount > 1 ? 's' : ''} precisa${stalledCount > 1 ? 'm' : ''} de atencao` : ''}\n${goalSummary ? `• ${goalSummary}` : ''}\n\n${priorities.length > 0 ? `🎯 PRIORIDADES\n${priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : ''}\n\n${hotCount > 0 ? `🔥 LEADS QUENTES\n${context.hotLeads.map((l: any) => `• ${l.name}${l.company ? ` (${l.company})` : ''}`).join('\n')}` : ''}\n\nBoas vendas! 🚀`.trim();

  return { summary, full: fullReport };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

async function sendReportEmail(email: string, name: string, report: { summary: string; full: string }): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.log('RESEND_API_KEY not configured, skipping email');
    return false;
  }
  try {
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1a1a2e;max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#f43f6e,#ff77a0);color:#fff;padding:30px;border-radius:12px 12px 0 0;text-align:center}.content{background:#f8fafc;padding:30px;border-radius:0 0 12px 12px}.section{background:#fff;padding:20px;border-radius:8px;border:1px solid #e2e8f0}pre{white-space:pre-wrap;font-family:inherit;margin:0}.footer{text-align:center;padding:20px;color:#64748b;font-size:12px}</style></head><body><div class="header"><h1 style="margin:0;font-size:24px">☀️ Seu Briefing do Dia</h1><p style="margin:10px 0 0;opacity:.9">Bom dia, ${name.split(' ')[0]}!</p></div><div class="content"><div class="section"><pre>${report.full.replace(/☀️.*?\n\n/, '')}</pre></div></div><div class="footer"><p>Enviado automaticamente pelo seu assistente de vendas</p></div></body></html>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Assistente de Vendas <noreply@resend.dev>',
        to: [email],
        subject: `☀️ Seu briefing do dia - ${new Date().toLocaleDateString('pt-BR')}`,
        html: htmlContent,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}
