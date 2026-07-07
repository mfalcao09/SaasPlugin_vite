// deno test scenario-match.test.ts
// Reproduz o bug latente de 2026-07-06: o filtro product_cakto_id era inerte
// porque a coluna não vinha no SELECT (order.product_cakto_id === undefined).

import { assertEquals } from 'jsr:@std/assert@1';
import { matchScenario, type OrderFacts, type Scenario } from './scenario-match.ts';

const scenario = (filters: Record<string, unknown> | null): Scenario => ({
  name: 'test',
  instruction: 'x',
  links: null,
  tags_to_apply: null,
  filters,
  priority: 0,
});

const order = (over: Partial<OrderFacts> = {}): OrderFacts => ({
  product_cakto_id: 'prod_abc123',
  amount: 197,
  items: [],
  ...over,
});

Deno.test('sem filters, cenário sempre casa', () => {
  assertEquals(matchScenario(scenario(null), order()), true);
  assertEquals(matchScenario(scenario({}), order()), true);
});

Deno.test('filtro product_cakto_id casa quando o produto do pedido é o mesmo', () => {
  assertEquals(
    matchScenario(scenario({ product_cakto_id: 'prod_abc123' }), order()),
    true,
  );
});

Deno.test('filtro product_cakto_id rejeita produto diferente', () => {
  assertEquals(
    matchScenario(scenario({ product_cakto_id: 'prod_outro' }), order()),
    false,
  );
});

Deno.test('regressão do bug: product_cakto_id ausente no pedido NÃO pode casar cenário filtrado', () => {
  // Antes do fix, order.product_cakto_id era sempre undefined em runtime.
  // O comportamento correto é rejeitar (não casar cenário de produto sem saber o produto).
  const semProduto = order({ product_cakto_id: null });
  assertEquals(
    matchScenario(scenario({ product_cakto_id: 'prod_abc123' }), semProduto),
    false,
  );
});

Deno.test('min_amount e max_amount', () => {
  assertEquals(matchScenario(scenario({ min_amount: 100 }), order({ amount: 97 })), false);
  assertEquals(matchScenario(scenario({ min_amount: 100 }), order({ amount: 197 })), true);
  assertEquals(matchScenario(scenario({ max_amount: 100 }), order({ amount: 197 })), false);
  assertEquals(matchScenario(scenario({ max_amount: 200 }), order({ amount: 197 })), true);
  assertEquals(matchScenario(scenario({ min_amount: 100 }), order({ amount: null })), false);
});

Deno.test('required_orderbumps: casa só quando todos os bumps estão no pedido', () => {
  // Antes do fix, este caminho lançava ReferenceError (TDZ de `items`) e derrubava a function.
  const comBump = order({
    items: [
      { product_cakto_id: 'prod_abc123', role: 'main' },
      { product_cakto_id: 'prod_bump1', role: 'orderbump' },
    ],
  });
  assertEquals(
    matchScenario(scenario({ required_orderbumps: ['prod_bump1'] }), comBump),
    true,
  );
  assertEquals(
    matchScenario(scenario({ required_orderbumps: ['prod_bump1', 'prod_bump2'] }), comBump),
    false,
  );
  assertEquals(
    matchScenario(scenario({ required_orderbumps: ['prod_bump1'] }), order({ items: [] })),
    false,
  );
});

Deno.test('filtros combinados: produto certo mas valor abaixo do mínimo rejeita', () => {
  assertEquals(
    matchScenario(
      scenario({ product_cakto_id: 'prod_abc123', min_amount: 300 }),
      order({ amount: 197 }),
    ),
    false,
  );
});
