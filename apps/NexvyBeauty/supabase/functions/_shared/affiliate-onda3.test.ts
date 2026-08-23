// Onda 3 — módulo do salão: cliente indica amiga. Dono = organization_id do salão.
// Isolamento: comissão tenant ≠ comissão plataforma (leitura e payout).
// Rodar: deno test apps/NexvyBeauty/supabase/functions/_shared/affiliate-onda3.test.ts

import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  attributeTenantReferralCommission,
  canAttributeAsPlatform,
  canAttributeAsTenant,
  canGenerateTenantClientLink,
  filterPlatformPayoutCommissions,
  isPlatformPayoutCommission,
  parseTenantCommissionPct,
  sanitizeTenantReferrerStats,
  tenantBookingReferralUrl,
  tenantCommissionIdempotencyKey,
  tenantReferrerStatsUrl,
} from './affiliate-onda3.ts';
import { attributeAffiliateCommission } from './affiliate-commission.ts';
import { groupApproved, listApproved, type CommissionRow } from '../affiliate-payout/payout-core.ts';

type Resp = { data: unknown; error: unknown };

function makeAdmin(
  responses: Record<string, Resp>,
  listResponses: Record<string, Resp> = {},
) {
  const captured: Record<string, unknown> = {};
  const admin = {
    from(table: string) {
      const listResp: Resp = listResponses[table] ?? { data: [], error: null };
      const singleResp = (): Resp => responses[table] ?? { data: null, error: null };
      const b: Record<string, unknown> = {};
      const chain = () => b;
      b.select = chain;
      b.eq = chain;
      b.neq = chain;
      b.not = chain;
      b.order = chain;
      b.limit = chain;
      b.gte = chain;
      b.ilike = chain;
      b.in = chain;
      b.update = (row: unknown) => {
        captured[table + ':update'] = row;
        return b;
      };
      b.insert = (row: unknown) => {
        captured[table] = row;
        return b;
      };
      b.maybeSingle = () => Promise.resolve(singleResp());
      b.single = () => Promise.resolve(singleResp());
      b.then = (
        onF: (v: Resp) => unknown,
        onR?: (e: unknown) => unknown,
      ) => Promise.resolve(listResp).then(onF, onR);
      return b;
    },
  };
  return { admin: admin as any, captured };
}

Deno.test('discriminator: tenant não é programa de plataforma', () => {
  assertEquals(canAttributeAsPlatform({ program: 'platform' }), true);
  assertEquals(canAttributeAsPlatform({ program: null }), true);
  assertEquals(canAttributeAsPlatform({ program: undefined }), true);
  assertEquals(canAttributeAsPlatform({ program: 'tenant' }), false);
});

Deno.test('discriminator: tenant só atribui no salão dono', () => {
  const aff = { program: 'tenant', owner_organization_id: 'org-salon', status: 'active' };
  assertEquals(canAttributeAsTenant({ affiliate: aff, salonOrganizationId: 'org-salon' }), true);
  assertEquals(canAttributeAsTenant({ affiliate: aff, salonOrganizationId: 'org-other' }), false);
  assertEquals(canAttributeAsTenant({
    affiliate: { program: 'platform', owner_organization_id: 'org-salon', status: 'active' },
    salonOrganizationId: 'org-salon',
  }), false);
});

Deno.test('payout: comissão tenant não entra no lote da plataforma', () => {
  assertEquals(isPlatformPayoutCommission({ program: 'platform', payout_method: 'pix' }), true);
  assertEquals(isPlatformPayoutCommission({ program: 'tenant', payout_method: 'pix' }), false);
  assertEquals(isPlatformPayoutCommission({ program: 'tenant', payout_method: 'tenant_revenue' }), false);
  const mixed: CommissionRow[] = [
    { id: 'plat', affiliate_id: 'aff-p', amount_cents: 3000, status: 'approved', payout_item_id: null, program: 'platform' },
    { id: 'ten', affiliate_id: 'aff-t', amount_cents: 9999, status: 'approved', payout_item_id: null, program: 'tenant' },
  ];
  const onlyPlatform = filterPlatformPayoutCommissions(mixed);
  assertEquals(onlyPlatform.map((c) => c.id), ['plat']);
  const groups = groupApproved(onlyPlatform, {
    'aff-p': { name: 'Plataforma', pix_key: 'p@pix' },
    'aff-t': { name: 'Cliente', pix_key: 't@pix' },
  });
  assertEquals(groups.length, 1);
  assertEquals(groups[0].affiliate_id, 'aff-p');
  assertEquals(groups[0].amount_cents, 3000);
});

