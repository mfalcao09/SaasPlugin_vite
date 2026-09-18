// Lead spacing — intervalo aleatório entre a 1ª bolha de leads diferentes.
// Piloto: 42s–197s após a 1ª mensagem do lead atual → not_before do próximo.
// Não espaça bolhas 2–4 do mesmo pacote.

export const LEAD_SPACING_MIN_MS = 42_000;
export const LEAD_SPACING_MAX_MS = 197_000;

export type LeadSpacingConfig = {
  minMs: number;
  maxMs: number;
};

export const DEFAULT_LEAD_SPACING: LeadSpacingConfig = {
  minMs: LEAD_SPACING_MIN_MS,
  maxMs: LEAD_SPACING_MAX_MS,
};

/**
 * Sorteia espera (ms) inclusiva em [min, max].
 * `rng` injetável (0..1) para testes determinísticos.
 */
export function sampleLeadSpacingMs(
  cfg: LeadSpacingConfig = DEFAULT_LEAD_SPACING,
  rng: () => number = Math.random,
): number {
  const lo = Math.min(cfg.minMs, cfg.maxMs);
  const hi = Math.max(cfg.minMs, cfg.maxMs);
  const span = hi - lo + 1;
  const u = Math.min(1, Math.max(0, rng()));
  // Inclusivo [lo, hi]: evita u=1 estourar hi+1
  return lo + Math.min(span - 1, Math.floor(u * span));
}

export type LeadSpacingState = {
  /** Instantâneo ISO da última 1ª bolha enviada (qualquer lead). */
  lastFirstBubbleAtIso: string | null;
  /** Próximo lead só pode abrir bolha 1 quando now >= este instante. */
  nextLeadNotBeforeIso: string | null;
  /** Último intervalo sorteado (ms), auditável. */
  lastSampledMs: number | null;
};

export function emptyLeadSpacing(): LeadSpacingState {
  return {
    lastFirstBubbleAtIso: null,
    nextLeadNotBeforeIso: null,
    lastSampledMs: null,
  };
}

/**
 * Após enviar a 1ª bolha de um lead: grava not_before do próximo.
 * Bolhas 2–4 / reply / exit NÃO chamam isto.
 */
export function afterFirstBubbleSent(
  state: LeadSpacingState,
  firstBubbleAt: Date,
  cfg: LeadSpacingConfig = DEFAULT_LEAD_SPACING,
  rng: () => number = Math.random,
): LeadSpacingState {
  const sampledMs = sampleLeadSpacingMs(cfg, rng);
  const notBefore = new Date(firstBubbleAt.getTime() + sampledMs);
  return {
    lastFirstBubbleAtIso: firstBubbleAt.toISOString(),
    nextLeadNotBeforeIso: notBefore.toISOString(),
    lastSampledMs: sampledMs,
  };
}

/** Pode abrir a 1ª bolha de um lead novo agora? */
export function canOpenNextLeadFirstBubble(
  state: LeadSpacingState,
  now: Date,
): { allowed: boolean; reason: string; notBeforeIso: string | null } {
  if (!state.nextLeadNotBeforeIso) {
    return { allowed: true, reason: "no_prior_first_bubble", notBeforeIso: null };
  }
  const t = Date.parse(state.nextLeadNotBeforeIso);
  if (!Number.isFinite(t)) {
    return { allowed: false, reason: "invalid_not_before", notBeforeIso: state.nextLeadNotBeforeIso };
  }
  if (now.getTime() < t) {
    return {
      allowed: false,
      reason: "lead_spacing_wait",
      notBeforeIso: state.nextLeadNotBeforeIso,
    };
  }
  return {
    allowed: true,
    reason: "lead_spacing_ok",
    notBeforeIso: state.nextLeadNotBeforeIso,
  };
}
