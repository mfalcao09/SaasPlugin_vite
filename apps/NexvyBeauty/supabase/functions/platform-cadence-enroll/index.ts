// platform-cadence-enroll — motor de CADÊNCIAS do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `cadence-enroll` do CRM Vendus, DESACOPLADO do tenant:
//   * Tabelas: platform_crm_cadences / platform_crm_cadence_steps /
//     platform_crm_cadence_enrollments / platform_crm_cadence_step_runs /
//     platform_crm_leads / platform_crm_lead_tag_assignments. SEM organization_id.
//   * Audiência: resolvePlatformAudience (porte de campaign-audience.ts) —
//     valida elegibilidade por entry_filters/exclusion_filters (incl. tags),
//     como o original.
//   * Auth: gate super_admin (platform-crm-auth) — o edge roda com SERVICE_ROLE,
//     então o gate do RLS precisa ser re-aplicado em código. Chamada interna
//     com a própria SERVICE_ROLE key + actorUserId também é aceita (padrão dos
//     edges platform-crm já portados).
//
// POST { cadence_id, lead_ids?: string[], source?: string, source_ref?: any }
// - Se lead_ids vier, usa eles direto (aplicando exclusion_filters).
// - Senão, resolve via entry_filters da cadência.
// - Cria enrollment + agenda 1º step_run.
//
// 🔒 ZERO tabela de tenant.

import {
  createPlatformServiceClient,
  resolvePlatformAudience,
} from "../_shared/platform-crm-audience.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

function computeScheduledAt(step: any, fromDate: Date): Date {
  if (step.execute_immediately) return new Date();
  const v = Number(step.delay_value ?? 0);
  const unit = step.delay_unit ?? "days";
  const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
  return new Date(fromDate.getTime() + v * mult);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const supabase = createPlatformServiceClient();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Gate super_admin (tabelas platform_crm_* são super_admin-only por RLS).
    const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
    if (errorResponse) return errorResponse;

    const { cadence_id, lead_ids, source, source_ref } = body;
    if (!cadence_id) {
      return new Response(JSON.stringify({ error: "Missing cadence_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cadence } = await supabase
      .from("platform_crm_cadences")
      .select("id, status, entry_filters, exclusion_filters")
      .eq("id", cadence_id)
      .maybeSingle();
    if (!cadence) {
      return new Response(JSON.stringify({ error: "Cadence not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (cadence.status !== "active") {
      return new Response(JSON.stringify({ error: "Cadence not active", status: cadence.status }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve leads (1:1)
    let targetLeads: string[] = [];
    if (Array.isArray(lead_ids) && lead_ids.length) {
      targetLeads = lead_ids;
      // Aplica exclusões manualmente se houver
      const excl = cadence.exclusion_filters ?? {};
      if (Object.keys(excl).length) {
        const { leadIds: toRemove } = await resolvePlatformAudience(
          supabase,
          { ...excl, lead_ids: targetLeads },
          {},
        );
        const rm = new Set(toRemove);
        targetLeads = targetLeads.filter((id) => !rm.has(id));
      }
    } else {
      const { leadIds } = await resolvePlatformAudience(
        supabase,
        cadence.entry_filters ?? {},
        cadence.exclusion_filters ?? {},
      );
      targetLeads = leadIds;
    }

    if (!targetLeads.length) {
      return new Response(JSON.stringify({ enrolled: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar 1º step
    const { data: firstStep } = await supabase
      .from("platform_crm_cadence_steps")
      .select("*")
      .eq("cadence_id", cadence_id)
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstStep) {
      return new Response(JSON.stringify({ error: "Cadence has no steps" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filtra leads já com enrollment ativo (1:1)
    const { data: existing } = await supabase
      .from("platform_crm_cadence_enrollments")
      .select("lead_id")
      .eq("cadence_id", cadence_id)
      .eq("status", "active")
      .in("lead_id", targetLeads);
    const already = new Set((existing ?? []).map((r: any) => r.lead_id));
    const fresh = targetLeads.filter((id) => !already.has(id));

    let enrolled = 0;
    const now = new Date();
    const scheduledAt = computeScheduledAt(firstStep, now);

    for (const lead_id of fresh) {
      const { data: enrollment, error: enrErr } = await supabase
        .from("platform_crm_cadence_enrollments")
        .insert({
          cadence_id,
          lead_id,
          status: "active",
          current_step_id: firstStep.id,
          current_step_index: 0,
          source: source ?? "manual",
          source_ref: source_ref ?? null,
        })
        .select("id")
        .single();
      if (enrErr || !enrollment) continue;

      await supabase.from("platform_crm_cadence_step_runs").insert({
        enrollment_id: enrollment.id,
        step_id: firstStep.id,
        scheduled_at: scheduledAt.toISOString(),
        status: "scheduled",
      });
      enrolled++;
    }

    return new Response(
      JSON.stringify({ enrolled, skipped_existing: already.size, total: targetLeads.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[platform-cadence-enroll]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
