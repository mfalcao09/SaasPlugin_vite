// Onda 3 — motor de indicação como módulo do SALÃO.
// Mesmo motor (hold, last-click, clique), outro dono: organization_id do tenant.
// A salão paga do próprio faturamento. Programa de plataforma (NexvyBeauty) fica separado.
// Sem split Cakto, sem CPF da compradora no portal da cliente, sem multi-nível.

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { computeHoldUntil, resolveCommissionPct } from './affiliate-policy.ts';

export interface TenantAttributeResult {
  created: boolean;
  skipped?: string;
  commissionId?: string;
  affiliateId?: string;
}

export type AffiliateProgram = 'platform' | 'tenant';

export interface ProgrammedAffiliate {
  program?: string | null;
  owner_organization_id?: string | null;
  status?: string | null;
}

export interface PlatformPayoutRow {
  program?: string | null;
  payout_method?: string | null;
}

export function isPlatformProgram(program: string | null | undefined): boolean {
  return program == null || program === '' || program === 'platform';
}

export function isTenantProgram(program: string | null | undefined): boolean {
  return program === 'tenant';
}

export function canAttributeAsPlatform(affiliate: { program?: string | null }): boolean {
  return isPlatformProgram(affiliate.program);
}

export function canAttributeAsTenant(args: {
  affiliate: ProgrammedAffiliate;
  salonOrganizationId: string;
}): boolean {
  const org = (args.salonOrganizationId ?? '').trim();
  const owner = (args.affiliate.owner_organization_id ?? '').trim();
  return (
    isTenantProgram(args.affiliate.program) &&
    org.length > 0 &&
    owner === org &&
    (args.affiliate.status ?? 'active') === 'active'
  );
}

export function isPlatformPayoutCommission(row: PlatformPayoutRow): boolean {
  if (isTenantProgram(row.program)) return false;
  if ((row.payout_method ?? '') === 'tenant_revenue') return false;
  return true;
}

export function filterPlatformPayoutCommissions<T extends PlatformPayoutRow>(rows: T[]): T[] {
  return rows.filter(isPlatformPayoutCommission);
}

export function canGenerateTenantClientLink(args: {
  programEnabled: boolean;
  organizationId: string | null | undefined;
}): boolean {
  return Boolean(args.programEnabled && args.organizationId && String(args.organizationId).trim());
}

export function parseTenantCommissionPct(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 50) return null;
  return Math.round(n * 100) / 100;
}

export function tenantCommissionIdempotencyKey(ownerOrganizationId: string, bookingId: string): string {
  return `tenant:${ownerOrganizationId}:${bookingId}`;
}

export function tenantBookingReferralUrl(args: {
  apexUrl: string;
  slug: string;
  refCode: string;
}): string {
  const base = args.apexUrl.replace(/\/+$/, '');
  return `${base}/s/${encodeURIComponent(args.slug)}?ref=${encodeURIComponent(args.refCode)}`;
}

export function tenantReferrerStatsUrl(args: {
  apexUrl: string;
  slug: string;
  refCode: string;
}): string {
  const base = args.apexUrl.replace(/\/+$/, '');
  return `${base}/s/${encodeURIComponent(args.slug)}/indicacao/${encodeURIComponent(args.refCode)}`;
}

export interface TenantReferrerPublicStats {
  clicks: number;
  conversions: number;
  pending_count: number;
  approved_count: number;
  paid_count: number;
  cancelled_count: number;
  program: 'tenant';
}

