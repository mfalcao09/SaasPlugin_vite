import { assertEquals } from "jsr:@std/assert@1";

const url = new URL(
  "../../migrations_platform_crm/20260912_camila_safety_kernel_action_ledger.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(url);

Deno.test("PRD-04 migration creates release control and action ledger", () => {
  assertEquals(sql.includes("platform_crm_agent_release_controls"), true);
  assertEquals(sql.includes("platform_crm_agent_action_ledger"), true);
  assertEquals(sql.includes("DEFAULT 'OFF'"), true);
  assertEquals(
    /UNIQUE INDEX[\s\S]*idempotency_key/.test(sql),
    true,
  );
  assertEquals(sql.includes("idx_pcrm_agent_action_agent_id"), true);
  assertEquals(sql.includes("idx_pcrm_agent_action_instance_id"), true);
});

Deno.test("PRD-04 migration locks immutable contact limits", () => {
  assertEquals(sql.includes("p_max_openings constant integer := 1"), true);
  assertEquals(sql.includes("p_max_followups constant integer := 2"), true);
  assertEquals(sql.includes("interval '24 hours'"), true);
  assertEquals(sql.includes("bubble_count BETWEEN 1 AND 2"), true);
});

Deno.test("PRD-04 authorization is transactional and fail closed", () => {
  assertEquals(sql.includes("pcrm_authorize_and_reserve_agent_action"), true);
  assertEquals(sql.includes("pg_advisory_xact_lock"), true);
  assertEquals(sql.includes("ficha_missing"), true);
  assertEquals(sql.includes("owner_mismatch"), true);
  assertEquals(sql.includes("opted_out"), true);
  assertEquals(sql.includes("release_off"), true);
});

Deno.test("PRD-04 migration supports CAS transitions and inbound cancellation", () => {
  assertEquals(sql.includes("pcrm_transition_agent_action"), true);
  assertEquals(sql.includes("pcrm_cancel_pending_agent_actions"), true);
  assertEquals(sql.includes("expected_status"), true);
  assertEquals(sql.includes("pcrm_expire_agent_action_reservations"), true);
  assertEquals(
    /status = 'reserved'[\s\S]*expires_at <= now\(\)/.test(sql),
    true,
  );
});

Deno.test("PRD-04 SECURITY DEFINER functions are private", () => {
  const definer = (sql.match(/^\s*SECURITY DEFINER\s*$/gm) ?? []).length;
  const searchPath =
    (sql.match(/^\s*SET search_path TO 'public'\s*$/gm) ?? []).length;
  const revokes = (sql.match(/REVOKE ALL ON FUNCTION/g) ?? []).length;
  assertEquals(definer > 0, true);
  assertEquals(searchPath, definer);
  assertEquals(revokes, definer);
});

Deno.test("PRD-04 opt-out lookup is normalized and never matches an empty phone", () => {
  assertEquals(sql.includes("telefone_digits"), true);
  assertEquals(sql.includes("lead_no_phone"), true);
  assertEquals(sql.includes("v_phone_digits <> ''"), true);
});
