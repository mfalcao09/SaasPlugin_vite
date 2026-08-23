// deno test — Fase 4: alçada da casa + Mia com contexto cross-produto.
//   cd apps/NexvyBeauty && deno test --no-check \
//     supabase/functions/_shared/house-agents.test.ts
//
// Check do PM: no detalhe do lead, Mia/alçada enxerga mais de um produto
// do mesmo party. Sem lente CNPJ. Sem NOT NULL em product_id.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  attachHouseMiaToLeadContext,
  buildHouseMiaPartyContext,
  evaluateHouseAuthority,
  HOUSE_AUTHORITY_ACTIONS,
  HOUSE_AUTHORITY_POLICY,
  listHouseAuthoritySnapshot,
} from './house-agents.ts';

const P_BEAUTY = '11111111-1111-1111-1111-111111111111';
const P_ADS = '22222222-2222-2222-2222-222222222222';
const P_LAW = '33333333-3333-3333-3333-333333333333';
const L_BEAUTY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const L_ADS = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARTY = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ORG_SALON = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const CATALOG = [
  { id: P_BEAUTY, name: 'Beauty' },
  { id: P_ADS, name: 'Ads' },
  { id: P_LAW, name: 'LAW' },
];

function partyWithTwoProducts() {
  return buildHouseMiaPartyContext({
    partyId: PARTY,
    currentLeadId: L_BEAUTY,
    currentProductId: P_BEAUTY,
    memberships: [
      { product_id: P_BEAUTY, lead_id: L_BEAUTY },
      { product_id: P_ADS, lead_id: L_ADS },
      { product_id: null, lead_id: 'orphan' },
    ],
    catalog: CATALOG,
  });
}

Deno.test('Mia: mesmo party em Beauty + Ads — vê os dois; null não entra', () => {
  const ctx = partyWithTwoProducts();
  assertEquals(ctx.seesMultipleProducts, true);
  assertEquals(ctx.productIds, [P_BEAUTY, P_ADS]);
  assertEquals(ctx.products.map((p) => p.productId), [P_BEAUTY, P_ADS]);
  assertEquals(ctx.products.map((p) => p.name), ['Beauty', 'Ads']);
  assertEquals(ctx.products.every((p) => p.productId.length > 0), true);
  assertEquals(ctx.products.some((p) => p.productId == null), false);
  assertEquals(ctx.products.find((p) => p.productId === P_BEAUTY)?.isCurrent, true);
  assertEquals(ctx.products.find((p) => p.productId === P_ADS)?.isCurrent, false);
});

Deno.test('Mia: product_id null/vazio no lead não vira NOT NULL nem products[0]', () => {
  const ctx = buildHouseMiaPartyContext({
    partyId: PARTY,
    currentLeadId: L_BEAUTY,
    currentProductId: null,
    memberships: [{ product_id: null, lead_id: L_BEAUTY }, { product_id: '  ', lead_id: L_ADS }],
    catalog: CATALOG,
  });
  assertEquals(ctx.productIds, []);
  assertEquals(ctx.seesMultipleProducts, false);
  assertEquals(ctx.products, []);
  assertEquals(ctx.productIds[0] === CATALOG[0].id, false);
});

Deno.test('Mia: lente é produtos SaaS — nunca CNPJ/operação', () => {
  const ctx = partyWithTwoProducts();
  assertEquals(ctx.lens, 'saas_products');
  const dumped = JSON.stringify(ctx);
  assertEquals(/cnpj/i.test(dumped), false);
  assertEquals(/operation_id/i.test(dumped), false);
  assertEquals(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.test(dumped), false);
  assertEquals('document' in ctx, false);
  assertEquals('operationId' in ctx, false);
});

