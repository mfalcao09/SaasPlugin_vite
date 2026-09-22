import { assertEquals } from "jsr:@std/assert@1";
import {
  applyPromotionIdempotent,
  assignExperimentArm,
  buildAssertivenessInboundMeta,
  classifyAssertivenessReply,
  computeIttRates,
  decidePromotion,
  evaluateLearningProposal,
  rejectDenominatorShrink,
  scoreAssertiveness,
  DEFAULT_CANARY_BPS,
  type ArmEffectiveness,
} from "./camila-learning.ts";

Deno.test("PRD-08: reward hacking on price/kernel rejected", () => {
  const d = evaluateLearningProposal({
    strategy: "soft_bridge",
    price: 97,
    safety_kernel: "bypass",
  });
  assertEquals(d.accepted, false);
  assertEquals(d.reason, "reward_hacking_or_constitution");
  assertEquals(d.rejectedKeys.includes("price"), true);
  assertEquals(d.rejectedKeys.includes("safety_kernel"), true);
});

Deno.test("PRD-08: learnable-only proposal accepted", () => {
  const d = evaluateLearningProposal({
    strategy: "soft_bridge",
    tone: "warm",
    beat_order: ["eco", "bridge"],
    cadence_within_caps: { minHours: 4 },
  });
  assertEquals(d.accepted, true);
});

Deno.test("PRD-08: kill_switch and metrics not learnable", () => {
  assertEquals(
    evaluateLearningProposal({ kill_switch: false }).accepted,
    false,
  );
  assertEquals(
    evaluateLearningProposal({ metrics: { reply_rate: 1 } }).accepted,
    false,
  );
});

Deno.test("PRD-08: canary 15% treatment / 85% control (inverted)", () => {
  assertEquals(DEFAULT_CANARY_BPS, 1500);
  const a = assignExperimentArm({ leadId: "L1", experimentId: "E1" });
  const b = assignExperimentArm({ leadId: "L1", experimentId: "E1" });
  assertEquals(a, b);
  assertEquals(a.stable, true);
  assertEquals(a.arm === "holdout", false);

  let treatment = 0;
  let control = 0;
  const n = 2000;
  for (let i = 0; i < n; i++) {
    const x = assignExperimentArm({
      leadId: `lead-${i}`,
      experimentId: "E-canary-15",
      canaryBps: DEFAULT_CANARY_BPS,
    });
    if (x.arm === "treatment") treatment++;
    else if (x.arm === "control") control++;
  }
  const share = treatment / n;
  // ~15% ± 3pp on 2000 draws
  assertEquals(share > 0.12 && share < 0.18, true);
  assertEquals(control / n > 0.80, true);
});

Deno.test("PRD-08: assertiveness labels from lead replies", () => {
  assertEquals(classifyAssertivenessReply("sim, isso mesmo"), "affirmative");
  assertEquals(classifyAssertivenessReply("acertou"), "affirmative");
  assertEquals(classifyAssertivenessReply("é isso"), "affirmative");
  assertEquals(classifyAssertivenessReply("não, não é isso"), "corrective");
  assertEquals(classifyAssertivenessReply("você entendeu errado"), "corrective");
  assertEquals(classifyAssertivenessReply("quero ver o preço"), "neutral");
  assertEquals(scoreAssertiveness(8, 2), 0.6);
});

Deno.test("PRD-08: ITT keeps unpaid in denominator", () => {
  const cohort = {
    admittedLeadIds: ["a", "b", "c"],
    paidLeadIds: ["a"],
    armByLeadId: {
      a: "treatment" as const,
      b: "control" as const,
      c: "control" as const,
    },
  };
  const r = computeIttRates(cohort);
  assertEquals(r.intact, true);
  const treatment = r.rates.find((x) => x.arm === "treatment")!;
  assertEquals(treatment.admitted, 1);
  assertEquals(treatment.paid, 1);
  const control = r.rates.find((x) => x.arm === "control")!;
  assertEquals(control.admitted, 2);
  assertEquals(control.paid, 0);
  assertEquals(
    rejectDenominatorShrink(["a", "b", "c"], ["a", "c"]).ok,
    false,
  );
});

