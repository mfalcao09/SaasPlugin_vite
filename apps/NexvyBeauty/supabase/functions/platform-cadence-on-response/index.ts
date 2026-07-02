// platform-cadence-on-response — motor de CADÊNCIAS do CRM de PLATAFORMA
//
// Porte 1:1 do `cadence-on-response` do CRM Vendus, DESACOPLADO do tenant.
// Chamado quando o lead responde uma mensagem (no tenant era o evolution-webhook;
// na plataforma o caller natural é o caminho inbound do webchat — ex.:
// platform-webchat-api — com a SERVICE_ROLE key).
// Marca o último step_run como respondido e, se stop_rules.stop_on_response,
// encerra a enrollment e aplica stop_actions.
//
// POST { lead_id?, conversation_id? }
//
// Adaptações de schema:
//   * webchat_conversations → platform_crm_conversations (resolve lead via conversa).
//   * leads.stage_id → platform_crm_leads.current_stage_id.
//   * lead_notes(organization_id) → platform_crm_lead_notes exige author_id
//     NOT NULL → usa cadences.created_by; sem created_by, a nota é pulada
//     (non-fatal, com warn).
//   * Auth: interno = bearer SERVICE_ROLE; humano = JWT super_admin.
//
// 🔒 ZERO tabela de tenant.

import { createPlatformServiceClient } from "../_shared/platform-crm-audience.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

async function applyStopActions(supabase: any, cadence: any, lead_id: string) {
  const actions = cadence.stop_actions ?? {};
  // Tags
  if (Array.isArray(actions.tags_add) && actions.tags_add.length) {
    const rows = actions.tags_add.map((tag_id: string) => ({ lead_id, tag_id, source: "cadence_response" }));
    await supabase.from("platform_crm_lead_tag_assignments").upsert(rows, { onConflict: "lead_id,tag_id", ignoreDuplicates: true });
  }
  if (Array.isArray(actions.tags_remove) && actions.tags_remove.length) {
    await supabase.from("platform_crm_lead_tag_assignments").delete().eq("lead_id", lead_id).in("tag_id", actions.tags_remove);
  }
  // Etapa do pipeline (stage_id do original → current_stage_id na plataforma)
  const leadUpdate: Record<string, any> = {};
  if (actions.stage_id) leadUpdate.current_stage_id = actions.stage_id;
  if (actions.temperature) leadUpdate.temperature = actions.temperature;
  if (Object.keys(leadUpdate).length) {
    await supabase.from("platform_crm_leads").update(leadUpdate).eq("id", lead_id);
  }
  // Nota — platform_crm_lead_notes exige author_id (ver header)
  if (actions.note && typeof actions.note === "string" && actions.note.trim()) {
    if (cadence.created_by) {
      await supabase.from("platform_crm_lead_notes").insert({
        lead_id,
        content: `[Cadência: ${cadence.name ?? "—"}] ${actions.note.trim()}`,
        author_id: cadence.created_by,
      });
    } else {
      console.warn("[platform-cadence-on-response] stop_actions.note pulada — cadência sem created_by (author_id obrigatório)");
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { lead_id: leadIdIn, conversation_id } = body;
    const supabase = createPlatformServiceClient();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Interno: bearer = SERVICE_ROLE key. Humano: JWT super_admin.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (bearer !== serviceKey) {
      const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
      if (errorResponse) return errorResponse;
    }

    let lead_id = leadIdIn as string | undefined;
    if (!lead_id && conversation_id) {
      const { data: conv } = await supabase
        .from("platform_crm_conversations")
        .select("lead_id")
        .eq("id", conversation_id)
        .maybeSingle();
      lead_id = (conv as any)?.lead_id ?? undefined;
    }
    if (!lead_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_lead" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pega enrollments ativos do lead
    const { data: enrollments } = await supabase
      .from("platform_crm_cadence_enrollments")
      .select("id, cadence_id, lead_id")
      .eq("lead_id", lead_id)
      .eq("status", "active");

    if (!enrollments?.length) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_active_enrollment" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cadenceIds = Array.from(new Set(enrollments.map((e: any) => e.cadence_id)));
    const { data: cadences } = await supabase
      .from("platform_crm_cadences")
      .select("id, name, stop_rules, stop_actions, created_by")
      .in("id", cadenceIds);
    const cMap = new Map((cadences ?? []).map((c: any) => [c.id, c]));

    let stoppedCount = 0;
    for (const enr of enrollments) {
      // Marca o último run "sent" como "responded"
      const { data: lastRun } = await supabase
        .from("platform_crm_cadence_step_runs")
        .select("id")
        .eq("enrollment_id", enr.id)
        .eq("status", "sent")
        .order("executed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastRun) {
        await supabase.from("platform_crm_cadence_step_runs").update({ status: "responded" }).eq("id", lastRun.id);
      }

      const cadence = cMap.get(enr.cadence_id);
      const rules = cadence?.stop_rules ?? {};
      if (rules.stop_on_response !== false) {
        // Cancela runs futuros agendados
        await supabase
          .from("platform_crm_cadence_step_runs")
          .update({ status: "skipped", skip_reason: "lead_responded", executed_at: new Date().toISOString() })
          .eq("enrollment_id", enr.id)
          .eq("status", "scheduled");
        await supabase
          .from("platform_crm_cadence_enrollments")
          .update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: "responded" })
          .eq("id", enr.id);
        if (cadence) await applyStopActions(supabase, cadence, lead_id);
        stoppedCount++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, stopped: stoppedCount, total: enrollments.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[platform-cadence-on-response]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
