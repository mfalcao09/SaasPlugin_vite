// Envio de status do afiliado via o caminho Evolution já existente.
// Não inventa segundo messenger. Sem PII do comprador no texto.

import {
  composeAffiliateWaNotice,
  nextStageAfterEvent,
  shouldNotifyWhatsApp,
  type AffiliateLeadStage,
  type AffiliateWaEvent,
  type PayoutPreference,
  type StageEvent,
} from './affiliate-onda2.ts';

export interface NotifyAdmin {
  from: (table: string) => any;
}

export interface NotifySendPort {
  sendText: (to: string, text: string) => Promise<{ ok: boolean; ref?: string; error?: string }>;
}

const EVENT_TO_STAGE: Record<AffiliateWaEvent, StageEvent> = {
  booked: 'booked',
  paid: 'paid',
  refund_requested: 'checkout',
};

export function makePlatformEvolutionSendPort(args: {
  supabaseUrl: string;
  serviceKey: string;
  productId: string | null;
}): NotifySendPort {
  return {
    async sendText(to: string, text: string) {
      if (!args.productId) return { ok: false, error: 'missing product_id' };
      const digits = to.replace(/\D/g, '');
      if (digits.length < 10) return { ok: false, error: 'invalid phone' };
      const res = await fetch(`${args.supabaseUrl}/functions/v1/platform-evolution-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.serviceKey}`,
        },
        body: JSON.stringify({
          product_id: args.productId,
          type: 'text',
          to: digits,
          payload: { text },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        return { ok: false, error: String(body?.error ?? res.status) };
      }
      return { ok: true, ref: String(body?.status ?? res.status) };
    },
  };
}

export async function resolvePlatformProductId(admin: NotifyAdmin): Promise<string | null> {
  const { data } = await admin
    .from('platform_crm_evolution_instances')
    .select('product_id')
    .not('product_id', 'is', null)
    .limit(1)
    .maybeSingle();
  return typeof data?.product_id === 'string' ? data.product_id : null;
}

export async function dispatchAffiliateWaNotice(
  admin: NotifyAdmin,
  send: NotifySendPort,
  args: {
    affiliateId: string | null | undefined;
    leadId?: string | null;
    event: AffiliateWaEvent;
    currentStage?: AffiliateLeadStage | null;
    payoutMethod?: PayoutPreference | null;
  },
): Promise<{ sent: boolean; skipped?: string }> {
  const affiliateId = args.affiliateId ?? null;
  if (!affiliateId) return { sent: false, skipped: 'no affiliate' };

  let alreadySent = false;
  if (args.leadId) {
    const { data } = await admin
      .from('affiliate_whatsapp_notices')
      .select('id')
      .eq('affiliate_id', affiliateId)
      .eq('lead_id', args.leadId)
      .eq('event', args.event)
      .maybeSingle();
    alreadySent = !!data?.id;
  }
  if (!shouldNotifyWhatsApp({ event: args.event, alreadySent })) {
    return { sent: false, skipped: 'already sent' };
  }

  const stage = nextStageAfterEvent(args.currentStage ?? null, EVENT_TO_STAGE[args.event]);
  if (args.leadId) {
    await admin
      .from('sales_leads')
      .update({
        affiliate_funnel_stage: stage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.leadId);
  }

  const { data: aff } = await admin
    .from('affiliates')
    .select('phone')
    .eq('id', affiliateId)
    .maybeSingle();
  const phone = typeof aff?.phone === 'string' ? aff.phone : '';
  if (phone.replace(/\D/g, '').length < 10) {
    return { sent: false, skipped: 'no affiliate phone' };
  }

  const notice = composeAffiliateWaNotice({
    event: args.event,
    stage,
    payoutMethod: args.payoutMethod,
  });
  const sent = await send.sendText(phone, notice.text);
  await admin.from('affiliate_whatsapp_notices').insert({
    affiliate_id: affiliateId,
    lead_id: args.leadId ?? null,
    event: args.event,
    stage,
    provider_ref: sent.ref ?? (sent.ok ? 'ok' : sent.error ?? 'failed'),
  });
  return sent.ok ? { sent: true } : { sent: false, skipped: sent.error };
}

export function makeCreditDb(admin: NotifyAdmin) {
  return {
    async getAffiliate(id: string) {
      const { data } = await admin
        .from('affiliates')
        .select('organization_id, payout_preference, name')
        .eq('id', id)
        .maybeSingle();
      return data ?? null;
    },
    async getSubscription(orgId: string) {
      const { data } = await admin
        .from('subscriptions')
        .select('id, current_period_end, price_monthly')
        .eq('organization_id', orgId)
        .maybeSingle();
      return data ?? null;
    },
    async insertCredit(row: Record<string, unknown>) {
      const { data, error } = await admin
        .from('affiliate_subscription_credits')
        .insert(row)
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },
    async updateSubscription(id: string, patch: Record<string, unknown>) {
      await admin.from('subscriptions').update(patch).eq('id', id);
    },
    async markCommissionPaid(id: string, creditId: string) {
      await admin
        .from('affiliate_commissions')
        .update({
          status: 'paid',
          credit_id: creditId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    },
  };
}
