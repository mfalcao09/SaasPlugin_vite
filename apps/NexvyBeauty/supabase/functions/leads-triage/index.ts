// Mutação canônica da triagem. A UI chama esta função; nunca escreve
// segment/triagem diretamente no banco.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authenticatePlatformAgent,
  platformCrmCorsHeaders as corsHeaders,
} from "../_shared/platform-crm-auth.ts";
import {
  isCanonicalTriage,
  legacySegmentFromTriage,
  triageFromLegacySegment,
  type CanonicalTriage,
} from "../_shared/platform-crm-triage.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 5000;
const TRIAGES = new Set<CanonicalTriage>([
  "principal",
  "semente",
  "nao_classificado",
  "remocao_confirmada",
]);

type LeadFilters = {
  triagem?: CanonicalTriage;
  derived_stage?: string;
  phone?: "with" | "without";
  suppressed?: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
  const { user, errorResponse } = await authenticatePlatformAgent(
    req,
    sb,
    serviceRoleKey,
    body,
  );
  if (errorResponse) return errorResponse;

  const productId = String(body?.product_id ?? "").trim();
  const triagem = body?.triagem;
  const hasSeedPatch = typeof body?.is_seed === "boolean";
  if (!UUID_RE.test(productId))
    return json({ error: "product_id invalido (UUID)" }, 400);
  if (!isCanonicalTriage(triagem) && !hasSeedPatch)
    return json({ error: "triagem invalida" }, 400);

  const ids = Array.isArray(body?.extracted_lead_ids)
    ? body.extracted_lead_ids
        .map((v: unknown) => String(v).trim())
        .filter((v: string) => UUID_RE.test(v))
    : [];
  const leadIds = Array.isArray(body?.lead_ids)
    ? body.lead_ids
        .map((v: unknown) => String(v).trim())
        .filter((v: string) => UUID_RE.test(v))
    : [];
  const handles = Array.isArray(body?.handles)
    ? body.handles
        .map((v: unknown) => String(v).trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean)
    : [];
  if (
    [ids.length > 0, leadIds.length > 0, handles.length > 0].filter(Boolean)
      .length > 1
  ) {
    return json(
      {
        error:
          "informe apenas uma fonte: extracted_lead_ids, lead_ids ou handles",
      },
      400,
    );
  }
  const filters = (body?.lead_filters ?? {}) as LeadFilters;
  const filterTriagem = filters.triagem;
  if (filterTriagem && !TRIAGES.has(filterTriagem)) {
    return json({ error: "lead_filters.triagem invalida" }, 400);
  }
  if (filters.phone && !["with", "without"].includes(filters.phone)) {
    return json({ error: "lead_filters.phone invalido" }, 400);
  }
  const filterStages = new Set([
    "db",
    "preselected",
    "contacted",
    "remarketing_pool",
    "service",
    "closing",
    "onboarding",
    "do_not_contact",
  ]);
  if (filters.derived_stage && !filterStages.has(filters.derived_stage)) {
    return json({ error: "lead_filters.derived_stage invalido" }, 400);
  }

  let resolvedLeadIds = leadIds;
  if (!ids.length && !leadIds.length && !handles.length) {
    let filterQuery = sb
      .from("platform_crm_lead_operational_snapshot")
      .select("lead_id")
      .eq("product_id", productId)
      .limit(MAX_ROWS);
    if (filterTriagem)
      filterQuery = filterQuery.eq("triagem_summary", filterTriagem);
    if (filters.derived_stage)
      filterQuery = filterQuery.eq("derived_stage", filters.derived_stage);
    if (filters.phone === "with")
      filterQuery = filterQuery.not("phone", "is", null);
    if (filters.phone === "without")
      filterQuery = filterQuery.is("phone", null);
    if (typeof filters.suppressed === "boolean")
      filterQuery = filterQuery.eq("is_suppressed", filters.suppressed);
    const { data: matching, error: filterError } = await filterQuery;
    if (filterError)
      return json({ error: "falha ao resolver filtro de leads" }, 500);
    resolvedLeadIds = (matching ?? []).map(
      (row: { lead_id: string }) => row.lead_id,
    );
  }
  if (ids.length + handles.length + resolvedLeadIds.length > MAX_ROWS)
    return json({ error: `limite de ${MAX_ROWS} linhas` }, 413);

  let query = sb
    .from("platform_crm_extracted_leads")
    .select("id, product_id, handle, segment, triagem")
    .eq("product_id", productId);
  query =
    ids.length > 0
      ? query.in("id", ids)
      : handles.length > 0
        ? query.in("handle", handles)
        : query.in("imported_to_lead_id", resolvedLeadIds);
  const { data: rows, error: readError } = await query;
  if (readError) return json({ error: "falha ao ler leads" }, 500);

  const reason =
    body?.reason == null ? null : String(body.reason).trim().slice(0, 500);
  const source = body?.source === "classifier" ? "classifier" : "human";
  let changed = 0;
  let unchanged = 0;
  for (const row of (rows ?? []) as any[]) {
    const oldTriage: CanonicalTriage = isCanonicalTriage(row.triagem)
      ? row.triagem
      : triageFromLegacySegment(row.segment);
    if (oldTriage === triagem && !reason) {
      unchanged++;
      continue;
    }
    const { error: updateError } = await sb
      .from("platform_crm_extracted_leads")
      .update({
        ...(isCanonicalTriage(triagem)
          ? {
              triagem,
              triagem_reason: reason,
              triagem_source: source,
              triagem_at: new Date().toISOString(),
              triagem_by: user?.id ?? null,
              // Compatibilidade temporária com consumidores legados.
              segment: legacySegmentFromTriage(triagem),
            }
          : {}),
        ...(hasSeedPatch ? { is_seed: body.is_seed } : {}),
      })
      .eq("id", row.id)
      .eq("product_id", productId);
    if (updateError) return json({ error: "falha ao salvar triagem" }, 500);
    if (!isCanonicalTriage(triagem)) {
      changed++;
      continue;
    }
    const { error: historyError } = await sb
      .from("platform_crm_extracted_lead_triage_history")
      .insert({
        extracted_lead_id: row.id,
        product_id: productId,
        from_triagem: oldTriage,
        to_triagem: triagem,
        reason,
        source,
        actor_id: user?.id ?? null,
      });
    if (historyError)
      return json({ error: "falha ao registrar histórico da triagem" }, 500);
    changed++;
  }

  return json({
    ok: true,
    requested: ids.length || handles.length || resolvedLeadIds.length,
    matched: rows?.length ?? 0,
    changed,
    unchanged,
    triagem: triagem ?? null,
    is_seed: hasSeedPatch ? body.is_seed : null,
  });
});
