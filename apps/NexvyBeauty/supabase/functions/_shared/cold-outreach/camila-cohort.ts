// PRD-07 — coortes dinâmicas do conductor (puro).
// Allowlist hardcoded deixa de ser fonte de verdade; vira seed da coorte v1.

export const CAMILA_AGENT_ID = "68aeece9-26f2-4f7b-a595-a6ea5e8acfa7";

/** Seed histórico do incidente — membros iniciais da coorte versionada, não gate. */
export const INCIDENT_COHORT_SEED_IDS: readonly string[] = [
  "7e427cd4-5181-445d-9eb1-f05906b8f42d", // Deise
  "e882518f-5ebd-457d-8c3c-dc33f400a7a1", // Expert
  "01385b74-29ab-4044-bf10-3a2bcc26928c", // Ellas
  "db870f09-54d1-4e1b-a221-6af8fb24788f", // Jeissiane
  "db7991a9-df6c-4665-8d9b-481b1cc48d53", // Emilly
];

export const INCIDENT_COHORT_SLUG = "incident-piloto-20260901";
export const INCIDENT_COHORT_VERSION = 1;

export type ReleaseStateForClassify =
  | "OFF"
  | "SHADOW"
  | "TEST"
  | "CANARY"
  | "LIVE"
  | string;

export interface CohortSnapshot {
  slug: string;
  version: number;
  active: boolean;
  memberConversationIds: ReadonlySet<string>;
}

export interface ConductorScopeInput {
  conversationId: string;
  status: string | null | undefined;
  currentAgentId: string | null | undefined;
  camilaAgentId?: string;
  leadId: string | null | undefined;
  hasFicha: boolean;
  releaseState: ReleaseStateForClassify;
  cohort: CohortSnapshot | null;
}

export interface ConductorScopeDecision {
  allowed: boolean;
  reason: string | null;
}

export function buildIncidentCohortV1(
  memberIds: readonly string[] = INCIDENT_COHORT_SEED_IDS,
  active = true,
): CohortSnapshot {
  return {
    slug: INCIDENT_COHORT_SLUG,
    version: INCIDENT_COHORT_VERSION,
    active,
    memberConversationIds: new Set(memberIds),
  };
}

const CLASSIFY_RELEASE_STATES = new Set([
  "SHADOW",
  "TEST",
  "CANARY",
  "LIVE",
]);

/** Blank/unknown → OFF (fail-closed). */
export function normalizeReleaseState(
  releaseState: ReleaseStateForClassify | null | undefined,
): string {
  const s = String(releaseState ?? "").trim().toUpperCase();
  return s.length ? s : "OFF";
}

/** Só SHADOW|TEST|CANARY|LIVE classificam; OFF/blank/unknown não propõem. */
export function releaseAllowsClassification(
  releaseState: ReleaseStateForClassify,
): boolean {
  return CLASSIFY_RELEASE_STATES.has(normalizeReleaseState(releaseState));
}

/**
 * Escopo dinâmico: coorte ativa + bot_active + owner Camila + lead + ficha
 * + release que permite classificação.
 */
export function evaluateConductorScope(
  input: ConductorScopeInput,
): ConductorScopeDecision {
  const camilaId = input.camilaAgentId ?? CAMILA_AGENT_ID;
  if (!releaseAllowsClassification(input.releaseState)) {
    return { allowed: false, reason: "release_off" };
  }
  if (!input.cohort || !input.cohort.active) {
    return { allowed: false, reason: "cohort_inactive" };
  }
  if (!input.cohort.memberConversationIds.has(input.conversationId)) {
    return { allowed: false, reason: "outside_cohort" };
  }
  if (String(input.status ?? "") !== "bot_active") {
    return { allowed: false, reason: "not_bot_active" };
  }
  if (!input.currentAgentId || input.currentAgentId !== camilaId) {
    return { allowed: false, reason: "owner_not_camila" };
  }
  if (!input.leadId) {
    return { allowed: false, reason: "lead_missing" };
  }
  if (!input.hasFicha) {
    return { allowed: false, reason: "ficha_missing" };
  }
  return { allowed: true, reason: null };
}

/** Idempotency de wake: conversa + kind + bucket horário (UTC). */
export function buildConductorWakeIdempotencyKey(
  conversationId: string,
  kind: string,
  now: Date,
): string {
  const bucket = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return `camila:wake:${conversationId}:${kind}:${bucket}`;
}
