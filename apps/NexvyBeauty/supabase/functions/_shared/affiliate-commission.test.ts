// Testes do helper de atribuição de comissão de afiliado.
// Rodar: deno test apps/NexvyBeauty/supabase/functions/_shared/affiliate-commission.test.ts
// Mocka o client Supabase (sem banco) — prova a lógica de comissão, idempotência e antifraude.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { attributeAffiliateCommission } from './affiliate-commission.ts';

type Resp = { data: unknown; error: unknown };

/**
 * Mock mínimo do supabase-js: chaining + terminais maybeSingle/single, captura o insert.
 *
 * Para `affiliate_commissions` há DOIS acessos distintos:
 *   - leitura de velocidade (Fase 3): `.select(...).gte('created_at', ...)` AWAITADA direto
 *     (PostgREST devolve lista) -> usa a chave `affiliate_commissions` em `listResponses` (default []);
 *   - insert: `.insert(...).select('id').single()` -> usa a chave `affiliate_commissions` em `responses`.
 *
 * O builder é "thenable": se for awaitado direto (sem maybeSingle/single) resolve com a
 * resposta de lista da tabela; `single`/`maybeSingle` resolvem com a resposta single.
 */
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
      b.not = chain;
      b.order = chain;
      b.limit = chain;
      b.gte = chain;
      b.insert = (row: unknown) => {
        captured[table] = row;
        return b;
      };
      b.maybeSingle = () => Promise.resolve(singleResp());
      b.single = () => Promise.resolve(singleResp());
      // thenable: await direto no builder -> resposta de lista.
      b.then = (
        onF: (v: Resp) => unknown,
        onR?: (e: unknown) => unknown,
      ) => Promise.resolve(listResp).then(onF, onR);
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
  assertEquals(res.flagged, false);
  const row = captured['affiliate_commissions'] as Record<string, unknown>;
  assertEquals(row.amount_cents, 5910); // 197 * 30
  assertEquals(row.pct_applied, 30);
  assertEquals(row.status, 'pending');
  assertEquals(row.review_status, 'clear');
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

// ---------------------------------------------------------------------------
// Fase 3 — Antifraude (velocidade, documento/IP, flag de revisão)
// ---------------------------------------------------------------------------

Deno.test('velocidade: mesmo comprador+afiliado dentro da janela bloqueia (por documento)', async () => {
  const nowIso = new Date().toISOString();
  const { admin, captured } = makeAdmin(
    { sales_leads: LEAD, affiliates: AFF_ACTIVE, affiliate_commissions: { data: { id: 'x' }, error: null } },
    {
      affiliate_commissions: {
        data: [
          { affiliate_id: 'aff-1', buyer_document: '123.456.789-00', buyer_ip: '203.0.113.5', created_at: nowIso, metadata: { customer_email: 'outro@x.com' } },
        ],
        error: null,
      },
    },
  );
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'comprador@x.com',
    orderRef: 'ORDER-VEL-1',
    amountReais: 197,
    buyerDocument: '12345678900', // mesmo doc (normalizado) da comissão recente
  });
  assertEquals(res.created, false);
  assertEquals(res.skipped, 'velocity: repeat buyer in window');
  assertEquals(captured['affiliate_commissions'], undefined); // não inseriu
});

Deno.test('velocidade: mesmo comprador FORA da janela cria normalmente', async () => {
  // Janela recente vazia (a comissão antiga já saiu do recorte de tempo do banco).
  const { admin } = makeAdmin(
    { sales_leads: LEAD, affiliates: AFF_ACTIVE, affiliate_commissions: { data: { id: 'comm-old' }, error: null } },
    { affiliate_commissions: { data: [], error: null } },
  );
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'comprador@x.com',
    orderRef: 'ORDER-VEL-2',
    amountReais: 197,
    buyerDocument: '12345678900',
  });
  assertEquals(res.created, true);
  assertEquals(res.flagged, false);
});

Deno.test('volume do afiliado acima do limite cria porém marca flagged', async () => {
  const nowIso = new Date().toISOString();
  // 21 comissões do mesmo afiliado na janela (> VELOCITY_MAX_AFFILIATE=20), comprador distinto cada.
  const many = Array.from({ length: 21 }, (_, i) => ({
    affiliate_id: 'aff-1',
    buyer_document: String(99000000000 + i),
    buyer_ip: `10.0.0.${i}`,
    created_at: nowIso,
    metadata: { customer_email: `buyer${i}@x.com` },
  }));
  const { admin, captured } = makeAdmin(
    { sales_leads: LEAD, affiliates: AFF_ACTIVE, affiliate_commissions: { data: { id: 'comm-flag' }, error: null } },
    { affiliate_commissions: { data: many, error: null } },
  );
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'novo@x.com',
    orderRef: 'ORDER-VOL-1',
    amountReais: 197,
    buyerDocument: '11122233344',
  });
  assertEquals(res.created, true);
  assertEquals(res.flagged, true);
  const row = captured['affiliate_commissions'] as Record<string, unknown>;
  assertEquals(row.review_status, 'flagged');
  const meta = row.metadata as { fraud?: string[] };
  assertEquals(Array.isArray(meta.fraud), true);
  assertEquals((meta.fraud ?? []).some((r) => r.startsWith('affiliate_velocity:')), true);
});

Deno.test('IP compartilhado entre afiliados diferentes marca flagged (ip_shared_cross_affiliate)', async () => {
  const nowIso = new Date().toISOString();
  const { admin, captured } = makeAdmin(
    { sales_leads: LEAD, affiliates: AFF_ACTIVE, affiliate_commissions: { data: { id: 'comm-ip' }, error: null } },
    {
      affiliate_commissions: {
        data: [
          { affiliate_id: 'aff-OTHER', buyer_document: '55566677788', buyer_ip: '203.0.113.9', created_at: nowIso, metadata: { customer_email: 'alguem@x.com' } },
        ],
        error: null,
      },
    },
  );
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'comprador@x.com',
    orderRef: 'ORDER-IP-1',
    amountReais: 197,
    buyerIp: '203.0.113.9', // mesmo IP, afiliado diferente
  });
  assertEquals(res.created, true);
  assertEquals(res.flagged, true);
  const row = captured['affiliate_commissions'] as Record<string, unknown>;
  assertEquals(row.review_status, 'flagged');
  const meta = row.metadata as { fraud?: string[] };
  assertEquals((meta.fraud ?? []).includes('ip_shared_cross_affiliate'), true);
});

Deno.test('regressão: sem buyerDocument e sem buyerIp comporta-se como antes (created, não flagged)', async () => {
  const { admin, captured } = makeAdmin(
    { sales_leads: LEAD, affiliates: AFF_ACTIVE, affiliate_commissions: { data: { id: 'comm-plain' }, error: null } },
    { affiliate_commissions: { data: [], error: null } },
  );
  const res = await attributeAffiliateCommission(admin, {
    customerEmail: 'comprador@x.com',
    orderRef: 'ORDER-PLAIN-1',
    amountReais: 197,
  });
  assertEquals(res.created, true);
  assertEquals(res.flagged, false);
  const row = captured['affiliate_commissions'] as Record<string, unknown>;
  assertEquals(row.review_status, 'clear');
  assertEquals(row.buyer_document, null);
  assertEquals(row.buyer_ip, null);
  const meta = row.metadata as { fraud?: string[] };
  assertEquals(meta.fraud, undefined); // sem bloco fraud quando clear
});
