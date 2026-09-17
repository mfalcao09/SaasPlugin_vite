// Path A R2 planner — pure, no sender. Shadow/enforce modes.
// deno test supabase/functions/_shared/cold-outreach/r2-plan.test.ts

import { classifyOptOutKind, type OptOutKind } from "./opt-out.ts";
import { getR2AutoMode, type PathAMode } from "./path-a-flags.ts";

export const R2_PLAN_VERSION = "r2-close@1";

/** Allowlisted site URLs for R2 bubble 2. */
export const R2_URL_ALLOWLIST = [
  "https://nexvybeauty.com.br",
  "https://www.nexvybeauty.com.br",
  "https://nexvy.tech",
] as const;

export type R2PlanInput = {
  conversationId: string;
  eventId: string;
  optOutText: string;
  mode?: PathAMode;
  /** ISO of last R2 for this conversation; null = never. */
  lastR2AtIso?: string | null;
  nowIso?: string;
  siteUrl?: string;
  version?: number;
};

export type R2Plan = {
  mode: PathAMode;
  optOutKind: OptOutKind | null;
  shouldPlan: boolean;
  idempotencyKey: string | null;
  bubbles: string[];
  sends: number;
  skipReason: string | null;
};

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

export function r2IdempotencyKey(
  conversationId: string,
  eventId: string,
  version = 1,
): string {
  return `r2-close:${conversationId}:${eventId}:v${version}`;
}

function urlAllowed(url: string): boolean {
  return (R2_URL_ALLOWLIST as readonly string[]).includes(url);
}

/**
 * Plan R2 close (≤2 bubbles). Never sends — caller must check mode.
 * Hard → no plan. Soft + shadow|enforce → 1 plan. off → no plan.
 * Replay same key → caller dedupes via seenKeys.
 */
export function planR2Close(input: R2PlanInput): R2Plan {
  const mode = input.mode ?? getR2AutoMode();
  const kind = classifyOptOutKind(input.optOutText);
  const version = input.version ?? 1;
  const key = r2IdempotencyKey(input.conversationId, input.eventId, version);
  const site = input.siteUrl ?? R2_URL_ALLOWLIST[0];

  const base = (skip: string | null, should: boolean): R2Plan => ({
    mode,
    optOutKind: kind,
    shouldPlan: should,
    idempotencyKey: should ? key : null,
    bubbles: [],
    sends: 0,
    skipReason: skip,
  });

  if (mode === "off") return base("mode_off", false);
  if (kind === null) return base("not_opt_out", false);
  if (kind === "hard") return base("hard_no_r2", false);

  const now = Date.parse(input.nowIso ?? new Date().toISOString());
  if (input.lastR2AtIso) {
    const last = Date.parse(input.lastR2AtIso);
    if (!Number.isNaN(last) && now - last < THIRTY_DAYS_MS) {
      return base("r2_repeat_30d", false);
    }
  }

  if (!urlAllowed(site)) return base("url_not_allowlisted", false);

  // Soft: exactly one R2 plan, ≤2 bubbles, sends always 0 in planner (shadow).
  return {
    mode,
    optOutKind: "soft",
    shouldPlan: true,
    idempotencyKey: key,
    bubbles: [
      "Combinado — se mudar de ideia, estou por aqui.",
      `Se quiser conhecer depois: ${site}`,
    ],
    sends: 0,
    skipReason: null,
  };
}

/** Dedup helper for shadow harness / motor. */
export function planR2CloseOnce(
  input: R2PlanInput,
  seenKeys: Set<string>,
): R2Plan {
  const plan = planR2Close(input);
  if (!plan.shouldPlan || !plan.idempotencyKey) return plan;
  if (seenKeys.has(plan.idempotencyKey)) {
    return {
      ...plan,
      shouldPlan: false,
      bubbles: [],
      skipReason: "duplicate_idempotency_key",
      idempotencyKey: plan.idempotencyKey,
    };
  }
  seenKeys.add(plan.idempotencyKey);
  return plan;
}
