// deno test — golden suite da decisão PURA isUnderpaid (rede cinto-e-suspensório
// contra link de oferta ANTIGA vendendo por preço defasado). Sem rede, sem DB.
//   deno test --no-check supabase/functions/_shared/cakto-plan-provisioning.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { isUnderpaid, PRICE_TOLERANCE_REAIS } from './cakto-plan-provisioning.ts';

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
