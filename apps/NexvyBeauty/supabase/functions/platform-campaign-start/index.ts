// platform-campaign-start — motor de CAMPANHAS do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `campaign-start` do CRM Vendus, DESACOPLADO do tenant.
// Inicia uma campanha: resolve público, monta snapshot e cria um job em
// `platform_crm_campaign_preparation_jobs`. O worker `platform-campaign-prepare`
// insere os `platform_crm_campaign_targets` em segundo plano. Resposta < 500ms.
//
// POST { campaign_id }
//
// Adaptações (mapeamento tenant → plataforma):
//   * campaigns / campaign_contexts / campaign_preparation_jobs →
//     platform_crm_campaigns / platform_crm_campaign_contexts /
//     platform_crm_campaign_preparation_jobs. SEM organization_id.
//   * Audiência: resolveAudience de `platform-crm-campaign-audience.ts`
//     (porte 1:1 do campaign-audience.ts, sem arg de org).
//   * Opt-out guard (leads.whatsapp_opt_in = false): a plataforma NÃO tem
//     WhatsApp nem coluna de opt-in em platform_crm_leads — bloco removido.
//     TODO(whatsapp): restaurar o guard quando o canal WhatsApp existir.
//   * Instâncias (evolution_instances / whatsapp_meta_connections): tabelas de
//     tenant, proibidas. O canal de entrega da plataforma é o WEBCHAT — o
//     snapshot usa uma única "instância" virtual { id: null, connection_type:
//     'webchat' } e o erro "Nenhum número WhatsApp conectado" cai fora.
//     TODO(whatsapp): resolver instâncias reais quando o canal existir.
//   * Auth: gate super_admin (platform-crm-auth) — o edge roda com
//     SERVICE_ROLE, então o gate do RLS precisa ser re-aplicado em código.
//
// 🔒 ZERO tabela de tenant.

import {
  resolveAudience,
  createServiceClient,
  type CampaignFilters,
} from "../_shared/platform-crm-campaign-audience.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json()) as { campaign_id?: string };
    const { campaign_id } = body;
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "Missing campaign_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createServiceClient();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Gate super_admin (tabelas platform_crm_* são super_admin-only por RLS).
    const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
    if (errorResponse) return errorResponse;

    const { data: campaign, error: cErr } = await supabase
      .from("platform_crm_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    if (campaign.status === "active" || campaign.status === "preparing") {
      return new Response(JSON.stringify({ error: `Campaign already ${campaign.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Resolve público (snapshot) — 1:1, sem organization_id
    const audience = await resolveAudience(
      supabase,
      (campaign.audience_filters ?? {}) as CampaignFilters,
      (campaign.exclusion_filters ?? {}) as CampaignFilters,
    );
    const { leadIds, total, excluded } = audience;

    // 2) Opt-out guard — REMOVIDO: platform_crm_leads não tem whatsapp_opt_in
    //    (canal da plataforma = webchat). TODO(whatsapp): restaurar o guard
    //    `whatsapp_opt_in = false → excluir` quando o canal WhatsApp existir.

    // 3) Instâncias — plataforma SEM WhatsApp: entrega via webchat.
    //    Instância virtual única; a rotação/pesos do prepare degeneram para ela.
    //    TODO(whatsapp): resolver instâncias reais (rotation/manual/random) aqui.
    const instances: Array<{ id: string | null; connection_type: string; weight: number }> = [
      { id: null, connection_type: "webchat", weight: 1 },
    ];

    // 4) Resolve contextos (snapshot com texto já materializado) — 1:1
    const contextEntries: Array<{ text: string; id?: string; weight: number }> = [];
    const declared = Array.isArray(campaign.contexts) ? (campaign.contexts as any[]) : [];
    for (const c of declared) {
      if (c.inline_text) {
        contextEntries.push({ text: c.inline_text, weight: c.weight ?? 1 });
      } else if (c.context_id) {
        const { data: ctx } = await supabase
          .from("platform_crm_campaign_contexts")
          .select("instructions, objective, tone, cta")
          .eq("id", c.context_id)
          .maybeSingle();
        if (ctx) {
          const text = [
            ctx.objective ? `Objetivo: ${ctx.objective}` : "",
            ctx.tone ? `Tom: ${ctx.tone}` : "",
            ctx.cta ? `CTA: ${ctx.cta}` : "",
            ctx.instructions,
          ].filter(Boolean).join("\n");
          contextEntries.push({ text, id: c.context_id, weight: c.weight ?? 1 });
        }
      }
    }
    if (!contextEntries.length) {
      contextEntries.push({ text: campaign.description ?? campaign.name, weight: 1 });
    }

    // 5) Cria snapshot completo — 1:1
    const snapshot = {
      instances,
      contexts: contextEntries,
      instance_strategy: campaign.instance_strategy,
      context_distribution: campaign.context_distribution,
      speed_preset: campaign.speed_preset,
      speed_config: campaign.speed_config,
      schedule_type: campaign.schedule_type,
      scheduled_at: campaign.scheduled_at,
      base_time_ms: campaign.schedule_type === "scheduled" && campaign.scheduled_at
        ? new Date(campaign.scheduled_at).getTime()
        : Date.now(),
    };

    // 6) Cria job de preparação + marca campanha como 'preparing' — 1:1 (sem org)
    const { data: job, error: jobErr } = await supabase
      .from("platform_crm_campaign_preparation_jobs")
      .insert({
        campaign_id,
        status: "pending",
        total_contacts: leadIds.length,
        lead_ids: leadIds,
        campaign_snapshot: snapshot,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    await supabase
      .from("platform_crm_campaigns")
      .update({
        status: "preparing",
        totals: { audience: total, will_receive: leadIds.length, excluded },
      })
      .eq("id", campaign_id);

    // 7) Incrementa usage_count dos contextos da biblioteca — 1:1
    const usedIds = Array.from(new Set(contextEntries.map((c) => c.id).filter(Boolean))) as string[];
    for (const id of usedIds) {
      const { data: row } = await supabase
        .from("platform_crm_campaign_contexts")
        .select("usage_count")
        .eq("id", id)
        .maybeSingle();
      if (row) {
        await supabase
          .from("platform_crm_campaign_contexts")
          .update({ usage_count: (row.usage_count ?? 0) + 1 })
          .eq("id", id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: "preparing",
        preparation_job_id: job.id,
        total_audience: total,
        scheduled: leadIds.length,
        excluded,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[platform-campaign-start]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
