// Onda 2 — crédito vs PIX, estágio do funil, WhatsApp sem PII, co-sell stub.
// Rodar: deno test apps/NexvyBeauty/supabase/functions/_shared/affiliate-onda2.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  affiliateReferrerMemoryLine,
  applySubscriptionCredit,
  canSalonOwnerGenerateLink,
  composeAffiliateWaNotice,
  creditDaysFromCommission,
  firstNameOnly,
  mapAffiliateLeadStage,
  nextStageAfterEvent,
  parseCosellStub,
  parsePayoutPreference,
  resolvePayoutMethod,
  settleSubscriptionCredit,
  shouldNotifyWhatsApp,
  stampCommissionPayoutMeta,
} from './affiliate-onda2.ts';

const NOW = new Date('2026-08-23T14:00:00.000Z');

Deno.test('preferência: aceita pix e subscription_credit; rejeita o resto', () => {
  assertEquals(parsePayoutPreference('pix'), 'pix');
  assertEquals(parsePayoutPreference('PIX'), 'pix');
  assertEquals(parsePayoutPreference('subscription_credit'), 'subscription_credit');
  assertEquals(parsePayoutPreference('crédito'), null);
  assertEquals(parsePayoutPreference(''), null);
  assertEquals(parsePayoutPreference(null), null);
});

Deno.test('payout: dona de salão com org escolhe crédito', () => {
  const r = resolvePayoutMethod({
    preference: 'subscription_credit',
    organizationId: 'org-salon',
    pixKey: '11999999999',
  });
  assertEquals(r.method, 'subscription_credit');
  assertEquals(r.reason, 'preference_credit');
});

Deno.test('payout: crédito sem organization_id cai no PIX (não inventa mês grátis)', () => {
  const r = resolvePayoutMethod({
    preference: 'subscription_credit',
    organizationId: null,
    pixKey: 'chave@pix',
  });
  assertEquals(r.method, 'pix');
  assertEquals(r.reason, 'credit_requires_organization');
});

Deno.test('payout: escolha PIX permanece PIX mesmo com org', () => {
  const r = resolvePayoutMethod({
    preference: 'pix',
    organizationId: 'org-salon',
    pixKey: null,
  });
  assertEquals(r.method, 'pix');
  assertEquals(r.reason, 'preference_pix');
});

Deno.test('payout: sem preferência default é PIX', () => {
  const r = resolvePayoutMethod({
    preference: null,
    organizationId: 'org-salon',
    pixKey: 'x',
  });
  assertEquals(r.method, 'pix');
  assertEquals(r.reason, 'default_pix');
});

Deno.test('crédito: sem preço mensal e comissão > 0 vira 30 dias (mês grátis)', () => {
  assertEquals(creditDaysFromCommission({ amountCents: 5910, monthlyPriceCents: null }), 30);
  assertEquals(creditDaysFromCommission({ amountCents: 0, monthlyPriceCents: null }), 0);
});

Deno.test('crédito: dias proporcionais ao preço mensal (arredonda, mínimo 1)', () => {
  assertEquals(creditDaysFromCommission({ amountCents: 19700, monthlyPriceCents: 19700 }), 30);
  assertEquals(creditDaysFromCommission({ amountCents: 9850, monthlyPriceCents: 19700 }), 15);
  assertEquals(creditDaysFromCommission({ amountCents: 100, monthlyPriceCents: 19700 }), 1);
});

Deno.test('crédito: estende current_period_end a partir do maior entre agora e o fim atual', () => {
  const fromFuture = applySubscriptionCredit({
    currentPeriodEnd: '2026-09-10T00:00:00.000Z',
    now: NOW,
    extraDays: 30,
  });
  assertEquals(fromFuture.nextPeriodEnd, '2026-10-10T00:00:00.000Z');
  assertEquals(fromFuture.complimentaryReason.startsWith('affiliate_credit:'), true);

  const fromPast = applySubscriptionCredit({
    currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    now: NOW,
    extraDays: 30,
  });
  assertEquals(fromPast.nextPeriodEnd, '2026-09-22T14:00:00.000Z');
});

Deno.test('estágio: prioridade paid > checkout > in_conversation > captured', () => {
  assertEquals(mapAffiliateLeadStage({ hasLead: false, hasConversation: false, hasCheckout: false, hasPaid: false }), null);
  assertEquals(mapAffiliateLeadStage({ hasLead: true, hasConversation: false, hasCheckout: false, hasPaid: false }), 'captured');
  assertEquals(mapAffiliateLeadStage({ hasLead: true, hasConversation: true, hasCheckout: false, hasPaid: false }), 'in_conversation');
  assertEquals(mapAffiliateLeadStage({ hasLead: true, hasConversation: true, hasCheckout: true, hasPaid: false }), 'checkout');
  assertEquals(mapAffiliateLeadStage({ hasLead: true, hasConversation: true, hasCheckout: true, hasPaid: true }), 'paid');
});

Deno.test('estágio: evento nunca rebaixa; booked sobe para em conversa', () => {
  assertEquals(nextStageAfterEvent('captured', 'booked'), 'in_conversation');
  assertEquals(nextStageAfterEvent('paid', 'booked'), 'paid');
  assertEquals(nextStageAfterEvent(null, 'captured'), 'captured');
  assertEquals(nextStageAfterEvent('in_conversation', 'checkout'), 'checkout');
  assertEquals(nextStageAfterEvent('checkout', 'paid'), 'paid');
});