Deno.test('Mia: um produto + catálogo — hint de cross-sell sem segundo host', () => {
  const ctx = buildHouseMiaPartyContext({
    partyId: PARTY,
    currentLeadId: L_BEAUTY,
    currentProductId: P_BEAUTY,
    memberships: [{ product_id: P_BEAUTY, lead_id: L_BEAUTY }],
    catalog: CATALOG,
  });
  assertEquals(ctx.seesMultipleProducts, false);
  assertEquals(ctx.crossSellHint?.includes('Beauty'), true);
  assertEquals(ctx.crossSellHint?.includes('Ads'), true);
  assertEquals(/cnpj|gestao\.|F5/i.test(ctx.crossSellHint ?? ''), false);
});

Deno.test('alçada: escopo tenant/salão é recusado — autoridade é da casa', () => {
  const ctx = partyWithTwoProducts();
  const r = evaluateHouseAuthority({
    action: 'discount',
    requestedScope: 'tenant',
    payload: { discountPercent: 5, organizationId: ORG_SALON },
    partyContext: ctx,
  });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.decision, 'deny');
    assertEquals(r.scope, 'house');
    assertEquals(/tenant|sal[aã]o/i.test(r.reason), true);
  }
});

Deno.test('alçada: desconto ≤ teto da casa libera; acima pede aprovação', () => {
  const ctx = partyWithTwoProducts();
  const allowed = evaluateHouseAuthority({
    action: 'discount',
    requestedScope: 'house',
    payload: { discountPercent: HOUSE_AUTHORITY_POLICY.maxDiscountPercentWithoutApproval },
    partyContext: ctx,
  });
  assertEquals(allowed.ok, true);
  if (allowed.ok) {
    assertEquals(allowed.decision, 'allow');
    assertEquals(allowed.scope, 'house');
  }

  const gated = evaluateHouseAuthority({
    action: 'discount',
    requestedScope: 'house',
    payload: { discountPercent: HOUSE_AUTHORITY_POLICY.maxDiscountPercentWithoutApproval + 5 },
    partyContext: ctx,
  });
  assertEquals(gated.ok, true);
  if (gated.ok) {
    assertEquals(gated.decision, 'require_approval');
    assertEquals(gated.scope, 'house');
  }
});

Deno.test('alçada: impersonate / publish_agent / cold pedem aprovação da casa', () => {
  const ctx = partyWithTwoProducts();
  for (const action of ['impersonate', 'publish_agent', 'cold'] as const) {
    const r = evaluateHouseAuthority({
      action,
      requestedScope: 'house',
      payload: { organizationId: ORG_SALON },
      partyContext: ctx,
    });
    assertEquals(r.ok, true);
    if (r.ok) {
      assertEquals(r.decision, 'require_approval');
      assertEquals(r.scope, 'house');
      assertEquals(r.partyProductIds, [P_BEAUTY, P_ADS]);
    }
  }
});

Deno.test('alçada: snapshot lista as 4 ações da casa com os produtos do party', () => {
  const ctx = partyWithTwoProducts();
  const snap = listHouseAuthoritySnapshot(ctx);
  assertEquals(snap.scope, 'house');
  assertEquals(snap.partyProductIds, [P_BEAUTY, P_ADS]);
  assertEquals(snap.gates.map((g) => g.action), [...HOUSE_AUTHORITY_ACTIONS]);
  assertEquals(snap.gates.every((g) => g.scope === 'house'), true);
  assertEquals(JSON.stringify(snap).toLowerCase().includes('cnpj'), false);
});

Deno.test('ligar no motor: get_lead_context ganha produtos_da_casa (2 linhas)', () => {
  const attached = attachHouseMiaToLeadContext(
    {
      encontrado: true,
      lead: { id: L_BEAUTY, nome: 'Ana', produto_id: P_BEAUTY },
    },
    partyWithTwoProducts(),
  );
  assertEquals(attached.encontrado, true);
  assertEquals(attached.produtos_da_casa.length, 2);
  assertEquals(attached.produtos_da_casa.map((p) => p.productId), [P_BEAUTY, P_ADS]);
  assertEquals(attached.casa.lens, 'saas_products');
  assertEquals(attached.alcada.scope, 'house');
  assertEquals(attached.alcada.partyProductIds.length > 1, true);
  assertEquals('cnpj' in attached.casa, false);
});
