// Atribuição de comissão de afiliado — camada PRÓPRIA, provider-agnóstica.
//
// A fonte de verdade do afiliado é `sales_leads.affiliate_id`, gravado na CAPTURA
// (antes do checkout) por `capture-lead`, que resolve `?ref=` via `resolve_affiliate_ref`.
// Aqui, no evento de venda PAGA, casamos o comprador pelo e-mail → lead → afiliado e
// criamos a comissão de forma IDEMPOTENTE. Funciona com qualquer provedor de pagamento
// (Cakto hoje, PSP próprio depois) — o meio de pagamento é só um adaptador.

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export interface AttributeArgs {
  customerEmail: string | null | undefined;
  /** Chave de idempotência: id do pedido (first_sale) ou do ciclo de cobrança (recurring). */
  orderRef: string;
  /** Valor BRUTO da venda em BRL (reais). */
  amountReais: number | null | undefined;
  organizationId?: string | null;
  kind?: 'first_sale' | 'recurring';
}

export interface AttributeResult {
  created: boolean;
  skipped?: string;
  commissionId?: string;
  affiliateId?: string;
}

/**
 * Cria a comissão de afiliado para uma venda paga, se houver afiliado atribuído ao lead.
 * Nunca lança por "não atribuído" — só lança em erro inesperado de banco (deixa o caller logar).
 * O caller DEVE chamar dentro de try/catch para não impactar o fluxo de provisionamento.
 */
export async function attributeAffiliateCommission(
  admin: SupabaseClient,
  args: AttributeArgs,
): Promise<AttributeResult> {
  const email = (args.customerEmail ?? '').trim().toLowerCase();
  const orderRef = (args.orderRef ?? '').trim();
  const kind = args.kind ?? 'first_sale';

  if (!orderRef) return { created: false, skipped: 'missing order_ref' };
  if (!email) return { created: false, skipped: 'missing customer_email' };

  // 1) Casa o comprador com o lead que tenha afiliado atribuído (último-clique).
  const { data: lead } = await admin
    .from('sales_leads')
    .select('id, affiliate_id')
    .eq('email', email)
    .not('affiliate_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead?.affiliate_id) return { created: false, skipped: 'no affiliate lead for email' };

  // 2) Carrega o afiliado (status + % + e-mail para o guard de auto-compra).
  const { data: affiliate } = await admin
    .from('affiliates')
    .select('id, email, status, commission_pct')
    .eq('id', lead.affiliate_id)
    .maybeSingle();

  if (!affiliate) return { created: false, skipped: 'affiliate not found' };
  if (affiliate.status !== 'active') return { created: false, skipped: `affiliate ${affiliate.status}`, affiliateId: affiliate.id };

  // 3) Antifraude básico de auto-compra (Fase 3 amplia: velocidade, CPF, IP).
  if ((affiliate.email ?? '').trim().toLowerCase() === email) {
    return { created: false, skipped: 'self-purchase blocked', affiliateId: affiliate.id };
  }

  // 4) Calcula a comissão: amount(reais) × pct(%) = comissão em centavos.
  const amount = Number(args.amountReais);
  const pct = Number(affiliate.commission_pct);
  if (!Number.isFinite(amount) || amount <= 0) return { created: false, skipped: 'no amount', affiliateId: affiliate.id };
  if (!Number.isFinite(pct) || pct <= 0) return { created: false, skipped: 'commission_pct=0', affiliateId: affiliate.id };
  const amountCents = Math.round(amount * pct);

  // 5) Cria a comissão (idempotente por idempotency_key = orderRef; unique index no banco).
  const { data: inserted, error } = await admin
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliate.id,
      lead_id: lead.id,
      order_ref: orderRef,
      organization_id: args.organizationId ?? null,
      amount_cents: amountCents,
      pct_applied: pct,
      currency: 'BRL',
      status: 'pending',
      idempotency_key: orderRef,
      metadata: { kind, customer_email: email },
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique_violation → reentrega do webhook; comissão já existe (idempotente).
    if ((error as { code?: string }).code === '23505') {
      return { created: false, skipped: 'duplicate (idempotent)', affiliateId: affiliate.id };
    }
    throw error;
  }

  return { created: true, commissionId: inserted?.id, affiliateId: affiliate.id };
}
