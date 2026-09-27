// Leitura agregada da nova Base de Leads. Regras de escrita ficam nas EFs.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authenticatePlatformAgent,
  platformCrmCorsHeaders as corsHeaders,
} from "../_shared/platform-crm-auth.ts";
import {
  type BaseLeadFilters,
  matchesBaseLeadFilters,
  normalizeBrazilianMobile,
  parseBaseLeadFilters,
} from "../_shared/leads-base-filters.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SnapshotOperation = {
  id: string;
  type: string;
  status: string;
  requested_at: string;
};

async function readAll<T>(
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0;; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) {
      console.error("operational snapshot paginated query failed", {
        code: error.code ?? null,
        message: error.message ?? "unknown database error",
        details: error.details ?? null,
        from,
      });
      throw error;
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
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
  try {
    const baseMode = body?.mode === "base";
    const limit = Math.min(
      Math.max(Number(body?.limit) || (baseMode ? 50 : 100), 1),
      baseMode ? 100 : 500,
    );
    const offset = Math.max(Number(body?.offset) || 0, 0);
    let baseFilters: BaseLeadFilters = {};
    if (baseMode) {
      try {
        baseFilters = parseBaseLeadFilters(body?.filters ?? {});
      } catch (error) {
        return json({
          error: error instanceof Error ? error.message : "filtros invalidos",
        }, 400);
      }
    }
    const sortBy =
      ["name", "handle", "followers", "phone", "stage", "updated_at"].includes(
          String(body?.sort_by),
        )
        ? String(body.sort_by)
        : "updated_at";
    const sortDirection = body?.sort_direction === "desc" ? -1 : 1;
    let snapshotData: any[] = [];
    if (!baseMode) {
      let query = sb
        .from("platform_crm_lead_operational_snapshot")
        .select("*")
        .eq("product_id", productId)
        .range(offset, offset + limit - 1)
        .order("updated_at", { ascending: false });
      if (body?.derived_stage) {
        query = query.eq("derived_stage", String(body.derived_stage));
      }
      if (body?.triagem_summary) {
        query = query.eq("triagem_summary", String(body.triagem_summary));
      }
      if (body?.suppressed === true) query = query.eq("is_suppressed", true);
      if (body?.suppressed === false) query = query.eq("is_suppressed", false);
      const { data, error } = await query;
      if (error) {
        return json({ error: "falha ao carregar snapshot operacional" }, 500);
      }
      snapshotData = (data ?? []) as any[];
    }

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
          .range(from, to)
      ),
      readAll<{
        id: string;
        lead_id: string | null;
        operation_type: string;
        status: string;
        requested_at: string;
      }>((from, to) =>
        sb
          .from("platform_crm_lead_operations")
          .select("id, lead_id, operation_type, status, requested_at")
          .eq("product_id", productId)
          .in("status", ["queued", "running"])
          .not("lead_id", "is", null)
          .range(from, to)
      ),
      readAll<{
        id: string;
        name: string;
        phone: string | null;
        source: string | null;
        updated_at: string;
      }>((from, to) =>
        sb
          .from("platform_crm_leads")
          .select("id, name, phone, source, updated_at")
          .eq("product_id", productId)
          .range(from, to)
      ),
      readAll<{
        id: string;
        imported_to_lead_id: string | null;
        handle: string | null;
        triagem: string | null;
        telefone: string | null;
        whatsapp_link: string | null;
        seguidores: number | null;
        extraction_id: string;
      }>((from, to) =>
        sb
          .from("platform_crm_extracted_leads")
          .select(
            "id, imported_to_lead_id, handle, triagem, telefone, whatsapp_link, seguidores, extraction_id",
          )
          .eq("product_id", productId)
          .not("imported_to_lead_id", "is", null)
          .range(from, to)
      ),
      readAll<{ telefone: string | null; handle: string | null }>((from, to) =>
        sb
          .from("platform_crm_lead_optout")
          .select("telefone, handle")
          .eq("product_id", productId)
          .range(from, to)
      ),
      readAll<{ id: string; status: string | null }>((from, to) =>
        sb
          .from("platform_crm_campaigns")
          .select("id, status")
          .eq("product_id", productId)
          .range(from, to)
      ),
    ]);
    if (leadCount.error || phoneCount.error) {
      const failure = leadCount.error ?? phoneCount.error;
      console.error("operational snapshot count query failed", failure);
      return json({
        error: "Falha ao consultar os totais da base.",
        code: failure?.code ?? null,
      }, 500);
    }

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
    const byTriagem = Object.fromEntries(
      triagens.map((triagem) => [triagem, 0]),
    );
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
    const activeOperationsByLead = new Map<string, SnapshotOperation[]>();
    for (const row of operationRows) {
      if (!row.lead_id) continue;
      const operations = activeOperationsByLead.get(row.lead_id) ?? [];
      operations.push({
        id: row.id,
        type: row.operation_type,
        status: row.status,
        requested_at: row.requested_at,
      });
      activeOperationsByLead.set(row.lead_id, operations);
    }
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
    for (const lead of leadRows) {
      if (lead.phone && optoutPhones.has(String(lead.phone))) {
        suppressedLeadIds.add(String(lead.id));
      }
    }
    for (const profile of profileRows) {
      if (
        profile.imported_to_lead_id &&
        profile.handle &&
        optoutHandles.has(
          String(profile.handle).replace(/^@/, "").toLowerCase(),
        )
      ) {
        suppressedLeadIds.add(String(profile.imported_to_lead_id));
      }
    }
    const stagesByLead = new Map(
      stateRows.map((row) => [String(row.lead_id), row.derived_stage]),
    );
    const baseRows = baseMode
      ? leadRows.map((lead) => {
        const profiles = profilesByLead.get(lead.id) ?? [];
        const values = triagemByLead.get(lead.id) ?? [];
        const triagemSummary = values.includes("principal")
          ? "principal"
          : values.includes("semente")
          ? "semente"
          : values.length > 0 &&
              values.every((value) => value === "remocao_confirmada")
          ? "remocao_confirmada"
          : "nao_classificado";
        return {
          lead_id: lead.id,
          name: lead.name,
          phone: lead.phone,
          phone_normalized: normalizeBrazilianMobile(lead.phone),
          source: lead.source,
          updated_at: lead.updated_at,
          derived_stage: stagesByLead.get(lead.id) ?? null,
          triagem_summary: triagemSummary,
          profile_count: profiles.length,
          followers_count: profiles.reduce(
            (sum, profile) =>
              sum + Math.max(0, Number(profile.seguidores) || 0),
            0,
          ),
          profiles: profiles.map((profile) => ({
            id: profile.id,
            handle: profile.handle,
            triagem: profile.triagem,
            telefone: profile.telefone,
            seguidores: profile.seguidores,
            origem: profile.extraction_id,
          })),
          active_operation_count: activeOperationsByLead.get(lead.id)?.length ??
            0,
          active_operations: activeOperationsByLead.get(lead.id) ?? [],
          recent_operations: activeOperationsByLead.get(lead.id) ?? [],
          is_suppressed: suppressedLeadIds.has(lead.id),
        };
      })
      : [];
    const filteredBaseRows = baseMode
      ? baseRows.filter((row) => matchesBaseLeadFilters(row, baseFilters))
      : [];
    if (baseMode) {
      const compareText = (left: string, right: string) =>
        left.localeCompare(right, "pt-BR", {
          sensitivity: "base",
          numeric: true,
        });
      filteredBaseRows.sort((left, right) => {
        if (sortBy === "phone") {
          const a = left.phone_normalized ?? "";
          const b = right.phone_normalized ?? "";
          if (!a && b) return 1;
          if (a && !b) return -1;
          return compareText(a, b) * sortDirection ||
            compareText(left.name, right.name);
        }
        if (sortBy === "followers") {
          return (left.followers_count - right.followers_count) *
              sortDirection || compareText(left.name, right.name);
        }
        if (sortBy === "handle") {
          return compareText(
                left.profiles[0]?.handle ?? "",
                right.profiles[0]?.handle ?? "",
              ) * sortDirection || compareText(left.name, right.name);
        }
        if (sortBy === "stage") {
          return compareText(
                left.derived_stage ?? "db",
                right.derived_stage ?? "db",
              ) * sortDirection || compareText(left.name, right.name);
        }
        if (sortBy === "updated_at") {
          return compareText(left.updated_at, right.updated_at) *
              sortDirection || compareText(left.name, right.name);
        }
        return compareText(left.name, right.name) * sortDirection;
      });
    }
    const campaignIds = campaignRows.map((row) => String(row.id));
    let campaignProblems = campaignRows.filter((row) =>
      ["paused", "failed"].includes(String(row.status))
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
              .in("status", [
                "queued",
                "sending",
                "sent",
                "responded",
                "failed",
              ])
              .range(from, to),
        );
        campaignActivity = new Set(targets.map((row) =>
          String(row.lead_id)
        ))
          .size;
        const failedTargets = targets.filter(
          (row) => row.status === "failed",
        ).length;
        if (failedTargets > 0) {
          // Keep this count operational: one campaign with any failed target is one problem.
          // The detail remains available in Campanhas & disparos.
          if (campaignProblems === 0) campaignProblems = 1;
        }
      } catch (error) {
        console.error(
          "operational snapshot campaign aggregation failed",
          error,
        );
        return json({ error: "falha ao calcular atividade de campanhas" }, 500);
      }
    }
    const completedAt = new Date().toISOString();
    let refreshAudit: unknown = null;
    if (!baseMode || body?.audit_refresh === true) {
      const result = await sb
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
      if (result.error || !result.data) {
        console.error("snapshot refresh audit failed", result.error);
        return json({ error: "falha ao registrar auditoria do snapshot" }, 500);
      }
      refreshAudit = result.data;
    }
    return json({
      ok: true,
      data: baseMode
        ? filteredBaseRows.slice(offset, offset + limit)
        : snapshotData,
      total: baseMode ? filteredBaseRows.length : (leadCount.count ?? 0),
      filtered_total: baseMode ? filteredBaseRows.length : undefined,
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
  } catch (error) {
    const failure = error as {
      message?: string;
      code?: string;
      details?: string;
    };
    console.error("operational snapshot request failed", {
      code: failure?.code ?? null,
      message: failure?.message ?? String(error),
      details: failure?.details ?? null,
    });
    return json({
      error: "Não foi possível carregar a base de leads. Tente atualizar.",
    }, 500);
  }
});
