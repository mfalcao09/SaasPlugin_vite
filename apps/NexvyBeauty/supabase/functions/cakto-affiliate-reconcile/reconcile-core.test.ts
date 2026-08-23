// Testes do núcleo do reconciliador. Rodar: deno test <path>
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { orderToCommissionArgs } from './reconcile-core.ts';

Deno.test('compra única paga → first_sale', () => {
  const a = orderToCommissionArgs({
    id: 'o1', status: 'paid', amount: '197.00',
    customer: { email: 'c@x.com' }, subscription: null, subscription_period: null, type: 'unique',
  });
  assertEquals(a, { orderRef: 'o1', customerEmail: 'c@x.com', amountReais: 197, kind: 'first_sale' });
});

Deno.test('renovação (subscription + period>1) → recurring', () => {
  const a = orderToCommissionArgs({
    id: 'o2', status: 'paid', amount: '197.00',
    customer: { email: 'c@x.com' }, subscription: 'sub_1', subscription_period: 2, type: 'subscription',
  });
  assertEquals(a?.kind, 'recurring');
  assertEquals(a?.orderRef, 'o2');
});

Deno.test('1ª cobrança de assinatura (period=1) → first_sale', () => {
  const a = orderToCommissionArgs({
    id: 'o3', status: 'paid', amount: '197',
    customer: { email: 'c@x.com' }, subscription: 'sub_1', subscription_period: 1, type: 'subscription',
  });
  assertEquals(a?.kind, 'first_sale');
});

Deno.test('order não-paga → null', () => {
  assertEquals(orderToCommissionArgs({ id: 'o4', status: 'waiting_payment', amount: '10' }), null);
});

Deno.test('order sem id → null', () => {
  assertEquals(orderToCommissionArgs({ status: 'paid' }), null);
});

Deno.test('amount inválido → amountReais null (helper depois pula)', () => {
  const a = orderToCommissionArgs({ id: 'o5', status: 'paid', amount: 'abc', customer: { email: 'c@x.com' } });
  assertEquals(a?.amountReais, null);
});
