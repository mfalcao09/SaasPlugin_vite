// Resolve audience and exclusion filters server-side.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type CustomFieldFilter = { key: string; op: string; value: any };

export type CampaignFilters = {
  lead_ids?: string[];
  origins?: string[];
  channels?: string[];
  stage_ids?: string[];
  assigned_to?: string[];
  temperature?: string[];
  tag_ids?: string[];
  created_after?: string;
  created_before?: string;
  last_interaction_after?: string;
  last_interaction_before?: string;
  custom_fields?: CustomFieldFilter[];
  has_phone?: boolean;
  search?: { name?: string; email?: string; phone?: string };
};

const PAGE = 1000;

async function fetchLeadIdsByTags(
  supabase: SupabaseClient,
  organizationId: string,
  tagIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!tagIds.length) return out;
  const { data } = await supabase
    .from("lead_tag_assignments")
    .select("lead_id, tag_id, leads!inner(organization_id)")
    .in("tag_id", tagIds)
    .eq("leads.organization_id", organizationId);
  (data ?? []).forEach((row: any) => out.add(row.lead_id));
  return out;
}

function matchCustomField(value: any, op: string, target: any): boolean {
  const isEmpty = value === undefined || value === null || String(value).trim() === "";
  switch (op) {
    case "is_empty": return isEmpty;
    case "is_filled": return !isEmpty;
    case "eq": return String(value ?? "") === String(target ?? "");
    case "neq": return String(value ?? "") !== String(target ?? "");
    case "contains": return String(value ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "gt": return Number(value) > Number(target);
    case "gte": return Number(value) >= Number(target);
    case "lt": return Number(value) < Number(target);
    case "lte": return Number(value) <= Number(target);
    case "between": {
      const [a, b] = Array.isArray(target) ? target : [target?.from, target?.to];
      const n = Number(value);
      return n >= Number(a) && n <= Number(b);
    }
    default: return false;
  }
}

function applyCustomFields(rows: any[], filters: CustomFieldFilter[]): Set<string> {
  const keep = new Set<string>();
  for (const r of rows) {
    const cf = r?.metadata?.custom_fields ?? {};
    const ok = filters.every((f) => matchCustomField(cf[f.key], f.op, f.value));
    if (ok) keep.add(r.id);
  }
  return keep;
}

export async function resolveAudience(
  supabase: SupabaseClient,
  organizationId: string,
  audience: CampaignFilters,
  exclusion: CampaignFilters,
): Promise<{ leadIds: string[]; total: number; excluded: number }> {
  let baseRows: any[] = [];

  if (audience.lead_ids?.length) {
    const { data } = await supabase
      .from("leads")
      .select("id, metadata")
      .eq("organization_id", organizationId)
      .in("id", audience.lead_ids);
    baseRows = data ?? [];
  } else {
    let q = supabase
      .from("leads")
      .select("id, metadata", { count: "exact" })
      .eq("organization_id", organizationId)
      .limit(PAGE * 50);

    if (audience.origins?.length) q = q.in("lead_origin", audience.origins);
    if (audience.channels?.length) q = q.in("lead_channel", audience.channels);
    if (audience.stage_ids?.length) q = q.in("current_stage_id", audience.stage_ids);
    if (audience.assigned_to?.length) q = q.in("assigned_to", audience.assigned_to);
    if (audience.temperature?.length) q = q.in("temperature", audience.temperature);
    if (audience.created_after) q = q.gte("created_at", audience.created_after);
    if (audience.created_before) q = q.lte("created_at", audience.created_before);
    if (audience.last_interaction_after) q = q.gte("last_interaction_at", audience.last_interaction_after);
    if (audience.last_interaction_before) q = q.lte("last_interaction_at", audience.last_interaction_before);
    if (audience.has_phone !== false) q = q.not("phone", "is", null);
    if (audience.search?.name) q = q.ilike("name", `%${audience.search.name}%`);
    if (audience.search?.email) q = q.ilike("email", `%${audience.search.email}%`);
    if (audience.search?.phone) q = q.ilike("phone", `%${audience.search.phone}%`);

    const { data } = await q;
    baseRows = data ?? [];

    if (audience.tag_ids?.length) {
      const tagged = await fetchLeadIdsByTags(supabase, organizationId, audience.tag_ids);
      baseRows = baseRows.filter((r) => tagged.has(r.id));
    }
  }

  if (audience.custom_fields?.length) {
    const keep = applyCustomFields(baseRows, audience.custom_fields);
    baseRows = baseRows.filter((r) => keep.has(r.id));
  }

  let baseIds = baseRows.map((r) => r.id);
  const total = baseIds.length;

  // Exclusion
  const toExclude = new Set<string>();
  if (exclusion.lead_ids?.length) exclusion.lead_ids.forEach((id) => toExclude.add(id));

  const hasExclusionLeadQuery =
    exclusion.origins?.length ||
    exclusion.channels?.length ||
    exclusion.stage_ids?.length ||
    exclusion.assigned_to?.length ||
    exclusion.temperature?.length ||
    exclusion.created_after ||
    exclusion.created_before ||
    exclusion.custom_fields?.length;

  if (hasExclusionLeadQuery) {
    let q = supabase.from("leads").select("id, metadata").eq("organization_id", organizationId).limit(PAGE * 50);
    if (exclusion.origins?.length) q = q.in("lead_origin", exclusion.origins);
    if (exclusion.channels?.length) q = q.in("lead_channel", exclusion.channels);
    if (exclusion.stage_ids?.length) q = q.in("current_stage_id", exclusion.stage_ids);
    if (exclusion.assigned_to?.length) q = q.in("assigned_to", exclusion.assigned_to);
    if (exclusion.temperature?.length) q = q.in("temperature", exclusion.temperature);
    if (exclusion.created_after) q = q.gte("created_at", exclusion.created_after);
    if (exclusion.created_before) q = q.lte("created_at", exclusion.created_before);
    const { data } = await q;
    let rows = data ?? [];
    if (exclusion.custom_fields?.length) {
      const keep = applyCustomFields(rows, exclusion.custom_fields);
      rows = rows.filter((r) => keep.has(r.id));
    }
    rows.forEach((r: any) => toExclude.add(r.id));
  }

  if (exclusion.tag_ids?.length) {
    const tagged = await fetchLeadIdsByTags(supabase, organizationId, exclusion.tag_ids);
    tagged.forEach((id) => toExclude.add(id));
  }

  const finalIds = baseIds.filter((id) => !toExclude.has(id));
  return { leadIds: finalIds, total, excluded: total - finalIds.length };
}

export function createServiceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
