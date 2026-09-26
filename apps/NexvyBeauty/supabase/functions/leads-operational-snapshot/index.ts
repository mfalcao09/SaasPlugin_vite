// Leitura agregada da nova Base de Leads. Regras de escrita ficam nas EFs.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authenticatePlatformAgent,
  platformCrmCorsHeaders as corsHeaders,
} from "../_shared/platform-crm-auth.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readAll<T>(
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const requestedAt = new Date().toISOString();
  const body = await req.json().catch(() => ({}));
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
  const { errorResponse } = await authenticatePlatformAgent(
    req,
    sb,
    serviceRoleKey,
    body,
  );
  if (errorResponse) return errorResponse;

  const productId = String(body?.product_id ?? "").trim();
  if (!productId) return json({ error: "product_id obrigatorio" }, 400);
  const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 500);
  const offset = Math.max(Number(body?.offset) || 0, 0);
  let query = sb
    .from("platform_crm_lead_operational_snapshot")
    .select("*")
    .eq("product_id", productId)
    .range(offset, offset + limit - 1)
    .order("updated_at", { ascending: false });
  if (body?.derived_stage)
    query = query.eq("derived_stage", String(body.derived_stage));
  if (body?.triagem_summary)
    query = query.eq("triagem_summary", String(body.triagem_summary));
  if (body?.suppressed === true) query = query.eq("is_suppressed", true);
  if (body?.suppressed === false) query = query.eq("is_suppressed", false);
  const { data, error } = await query;
  if (error)
    return json({ error: "falha ao carregar snapshot operacional" }, 500);

  const stages = [
    "db",
    "preselected",
    "contacted",
    "remarketing_pool",
    "service",
    "closing",
    "onboarding",
    "do_not_contact",
  ];
  const triagens = [
    "principal",
    "semente",
    "nao_classificado",
    "remocao_confirmada",
  ];
  const [
    leadCount,
    phoneCount,
    stateRows,
    operationRows,
    leadRows,
    profileRows,
    optoutRows,
    campaignRows,
  ] = await Promise.all([
    sb
      .from("platform_crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    sb
      .from("platform_crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .not("phone", "is", null),
    readAll<{ lead_id: string; derived_stage: string | null }>((from, to) =>
      sb
        .from("platform_crm_lead_state")
        .select("lead_id, derived_stage")
        .eq("product_id", productId)
        .range(from, to),
    ),
    readAll<{ lead_id: string | null }>((from, to) =>
      sb
        .from("platform_crm_lead_operations")
        .select("lead_id")
        .eq("product_id", productId)
        .in("status", ["queued", "running"])
        .not("lead_id", "is", null)
        .range(from, to),
    ),
    readAll<{ id: string; phone: string | null }>((from, to) =>
      sb
        .from("platform_crm_leads")
        .select("id, phone")
        .eq("product_id", productId)
        .range(from, to),
    ),
    readAll<{
      id: string;
      imported_to_lead_id: string | null;
      handle: string | null;
      triagem: string | null;
      telefone: string | null;
      whatsapp_link: string | null;
    }>((from, to) =>
      sb
        .from("platform_crm_extracted_leads")
        .select(
          "id, imported_to_lead_id, handle, triagem, telefone, whatsapp_link",
        )
        .eq("product_id", productId)
        .not("imported_to_lead_id", "is", null)
        .range(from, to),
    ),
    readAll<{ telefone: string | null; handle: string | null }>((from, to) =>
      sb
        .from("platform_crm_lead_optout")
        .select("telefone, handle")
        .eq("product_id", productId)
        .range(from, to),
    ),
    readAll<{ id: string; status: string | null }>((from, to) =>
      sb
        .from("platform_crm_campaigns")
        .select("id, status")
        .eq("product_id", productId)
        .range(from, to),
    ),
  ]);
  if (leadCount.error || phoneCount.error)
    return json({ error: "falha ao calcular resumo operacional" }, 500);

  const byStage = Object.fromEntries(stages.map((stage) => [stage, 0]));
  for (const row of stateRows) {
    const stage = String(row.derived_stage ?? "db");
    if (stage in byStage) byStage[stage] += 1;
  }
  const triagemByLead = new Map<string, string[]>();
  const profilesByLead = new Map<string, typeof profileRows>();
  for (const row of profileRows) {
    const leadId = String(row.imported_to_lead_id);
    const values = triagemByLead.get(leadId) ?? [];
    values.push(String(row.triagem ?? "nao_classificado"));
    triagemByLead.set(leadId, values);
    const profiles = profilesByLead.get(leadId) ?? [];
    profiles.push(row);
    profilesByLead.set(leadId, profiles);
  }
  const byTriagem = Object.fromEntries(triagens.map((triagem) => [triagem, 0]));
  const byTriagemWithPhone = Object.fromEntries(
    triagens.map((triagem) => [triagem, 0]),
  );
  const byTriagemWithoutPhone = Object.fromEntries(
    triagens.map((triagem) => [triagem, 0]),
  );
  const enrichmentPendingLeadIds = new Set<string>();
  for (const lead of leadRows) {
    const values = triagemByLead.get(String(lead.id)) ?? [];
    const summary = values.includes("principal")
      ? "principal"
      : values.includes("semente")
        ? "semente"
        : values.length > 0 &&
            values.every((value) => value === "remocao_confirmada")
          ? "remocao_confirmada"
          : "nao_classificado";
    byTriagem[summary] += 1;
    if (lead.phone) byTriagemWithPhone[summary] += 1;
    else byTriagemWithoutPhone[summary] += 1;
    const profiles = profilesByLead.get(String(lead.id)) ?? [];
    if (
      profiles.length > 0 &&
      profiles.every((profile) => !profile.telefone && !profile.whatsapp_link)
    ) {
      enrichmentPendingLeadIds.add(String(lead.id));
    }
  }
  const activeLeadIds = new Set(
    operationRows.map((row) => String(row.lead_id)),
  );
  const optoutPhones = new Set(
    optoutRows
      .map((row) => row.telefone)
      .filter(Boolean)
      .map(String),
  );
  const optoutHandles = new Set(
    optoutRows
      .filter((row) => !row.telefone && row.handle)
      .map((row) => String(row.handle).replace(/^@/, "").toLowerCase()),
  );
  const suppressedLeadIds = new Set<string>();
  for (const lead of leadRows)
    if (lead.phone && optoutPhones.has(String(lead.phone)))
      suppressedLeadIds.add(String(lead.id));
  for (const profile of profileRows) {
    if (
      profile.imported_to_lead_id &&
      profile.handle &&
      optoutHandles.has(String(profile.handle).replace(/^@/, "").toLowerCase())
    )
      suppressedLeadIds.add(String(profile.imported_to_lead_id));
  }
  const campaignIds = campaignRows.map((row) => String(row.id));
  let campaignProblems = campaignRows.filter((row) =>
    ["paused", "failed"].includes(String(row.status)),
  ).length;
  let campaignActivity = 0;
  if (campaignIds.length) {
    try {
      const targets = await readAll<{ lead_id: string; status: string }>(
        (from, to) =>
          sb
            .from("platform_crm_campaign_targets")
            .select("lead_id, status")
            .in("campaign_id", campaignIds)
            .in("status", ["queued", "sending", "sent", "responded", "failed"])
            .range(from, to),
      );
      campaignActivity = new Set(targets.map((row) => String(row.lead_id)))
        .size;
      const failedTargets = targets.filter(
        (row) => row.status === "failed",
      ).length;
      if (failedTargets > 0) {
        // Keep this count operational: one campaign with any failed target is one problem.
        // The detail remains available in Campanhas & disparos.
        if (campaignProblems === 0) campaignProblems = 1;
      }
    } catch (_) {
      return json({ error: "falha ao calcular atividade de campanhas" }, 500);
    }
  }
  const completedAt = new Date().toISOString();
  const { data: refreshAudit, error: refreshAuditError } = await sb
    .from("platform_crm_snapshot_refresh_audit")
    .insert({
      function_name: "leads-operational-snapshot",
      product_id: productId,
      requested_at: requestedAt,
      completed_at: completedAt,
      status: "success",
    })
    .select(
      "function_name, product_id, requested_at, completed_at, status, snapshot_version",
    )
    .single();
  if (refreshAuditError || !refreshAudit) {
    console.error("snapshot refresh audit failed", refreshAuditError);
    return json({ error: "falha ao registrar auditoria do snapshot" }, 500);
  }
  return json({
    ok: true,
    data: data ?? [],
    total: leadCount.count ?? 0,
    limit,
    offset,
    summary: {
      total_cards: leadCount.count ?? 0,
      by_stage: byStage,
      by_triagem: byTriagem,
      by_triagem_with_phone: byTriagemWithPhone,
      by_triagem_without_phone: byTriagemWithoutPhone,
      enrichment_pending: enrichmentPendingLeadIds.size,
      active_operations: activeLeadIds.size,
      suppressed: suppressedLeadIds.size,
      campaign_activity: campaignActivity,
      campaign_problems: campaignProblems,
      with_phone: phoneCount.count ?? 0,
    },
    audit: refreshAudit,
  });
});