export function sanitizeTenantReferrerStats(input: {
  clicks: number;
  commissions: Array<{
    status: string;
    buyer_document?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
}): TenantReferrerPublicStats {
  const counts = { pending: 0, approved: 0, paid: 0, cancelled: 0 };
  for (const c of input.commissions) {
    if (c.status === 'pending') counts.pending += 1;
    else if (c.status === 'approved') counts.approved += 1;
    else if (c.status === 'paid') counts.paid += 1;
    else if (c.status === 'cancelled') counts.cancelled += 1;
  }
  return {
    clicks: Number(input.clicks) || 0,
    conversions: counts.pending + counts.approved + counts.paid,
    pending_count: counts.pending,
    approved_count: counts.approved,
    paid_count: counts.paid,
    cancelled_count: counts.cancelled,
    program: 'tenant',
  };
}

export interface TenantAttributeArgs {
  ownerOrganizationId: string;
  refCode: string | null | undefined;
  bookingId: string;
  amountReais: number | null | undefined;
  buyerClienteId?: string | null;
  buyerEmail?: string | null;
}

export async function attributeTenantReferralCommission(
  admin: SupabaseClient,
  args: TenantAttributeArgs,
): Promise<TenantAttributeResult> {
  const ownerOrganizationId = (args.ownerOrganizationId ?? '').trim();
  const refCode = (args.refCode ?? '').trim();
  const bookingId = (args.bookingId ?? '').trim();
  if (!ownerOrganizationId) return { created: false, skipped: 'missing owner organization' };
  if (!refCode) return { created: false, skipped: 'missing ref' };
  if (!bookingId) return { created: false, skipped: 'missing booking_id' };

  const { data: link } = await admin
    .from('affiliate_links')
    .select('affiliate_id, ref_code')
    .ilike('ref_code', refCode)
    .maybeSingle();
  if (!link?.affiliate_id) return { created: false, skipped: 'tenant ref not found' };

  const { data: affiliate } = await admin
    .from('affiliates')
    .select('id, email, status, commission_pct, program, owner_organization_id, referrer_cliente_id')
    .eq('id', link.affiliate_id)
    .maybeSingle();
  if (!affiliate) return { created: false, skipped: 'affiliate not found' };
  if (!isTenantProgram(affiliate.program)) {
    return { created: false, skipped: 'platform affiliate is not tenant', affiliateId: affiliate.id };
  }
  if ((affiliate.owner_organization_id ?? '') !== ownerOrganizationId) {
    return { created: false, skipped: 'owner organization mismatch', affiliateId: affiliate.id };
  }
  if (affiliate.status !== 'active') {
    return { created: false, skipped: `affiliate ${affiliate.status}`, affiliateId: affiliate.id };
  }

  const { data: program } = await admin
    .from('tenant_referral_programs')
    .select('enabled, commission_pct')
    .eq('organization_id', ownerOrganizationId)
    .maybeSingle();
  if (!program?.enabled) {
    return { created: false, skipped: 'program disabled', affiliateId: affiliate.id };
  }

  const buyerClienteId = (args.buyerClienteId ?? '').trim();
  if (affiliate.referrer_cliente_id && buyerClienteId && affiliate.referrer_cliente_id === buyerClienteId) {
    return { created: false, skipped: 'self-referral blocked', affiliateId: affiliate.id };
  }
  const buyerEmail = (args.buyerEmail ?? '').trim().toLowerCase();
  if (buyerEmail && (affiliate.email ?? '').trim().toLowerCase() === buyerEmail) {
    return { created: false, skipped: 'self-referral blocked', affiliateId: affiliate.id };
  }

  const amount = Number(args.amountReais);
  const pct = resolveCommissionPct(
    Number(affiliate.commission_pct),
    program.commission_pct != null ? Number(program.commission_pct) : null,
  );
  if (!Number.isFinite(amount) || amount <= 0) {
    return { created: false, skipped: 'no amount', affiliateId: affiliate.id };
  }
  if (!Number.isFinite(pct) || pct <= 0) {
    return { created: false, skipped: 'commission_pct=0', affiliateId: affiliate.id };
  }

  const now = new Date();
  const { data: inserted, error } = await admin
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliate.id,
      lead_id: null,
      order_ref: bookingId,
      organization_id: ownerOrganizationId,
      owner_organization_id: ownerOrganizationId,
      program: 'tenant',
      amount_cents: Math.round(amount * pct),
      pct_applied: pct,
      currency: 'BRL',
      status: 'pending',
      hold_until: computeHoldUntil(now),
      payout_method: 'tenant_revenue',
      idempotency_key: tenantCommissionIdempotencyKey(ownerOrganizationId, bookingId),
      buyer_document: null,
      metadata: {
        kind: 'salon_booking',
        attribution: 'last_click',
        amount_reais: amount,
        payer: 'tenant_revenue',
      },
    })
    .select('id')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { created: false, skipped: 'duplicate (idempotent)', affiliateId: affiliate.id };
    }
    throw error;
  }

  return { created: true, commissionId: inserted?.id, affiliateId: affiliate.id };
}
