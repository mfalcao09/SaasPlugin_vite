// Onda 2 — dono indica dono (crédito ou PIX), estágio do funil, WhatsApp sem PII.
// Funções puras + settle com porta injetada. Sem split Cakto, sem CPF, sem multi-nível.

export type PayoutPreference = 'pix' | 'subscription_credit';
export type AffiliateLeadStage = 'captured' | 'in_conversation' | 'checkout' | 'paid';
export type AffiliateWaEvent = 'booked' | 'paid' | 'refund_requested';
export type StageEvent = 'captured' | 'conversation' | 'checkout' | 'paid' | 'booked';

const STAGE_RANK: Record<AffiliateLeadStage, number> = {
  captured: 1,
  in_conversation: 2,
  checkout: 3,
  paid: 4,
};

const EVENT_TO_STAGE: Record<StageEvent, AffiliateLeadStage> = {
  captured: 'captured',
  conversation: 'in_conversation',
  booked: 'in_conversation',
  checkout: 'checkout',
  paid: 'paid',
};

export function parsePayoutPreference(raw: unknown): PayoutPreference | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'pix') return 'pix';
  if (v === 'subscription_credit') return 'subscription_credit';
  return null;
}

export function resolvePayoutMethod(args: {
  preference: PayoutPreference | null | undefined;
  organizationId: string | null | undefined;
  pixKey?: string | null;
}): { method: PayoutPreference; reason: string } {
  if (args.preference === 'subscription_credit') {
    if (args.organizationId && String(args.organizationId).trim()) {
      return { method: 'subscription_credit', reason: 'preference_credit' };
    }
    return { method: 'pix', reason: 'credit_requires_organization' };
  }
  if (args.preference === 'pix') return { method: 'pix', reason: 'preference_pix' };
  return { method: 'pix', reason: 'default_pix' };
}

export function creditDaysFromCommission(args: {
  amountCents: number;
  monthlyPriceCents: number | null;
}): number {
  const amount = Number(args.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const monthly = Number(args.monthlyPriceCents);
  if (!Number.isFinite(monthly) || monthly <= 0) return 30;
  return Math.max(1, Math.round((amount / monthly) * 30));
}

export function applySubscriptionCredit(args: {
  currentPeriodEnd: string | null;
  now: Date;
  extraDays: number;
}): { nextPeriodEnd: string; complimentaryReason: string } {
  const days = Math.max(0, Number(args.extraDays) || 0);
  const end = args.currentPeriodEnd ? new Date(args.currentPeriodEnd) : null;
  const endOk = end && Number.isFinite(end.getTime());
  const base = endOk && end!.getTime() > args.now.getTime() ? end! : args.now;
  const next = new Date(base.getTime() + days * 86400000);
  return {
    nextPeriodEnd: next.toISOString(),
    complimentaryReason: `affiliate_credit:${days}d`,
  };
}

export function mapAffiliateLeadStage(signals: {
  hasLead: boolean;
  hasConversation: boolean;
  hasCheckout: boolean;
  hasPaid: boolean;
}): AffiliateLeadStage | null {
  if (!signals.hasLead) return null;
  if (signals.hasPaid) return 'paid';
  if (signals.hasCheckout) return 'checkout';
  if (signals.hasConversation) return 'in_conversation';
  return 'captured';
}

export function nextStageAfterEvent(
  current: AffiliateLeadStage | null | undefined,
  event: StageEvent,
): AffiliateLeadStage {
  const incoming = EVENT_TO_STAGE[event];
  if (!current) return incoming;
  return STAGE_RANK[incoming] >= STAGE_RANK[current] ? incoming : current;
}

export function composeAffiliateWaNotice(args: {
  event: AffiliateWaEvent;
  stage: AffiliateLeadStage;
  payoutMethod?: PayoutPreference | null;
}): { text: string; containsPii: false } {
  const stageLabel: Record<AffiliateLeadStage, string> = {
    captured: 'capturado',
    in_conversation: 'em conversa',
    checkout: 'checkout',
    paid: 'pago',
  };
  const stage = stageLabel[args.stage];
  let text = '';
  if (args.event === 'booked') {
    text = `Seu indicado agendou a reunião. Estágio do funil: ${stage}.`;
  } else if (args.event === 'paid') {
    const how = args.payoutMethod === 'subscription_credit'
      ? 'crédito na sua assinatura'
      : 'PIX (após o hold)';
    text = `Seu indicado pagou. Comissão como ${how}. Estágio: ${stage}.`;
  } else {
    text = `Seu indicado pediu reembolso. A comissão entra em revisão. Estágio: ${stage}.`;
  }
  return { text, containsPii: false };
}

export function shouldNotifyWhatsApp(args: {
  event: AffiliateWaEvent;
  alreadySent: boolean;
}): boolean {
  return !args.alreadySent && Boolean(args.event);
}

export function firstNameOnly(fullName: string | null | undefined): string | null {
  const raw = (fullName ?? '').trim();
  if (!raw) return null;
  if (/@/.test(raw)) return null;
  if (/^\+?\d[\d\s().-]{7,}$/.test(raw)) return null;
  const first = raw.split(/\s+/)[0] ?? '';
  if (first.length < 2) return null;
  return first;
}

export function affiliateReferrerMemoryLine(fullName: string | null | undefined): string {
  const first = firstNameOnly(fullName);
  if (!first) return '';
  return `Indicação: veio da ${first}. Não contradiga o pitch que ela já ouviu. Sem dado pessoal do comprador.`;
}

export function parseCosellStub(body: unknown):
  | { ok: true; value: { meetingAt: string; closerUserId: string | null; splitKind: 'cosell' } }
  | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = typeof b.meeting_at === 'string' ? b.meeting_at.trim() : '';
  const t = Date.parse(raw);
  if (!raw || !Number.isFinite(t)) return { ok: false, error: 'meeting_at inválido' };
  const closer = typeof b.closer_user_id === 'string' && b.closer_user_id.trim()
    ? b.closer_user_id.trim()
    : null;
  return {
    ok: true,
    value: { meetingAt: new Date(t).toISOString(), closerUserId: closer, splitKind: 'cosell' },
  };
}

