// Harness funnel stages — fonte de verdade = platform_crm_lead_state.derived_stage
import type { HarnessState } from "./states.ts";

export const HARNESS_STAGES: readonly HarnessState[] = [
  "db",
  "preselected",
  "contacted",
  "remarketing_pool",
  "service",
  "do_not_contact",
  "closing",
  "onboarding",
] as const;

export const HARNESS_FACTS_KEY = "harness";

export type HarnessLeadFacts = {
  greeting: string;
  instagram_handle: string;
  resume_exception: boolean;
  pilot_order: number;
  cohort: string;
};

export const PILOT_COHORT_ID = "pilot-v1-shortlist-d3";

export function isHarnessStage(raw: unknown): raw is HarnessState {
  return typeof raw === "string" &&
    (HARNESS_STAGES as readonly string[]).includes(raw);
}

export function parseHarnessFacts(facts: Record<string, unknown> | null | undefined): HarnessLeadFacts | null {
  const h = facts?.[HARNESS_FACTS_KEY];
  if (!h || typeof h !== "object" || Array.isArray(h)) return null;
  const o = h as Record<string, unknown>;
  const greeting = String(o.greeting ?? "").trim();
  const handle = String(o.instagram_handle ?? o.handle ?? "").trim();
  const order = Number(o.pilot_order);
  if (!greeting || !handle || !Number.isFinite(order)) return null;
  return {
    greeting,
    instagram_handle: handle.replace(/^@/, ""),
    resume_exception: o.resume_exception === true,
    pilot_order: order,
    cohort: String(o.cohort ?? PILOT_COHORT_ID),
  };
}

export function buildHarnessFactsPatch(facts: HarnessLeadFacts): Record<string, unknown> {
  return {
    [HARNESS_FACTS_KEY]: {
      greeting: facts.greeting,
      instagram_handle: facts.instagram_handle,
      resume_exception: facts.resume_exception,
      pilot_order: facts.pilot_order,
      cohort: facts.cohort,
    },
  };
}

/** Transições canônicas do funil (piloto). */
export function nextStageAfterFirstOutbound(current: HarnessState | null): HarnessState {
  if (current === "preselected" || current === "db" || current == null) {
    return "contacted";
  }
  return current;
}

export function nextStageAfterSoftExit(current: HarnessState | null): HarnessState {
  if (current === "service") return "remarketing_pool"; // 1º disparo → laranja
  if (current === "contacted" || current === "preselected") return "remarketing_pool";
  return current ?? "remarketing_pool";
}

export function nextStageAfterHardExit(_current: HarnessState | null): HarnessState {
  return "do_not_contact";
}
