// Atribuição de comissão de afiliado — camada PRÓPRIA, provider-agnóstica.
//
// A fonte de verdade do afiliado é `sales_leads.affiliate_id` (captura ?ref=)
// OU o cupom de desconto Cakto (`coupon_code` no pedido) — sem ligar o split
// nativo da Cakto. Janela last-click 60d, hold 30d, teto 12 ciclos.

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  applyClawback,
  computeHoldUntil,
  isLeadInsideWindow,
  isOverRecurringCap,
  resolveCommissionPct,
} from './affiliate-policy.ts';
import { resolvePayoutMethod, stampCommissionPayoutMeta } from './affiliate-onda2.ts';

const VELOCITY_WINDOW_MS = 10 * 60 * 1000;
const VELOCITY_MAX_SAME_BUYER = 1;
const VELOCITY_MAX_AFFILIATE = 20;

export interface AttributeArgs {
  customerEmail: string | null | undefined;
  orderRef: string;
  amountReais: number | null | undefined;
  organizationId?: string | null;
  kind?: 'first_sale' | 'recurring';
  buyerDocument?: string | null;
  buyerIp?: string | null;
  /** Cupom de DESCONTO Cakto (não é afiliado nativo). */
  couponCode?: string | null;
  customerPhone?: string | null;
  planSlug?: string | null;
}

export interface AttributeResult {
  created: boolean;
  skipped?: string;
  commissionId?: string;
  affiliateId?: string;
  flagged?: boolean;
}

interface CommissionRow {
  affiliate_id?: string | null;
  buyer_document?: string | null;
  buyer_ip?: string | null;
  created_at?: string | null;
  status?: string | null;
  metadata?: { customer_email?: string | null } | null;
}

function normalizeDocument(doc: string | null | undefined): string {
  return (doc ?? '').replace(/\D+/g, '');
}

function normalizeCoupon(code: string | null | undefined): string {
  return (code ?? '').trim();
}

