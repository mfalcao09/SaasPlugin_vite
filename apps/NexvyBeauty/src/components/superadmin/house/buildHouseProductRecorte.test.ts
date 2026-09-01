// deno test — recorte do dashboard da casa por produto do catálogo.
//   deno test --no-check apps/NexvyBeauty/src/components/superadmin/house/buildHouseProductRecorte.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildHouseProductRecorte,
  type HouseProductRecorteInput,
  type HouseProductStats,
} from './buildHouseProductRecorte.ts';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const ORPHAN = '99999999-9999-9999-9999-999999999999';

const catalog: HouseProductRecorteInput[] = [
  { id: P1, name: 'Beauty', status: 'published' },
  { id: P2, name: 'Ads', status: 'draft' },
];

function statsMap(
  entries: HouseProductStats[],
): Map<string, HouseProductStats> {
  return new Map(entries.map((s) => [s.product_id, s]));
}

Deno.test('catálogo vazio: zero linhas, totais zerados — sem produto inventado', () => {
  const r = buildHouseProductRecorte([], statsMap([
    { product_id: P1, total_leads: 9, sellers_count: 1, won_count: 2, won_value: 100 },
  ]));
  assertEquals(r.rows, []);
  assertEquals(r.totals, { products: 0, leadCount: 0, wonCount: 0, wonValue: 0 });
});

Deno.test('produto do catálogo sem stats: zeros reais, não MRR inventado', () => {
  const r = buildHouseProductRecorte(catalog, undefined);
  assertEquals(r.rows.length, 2);
  assertEquals(r.rows.every((row) => row.leadCount === 0 && row.wonCount === 0 && row.wonValue === 0), true);
  assertEquals(r.totals.products, 2);
  assertEquals(r.totals.wonValue, 0);
  assertEquals('mrr' in r.rows[0], false);
});

Deno.test('stats batem no catálogo; product_id órfão não vira linha', () => {
  const r = buildHouseProductRecorte(
    catalog,
    statsMap([
      { product_id: P1, total_leads: 4, sellers_count: 2, won_count: 1, won_value: 1500 },
      { product_id: ORPHAN, total_leads: 99, sellers_count: 9, won_count: 9, won_value: 9999 },
    ]),
  );
  assertEquals(r.rows.map((row) => row.productId), [P1, P2]);
  assertEquals(r.rows[0], {
    productId: P1,
    name: 'Beauty',
    status: 'published',
    leadCount: 4,
    wonCount: 1,
    wonValue: 1500,
    sellersCount: 2,
  });
  assertEquals(r.rows[1].leadCount, 0);
  assertEquals(r.totals, { products: 2, leadCount: 4, wonCount: 1, wonValue: 1500 });
  assertEquals(r.rows.some((row) => row.productId === ORPHAN), false);
});

Deno.test('lente Todos: catálogo inteiro; lente Produto: só o id ativo', () => {
  const stats = statsMap([
    { product_id: P2, total_leads: 3, sellers_count: 1, won_count: 0, won_value: 0 },
  ]);
  const all = buildHouseProductRecorte(catalog, stats, null);
  assertEquals(all.rows.map((row) => row.productId), [P1, P2]);
  const one = buildHouseProductRecorte(catalog, stats, P2);
  assertEquals(one.rows.map((row) => row.productId), [P2]);
  assertEquals(one.totals, { products: 1, leadCount: 3, wonCount: 0, wonValue: 0 });
  const missing = buildHouseProductRecorte(catalog, stats, ORPHAN);
  assertEquals(missing.rows, []);
  assertEquals(missing.totals.products, 0);
});