Deno.test("PRD-08: attribution rejects paid outside admitted", () => {
  const r = computeIttRates({
    admittedLeadIds: ["a"],
    paidLeadIds: ["a", "ghost"],
    armByLeadId: { a: "control" },
  });
  assertEquals(r.intact, false);
  assertEquals(r.reason, "paid_outside_admitted");
});

function arm(
  partial: Partial<ArmEffectiveness> & Pick<ArmEffectiveness, "arm">,
): ArmEffectiveness {
  const affirmative = partial.affirmative ?? 0;
  const corrective = partial.corrective ?? 0;
  const labeled = affirmative + corrective;
  const admitted = partial.admitted ?? 30;
  const paid = partial.paid ?? 0;
  return {
    arm: partial.arm,
    admitted,
    paid,
    closeRate: admitted === 0 ? 0 : paid / admitted,
    affirmative,
    corrective,
    labeled,
    assertivenessScore: scoreAssertiveness(affirmative, corrective),
  };
}

Deno.test("PRD-08: promote only when more assertive AND more closing", () => {
  const better = {
    strategyVersionId: "v2",
    treatment: arm({ arm: "treatment", admitted: 40, paid: 8, affirmative: 30, corrective: 5 }),
    control: arm({ arm: "control", admitted: 40, paid: 4, affirmative: 20, corrective: 10 }),
    guardrailViolations: [] as string[],
    missingData: false,
  };
  assertEquals(decidePromotion("v1", better).action, "promote");
  assertEquals(decidePromotion("v1", better).reason, "more_effective");

  assertEquals(
    decidePromotion("v1", {
      ...better,
      treatment: arm({ arm: "treatment", admitted: 40, paid: 8, affirmative: 10, corrective: 20 }),
    }).reason,
    "not_more_assertive",
  );
  assertEquals(
    decidePromotion("v1", {
      ...better,
      treatment: arm({ arm: "treatment", admitted: 40, paid: 3, affirmative: 30, corrective: 5 }),
    }).reason,
    "not_more_closing",
  );
  assertEquals(
    decidePromotion("v1", {
      ...better,
      guardrailViolations: ["price"],
    }).reason,
    "guardrail:price",
  );
  assertEquals(
    decidePromotion("v1", { ...better, missingData: true }).reason,
    "missing_data",
  );
});

Deno.test("PRD-08: promote/rollback idempotent under concurrency", () => {
  const store = {
    activeStrategyVersionId: "v1",
    appliedOps: new Map<string, string>(),
  };
  const first = applyPromotionIdempotent(store, "op-1", "v2");
  const second = applyPromotionIdempotent(store, "op-1", "v2");
  const concurrent = applyPromotionIdempotent(store, "op-1", "v3");
  assertEquals(first.applied, true);
  assertEquals(second.applied, false);
  assertEquals(concurrent.applied, false);
  assertEquals(store.activeStrategyVersionId, "v2");
  const rb = applyPromotionIdempotent(store, "op-rb", "v1");
  assertEquals(rb.applied, true);
  assertEquals(store.activeStrategyVersionId, "v1");
});

Deno.test("PRD-08: nested price/kernel smuggling rejected", () => {
  const d = evaluateLearningProposal({
    strategy: { name: "x", price: 97 },
    tone: { kill_switch: false },
  });
  assertEquals(d.accepted, false);
  assertEquals(d.reason, "reward_hacking_or_constitution");
  assertEquals(d.rejectedKeys.includes("price"), true);
  assertEquals(d.rejectedKeys.includes("kill_switch"), true);
});

Deno.test("PRD-08/E5.3b: inbound meta carries assertiveness label", () => {
  const a = buildAssertivenessInboundMeta("Acertou");
  assertEquals(a.assertiveness_label, "affirmative");
  assertEquals(a.assertiveness_source, "inbound_classifier_v1");
  const c = buildAssertivenessInboundMeta("não é isso");
  assertEquals(c.assertiveness_label, "corrective");
  const n = buildAssertivenessInboundMeta("quanto custa?");
  assertEquals(n.assertiveness_label, "neutral");
});
