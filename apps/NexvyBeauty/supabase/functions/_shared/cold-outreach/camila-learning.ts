// PRD-08 — Learning Controller (puro).
// Aprende estratégia/tom/cadência/beats; NUNCA preço, kernel, métricas ou kill-switch.
// Canário invertido (Marcelo 2026-09-13): 15% estratégia nova, 85% estável.

import { stableHash } from "./script.ts";

/** Campos que o Learning Controller pode propor (dentro do kernel). */
export const LEARNABLE_KEYS = [
  "strategy",
  "beat_order",
  "tone",
  "cadence_within_caps",
] as const;

/** Constituição — só muda por PR humano. */
export const NON_LEARNABLE_KEYS = [
  "price",
  "checkout_url",
  "identity",
  "opt_out",
  "channel",
  "hard_caps",
  "metrics",
  "history",
  "kill_switch",
  "release_state",
  "safety_kernel",
  "action_ledger",
  "evaluator",
  "payment_events",
] as const;

export type LearnableKey = (typeof LEARNABLE_KEYS)[number];
export type NonLearnableKey = (typeof NON_LEARNABLE_KEYS)[number];

export type LearningProposal = Record<string, unknown>;

export interface ProposalDecision {
  accepted: boolean;
  reason: string;
  rejectedKeys: string[];
}

const LEARNABLE_SET = new Set<string>(LEARNABLE_KEYS);
const NON_LEARNABLE_SET = new Set<string>(NON_LEARNABLE_KEYS);

/**
 * Canário: % que recebe a estratégia NOVA (treatment).
 * Massa restante fica no controle/estável.
 * Decisão Marcelo 2026-09-13: 15% (1500 bps).
 */
export const DEFAULT_CANARY_BPS = 1500;

/** @deprecated use DEFAULT_CANARY_BPS — nome antigo apontava holdout clássico. */
export const DEFAULT_HOLDOUT_BPS = DEFAULT_CANARY_BPS;

export type ExperimentArm = "holdout" | "control" | "treatment";

export interface AssignmentInput {
  leadId: string;
  experimentId: string;
  /**
   * Basis points 0–10000 assigned to treatment (new strategy).
   * Rest → control (stable). Default 15%.
   */
  canaryBps?: number;
  /** @deprecated alias of canaryBps */
  holdoutBps?: number;
}

export interface Assignment {
  arm: ExperimentArm;
  bucket: number; // 0..9999
  stable: true;
}

export type AssertivenessLabel = "affirmative" | "corrective" | "neutral";

export interface IttCohort {
  admittedLeadIds: readonly string[];
  paidLeadIds: readonly string[];
  armByLeadId: Readonly<Record<string, ExperimentArm>>;
}

export interface IttRate {
  arm: ExperimentArm;
  admitted: number;
  paid: number;
  rate: number;
}

export interface ArmEffectiveness {
  arm: ExperimentArm;
  admitted: number;
  paid: number;
  closeRate: number;
  affirmative: number;
  corrective: number;
  labeled: number;
  /** (affirmative - corrective) / labeled; 0 if no labels. */
  assertivenessScore: number;
}

export interface PromotionFloors {
  /** Minimum labeled assertiveness replies per arm (sample safety). */
  minLabeledPerArm: number;
  /** Minimum admitted leads per arm. */
  minAdmittedPerArm: number;
}

export interface PromotionCandidate {
  strategyVersionId: string;
  treatment: ArmEffectiveness;
  control: ArmEffectiveness;
  guardrailViolations: readonly string[];
  missingData: boolean;
}

export interface PromotionDecision {
  action: "promote" | "rollback" | "reject";
  reason: string;
  activeStrategyVersionId: string;
}

export interface IdempotentOpResult {
  applied: boolean;
  activeStrategyVersionId: string;
  opId: string;
}

/** Collect object keys at every nesting level (arrays recurse into elements). */
export function collectDeepKeys(value: unknown, out: string[] = []): string[] {
  if (value == null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const el of value) collectDeepKeys(el, out);
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out.push(k);
    collectDeepKeys(v, out);
  }
  return out;
}

