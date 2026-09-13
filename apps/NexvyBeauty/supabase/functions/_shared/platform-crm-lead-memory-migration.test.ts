import { assertEquals } from "jsr:@std/assert@1";

const migrationUrl = new URL(
  "../../migrations_platform_crm/20260912_platform_crm_lead_state_and_memory.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

Deno.test("PRD-03 migration does not claim it was applied", () => {
  assertEquals(sql.includes("-- Applied:"), false);
});

Deno.test("PRD-03 migration uses object consent and provenance foreign keys", () => {
  assertEquals(
    /consents\s+jsonb\s+NOT NULL DEFAULT '\{\}'::jsonb/.test(sql),
    true,
  );
  assertEquals(
    /source_message_id\s+uuid[\s\S]*REFERENCES public\.platform_crm_messages/
      .test(
        sql,
      ),
    true,
  );
  assertEquals(
    /conversation_id\s+uuid[\s\S]*REFERENCES public\.platform_crm_conversations/
      .test(
        sql,
      ),
    true,
  );
});

Deno.test("PRD-03 migration prevents duplicate QR conversations at source", () => {
  assertEquals(
    /UNIQUE INDEX[\s\S]*ON public\.platform_crm_conversations[\s\S]*wa_qr_instance_id/
      .test(
        sql,
      ),
    true,
  );
});

Deno.test("PRD-03 SECURITY DEFINER functions are service-role only", () => {
  assertEquals(
    /GRANT EXECUTE[\s\S]*platform_crm_lead_context_read[\s\S]*TO service_role;/
      .test(sql),
    true,
  );
  assertEquals(
    /platform_crm_lead_context_read[\s\S]*TO service_role,\s*authenticated;/
      .test(
        sql,
      ),
    false,
  );
  const definerCount = (sql.match(/^\s*SECURITY DEFINER\s*$/gm) ?? []).length;
  const searchPathCount =
    (sql.match(/^\s*SET search_path TO 'public'\s*$/gm) ?? []).length;
  assertEquals(searchPathCount, definerCount);
});

Deno.test("PRD-03 append is race-safe and state facts merge", () => {
  assertEquals(
    /ON CONFLICT \(lead_id, product_id, idempotency_key\)[\s\S]*DO NOTHING/
      .test(
        sql,
      ),
    true,
  );
  assertEquals(
    /facts\s*=\s*CASE[\s\S]*facts\s*\|\|/.test(sql),
    true,
  );
});

Deno.test("PRD-03 preflights existing unique indexes and hoists RLS checks", () => {
  assertEquals(
    sql.includes("PRD-03 blocker: duplicate (product_id, phone)"),
    true,
  );
  assertEquals(
    sql.includes("PRD-03 blocker: duplicate QR conversation identity"),
    true,
  );
  assertEquals(
    sql.includes(
      "USING ((SELECT public.has_role(auth.uid(), 'super_admin'::app_role)))",
    ),
    true,
  );
});

Deno.test("PRD-03 provides idempotent QR lead/state backfill", () => {
  assertEquals(
    sql.includes("platform_crm_backfill_qr_lead_bindings"),
    true,
  );
  assertEquals(sql.includes("pg_advisory_xact_lock"), true);
  assertEquals(
    /UPDATE public\.platform_crm_conversations[\s\S]*SET lead_id/.test(sql),
    true,
  );
});
