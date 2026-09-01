// Política Onda 1 — hold, clawback, atribuição, teto, cliques, cupom.
// Rodar: deno test apps/NexvyBeauty/supabase/functions/_shared/affiliate-policy.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ATTRIBUTION_WINDOW_DAYS,
  HOLD_DAYS,
  RECURRING_CAP_CYCLES,
  applyClawback,
  canApproveCommission,
  checkoutCouponParam,
  computeHoldUntil,
  isLeadInsideWindow,
  isOverRecurringCap,
  pickAttributedLead,
  resolveCommissionPct,
  shouldIncrementClicks,
} from './affiliate-policy.ts';

const NOW = new Date('2026-08-23T14:00:00.000Z');

Deno.test('hold: computeHoldUntil soma N dias', () => {
  const iso = computeHoldUntil(NOW, 30);
  assertEquals(iso, '2026-09-22T14:00:00.000Z');
  assertEquals(HOLD_DAYS, 30);
});

Deno.test('hold: não aprova comissão ainda dentro da janela', () => {
  const holdUntil = computeHoldUntil(NOW, 30);
  assertEquals(
    canApproveCommission({ status: 'pending', holdUntil, now: NOW }),
    false,
  );
});

Deno.test('hold: aprova depois do hold_until se ainda pending', () => {
  const holdUntil = computeHoldUntil(NOW, 7);
  const later = new Date('2026-09-01T14:00:00.000Z');
  assertEquals(
    canApproveCommission({ status: 'pending', holdUntil, now: later }),
    true,
  );
});

Deno.test('hold: não aprova se status não é pending', () => {
  assertEquals(
    canApproveCommission({
      status: 'paid',
      holdUntil: '2026-01-01T00:00:00.000Z',
      now: NOW,
    }),
    false,
  );
});

Deno.test('clawback: pending + reembolso total cancela', () => {
  const r = applyClawback({
    status: 'pending',
    amountCents: 5910,
    originalSaleReais: 197,
    refundReais: 197,
  });
  assertEquals(r.status, 'cancelled');
  assertEquals(r.amountCents, 0);
  assertEquals(r.needsReversal, false);
  assertEquals(r.reason, 'refund');
});

Deno.test('clawback: approved + chargeback cancela', () => {
  const r = applyClawback({
    status: 'approved',
    amountCents: 5910,
    originalSaleReais: 197,
    refundReais: 197,
    reason: 'chargeback',
  });
  assertEquals(r.status, 'cancelled');
  assertEquals(r.amountCents, 0);
  assertEquals(r.reason, 'chargeback');
});

Deno.test('clawback: paid + reembolso total cancela e pede reversão', () => {
  const r = applyClawback({
    status: 'paid',
    amountCents: 5910,
    originalSaleReais: 197,
    refundReais: 197,
  });
  assertEquals(r.status, 'cancelled');
  assertEquals(r.amountCents, 0);
  assertEquals(r.needsReversal, true);
});

Deno.test('clawback: já cancelled é no-op', () => {
  const r = applyClawback({
    status: 'cancelled',
    amountCents: 0,
    originalSaleReais: 197,
    refundReais: 197,
  });
  assertEquals(r.unchanged, true);
  assertEquals(r.status, 'cancelled');
});

Deno.test('clawback: reembolso parcial reduz a comissão pending', () => {
  const r = applyClawback({
    status: 'pending',
    amountCents: 6000,
    originalSaleReais: 200,
    refundReais: 50,
  });
  assertEquals(r.status, 'pending');
  assertEquals(r.amountCents, 4500); // 6000 * (150/200)
  assertEquals(r.reason, 'partial_refund');
});

Deno.test('atribuição: last-click pega o lead mais recente dentro da janela', () => {
  const picked = pickAttributedLead(
    [
      { id: 'old', affiliate_id: 'a1', created_at: '2026-07-01T00:00:00.000Z' },
      { id: 'mid', affiliate_id: 'a2', created_at: '2026-08-10T00:00:00.000Z' },
      { id: 'new', affiliate_id: 'a3', created_at: '2026-08-20T00:00:00.000Z' },
    ],
    NOW,
    { mode: 'last_click', windowDays: 60 },
  );
  assertEquals(picked?.id, 'new');
  assertEquals(picked?.affiliate_id, 'a3');
  assertEquals(ATTRIBUTION_WINDOW_DAYS, 60);
});

Deno.test('atribuição: lead fora da janela de 60 dias é ignorado', () => {
  assertEquals(isLeadInsideWindow('2026-05-01T00:00:00.000Z', NOW, 60), false);
  const picked = pickAttributedLead(
    [{ id: 'stale', affiliate_id: 'a1', created_at: '2026-05-01T00:00:00.000Z' }],
    NOW,
    { mode: 'last_click', windowDays: 60 },
  );
  assertEquals(picked, null);
});

Deno.test('atribuição: first-click (opção) pega o mais antigo dentro da janela', () => {
  const picked = pickAttributedLead(
    [
      { id: 'older', affiliate_id: 'a1', created_at: '2026-07-20T00:00:00.000Z' },
      { id: 'newer', affiliate_id: 'a2', created_at: '2026-08-20T00:00:00.000Z' },
    ],
    NOW,
    { mode: 'first_click', windowDays: 60 },
  );
  assertEquals(picked?.id, 'older');
});

Deno.test('teto: 12 ciclos bloqueia o 13º', () => {
  assertEquals(RECURRING_CAP_CYCLES, 12);
  assertEquals(isOverRecurringCap(12), true);
  assertEquals(isOverRecurringCap(11), false);
  assertEquals(isOverRecurringCap(0), false);
});

Deno.test('comissão por plano: rate do plano vence o default do afiliado', () => {
  assertEquals(resolveCommissionPct(30, 20), 20);
  assertEquals(resolveCommissionPct(30, null), 30);
  assertEquals(resolveCommissionPct(30, 0), 30);
});

Deno.test('cliques: incrementa só com ref e se ainda não gravou', () => {
  assertEquals(shouldIncrementClicks('maria', false), true);
  assertEquals(shouldIncrementClicks('maria', true), false);
  assertEquals(shouldIncrementClicks(null, false), false);
  assertEquals(shouldIncrementClicks('  ', false), false);
});

Deno.test('cupom Cakto: monta ?coupon= sem ligar split nativo', () => {
  assertEquals(checkoutCouponParam('MARIA30'), 'MARIA30');
  assertEquals(checkoutCouponParam('  maria-30  '), 'maria-30');
  assertEquals(checkoutCouponParam(''), null);
  assertEquals(checkoutCouponParam(null), null);
});
