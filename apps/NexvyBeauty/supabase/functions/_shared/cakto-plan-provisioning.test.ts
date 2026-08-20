// deno test — golden suite da decisão PURA isUnderpaid (rede cinto-e-suspensório
// contra link de oferta ANTIGA vendendo por preço defasado). Sem rede, sem DB.
//   deno test --no-check supabase/functions/_shared/cakto-plan-provisioning.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { isUnderpaid, PRICE_TOLERANCE_REAIS, resolvePlanPriceForOffer } from './cakto-plan-provisioning.ts';

Deno.test('(c) flagra underpay: pagou menos que o preço atual além da tolerância', () => {
  // preço subiu 275 → 383; um link antigo ainda vendeu a 275.
  assertEquals(isUnderpaid(275, 383), true);
  assertEquals(isUnderpaid(4.99, 383), true);
});

Deno.test('(c) passa exato e overpay (nunca alerta quem pagou certo/a mais)', () => {
  assertEquals(isUnderpaid(383, 383), false); // exato
  assertEquals(isUnderpaid(383.49, 383), false); // dentro da tolerância (+)
  assertEquals(isUnderpaid(3830, 383), false); // anual (overpay grande)
});

Deno.test('(c) tolerância: dentro da margem NÃO flagra, além dela SIM', () => {
  // preço 383, tolerância 0.5 → limite em 382.5
  assertEquals(isUnderpaid(383 - PRICE_TOLERANCE_REAIS, 383), false); // == 382.5, não é < 382.5
  assertEquals(isUnderpaid(382.49, 383), true); // abaixo do limite
});

Deno.test('(c) null/NaN amount → skip (não dá pra afirmar); preço inválido → skip', () => {
  assertEquals(isUnderpaid(null, 383), false);
  assertEquals(isUnderpaid(undefined, 383), false);
  assertEquals(isUnderpaid(NaN, 383), false);
  assertEquals(isUnderpaid(100, null), false);
  assertEquals(isUnderpaid(100, 0), false);
  assertEquals(isUnderpaid(100, NaN), false);
});

const planPrices = {
  price_monthly: 383,
  price_quarterly: 990,
  price_yearly: 3830,
  cakto_offer_slug: 'slug-m',
  cakto_offer_slug_quarterly: 'slug-q',
  cakto_offer_slug_yearly: 'slug-y',
};

Deno.test('underpay usa preço do ciclo da oferta, não só o mensal', () => {
  assertEquals(resolvePlanPriceForOffer(planPrices, 'slug-m'), { cycle: 'monthly', price: 383 });
  assertEquals(resolvePlanPriceForOffer(planPrices, 'slug-q'), { cycle: 'quarterly', price: 990 });
  assertEquals(resolvePlanPriceForOffer(planPrices, 'slug-y'), { cycle: 'yearly', price: 3830 });
  assertEquals(isUnderpaid(800, resolvePlanPriceForOffer(planPrices, 'slug-q').price), true);
  assertEquals(isUnderpaid(990, resolvePlanPriceForOffer(planPrices, 'slug-q').price), false);
  assertEquals(isUnderpaid(3830, resolvePlanPriceForOffer(planPrices, 'slug-y').price), false);
});

Deno.test('oferta desconhecida cai no mensal (fallback do product_id)', () => {
  assertEquals(resolvePlanPriceForOffer(planPrices, 'outro'), { cycle: 'monthly', price: 383 });
  assertEquals(resolvePlanPriceForOffer(planPrices, null), { cycle: 'monthly', price: 383 });
});