Deno.test('payout: listApproved não lê/paga comissão tenant mesmo se o db vazou a linha', async () => {
  const commissions: CommissionRow[] = [
    { id: 'ten', affiliate_id: 'aff-t', amount_cents: 5000, status: 'approved', payout_item_id: null, program: 'tenant', payout_method: 'tenant_revenue' },
  ];
  const db = {
    listApprovedCommissions: () => Promise.resolve(filterPlatformPayoutCommissions(commissions)),
    getAffiliates: () => Promise.resolve({ 'aff-t': { name: 'Cliente', pix_key: 't@pix' } }),
  };
  const res = await listApproved(db as any);
  assertEquals(res.affiliates_count, 0);
  assertEquals(res.total_cents, 0);
});

Deno.test('plataforma: attributeAffiliateCommission recusa afiliado tenant', async () => {
  const { admin, captured } = makeAdmin({
    sales_leads: { data: { id: 'lead-1', affiliate_id: 'aff-tenant' }, error: null },
    affiliates: {
      data: {
        id: 'aff-tenant',
        email: 'cliente@salao.com',
        status: 'active',
        commission_pct: 10,
        program: 'tenant',
        owner_organization_id: 'org-salon',
      },
      error: null,
    },
    affiliate_commissions: { data: { id: 'should-not' }, error: null },
  });
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'amiga@x.com',
    orderRef: 'CAKTO-1',
    amountReais: 197,
    organizationId: 'org-nexvy-customer',
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'tenant program is not platform');
  assertEquals(captured['affiliate_commissions'], undefined);
});

Deno.test('tenant: atribui no booking do salão dono e carimba program=tenant', async () => {
  const { admin, captured } = makeAdmin({
    affiliate_links: { data: { affiliate_id: 'aff-t', ref_code: 'maria-abc' }, error: null },
    affiliates: {
      data: {
        id: 'aff-t',
        email: 'maria@x.com',
        status: 'active',
        commission_pct: 10,
        program: 'tenant',
        owner_organization_id: 'org-salon',
        referrer_cliente_id: 'cli-maria',
      },
      error: null,
    },
    tenant_referral_programs: { data: { organization_id: 'org-salon', enabled: true, commission_pct: 10 }, error: null },
    affiliate_commissions: { data: { id: 'comm-t' }, error: null },
  });
  const res = await attributeTenantReferralCommission(admin, {
    ownerOrganizationId: 'org-salon',
    refCode: 'maria-abc',
    bookingId: 'ag-1',
    amountReais: 120,
    buyerClienteId: 'cli-amiga',
  });
  assertEquals(res.created, true);
  assertEquals(res.commissionId, 'comm-t');
  const row = captured['affiliate_commissions'] as Record<string, unknown>;
  assertEquals(row.program, 'tenant');
  assertEquals(row.owner_organization_id, 'org-salon');
  assertEquals(row.idempotency_key, tenantCommissionIdempotencyKey('org-salon', 'ag-1'));
  assertEquals(row.payout_method, 'tenant_revenue');
  assertEquals(row.buyer_document, null);
  const meta = JSON.stringify(row.metadata ?? {});
  assertEquals(meta.includes('cpf'), false);
  assertEquals(meta.includes('amiga'), false);
});

