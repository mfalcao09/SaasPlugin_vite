// Gates de go-live — impede F3 acidental (piloto/teste sem flag explícita).
//   deno test --allow-env supabase/functions/_shared/cold-outreach/go-live-gates.test.ts

export interface GoLiveGateInput {
  campaignName: string;
  dryRun: boolean;
  envEnabled: boolean;
  allowRealSendEnv?: string | null;
}

export interface GoLiveGateVerdict {
  allowed: boolean;
  reason: string | null;
}

const PILOT_NAME_RE = /piloto|teste|gate[_-]?g|dry/i;

/** Env real só se: dry_run=false AND (COLD_OUTREACH_ENABLED OR allow flag) AND nome não-piloto OU ALLOW_REAL_SEND=1 */
export function validateRealSend(input: GoLiveGateInput): GoLiveGateVerdict {
  if (input.dryRun) {
    return { allowed: false, reason: "dry_run" };
  }
  if (!input.envEnabled && input.allowRealSendEnv !== "1") {
    return { allowed: false, reason: "COLD_OUTREACH_ENABLED=false" };
  }
  const isPilot = PILOT_NAME_RE.test(input.campaignName);
  if (isPilot && input.allowRealSendEnv !== "1") {
    return {
      allowed: false,
      reason: "pilot_campaign_requires_ALLOW_REAL_SEND=1",
    };
  }
  return { allowed: true, reason: null };
}

export const DEFAULT_WINDOW_CONFIG = {
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  timeZone: "America/Sao_Paulo",
};

/** Janela 24/7 exige override explícito no nome ou env (evita meia-noite acidental). */
export function isPermissiveWindow(windowCfg: {
  startHour?: number;
  endHour?: number;
  days?: number[];
}): boolean {
  const start = windowCfg.startHour ?? 9;
  const end = windowCfg.endHour ?? 18;
  const days = windowCfg.days ?? [1, 2, 3, 4, 5];
  if (start <= 0 && end >= 24 && days.length >= 7) return true;
  if (start === 0 && end === 24) return true;
  return false;
}

export function validateWindowForRealSend(
  windowCfg: { startHour?: number; endHour?: number; days?: number[] },
  allowPermissiveEnv?: string | null,
): GoLiveGateVerdict {
  if (!isPermissiveWindow(windowCfg)) {
    return { allowed: true, reason: null };
  }
  if (allowPermissiveEnv === "1") {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: "window_24_7_requires_ALLOW_PERMISSIVE_WINDOW=1",
  };
}
