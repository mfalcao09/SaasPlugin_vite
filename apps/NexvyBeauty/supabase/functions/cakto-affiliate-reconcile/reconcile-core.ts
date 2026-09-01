// Núcleo puro do reconciliador de comissões de afiliado (testável, sem rede/Deno.serve).

export interface ReconcileCommissionArgs {
  orderRef: string;
  customerEmail: string | null;
  amountReais: number | null;
  kind: 'first_sale' | 'recurring';
}

/**
 * Converte uma order da API Cakto (GET /orders) em args de comissão.
 * Retorna null se a order não é elegível (sem id ou não-paga).
 * Renovação = `subscription` preenchida E `subscription_period > 1` → kind 'recurring'
 * (a 1ª cobrança da assinatura tem period 1 → 'first_sale', igual à compra única).
 */
export function orderToCommissionArgs(order: unknown): ReconcileCommissionArgs | null {
  const o = (order ?? {}) as Record<string, any>;
  const id = o.id != null ? String(o.id) : '';
  if (!id) return null;

  const status = String(o.status ?? '').toLowerCase();
  if (status !== 'paid' && status !== 'approved') return null;

  const email = o.customer?.email ?? o.customer_email ?? null;
  const amountNum = o.amount != null ? Number(o.amount) : NaN;
  const period = Number(o.subscription_period ?? 0);
  const isRecurring = Boolean(o.subscription) && period > 1;

  return {
    orderRef: id,
    customerEmail: email,
    amountReais: Number.isFinite(amountNum) ? amountNum : null,
    kind: isRecurring ? 'recurring' : 'first_sale',
  };
}