Deno.test('tenant: afiliado de plataforma não vira comissão do salão', async () => {
  const { admin, captured } = makeAdmin({
    affiliate_links: { data: { affiliate_id: 'aff-p', ref_code: 'nexvy-ref' }, error: null },
    affiliates: {
      data: {
        id: 'aff-p',
        email: 'parceiro@x.com',
        status: 'active',
        commission_pct: 30,
        program: 'platform',
        owner_organization_id: null,
      },
      error: null,
    },
    tenant_referral_programs: { data: { organization_id: 'org-salon', enabled: true, commission_pct: 10 }, error: null },
    affiliate_commissions: { data: { id: 'x' }, error: null },
  });
  const res = await attributeTenantReferralCommission(admin, {
    ownerOrganizationId: 'org-salon',
    refCode: 'nexvy-ref',
    bookingId: 'ag-2',
    amountReais: 120,
    buyerClienteId: 'cli-amiga',
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'platform affiliate is not tenant');
  assertEquals(captured['affiliate_commissions'], undefined);
});

Deno.test('tenant: outro salão não captura o link (owner isolation)', async () => {
  const { admin, captured } = makeAdmin({
    affiliate_links: { data: { affiliate_id: 'aff-t', ref_code: 'maria-abc' }, error: null },
    affiliates: {
      data: {
        id: 'aff-t',
        status: 'active',
        commission_pct: 10,
        program: 'tenant',
        owner_organization_id: 'org-salon-a',
        referrer_cliente_id: 'cli-maria',
      },
      error: null,
    },
    tenant_referral_programs: { data: { enabled: true, commission_pct: 10 }, error: null },
    affiliate_commissions: { data: { id: 'x' }, error: null },
  });
  const res = await attributeTenantReferralCommission(admin, {
    ownerOrganizationId: 'org-salon-b',
    refCode: 'maria-abc',
    bookingId: 'ag-3',
    amountReais: 80,
    buyerClienteId: 'cli-amiga',
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'owner organization mismatch');
  assertEquals(captured['affiliate_commissions'], undefined);
});

Deno.test('tenant: autoindicação da própria cliente é bloqueada', async () => {
  const { admin, captured } = makeAdmin({
    affiliate_links: { data: { affiliate_id: 'aff-t', ref_code: 'maria-abc' }, error: null },
    affiliates: {
      data: {
        id: 'aff-t',
        email: 'maria@x.com',
        status: 'active',
        commission_pct: 10,
        program: 'tenant',
        owner_organization_id: 'org-salon',
        referrer_cliente_id: 'cli-maria',
      },
      error: null,
    },
    tenant_referral_programs: { data: { enabled: true, commission_pct: 10 }, error: null },
    affiliate_commissions: { data: { id: 'x' }, error: null },
  });
  const res = await attributeTenantReferralCommission(admin, {
    ownerOrganizationId: 'org-salon',
    refCode: 'maria-abc',
    bookingId: 'ag-self',
    amountReais: 80,
    buyerClienteId: 'cli-maria',
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'self-referral blocked');
  assertEquals(captured['affiliate_commissions'], undefined);
});

Deno.test('stats públicas: sem CPF, e-mail, telefone ou nome da amiga', () => {
  const stats = sanitizeTenantReferrerStats({
    clicks: 4,
    commissions: [{
      status: 'pending',
      buyer_document: '12345678901',
      metadata: {
        customer_email: 'amiga@x.com',
        customer_phone: '11999999999',
        customer_name: 'Ana Souza',
        cpf: '12345678901',
      },
    }],
  });
  const dumped = JSON.stringify(stats);
  assertEquals(stats.clicks, 4);
  assertEquals(stats.pending_count, 1);
  assertEquals(stats.program, 'tenant');
  assertEquals(dumped.includes('12345678901'), false);
  assertEquals(dumped.includes('amiga@x.com'), false);
  assertEquals(dumped.includes('11999999999'), false);
  assertEquals(dumped.includes('Ana Souza'), false);
  assertEquals(dumped.includes('cpf'), false);
});

Deno.test('admin do salão: só gera link com programa ligado', () => {
  assertEquals(canGenerateTenantClientLink({ programEnabled: true, organizationId: 'org-1' }), true);
  assertEquals(canGenerateTenantClientLink({ programEnabled: false, organizationId: 'org-1' }), false);
  assertEquals(canGenerateTenantClientLink({ programEnabled: true, organizationId: null }), false);
});

Deno.test('pct do salão: 1–50; rejeita 0 e acima do teto', () => {
  assertEquals(parseTenantCommissionPct(10), 10);
  assertEquals(parseTenantCommissionPct(0), null);
  assertEquals(parseTenantCommissionPct(51), null);
  assertEquals(parseTenantCommissionPct('x'), null);
});

Deno.test('URLs do módulo: booking do salão, não checkout Cakto', () => {
  const book = tenantBookingReferralUrl({
    apexUrl: 'https://nexvybeauty.com.br',
    slug: 'studio-lua',
    refCode: 'maria-abc',
  });
  const stats = tenantReferrerStatsUrl({
    apexUrl: 'https://nexvybeauty.com.br',
    slug: 'studio-lua',
    refCode: 'maria-abc',
  });
  assertEquals(book, 'https://nexvybeauty.com.br/s/studio-lua?ref=maria-abc');
  assertEquals(stats, 'https://nexvybeauty.com.br/s/studio-lua/indicacao/maria-abc');
  assertStringIncludes(book, '/s/');
  assertEquals(book.includes('cakto'), false);
});