Deno.test('WhatsApp: mensagens de status sem PII do comprador', () => {
  const booked = composeAffiliateWaNotice({ event: 'booked', stage: 'in_conversation' });
  const paidCredit = composeAffiliateWaNotice({
    event: 'paid',
    stage: 'paid',
    payoutMethod: 'subscription_credit',
  });
  const refund = composeAffiliateWaNotice({ event: 'refund_requested', stage: 'checkout' });

  assertEquals(booked.text.includes('agendou'), true);
  assertEquals(paidCredit.text.toLowerCase().includes('crédito') || paidCredit.text.toLowerCase().includes('credito'), true);
  assertEquals(refund.text.toLowerCase().includes('reembolso'), true);

  for (const m of [booked, paidCredit, refund]) {
    assertEquals(m.containsPii, false);
    assertEquals(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(m.text), false);
    assertEquals(/\b\d{10,}\b/.test(m.text), false);
    assertEquals(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(m.text), false);
  }
});

Deno.test('WhatsApp: não reenvia o mesmo evento', () => {
  assertEquals(shouldNotifyWhatsApp({ event: 'paid', alreadySent: false }), true);
  assertEquals(shouldNotifyWhatsApp({ event: 'paid', alreadySent: true }), false);
});

Deno.test('cérebro: só o primeiro nome da afiliada, sem e-mail/telefone', () => {
  assertEquals(firstNameOnly('Maria Silva'), 'Maria');
  assertEquals(firstNameOnly('maria@x.com'), null);
  assertEquals(firstNameOnly('11999998888'), null);
  assertEquals(firstNameOnly(''), null);
  const line = affiliateReferrerMemoryLine('Maria Silva');
  assertEquals(line.includes('Maria'), true);
  assertEquals(line.includes('Silva'), false);
  assertEquals(line.toLowerCase().includes('veio da'), true);
  assertEquals(affiliateReferrerMemoryLine('11999998888'), '');
});

Deno.test('co-sell stub: registra reunião + closer opcional', () => {
  const ok = parseCosellStub({
    meeting_at: '2026-08-24T15:00:00.000Z',
    closer_user_id: 'user-camila',
  });
  assertEquals(ok.ok, true);
  if (ok.ok) {
    assertEquals(ok.value.meetingAt, '2026-08-24T15:00:00.000Z');
    assertEquals(ok.value.closerUserId, 'user-camila');
    assertEquals(ok.value.splitKind, 'cosell');
  }
  const bad = parseCosellStub({ meeting_at: 'ontem' });
  assertEquals(bad.ok, false);
});

Deno.test('salão cliente: só org com plano ativo/trial gera link', () => {
  assertEquals(canSalonOwnerGenerateLink({ organizationId: 'org-1', planStatus: 'active' }), true);
  assertEquals(canSalonOwnerGenerateLink({ organizationId: 'org-1', planStatus: 'trialing' }), true);
  assertEquals(canSalonOwnerGenerateLink({ organizationId: 'org-1', planStatus: 'trial' }), true);
  assertEquals(canSalonOwnerGenerateLink({ organizationId: 'org-1', planStatus: 'suspended' }), false);
  assertEquals(canSalonOwnerGenerateLink({ organizationId: null, planStatus: 'active' }), false);
});

Deno.test('comissão: metadata carrega o método de payout escolhido', () => {
  const meta = stampCommissionPayoutMeta({ kind: 'first_sale' }, 'subscription_credit');
  assertEquals(meta.payout_method, 'subscription_credit');
  assertEquals(meta.kind, 'first_sale');
});

Deno.test('settle crédito: grava ledger, estende assinatura e marca comissão paid', async () => {
  const captured: Record<string, unknown> = {};
  const db = {
    async getAffiliate(id: string) {
      assertEquals(id, 'aff-1');
      return { organization_id: 'org-salon', payout_preference: 'subscription_credit' as const, name: 'Maria' };
    },
    async getSubscription(orgId: string) {
      assertEquals(orgId, 'org-salon');
      return { id: 'sub-1', current_period_end: '2026-09-10T00:00:00.000Z', price_monthly: 197 };
    },
    async insertCredit(row: Record<string, unknown>) {
      captured.credit = row;
      return { id: 'cred-1' };
    },
    async updateSubscription(id: string, patch: Record<string, unknown>) {
      captured.subId = id;
      captured.sub = patch;
    },
    async markCommissionPaid(id: string, creditId: string) {
      captured.paid = { id, creditId };
    },
  };
  const res = await settleSubscriptionCredit(db, {
    commissionId: 'comm-1',
    affiliateId: 'aff-1',
    amountCents: 5910,
    now: NOW,
  });
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.creditId, 'cred-1');
    assertEquals(res.days, 9);
  }
  const credit = captured.credit as Record<string, unknown>;
  assertEquals(credit.organization_id, 'org-salon');
  assertEquals(credit.commission_id, 'comm-1');
  assertEquals(credit.status, 'applied');
  assertEquals(captured.subId, 'sub-1');
  const sub = captured.sub as Record<string, unknown>;
  assertEquals(typeof sub.current_period_end, 'string');
  assertEquals(captured.paid, { id: 'comm-1', creditId: 'cred-1' });
});

Deno.test('settle crédito: afiliado sem org não aplica (fica PIX)', async () => {
  const db = {
    async getAffiliate() {
      return { organization_id: null, payout_preference: 'subscription_credit' as const, name: 'Ana' };
    },
    async getSubscription() {
      return null;
    },
    async insertCredit() {
      throw new Error('não deveria inserir');
    },
    async updateSubscription() {
      throw new Error('não deveria atualizar');
    },
    async markCommissionPaid() {
      throw new Error('não deveria marcar');
    },
  };
  const res = await settleSubscriptionCredit(db, {
    commissionId: 'comm-2',
    affiliateId: 'aff-2',
    amountCents: 5910,
    now: NOW,
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, 'credit_requires_organization');
});
