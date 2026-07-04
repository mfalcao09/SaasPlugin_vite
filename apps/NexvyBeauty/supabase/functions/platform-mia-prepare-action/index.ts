// platform-mia-prepare-action — prepares a Mia action for human approval (PLATFORM CRM).
// Decoupled port of mia-prepare-action: table `platform_crm_mia_actions`, ZERO
// organization_id (RLS super_admin isolates). NEVER executes anything — only inserts
// a row with status=waiting_confirmation (or executed, for nav actions).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES = new Set([
  "create_task",
  "schedule_followup",
  "notify_seller",
  "open_conversation",
  "open_lead",
  "open_calendar",
  "open_tasks",
  "open_report",
]);

// Navigation actions need no confirmation (frontend just navigates).
const NAV_TYPES = new Set([
  "open_conversation",
  "open_lead",
  "open_calendar",
  "open_tasks",
  "open_report",
]);

function buildPreview(type: string, payload: Record<string, any>): string {
  switch (type) {
    case "create_task":
      return `Criar tarefa "${payload.title ?? "(sem título)"}"` +
        (payload.assignee_name ? ` para ${payload.assignee_name}` : "") +
        (payload.due_at ? ` em ${new Date(payload.due_at).toLocaleString("pt-BR")}` : "") +
        (payload.priority ? ` (prioridade ${payload.priority})` : "");
    case "schedule_followup":
      return `Agendar follow-up` +
        (payload.lead_name ? ` com ${payload.lead_name}` : "") +
        (payload.when ? ` em ${new Date(payload.when).toLocaleString("pt-BR")}` : "");
    case "notify_seller":
      return `Notificar ${payload.seller_name ?? "vendedor"}: ${String(payload.message ?? "").slice(0, 120)}`;
    case "open_conversation":
      return `Abrir conversa${payload.lead_name ? ` de ${payload.lead_name}` : ""}`;
    case "open_lead":
      return `Abrir lead${payload.lead_name ? ` ${payload.lead_name}` : ""}`;
    case "open_calendar":
      return "Abrir agenda";
    case "open_tasks":
      return "Abrir tarefas";
    case "open_report":
      return `Abrir relatório${payload.report ? ` "${payload.report}"` : ""}`;
    default:
      return type;
  }
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
    const actionType = String(body?.action_type ?? "").trim();
    const payload = body?.payload ?? {};

    if (!ALLOWED_TYPES.has(actionType)) {
      return new Response(JSON.stringify({ error: "invalid_action_type", action_type: actionType }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isNav = NAV_TYPES.has(actionType);
    const preview = buildPreview(actionType, payload);

    const { data: inserted, error } = await admin.from("platform_crm_mia_actions").insert({
      user_id: userId,
      action_type: actionType,
      payload,
      preview,
      status: isNav ? "executed" : "waiting_confirmation",
      executed_at: isNav ? new Date().toISOString() : null,
    }).select("id, status, preview, action_type, payload").single();

    if (error) {
      console.error("[platform-mia-prepare-action] insert error", error);
      return new Response(JSON.stringify({ error: "insert_failed", message: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      action_id: inserted.id,
      status: inserted.status,
      preview: inserted.preview,
      is_navigation: isNav,
      narration: isNav ? preview : `${preview}. Confirma?`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[platform-mia-prepare-action] unexpected", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