async function findLeadByEmail(admin: SupabaseClient, email: string) {
  const { data } = await admin
    .from('sales_leads')
    .select('id, affiliate_id, created_at')
    .eq('email', email)
    .not('affiliate_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; affiliate_id: string; created_at?: string | null } | null;
}

async function findLeadByPhone(admin: SupabaseClient, phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const { data } = await admin
    .from('sales_leads')
    .select('id, affiliate_id, created_at')
    .eq('whatsapp', phone)
    .not('affiliate_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; affiliate_id: string; created_at?: string | null } | null;
}

async function findAffiliateByCoupon(admin: SupabaseClient, coupon: string) {
  const { data } = await admin
    .from('affiliate_links')
    .select('affiliate_id, coupon_code')
    .ilike('coupon_code', coupon)
    .limit(1)
    .maybeSingle();
  return data as { affiliate_id: string; coupon_code: string } | null;
}

export async function attributeAffiliateCommission(
  admin: SupabaseClient,
  args: AttributeArgs,
): Promise<AttributeResult> {
  const email = (args.customerEmail ?? '').trim().toLowerCase();
  const orderRef = (args.orderRef ?? '').trim();
  const kind = args.kind ?? 'first_sale';
  const doc = normalizeDocument(args.buyerDocument);
  const ip = (args.buyerIp ?? '').trim();
  const coupon = normalizeCoupon(args.couponCode);
  const now = new Date();

  if (!orderRef) return { created: false, skipped: 'missing order_ref' };
  if (!email && !coupon) return { created: false, skipped: 'missing customer_email' };

  let attribution: 'lead' | 'coupon' = 'lead';
  let lead = email ? await findLeadByEmail(admin, email) : null;
  if (!lead?.affiliate_id && args.customerPhone) {
    lead = await findLeadByPhone(admin, args.customerPhone);
  }

  if (lead?.affiliate_id && !isLeadInsideWindow(lead.created_at, now)) {
    return { created: false, skipped: 'attribution window expired' };
  }

  let affiliateId = lead?.affiliate_id ?? null;
  if (!affiliateId && coupon) {
    const link = await findAffiliateByCoupon(admin, coupon);
    if (link?.affiliate_id) {
      affiliateId = link.affiliate_id;
      attribution = 'coupon';
      lead = null;
    }
  }

  if (!affiliateId) return { created: false, skipped: 'no affiliate lead for email' };

  const { data: affiliate } = await admin
    .from('affiliates')
    .select('id, email, status, commission_pct, organization_id, payout_preference, program')
    .eq('id', affiliateId)
    .maybeSingle();

  if (!affiliate) return { created: false, skipped: 'affiliate not found' };
  if ((affiliate as { program?: string | null }).program === 'tenant') {
    return { created: false, skipped: 'tenant program is not platform', affiliateId: affiliate.id };
  }
  if (affiliate.status !== 'active') {
    return { created: false, skipped: `affiliate ${affiliate.status}`, affiliateId: affiliate.id };
  }

  if (email && (affiliate.email ?? '').trim().toLowerCase() === email) {
    return { created: false, skipped: 'self-purchase blocked', affiliateId: affiliate.id };
  }

  const windowStart = Date.now() - VELOCITY_WINDOW_MS;
  const { data: recentRaw } = await admin
    .from('affiliate_commissions')
    .select('affiliate_id, buyer_document, buyer_ip, created_at, status, metadata')
    .gte('created_at', new Date(windowStart).toISOString());
  const allRecent: CommissionRow[] = Array.isArray(recentRaw) ? (recentRaw as CommissionRow[]) : [];
  const recent = allRecent.filter((c) => {
    if (!c.created_at) return true;
    const t = new Date(c.created_at).getTime();
    return Number.isFinite(t) && t >= windowStart;
  });

  const { data: cycleRaw } = await admin
    .from('affiliate_commissions')
    .select('id, status, metadata, affiliate_id')
    .eq('affiliate_id', affiliate.id);
  const cycles = (Array.isArray(cycleRaw) ? cycleRaw : []) as CommissionRow[];
  const cycleCount = cycles.filter((c) => {
    if (c.affiliate_id !== affiliate.id) return false;
    if ((c.status ?? '') === 'cancelled') return false;
    const cEmail = (c.metadata?.customer_email ?? '').trim().toLowerCase();
    return email.length > 0 && cEmail === email;
  }).length;
  if (isOverRecurringCap(cycleCount)) {
    return { created: false, skipped: 'recurring cap reached', affiliateId: affiliate.id };
  }

  const fraudReasons: string[] = [];
  let flagged = false;

  const sameBuyerSameAffiliate = recent.filter((c) => {
    if (c.affiliate_id !== affiliate.id) return false;
    const cDoc = normalizeDocument(c.buyer_document);
    const docMatch = doc.length > 0 && cDoc.length > 0 && cDoc === doc;
    const emailMatch = (c.metadata?.customer_email ?? '').trim().toLowerCase() === email;
    return docMatch || emailMatch;
  }).length;
  if (sameBuyerSameAffiliate >= VELOCITY_MAX_SAME_BUYER) {
    return { created: false, skipped: 'velocity: repeat buyer in window', affiliateId: affiliate.id };
  }

  const affiliateVolume = recent.filter((c) => c.affiliate_id === affiliate.id).length;
  if (affiliateVolume > VELOCITY_MAX_AFFILIATE) {
    flagged = true;
    fraudReasons.push(`affiliate_velocity:${affiliateVolume}_in_${VELOCITY_WINDOW_MS / 60000}min`);
  }

  if (ip) {
    const ipCrossAffiliate = recent.some((c) => c.buyer_ip === ip && c.affiliate_id !== affiliate.id);
    if (ipCrossAffiliate) {
      flagged = true;
      fraudReasons.push('ip_shared_cross_affiliate');
    }
  }

  const amount = Number(args.amountReais);
  let planPct: number | null = null;
  if (args.planSlug) {
    const { data: rate } = await admin
      .from('affiliate_plan_rates')
      .select('commission_pct')
      .eq('plan_slug', args.planSlug)
      .maybeSingle();
    planPct = rate?.commission_pct != null ? Number(rate.commission_pct) : null;
  }
  const pct = resolveCommissionPct(Number(affiliate.commission_pct), planPct);
  if (!Number.isFinite(amount) || amount <= 0) return { created: false, skipped: 'no amount', affiliateId: affiliate.id };
  if (!Number.isFinite(pct) || pct <= 0) return { created: false, skipped: 'commission_pct=0', affiliateId: affiliate.id };
  const amountCents = Math.round(amount * pct);
  const payout = resolvePayoutMethod({
    preference: affiliate.payout_preference ?? null,
    organizationId: affiliate.organization_id ?? null,
    pixKey: null,
  });

  const { data: inserted, error } = await admin
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliate.id,
      lead_id: lead?.id ?? null,
      order_ref: orderRef,
      organization_id: args.organizationId ?? null,
      amount_cents: amountCents,
      pct_applied: pct,
      currency: 'BRL',
      status: 'pending',
      hold_until: computeHoldUntil(now),
      plan_slug: args.planSlug ?? null,
      payout_method: payout.method,
      idempotency_key: orderRef,
      buyer_document: doc || null,
      buyer_ip: ip || null,
      review_status: flagged ? 'flagged' : 'clear',
      metadata: stampCommissionPayoutMeta({
        kind,
        customer_email: email || null,
        amount_reais: amount,
        attribution,
        ...(args.planSlug ? { plan_slug: args.planSlug } : {}),
        ...(coupon ? { coupon_code: coupon } : {}),
        ...(flagged ? { fraud: fraudReasons } : {}),
      }, payout.method),
    })
    .select('id')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { created: false, skipped: 'duplicate (idempotent)', affiliateId: affiliate.id };
    }
    throw error;
  }

  return { created: true, commissionId: inserted?.id, affiliateId: affiliate.id, flagged };
}

