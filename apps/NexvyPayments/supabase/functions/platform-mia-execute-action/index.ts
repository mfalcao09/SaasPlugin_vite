// platform-mia-execute-action — executes a previously prepared Mia action (PLATFORM CRM).
// Decoupled port of mia-execute-action: table `platform_crm_mia_actions`, targets
// `platform_crm_tasks` / `platform_crm_notifications` / `platform_crm_leads`, ZERO
// organization_id. Ownership = owner-only (every platform user is a super_admin).
//
// v1 remap (documented deviations from the tenant model):
//   create_task       -> platform_crm_tasks (assignee = payload.assignee_id || requester)
//   schedule_followup -> platform_crm_tasks (type=follow_up, due_date=when) — the platform
//                        has no ai_outreach_queue; a follow-up task is the clean equivalent.
//   notify_seller     -> platform_crm_notifications (seller = payload.seller_id || requester)
//   open_*            -> navigation (frontend handles; just mark executed)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NAV_TYPES = ["open_conversation", "open_lead", "open_calendar", "open_tasks", "open_report"];

async function resolveLeadByName(
  admin: any,
  name: string | null | undefined,
): Promise<{ id: string; name: string; assigned_to: string | null; product_id: string | null } | null> {
  if (!name) return null;
  const { data } = await admin.from("platform_crm_leads")
    .select("id, name, assigned_to, product_id")
    .ilike("name", `%${name}%`)
    .limit(2);
  if (!data || data.length !== 1) return null; // not found or ambiguous
  return data[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const actionId = String(body?.action_id ?? "");
    if (!actionId) {
      return new Response(JSON.stringify({ error: "missing_action_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: action, error: loadErr } = await admin.from("platform_crm_mia_actions")
      .select("*").eq("id", actionId).maybeSingle();
    if (loadErr || !action) {
      return new Response(JSON.stringify({ error: "action_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership: owner-only (all platform users are super_admins; RLS already gates reads).
    if (action.user_id !== userId) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["waiting_confirmation", "approved", "draft"].includes(action.status)) {
      return new Response(JSON.stringify({ error: "invalid_status", status: action.status }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("platform_crm_mia_actions").update({ status: "executing" }).eq("id", actionId);

    const isNav = NAV_TYPES.includes(action.action_type);
    if (isNav) {
      const result = { navigation: true, payload: action.payload || {} };
      await admin.from("platform_crm_mia_actions").update({
        status: "executed", result, executed_at: new Date().toISOString(),
      }).eq("id", actionId);
      return new Response(JSON.stringify({ ok: true, action_id: actionId, status: "executed", result }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Background worker — does not block the response.
    const worker = (async () => {
      const payload = action.payload || {};
      let result: any = null;
      let errMsg: string | null = null;
      try {
        result = await runActionExecution(admin, action, userId, payload);
      } catch (e: any) {
        errMsg = e?.message ?? String(e);
      }
      await admin.from("platform_crm_mia_actions").update({
        status: errMsg ? "failed" : "executed",
        result, error_message: errMsg,
        executed_at: errMsg ? null : new Date().toISOString(),
      }).eq("id", actionId);
    })();

    // @ts-ignore — EdgeRuntime exists in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(worker);
    } else {
      worker.catch((e) => console.error("[platform-mia-execute-action] worker", e));
    }

    return new Response(JSON.stringify({
      ok: true, action_id: actionId, status: "executing",
      message: "Em execução. Você será notificado quando concluir.",
    }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[platform-mia-execute-action] unexpected", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runActionExecution(
  admin: any,
  action: any,
  userId: string,
  payload: any,
): Promise<any> {
  switch (action.action_type) {
    case "create_task": {
      // v1: assignee = explicit id or the requesting super-admin (name-resolution deferred).
      const assigneeId = payload.assignee_id || userId;
      const row: Record<string, any> = {
        user_id: assigneeId,
        title: payload.title ?? "Tarefa criada pela Mia",
        description: payload.description ?? null,
        due_date: payload.due_at ?? null,
        lead_id: payload.lead_id ?? null,
        type: "follow_up",
        created_by: userId,
      };
      if (payload.priority) row.priority = payload.priority;
      const { data: task, error } = await admin.from("platform_crm_tasks").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      return { task_id: task.id, assignee_id: assigneeId };
    }

    case "schedule_followup": {
      // Platform has no ai_outreach_queue — a follow-up task is the clean equivalent.
      let lead = payload.lead_id ? null : await resolveLeadByName(admin, payload.lead_name);
      const leadId = payload.lead_id ?? lead?.id ?? null;
      if (!leadId) throw new Error(`Não encontrei lead "${payload.lead_name ?? ""}".`);
      if (!lead && payload.lead_id) {
        const { data } = await admin.from("platform_crm_leads")
          .select("id, name, assigned_to, product_id").eq("id", leadId).maybeSingle();
        lead = data;
      }
      const when = payload.when ? new Date(payload.when) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const row: Record<string, any> = {
        user_id: lead?.assigned_to || userId,
        lead_id: leadId,
        title: payload.objective ?? `Follow-up${lead?.name ? ` com ${lead.name}` : ""}`,
        description: payload.extra_context ?? null,
        type: "follow_up",
        due_date: when.toISOString(),
        created_by: userId,
      };
      const { data: task, error } = await admin.from("platform_crm_tasks").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      return { task_id: task.id, lead_id: leadId, scheduled_for: when.toISOString() };
    }

    case "notify_seller": {
      // v1: seller = explicit id or the requesting super-admin (name-resolution deferred).
      const sellerId = payload.seller_id || userId;
      const { data: n, error } = await admin.from("platform_crm_notifications").insert({
        user_id: sellerId,
        title: payload.title ?? "Mensagem da Mia",
        message: payload.message ?? "",
        metadata: { from_mia: true, requested_by: userId },
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { notification_id: n.id, seller_id: sellerId };
    }

    default:
      throw new Error(`Tipo de ação não suportado: ${action.action_type}`);
  }
}