const ACTIVE_PLAN = new Set(['active', 'trialing', 'trial']);

export function canSalonOwnerGenerateLink(args: {
  organizationId: string | null | undefined;
  planStatus: string | null | undefined;
}): boolean {
  if (!args.organizationId || !String(args.organizationId).trim()) return false;
  return ACTIVE_PLAN.has(String(args.planStatus ?? '').trim().toLowerCase());
}

export function stampCommissionPayoutMeta(
  existing: Record<string, unknown> | null | undefined,
  method: PayoutPreference,
): Record<string, unknown> {
  return { ...(existing ?? {}), payout_method: method };
}

export interface CreditAffiliate {
  organization_id: string | null;
  payout_preference: PayoutPreference | null;
  name?: string | null;
}

export interface CreditSubscription {
  id: string;
  current_period_end: string | null;
  price_monthly: number | null;
}

export interface CreditDb {
  getAffiliate(id: string): Promise<CreditAffiliate | null>;
  getSubscription(orgId: string): Promise<CreditSubscription | null>;
  insertCredit(row: Record<string, unknown>): Promise<{ id: string }>;
  updateSubscription(id: string, patch: Record<string, unknown>): Promise<void>;
  markCommissionPaid(id: string, creditId: string): Promise<void>;
}

export async function settleSubscriptionCredit(
  db: CreditDb,
  args: {
    commissionId: string;
    affiliateId: string;
    amountCents: number;
    now: Date;
  },
): Promise<{ ok: true; creditId: string; days: number } | { ok: false; reason: string }> {
  const aff = await db.getAffiliate(args.affiliateId);
  const resolved = resolvePayoutMethod({
    preference: aff?.payout_preference ?? 'subscription_credit',
    organizationId: aff?.organization_id ?? null,
  });
  if (resolved.method !== 'subscription_credit' || !aff?.organization_id) {
    return { ok: false, reason: 'credit_requires_organization' };
  }

  const sub = await db.getSubscription(aff.organization_id);
  const monthlyCents = sub?.price_monthly != null ? Math.round(Number(sub.price_monthly) * 100) : null;
  const days = creditDaysFromCommission({
    amountCents: args.amountCents,
    monthlyPriceCents: monthlyCents,
  });
  const applied = applySubscriptionCredit({
    currentPeriodEnd: sub?.current_period_end ?? null,
    now: args.now,
    extraDays: days,
  });

  const credit = await db.insertCredit({
    affiliate_id: args.affiliateId,
    organization_id: aff.organization_id,
    commission_id: args.commissionId,
    amount_cents: args.amountCents,
    days_applied: days,
    status: 'applied',
    applied_at: args.now.toISOString(),
    metadata: { complimentary_reason: applied.complimentaryReason },
  });

  if (sub?.id) {
    await db.updateSubscription(sub.id, {
      current_period_end: applied.nextPeriodEnd,
      is_complimentary: true,
      complimentary_reason: applied.complimentaryReason,
      complimentary_since: args.now.toISOString(),
    });
  }

  await db.markCommissionPaid(args.commissionId, credit.id);
  return { ok: true, creditId: credit.id, days };
}

export function monthlyPriceToCents(priceMonthly: number | null | undefined): number | null {
  const n = Number(priceMonthly);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function slugifyAffiliateName(name: string): string {
  return (name || 'afiliado')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'afiliado';
}

export function randomRefSuffix(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString(36).slice(0, 6).padStart(6, '0');
}
