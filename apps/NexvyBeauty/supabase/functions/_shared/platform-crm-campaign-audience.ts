// _shared/platform-crm-campaign-audience.ts
//
// Porte 1:1 de `_shared/campaign-audience.ts` do CRM Vendus para o CRM de
// PLATAFORMA (super_admin), DESACOPLADO do tenant.
//
// 🔒 REGRA MÁXIMA: zero tabela de tenant. Só platform_crm_leads /
// platform_crm_lead_tag_assignments.
//
// Diferenças de schema vs. tenant (mapeamento 1:1 quando existe par):
//   * leads                 → platform_crm_leads (SEM organization_id — tenant-of-one)
//   * lead_tag_assignments  → platform_crm_lead_tag_assignments (sem join de org)
//   * stage_ids             → coluna `current_stage_id` (mesma do original)
//   * last_interaction_*    → coluna `last_contact_at` (a plataforma não tem
//                             `last_interaction_at`; par semântico mais próximo)
//   * has_phone             → o canal da plataforma é WEBCHAT (sem WhatsApp).
//                             O default do original ("exigir telefone normalizável
//                             a menos que has_phone === false") excluiria leads
//                             perfeitamente alcançáveis via webchat. Aqui o gate
//                             de telefone só se aplica quando has_phone === true
//                             (explícito). TODO(whatsapp): ao plugar WhatsApp na
//                             plataforma, restaurar o default do original.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhoneBR } from "./phone.ts";

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
const MAX_ROWS = 500_000; // safety guard

// Paginates a PostgREST query builder beyond the server's max-rows cap.
// `build` must return a fresh builder each call so filters can be re-applied.
async function fetchAllPages<T = any>(
  build: () => any,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (from < MAX_ROWS) {
    const to = from + PAGE - 1;
    const { data, error } = await build().range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function fetchLeadIdsByTags(
  supabase: SupabaseClient,
  tagIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!tagIds.length) return out;
  const rows = await fetchAllPages<any>(() =>
    supabase
      .from("platform_crm_lead_tag_assignments")
      .select("lead_id, tag_id")
      .in("tag_id", tagIds),
  );
  rows.forEach((row: any) => out.add(row.lead_id));
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

function applyAudienceFilters(q: any, audience: CampaignFilters) {
  if (audience.origins?.length) q = q.in("lead_origin", audience.origins);
  if (audience.channels?.length) q = q.in("lead_channel", audience.channels);
  if (audience.stage_ids?.length) q = q.in("current_stage_id", audience.stage_ids);
  if (audience.assigned_to?.length) q = q.in("assigned_to", audience.assigned_to);
  if (audience.temperature?.length) q = q.in("temperature", audience.temperature);
  if (audience.created_after) q = q.gte("created_at", audience.created_after);
  if (audience.created_before) q = q.lte("created_at", audience.created_before);
  if (audience.last_interaction_after) q = q.gte("last_contact_at", audience.last_interaction_after);
  if (audience.last_interaction_before) q = q.lte("last_contact_at", audience.last_interaction_before);
  // Plataforma = webchat: telefone só é exigido quando pedido explicitamente.
  if (audience.has_phone === true) q = q.not("phone", "is", null);
  if (audience.search?.name) q = q.ilike("name", `%${audience.search.name}%`);
  if (audience.search?.email) q = q.ilike("email", `%${audience.search.email}%`);
  if (audience.search?.phone) q = q.ilike("phone", `%${audience.search.phone}%`);
  return q;
}

function applyExclusionFilters(q: any, exclusion: CampaignFilters) {
  if (exclusion.origins?.length) q = q.in("lead_origin", exclusion.origins);
  if (exclusion.channels?.length) q = q.in("lead_channel", exclusion.channels);
  if (exclusion.stage_ids?.length) q = q.in("current_stage_id", exclusion.stage_ids);
  if (exclusion.assigned_to?.length) q = q.in("assigned_to", exclusion.assigned_to);
  if (exclusion.temperature?.length) q = q.in("temperature", exclusion.temperature);
  if (exclusion.created_after) q = q.gte("created_at", exclusion.created_after);
  if (exclusion.created_before) q = q.lte("created_at", exclusion.created_before);
  return q;
}

export async function resolveAudience(
  supabase: SupabaseClient,
  audience: CampaignFilters,
  exclusion: CampaignFilters,
): Promise<{ leadIds: string[]; total: number; excluded: number }> {
  let baseRows: any[] = [];

  if (audience.lead_ids?.length) {
    // Chunk IN() in safe batches and paginate each chunk.
    const chunks: string[][] = [];
    for (let i = 0; i < audience.lead_ids.length; i += 500) {
      chunks.push(audience.lead_ids.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      const rows = await fetchAllPages<any>(() =>
        supabase
          .from("platform_crm_leads")
          .select("id, phone, metadata")
          .in("id", chunk),
      );
      baseRows.push(...rows);
    }
  } else {
    baseRows = await fetchAllPages<any>(() =>
      applyAudienceFilters(
        supabase.from("platform_crm_leads").select("id, phone, metadata"),
        audience,
      ),
    );

    if (audience.tag_ids?.length) {
      const tagged = await fetchLeadIdsByTags(supabase, audience.tag_ids);
      baseRows = baseRows.filter((r) => tagged.has(r.id));
    }
  }

  // No original o canal padrão era WhatsApp → sem telefone normalizável BR não
  // dava pra enviar. Na plataforma o canal é webchat: só filtra telefone quando
  // o filtro pediu explicitamente. TODO(whatsapp): restaurar default original.
  if (audience.has_phone === true) {
    baseRows = baseRows.filter((r) => !!normalizePhoneBR((r as any).phone));
  }

  if (audience.custom_fields?.length) {
    const keep = applyCustomFields(baseRows, audience.custom_fields);
    baseRows = baseRows.filter((r) => keep.has(r.id));
  }

  const baseIds = baseRows.map((r) => r.id);
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
    let rows = await fetchAllPages<any>(() =>
      applyExclusionFilters(
        supabase.from("platform_crm_leads").select("id, metadata"),
        exclusion,
      ),
    );
    if (exclusion.custom_fields?.length) {
      const keep = applyCustomFields(rows, exclusion.custom_fields);
      rows = rows.filter((r) => keep.has(r.id));
    }
    rows.forEach((r: any) => toExclude.add(r.id));
  }

  if (exclusion.tag_ids?.length) {
    const tagged = await fetchLeadIdsByTags(supabase, exclusion.tag_ids);
    tagged.forEach((id) => toExclude.add(id));
  }

  const finalIds = baseIds.filter((id) => !toExclude.has(id));
  return { leadIds: finalIds, total, excluded: total - finalIds.length };
}

export function createServiceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
