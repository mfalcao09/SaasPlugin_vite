// _shared/platform-crm-audience.ts
//
// Porte 1:1 do `_shared/campaign-audience.ts` do CRM Vendus para o CRM de
// PLATAFORMA (super_admin), DESACOPLADO do tenant:
//   * Tabelas: platform_crm_leads / platform_crm_lead_tag_assignments.
//     SEM organization_id (o CRM de plataforma é global).
//   * Colunas mapeadas: lead_origin, lead_channel, current_stage_id,
//     assigned_to, temperature, created_at, metadata.custom_fields — 1:1.
//     `last_interaction_after/before` → `last_contact_at` (nome da coluna na
//     plataforma; o tenant chamava `last_interaction_at`).
//   * Filtro de telefone: o original EXIGIA telefone BR normalizável por
//     default (canal padrão do tenant = WhatsApp). A plataforma ainda NÃO tem
//     WhatsApp conectado — o canal de entrega é o webchat — então aqui o gate
//     de telefone só é aplicado quando `has_phone === true` explicitamente.
//     TODO(whatsapp): restaurar o default `has_phone !== false` quando o canal
//     WhatsApp da plataforma existir.
//
// 🔒 ZERO tabela de tenant.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { normalizePhoneBR } from "./phone.ts";

export type CustomFieldFilter = { key: string; op: string; value: any };

export type PlatformCadenceFilters = {
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
const MAX_ROWS = 500_000; // safety guard (1:1)

// Pagina um query builder do PostgREST além do max-rows do servidor.
// `build` precisa retornar um builder novo a cada chamada (filtros re-aplicados).
async function fetchAllPages<T = any>(build: () => any): Promise<T[]> {
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
  // 1:1 sem o join leads!inner(organization_id) — plataforma não tem org.
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

function applyAudienceFilters(q: any, audience: PlatformCadenceFilters) {
  if (audience.origins?.length) q = q.in("lead_origin", audience.origins);
  if (audience.channels?.length) q = q.in("lead_channel", audience.channels);
  if (audience.stage_ids?.length) q = q.in("current_stage_id", audience.stage_ids);
  if (audience.assigned_to?.length) q = q.in("assigned_to", audience.assigned_to);
  if (audience.temperature?.length) q = q.in("temperature", audience.temperature);
  if (audience.created_after) q = q.gte("created_at", audience.created_after);
  if (audience.created_before) q = q.lte("created_at", audience.created_before);
  if (audience.last_interaction_after) q = q.gte("last_contact_at", audience.last_interaction_after);
  if (audience.last_interaction_before) q = q.lte("last_contact_at", audience.last_interaction_before);
  // Plataforma: gate de telefone só quando pedido explicitamente (ver header).
  if (audience.has_phone === true) q = q.not("phone", "is", null);
  if (audience.search?.name) q = q.ilike("name", `%${audience.search.name}%`);
  if (audience.search?.email) q = q.ilike("email", `%${audience.search.email}%`);
  if (audience.search?.phone) q = q.ilike("phone", `%${audience.search.phone}%`);
  return q;
}

function applyExclusionFilters(q: any, exclusion: PlatformCadenceFilters) {
  if (exclusion.origins?.length) q = q.in("lead_origin", exclusion.origins);
  if (exclusion.channels?.length) q = q.in("lead_channel", exclusion.channels);
  if (exclusion.stage_ids?.length) q = q.in("current_stage_id", exclusion.stage_ids);
  if (exclusion.assigned_to?.length) q = q.in("assigned_to", exclusion.assigned_to);
  if (exclusion.temperature?.length) q = q.in("temperature", exclusion.temperature);
  if (exclusion.created_after) q = q.gte("created_at", exclusion.created_after);
  if (exclusion.created_before) q = q.lte("created_at", exclusion.created_before);
  return q;
}

export async function resolvePlatformAudience(
  supabase: SupabaseClient,
  audience: PlatformCadenceFilters,
  exclusion: PlatformCadenceFilters,
): Promise<{ leadIds: string[]; total: number; excluded: number }> {
  let baseRows: any[] = [];

  if (audience.lead_ids?.length) {
    // Chunk IN() em lotes seguros e pagina cada chunk (1:1).
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

  // Original: excluía leads sem telefone BR normalizável por default (canal
  // WhatsApp do tenant). Plataforma: só quando has_phone === true (canal =
  // webchat). TODO(whatsapp): voltar ao default quando houver canal WhatsApp.
  if (audience.has_phone === true) {
    baseRows = baseRows.filter((r) => !!normalizePhoneBR((r as any).phone));
  }

  if (audience.custom_fields?.length) {
    const keep = applyCustomFields(baseRows, audience.custom_fields);
    baseRows = baseRows.filter((r) => keep.has(r.id));
  }

  const baseIds = baseRows.map((r) => r.id);
  const total = baseIds.length;

  // Exclusion (1:1)
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

export function createPlatformServiceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
