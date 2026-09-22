import { assertEquals } from "jsr:@std/assert@1";
import {
  CAMILA_AGENT_ID,
  INCIDENT_COHORT_SEED_IDS,
  buildConductorWakeIdempotencyKey,
  buildIncidentCohortV1,
  evaluateConductorScope,
  normalizeReleaseState,
  releaseAllowsClassification,
} from "./camila-cohort.ts";

const DEISE = INCIDENT_COHORT_SEED_IDS[0];
const OUTSIDER = "00000000-0000-0000-0000-000000000099";

const base = {
  conversationId: DEISE,
  status: "bot_active",
  currentAgentId: CAMILA_AGENT_ID,
  leadId: "lead-1",
  hasFicha: true,
  releaseState: "SHADOW",
  cohort: buildIncidentCohortV1(),
};

Deno.test("PRD-07: incident cohort seed has exactly 5 members", () => {
  assertEquals(INCIDENT_COHORT_SEED_IDS.length, 5);
  assertEquals(buildIncidentCohortV1().memberConversationIds.size, 5);
});

Deno.test("PRD-07: outside cohort never gets a proposal", () => {
  const d = evaluateConductorScope({ ...base, conversationId: OUTSIDER });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "outside_cohort");
});

Deno.test("PRD-07: removed from cohort (inactive members) is denied", () => {
  const cohort = buildIncidentCohortV1(
    INCIDENT_COHORT_SEED_IDS.filter((id) => id !== DEISE),
  );
  const d = evaluateConductorScope({ ...base, cohort });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "outside_cohort");
});

Deno.test("PRD-07: bot_active + Camila owner + lead + ficha required", () => {
  assertEquals(
    evaluateConductorScope({ ...base, status: "closed" }).reason,
    "not_bot_active",
  );
  assertEquals(
    evaluateConductorScope({ ...base, currentAgentId: "duda" }).reason,
    "owner_not_camila",
  );
  assertEquals(
    evaluateConductorScope({ ...base, leadId: null }).reason,
    "lead_missing",
  );
  assertEquals(
    evaluateConductorScope({ ...base, hasFicha: false }).reason,
    "ficha_missing",
  );
});

Deno.test("PRD-07: OFF release blocks classification", () => {
  assertEquals(releaseAllowsClassification("OFF"), false);
  assertEquals(releaseAllowsClassification(""), false);
  assertEquals(releaseAllowsClassification("   "), false);
  assertEquals(normalizeReleaseState(""), "OFF");
  assertEquals(normalizeReleaseState(" shadow "), "SHADOW");
  assertEquals(releaseAllowsClassification("SHADOW"), true);
  assertEquals(releaseAllowsClassification("BOGUS"), false);
  assertEquals(
    evaluateConductorScope({ ...base, releaseState: "OFF" }).reason,
    "release_off",
  );
});

Deno.test("PRD-07: eligible cohort member is allowed", () => {
  const d = evaluateConductorScope(base);
  assertEquals(d.allowed, true);
  assertEquals(d.reason, null);
});

Deno.test("PRD-07: wake idempotency key is hour-bucketed", () => {
  const a = buildConductorWakeIdempotencyKey(DEISE, "debt", new Date("2026-09-13T15:10:00Z"));
  const b = buildConductorWakeIdempotencyKey(DEISE, "debt", new Date("2026-09-13T15:50:00Z"));
  const c = buildConductorWakeIdempotencyKey(DEISE, "debt", new Date("2026-09-13T16:00:00Z"));
  assertEquals(a, b);
  assertEquals(a === c, false);
});

Deno.test("PRD-07: inactive cohort snapshot is denied", () => {
  const d = evaluateConductorScope({
    ...base,
    cohort: buildIncidentCohortV1([], false),
  });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "cohort_inactive");
});
