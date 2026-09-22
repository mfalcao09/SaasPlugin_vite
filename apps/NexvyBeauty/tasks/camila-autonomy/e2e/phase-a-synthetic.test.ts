/**
 * Camila E2E Fase A — casos sintéticos (sem WhatsApp / sem lead real).
 * cwd = apps/NexvyBeauty
 */
import { assertEquals, assert } from "jsr:@std/assert@1";
import {
  assignExperimentArm,
  classifyAssertivenessReply,
  decidePromotion,
  evaluateLearningProposal,
  scoreAssertiveness,
  DEFAULT_CANARY_BPS,
  type ArmEffectiveness,
} from "../../../supabase/functions/_shared/cold-outreach/camila-learning.ts";
import {
  evaluateConductorScope,
  buildIncidentCohortV1,
  releaseAllowsClassification,
  normalizeReleaseState,
  CAMILA_AGENT_ID,
} from "../../../supabase/functions/_shared/cold-outreach/camila-cohort.ts";
import {
  validateCommercialTruth,
  allowlistFromPlans,
} from "../../../supabase/functions/_shared/commercial-truth.ts";
import { decideCamilaWake } from "../../../supabase/functions/_shared/cold-outreach/camila-conductor-policy.ts";

const OUTSIDER = "00000000-0000-4000-8000-000000000099";

Deno.test("E2.1: outside cohort never proposed", () => {
  const d = evaluateConductorScope({
    conversationId: OUTSIDER,
    status: "bot_active",
    currentAgentId: CAMILA_AGENT_ID,
    leadId: "lead-1",
    hasFicha: true,
    releaseState: "SHADOW",
    cohort: buildIncidentCohortV1(),
  });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "outside_cohort");
});

Deno.test("E2.1b: OFF release blocks classification", () => {
  assertEquals(releaseAllowsClassification(normalizeReleaseState("")), false);
  assertEquals(releaseAllowsClassification("OFF"), false);
});

Deno.test("E2.4: cap_hour blocks wake", () => {
  const d = decideCamilaWake({
    conversationId: "7e427cd4-5181-445d-9eb1-f05906b8f42d",
    messages: [],
    now: new Date("2026-09-11T19:00:00.000Z"),
    inCohort: true,
    wakesInLastHour: 8,
    lastWakeAtMs: null,
  });
  assertEquals(d.reason, "cap_hour");
});

Deno.test("E1.4: invented price rejected", () => {
  const plans = allowlistFromPlans([
    { price_monthly: 197, checkout_url: "https://pay.example/ok" },
  ], "Camila");
  const v = validateCommercialTruth(
    ["Nosso plano é só R$ 1,99 em https://evil.com/x"],
    plans,
  );
  assertEquals(v.ok, false);
});

Deno.test("E3.1: canary ~15%", () => {
  assertEquals(DEFAULT_CANARY_BPS, 1500);
  let treatment = 0;
  const n = 2000;
  for (let i = 0; i < n; i++) {
    if (
      assignExperimentArm({
        leadId: `e2e-${i}`,
        experimentId: "e2e-phase-a",
      }).arm === "treatment"
    ) {
      treatment++;
    }
  }
  const share = treatment / n;
  assert(share > 0.12 && share < 0.18, `share=${share}`);
});

Deno.test("E3.2: assertiveness labels", () => {
  assertEquals(classifyAssertivenessReply("é isso"), "affirmative");
  assertEquals(classifyAssertivenessReply("não é isso"), "corrective");
});

Deno.test("E3.3: promote only if more effective", () => {
  const mk = (
    arm: "treatment" | "control",
    paid: number,
    aff: number,
    corr: number,
  ): ArmEffectiveness => {
    const admitted = 40;
    return {
      arm,
      admitted,
      paid,
      closeRate: paid / admitted,
      affirmative: aff,
      corrective: corr,
      labeled: aff + corr,
      assertivenessScore: scoreAssertiveness(aff, corr),
    };
  };
  const ok = decidePromotion("v1", {
    strategyVersionId: "v2",
    treatment: mk("treatment", 8, 30, 5),
    control: mk("control", 4, 20, 10),
    guardrailViolations: [],
    missingData: false,
  });
  assertEquals(ok.action, "promote");
  const bad = decidePromotion("v1", {
    strategyVersionId: "v2",
    treatment: mk("treatment", 3, 30, 5),
    control: mk("control", 4, 20, 10),
    guardrailViolations: [],
    missingData: false,
  });
  assertEquals(bad.reason, "not_more_closing");
});

Deno.test("E3.4: learning cannot touch kernel", () => {
  const d = evaluateLearningProposal({
    strategy: "x",
    price: 1,
    kill_switch: true,
  });
  assertEquals(d.accepted, false);
});