export interface ClawbackArgs {
  orderRef: string;
  reason?: 'refund' | 'chargeback';
  refundReais?: number | null;
}

export interface ClawbackFnResult {
  updated: boolean;
  cancelled: number;
  skipped?: string;
}

export async function clawbackAffiliateCommission(
  admin: SupabaseClient,
  args: ClawbackArgs,
): Promise<ClawbackFnResult> {
  const orderRef = (args.orderRef ?? '').trim();
  if (!orderRef) return { updated: false, cancelled: 0, skipped: 'missing order_ref' };

  const { data: rowsRaw } = await admin
    .from('affiliate_commissions')
    .select('id, status, amount_cents, metadata')
    .eq('order_ref', orderRef);
  const rows = (Array.isArray(rowsRaw) ? rowsRaw : rowsRaw ? [rowsRaw] : []) as Array<{
    id: string;
    status: string;
    amount_cents: number;
    metadata?: { amount_reais?: number } | null;
  }>;

  let cancelled = 0;
  let updated = false;
  for (const row of rows) {
    const originalSaleReais = Number(row.metadata?.amount_reais);
    const next = applyClawback({
      status: row.status,
      amountCents: Number(row.amount_cents),
      originalSaleReais: Number.isFinite(originalSaleReais) ? originalSaleReais : null,
      refundReais: args.refundReais ?? null,
      reason: args.reason,
    });
    if (next.unchanged) continue;
    const metadata = {
      ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
      clawback_reason: next.reason,
      clawback_at: new Date().toISOString(),
      needs_reversal: next.needsReversal,
    };
    await admin
      .from('affiliate_commissions')
      .update({
        status: next.status,
        amount_cents: next.amountCents,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    updated = true;
    if (next.status === 'cancelled') cancelled += 1;
  }

  return { updated, cancelled, skipped: updated ? undefined : 'no commission for order' };
}
