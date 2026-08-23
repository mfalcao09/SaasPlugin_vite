// Política pública do programa de afiliados (Onda 1).
// Funções PURAS — sem I/O. A Nexvy é dona da atribuição; Cakto só checkout.

export const HOLD_DAYS = 30;
export const ATTRIBUTION_WINDOW_DAYS = 60;
export const RECURRING_CAP_CYCLES = 12;
export const DEFAULT_COMMISSION_PCT = 30;
export type AttributionMode = 'last_click' | 'first_click';
export const ATTRIBUTION_MODE: AttributionMode = 'last_click';

export function computeHoldUntil(now: Date, holdDays = HOLD_DAYS): string {
  return new Date(now.getTime() + holdDays * 86400000).toISOString();
}

export function canApproveCommission(args: {
  status: string;
  holdUntil: string | null | undefined;
  now: Date;
}): boolean {
  if (args.status !== 'pending') return false;
  if (!args.holdUntil) return true;
  return args.now.getTime() >= new Date(args.holdUntil).getTime();
}

export interface ClawbackInput {
  status: string;
  amountCents: number;
  originalSaleReais: number | null;
  refundReais: number | null;
  reason?: string;
}

export interface ClawbackResult {
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  amountCents: number;
  reason: string;
  needsReversal: boolean;
  unchanged?: boolean;
}

export function applyClawback(input: ClawbackInput): ClawbackResult {
  const reason = input.reason === 'chargeback' ? 'chargeback' : 'refund';
  if (input.status === 'cancelled') {
    return {
      status: 'cancelled',
      amountCents: input.amountCents,
      reason,
      needsReversal: false,
      unchanged: true,
    };
  }

  const sale = Number(input.originalSaleReais);
  const refund = input.refundReais == null ? sale : Number(input.refundReais);
  const full = !Number.isFinite(sale) || sale <= 0 || !Number.isFinite(refund) || refund >= sale;

  if (full) {
    return {
      status: 'cancelled',
      amountCents: 0,
      reason,
      needsReversal: input.status === 'paid',
    };
  }

  const remaining = Math.max(0, sale - refund);
  const nextCents = Math.round(input.amountCents * (remaining / sale));
  if (nextCents <= 0) {
    return {
      status: 'cancelled',
      amountCents: 0,
      reason: 'partial_refund',
      needsReversal: input.status === 'paid',
    };
  }

  return {
    status: input.status as ClawbackResult['status'],
    amountCents: nextCents,
    reason: 'partial_refund',
    needsReversal: false,
  };
}

export function isLeadInsideWindow(
  createdAt: string | null | undefined,
  now: Date,
  windowDays = ATTRIBUTION_WINDOW_DAYS,
): boolean {
  if (!createdAt) return true; // legado sem timestamp: não punir
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t <= windowDays * 86400000;
}

export interface LeadCandidate {
  id: string;
  affiliate_id: string;
  created_at?: string | null;
}

export function pickAttributedLead(
  leads: LeadCandidate[],
  now: Date,
  opts?: { mode?: AttributionMode; windowDays?: number },
): LeadCandidate | null {
  const mode = opts?.mode ?? ATTRIBUTION_MODE;
  const windowDays = opts?.windowDays ?? ATTRIBUTION_WINDOW_DAYS;
  const inside = leads.filter((l) => l.affiliate_id && isLeadInsideWindow(l.created_at, now, windowDays));
  if (inside.length === 0) return null;
  const sorted = [...inside].sort((a, b) => {
    const ta = new Date(a.created_at ?? 0).getTime();
    const tb = new Date(b.created_at ?? 0).getTime();
    return ta - tb;
  });
  return mode === 'first_click' ? sorted[0] : sorted[sorted.length - 1];
}

export function isOverRecurringCap(existingCycleCount: number, cap = RECURRING_CAP_CYCLES): boolean {
  return existingCycleCount >= cap;
}

export function resolveCommissionPct(affiliatePct: number, planPct: number | null | undefined): number {
  const plan = Number(planPct);
  if (Number.isFinite(plan) && plan > 0) return plan;
  return Number(affiliatePct);
}

export function shouldIncrementClicks(
  ref: string | null | undefined,
  alreadyRecorded: boolean,
): boolean {
  if (alreadyRecorded) return false;
  return typeof ref === 'string' && ref.trim().length > 0;
}

/** Cupom de DESCONTO Cakto (`?coupon=`). Não é o programa oficial de afiliados/split. */
export function checkoutCouponParam(couponCode: string | null | undefined): string | null {
  if (typeof couponCode !== 'string') return null;
  const c = couponCode.trim();
  return c.length > 0 ? c : null;
}

export function isClickAlreadyRecorded(flag: unknown): boolean {
  return flag === true || flag === '1' || flag === 'true';
}
