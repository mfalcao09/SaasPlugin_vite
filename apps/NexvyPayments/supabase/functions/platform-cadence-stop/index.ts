// platform-cadence-stop — motor de CADÊNCIAS do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `cadence-stop` do CRM Vendus, DESACOPLADO do tenant:
//   * Tabelas: platform_crm_cadence_enrollments / platform_crm_cadence_step_runs.
//     SEM organization_id.
//   * Auth: gate super_admin (platform-crm-auth) — ação manual da UI; chamada
//     interna com SERVICE_ROLE key + actorUserId também é aceita.
//
// Cancela um enrollment manualmente.
// POST { enrollment_id, reason? } OU { cadence_id, lead_id, reason? }
//
// 🔒 ZERO tabela de tenant.

import { createPlatformServiceClient } from "../_shared/platform-crm-audience.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { enrollment_id, cadence_id, lead_id, reason } = body;
    const supabase = createPlatformServiceClient();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Gate super_admin (tabelas platform_crm_* são super_admin-only por RLS).
    const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
    if (errorResponse) return errorResponse;

    let q = supabase.from("platform_crm_cadence_enrollments").select("id").eq("status", "active");
    if (enrollment_id) q = q.eq("id", enrollment_id);
    else if (cadence_id && lead_id) q = q.eq("cadence_id", cadence_id).eq("lead_id", lead_id);
    else {
      return new Response(JSON.stringify({ error: "Missing enrollment_id or (cadence_id+lead_id)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: enrs } = await q;
    const ids = (enrs ?? []).map((e: any) => e.id);
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, stopped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("platform_crm_cadence_step_runs")
      .update({ status: "skipped", skip_reason: "manual_stop", executed_at: new Date().toISOString() })
      .in("enrollment_id", ids)
      .eq("status", "scheduled");

    await supabase
      .from("platform_crm_cadence_enrollments")
      .update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: reason ?? "manual" })
      .in("id", ids);

    return new Response(JSON.stringify({ ok: true, stopped: ids.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[platform-cadence-stop]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
