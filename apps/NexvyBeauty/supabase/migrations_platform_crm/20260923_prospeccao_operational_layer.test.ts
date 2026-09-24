import { assert, assertEquals } from "jsr:@std/assert@1";

const sql = await Deno.readTextFile(
  new URL("./20260923_prospeccao_operational_layer.sql", import.meta.url),
);

Deno.test("cria operações horizontais sem criar segundo estágio", () => {
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.platform_crm_lead_operations"));
  assert(sql.includes("operation_type IN ('enrichment','preselection','handoff','triage_review')"));
  assert(sql.includes("status IN ('queued','running','succeeded','failed','cancelled')"));
  assert(!/ADD COLUMN[^;]*preselected boolean/i.test(sql));
  assert(!sql.includes("ALTER TABLE public.platform_crm_lead_state"));
});

Deno.test("protege idempotência, RLS e alvo de operação", () => {
  assert(sql.includes("UNIQUE (product_id, idempotency_key)"));
  assert(sql.includes("uq_pcrm_lead_operations_active_target"));
  assert(sql.includes("platform_crm_lead_operations_super_admin_only"));
  assert(sql.includes("lead_id IS NOT NULL OR extracted_lead_id IS NOT NULL"));
});

Deno.test("snapshot lê derived_stage e expõe perfis do card", () => {
  assert(sql.includes("platform_crm_lead_operational_snapshot"));
  assert(sql.includes("s.derived_stage"));
  assert(sql.includes("imported_to_lead_id = l.id"));
  assert(sql.includes("platform_crm_campaign_targets"));
  assert(sql.includes("platform_crm_lead_optout"));
  assertEquals(sql.includes("current_stage_id ="), false);
});
