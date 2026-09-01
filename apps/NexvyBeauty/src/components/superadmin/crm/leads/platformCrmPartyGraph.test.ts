// deno test — grafo party (Fase 2): um contato, N produtos SaaS.
//   cd apps/NexvyBeauty && deno test --no-check \
//     src/components/superadmin/crm/leads/platformCrmPartyGraph.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  collectLinkedProductIds,
  listLinkableCatalogProducts,
  pickExistingLeadForProduct,
  productIdsForFilter,
  validateLinkPartyProduct,
  visiblePartyMemberships,
} from './platformCrmPartyGraph.ts';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const P3 = '33333333-3333-3333-3333-333333333333';
const L1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const L2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

Deno.test('productIdsForFilter: nunca inclui null/vazio; sem duplicata', () => {
  assertEquals(productIdsForFilter([P1, null, undefined, '', '  ', P1, P2]), [P1, P2]);
  assertEquals(productIdsForFilter([null, undefined]), []);
});

Deno.test('visiblePartyMemberships: descarta linha com product_id null', () => {
  const rows = [
    { id: 'm1', product_id: P1, lead_id: L1 },
    { id: 'm2', product_id: null, lead_id: L2 },
  ];
  const visible = visiblePartyMemberships(rows);
  assertEquals(visible.length, 1);
  assertEquals(visible[0].product_id, P1);
});

Deno.test('collectLinkedProductIds: lead atual + memberships; null não entra', () => {
  assertEquals(
    collectLinkedProductIds({
      leadProductId: P1,
      membershipProductIds: [null, P2, P1],
    }),
    [P1, P2],
  );
  assertEquals(
    collectLinkedProductIds({ leadProductId: null, membershipProductIds: [null] }),
    [],
  );
});

Deno.test('listLinkableCatalogProducts: catálogo menos já ligados; não cai em products[0]', () => {
  const catalog = [
    { id: P1, name: 'Beauty' },
    { id: P2, name: 'Ads' },
    { id: P3, name: 'LAW' },
  ];
  const linkable = listLinkableCatalogProducts(catalog, [P1, null]);
  assertEquals(linkable.map((p) => p.id), [P2, P3]);
  assertEquals(linkable[0]?.id === catalog[0].id, false);
});

Deno.test('validateLinkPartyProduct: seleção vazia recusa — nunca products[0]', () => {
  const r = validateLinkPartyProduct({
    selectedProductId: '',
    catalogIds: [P1, P2],
    alreadyLinkedIds: [P1],
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.length > 0, true);
});

Deno.test('validateLinkPartyProduct: aceita produto explícito ainda não ligado', () => {
  assertEquals(
    validateLinkPartyProduct({
      selectedProductId: P2,
      catalogIds: [P1, P2],
      alreadyLinkedIds: [P1],
    }),
    { ok: true, productId: P2 },
  );
});

Deno.test('validateLinkPartyProduct: recusa já ligado e id fora do catálogo', () => {
  const linked = validateLinkPartyProduct({
    selectedProductId: P1,
    catalogIds: [P1, P2],
    alreadyLinkedIds: [P1],
  });
  assertEquals(linked.ok, false);
  const outside = validateLinkPartyProduct({
    selectedProductId: P3,
    catalogIds: [P1, P2],
    alreadyLinkedIds: [],
  });
  assertEquals(outside.ok, false);
});

Deno.test('validateLinkPartyProduct: catálogo vazio não inventa product_id', () => {
  const r = validateLinkPartyProduct({
    selectedProductId: undefined,
    catalogIds: [],
    alreadyLinkedIds: [],
  });
  assertEquals(r.ok, false);
});

Deno.test('pickExistingLeadForProduct: casa email no mesmo produto; ignora product_id null', () => {
  const candidates = [
    { id: L1, product_id: null, email: 'ana@x.com', phone: '11999999999' },
    { id: L2, product_id: P2, email: 'ana@x.com', phone: null },
  ];
  assertEquals(
    pickExistingLeadForProduct(candidates, P2, { email: 'ana@x.com', phone: null }),
    L2,
  );
  assertEquals(
    pickExistingLeadForProduct(candidates, P1, { email: 'ana@x.com', phone: '11999999999' }),
    null,
  );
});

Deno.test('pickExistingLeadForProduct: identidade vazia não casa com ninguém', () => {
  assertEquals(
    pickExistingLeadForProduct(
      [{ id: L1, product_id: P2, email: '', phone: '' }],
      P2,
      { email: '', phone: '' },
    ),
    null,
  );
});
