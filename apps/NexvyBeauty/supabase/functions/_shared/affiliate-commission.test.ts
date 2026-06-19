// Testes do helper de atribuição de comissão de afiliado.
// Rodar: deno test apps/NexvyBeauty/supabase/functions/_shared/affiliate-commission.test.ts
// Mocka o client Supabase (sem banco) — prova a lógica de comissão, idempotência e antifraude.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { attributeAffiliateCommission } from './affiliate-commission.ts';

type Resp = { data: unknown; error: unknown };

/** Mock mínimo do supabase-js: chaining + terminais maybeSingle/single, captura o insert. */
function makeAdmin(responses: Record<string, Resp>) {
  const captured: Record<string, unknown> = {};
  const admin = {
    from(table: string) {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      b.select = chain;
      b.eq = chain;
      b.not = chain;
      b.order = chain;
      b.limit = chain;
      b.insert = (row: unknown) => {
        captured[table] = row;
        return b;
      };
      b.maybeSingle = () => Promise.resolve(responses[table] ?? { data: null, error: null });
      b.single = () => Promise.resolve(responses[table] ?? { data: null, error: null });
      return b;
    },
  };
  // deno-lint-ignore no-explicit-any
  return { admin: admin as any, captured };
}

const LEAD = { data: { id: 'lead-1', affiliate_id: 'aff-1' }, error: null };
const AFF_ACTIVE = { data: { id: 'aff-1', email: 'parceiro@x.com', status: 'active', commission_pct: 30 }, error: null };

Deno.test('cria comissão com valor e status corretos', async () => {
  const { admin, captured } = makeAdmin({
    sales_leads: LEAD,
    affiliates: AFF_ACTIVE,
    affiliate_commissions: { data: { id: 'comm-1' }, error: null },
  });
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'Comprador@X.com',
    orderRef: 'ORDER-123',
    amountReais: 197,
    organizationId: 'org-1',
    kind: 'first_sale',
  });
  assertEquals(res.created, true);
  assertEquals(res.commissionId, 'comm-1');
  const row = captured['affiliate_commissions'] as Record<string, unknown>;
  assertEquals(row.amount_cents, 5910); // 197 * 30
  assertEquals(row.pct_applied, 30);
  assertEquals(row.status, 'pending');
  assertEquals(row.idempotency_key, 'ORDER-123');
  assertEquals(row.affiliate_id, 'aff-1');
  assertEquals(row.lead_id, 'lead-1');
});

Deno.test('idempotente: unique_violation (23505) não duplica', async () => {
  const { admin } = makeAdmin({
    sales_leads: LEAD,
    affiliates: AFF_ACTIVE,
    affiliate_commissions: { data: null, error: { code: '23505' } },
  });
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'comprador@x.com',
    orderRef: 'ORDER-123',
    amountReais: 197,
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'duplicate (idempotent)');
});

Deno.test('bloqueia auto-compra (afiliado = comprador)', async () => {
  const { admin, captured } = makeAdmin({
    sales_leads: LEAD,
    affiliates: AFF_ACTIVE, // email parceiro@x.com
    affiliate_commissions: { data: { id: 'x' }, error: null },
  });
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'parceiro@x.com',
    orderRef: 'ORDER-9',
    amountReais: 197,
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'self-purchase blocked');
  assertEquals(captured['affiliate_commissions'], undefined); // não inseriu
});

Deno.test('venda orgânica (lead sem afiliado) não gera comissão', async () => {
  const { admin } = makeAdmin({
    sales_leads: { data: null, error: null },
  });
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'comprador@x.com',
    orderRef: 'ORDER-7',
    amountReais: 197,
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'no affiliate lead for email');
});

Deno.test('afiliado não-ativo não gera comissão', async () => {
  const { admin } = makeAdmin({
    sales_leads: LEAD,
    affiliates: { data: { id: 'aff-1', email: 'p@x.com', status: 'paused', commission_pct: 30 }, error: null },
  });
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'comprador@x.com',
    orderRef: 'ORDER-5',
    amountReais: 197,
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'affiliate paused');
});