/**
 * Reject reward hacking: non-learnable / unknown keys at any depth.
 * Top-level keys must be learnable; nested keys must not be constitution keys.
 */
export function evaluateLearningProposal(
  proposal: LearningProposal,
): ProposalDecision {
  const top = Object.keys(proposal);
  if (!top.length) {
    return { accepted: false, reason: "empty_proposal", rejectedKeys: [] };
  }
  const rejected: string[] = [];
  for (const k of top) {
    if (NON_LEARNABLE_SET.has(k) || !LEARNABLE_SET.has(k)) rejected.push(k);
  }
  const deep = collectDeepKeys(proposal);
  for (const k of deep) {
    if (NON_LEARNABLE_SET.has(k) && !rejected.includes(k)) rejected.push(k);
  }
  if (rejected.length) {
    const kernelTouch = rejected.some((k) => NON_LEARNABLE_SET.has(k));
    return {
      accepted: false,
      reason: kernelTouch ? "reward_hacking_or_constitution" : "unknown_keys",
      rejectedKeys: rejected,
    };
  }
  return { accepted: true, reason: "learnable_ok", rejectedKeys: [] };
}

function foldPt(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

const AFFIRMATIVE_RE =
  /(sim[, ]?(isso|exato|mesmo)|isso mesmo|acertou|\be isso\b|exato|correto|perfeito|isso ai|mandou bem)/i;
const CORRECTIVE_RE =
  /(nao[, ]?(e|eh) isso|nao foi isso|entendeu errado|nao entendeu|errou|nao e isso|nada a ver|nao e bem assim)/i;

/**
 * Classifica inbound da lead quanto à assertividade da última resposta da Camila.
 * affirmative → reforço; corrective → marcar atenção / não usar; neutral → sem sinal.
 */
export function classifyAssertivenessReply(text: string): AssertivenessLabel {
  const t = foldPt(text);
  if (!t) return "neutral";
  // Corrective first: "não, não é isso" must not win as affirmative via "sim".
  if (CORRECTIVE_RE.test(t)) return "corrective";
  if (AFFIRMATIVE_RE.test(t)) return "affirmative";
  return "neutral";
}

export type AssertivenessInboundMeta = {
  assertiveness_label: AssertivenessLabel;
  assertiveness_source: "inbound_classifier_v1";
};

/** Metadata to merge into inbound message rows for learning signals. */
export function buildAssertivenessInboundMeta(
  text: string,
): AssertivenessInboundMeta {
  return {
    assertiveness_label: classifyAssertivenessReply(text),
    assertiveness_source: "inbound_classifier_v1",
  };
}

export function scoreAssertiveness(
  affirmative: number,
  corrective: number,
): number {
  const labeled = affirmative + corrective;
  if (labeled <= 0) return 0;
  return (affirmative - corrective) / labeled;
}

/**
 * Assignment invertido: canaryBps → treatment (nova); resto → control (estável).
 * Holdout clássico não é o default (canário pequeno, massa estável).
 */
export function assignExperimentArm(input: AssignmentInput): Assignment {
  const canaryBps = Math.max(
    0,
    Math.min(
      10_000,
      input.canaryBps ?? input.holdoutBps ?? DEFAULT_CANARY_BPS,
    ),
  );
  const bucket = stableHash(`${input.experimentId}:${input.leadId}`) % 10_000;
  if (bucket < canaryBps) {
    return { arm: "treatment", bucket, stable: true };
  }
  return { arm: "control", bucket, stable: true };
}

/**
 * Intention-to-treat: every admitted lead stays in the denominator for its
 * frozen arm — unpaid included; dropping unpaid is rejected.
 */
export function computeIttRates(cohort: IttCohort): {
  rates: IttRate[];
  intact: boolean;
  reason: string | null;
} {
  const admitted = new Set(cohort.admittedLeadIds);
  for (const id of cohort.paidLeadIds) {
    if (!admitted.has(id)) {
      return {
        rates: [],
        intact: false,
        reason: "paid_outside_admitted",
      };
    }
  }
  for (const id of admitted) {
    if (!cohort.armByLeadId[id]) {
      return { rates: [], intact: false, reason: "missing_arm_at_admission" };
    }
  }
  const arms: ExperimentArm[] = ["holdout", "control", "treatment"];
  const rates: IttRate[] = arms.map((arm) => {
    const armLeads = [...admitted].filter((id) => cohort.armByLeadId[id] === arm);
    const paid = armLeads.filter((id) => cohort.paidLeadIds.includes(id)).length;
    const n = armLeads.length;
    return {
      arm,
      admitted: n,
      paid,
      rate: n === 0 ? 0 : paid / n,
    };
  });
  return { rates, intact: true, reason: null };
}

/** Attempt to shrink denominator by removing unpaid — must fail closed. */
export function rejectDenominatorShrink(
  admitted: readonly string[],
  proposedDenominator: readonly string[],
): { ok: boolean; reason: string } {
  const a = new Set(admitted);
  const p = new Set(proposedDenominator);
  for (const id of a) {
    if (!p.has(id)) {
      return { ok: false, reason: "itt_denominator_shrink" };
    }
  }
  return { ok: true, reason: "itt_ok" };
}

const DEFAULT_FLOORS: PromotionFloors = {
  minLabeledPerArm: 20,
  minAdmittedPerArm: 30,
};

/**
 * Promove só se treatment for mais efetiva que control:
 * maior assertivenessScore E maior closeRate (assinatura).
 * Pisos mínimos só evitam promoção com amostra ridícula.
 */
export function decidePromotion(
  currentActiveId: string,
  candidate: PromotionCandidate,
  floors: PromotionFloors = DEFAULT_FLOORS,
  mode: "promote" | "rollback" = "promote",
): PromotionDecision {
  if (mode === "rollback") {
    return {
      action: "rollback",
      reason: "rollback_requested",
      activeStrategyVersionId: currentActiveId,
    };
  }
  if (candidate.missingData) {
    return {
      action: "reject",
      reason: "missing_data",
      activeStrategyVersionId: currentActiveId,
    };
  }
  if (candidate.guardrailViolations.length) {
    return {
      action: "reject",
      reason: `guardrail:${candidate.guardrailViolations[0]}`,
      activeStrategyVersionId: currentActiveId,
    };
  }
  const t = candidate.treatment;
  const c = candidate.control;
  if (
    t.admitted < floors.minAdmittedPerArm ||
    c.admitted < floors.minAdmittedPerArm
  ) {
    return {
      action: "reject",
      reason: "floor_admitted",
      activeStrategyVersionId: currentActiveId,
    };
  }
  if (
    t.labeled < floors.minLabeledPerArm ||
    c.labeled < floors.minLabeledPerArm
  ) {
    return {
      action: "reject",
      reason: "floor_labeled",
      activeStrategyVersionId: currentActiveId,
    };
  }
  if (t.assertivenessScore <= c.assertivenessScore) {
    return {
      action: "reject",
      reason: "not_more_assertive",
      activeStrategyVersionId: currentActiveId,
    };
  }
  if (t.closeRate <= c.closeRate) {
    return {
      action: "reject",
      reason: "not_more_closing",
      activeStrategyVersionId: currentActiveId,
    };
  }
  return {
    action: "promote",
    reason: "more_effective",
    activeStrategyVersionId: candidate.strategyVersionId,
  };
}

/**
 * Idempotent promote/rollback under concurrency: same opId always yields the
 * same active version; a second apply is a no-op.
 */
export function applyPromotionIdempotent(
  store: {
    activeStrategyVersionId: string;
    appliedOps: Map<string, string>;
  },
  opId: string,
  desiredActiveId: string,
): IdempotentOpResult {
  const prior = store.appliedOps.get(opId);
  if (prior != null) {
    return {
      applied: false,
      activeStrategyVersionId: store.activeStrategyVersionId,
      opId,
    };
  }
  store.activeStrategyVersionId = desiredActiveId;
  store.appliedOps.set(opId, desiredActiveId);
  return {
    applied: true,
    activeStrategyVersionId: desiredActiveId,
    opId,
  };
}
