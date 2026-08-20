// Specs PUROS dos ciclos Cakto (mensal / trimestral / anual).
// Sem rede. Usado pelo cakto-sync-offer e pelos testes do payload.

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

export interface CycleSpec {
  cycle: BillingCycle;
  label: 'Mensal' | 'Trimestral' | 'Anual';
  intervalType: 'month' | 'year';
  interval: number;
  recurrence_period: number;
  type: 'subscription';
  quantity_recurrences: -1;
}

export const CYCLE_SPECS: Record<BillingCycle, CycleSpec> = {
  monthly: {
    cycle: 'monthly',
    label: 'Mensal',
    intervalType: 'month',
    interval: 1,
    recurrence_period: 30,
    type: 'subscription',
    quantity_recurrences: -1,
  },
  quarterly: {
    cycle: 'quarterly',
    label: 'Trimestral',
    intervalType: 'month',
    interval: 3,
    recurrence_period: 90,
    type: 'subscription',
    quantity_recurrences: -1,
  },
  yearly: {
    cycle: 'yearly',
    label: 'Anual',
    intervalType: 'year',
    interval: 1,
    recurrence_period: 365,
    type: 'subscription',
    quantity_recurrences: -1,
  },
};

export function priceColumnForCycle(cycle: BillingCycle): 'price_monthly' | 'price_quarterly' | 'price_yearly' {
  if (cycle === 'quarterly') return 'price_quarterly';
  if (cycle === 'yearly') return 'price_yearly';
  return 'price_monthly';
}

export function isQuarterlyOffer(o: { intervalType?: unknown; interval?: unknown } | null | undefined): boolean {
  return o?.intervalType === 'month' && Number(o?.interval) === 3;
}

/** Mensal Cakto: month + interval 1 (ou interval ausente, legado). */
export function isMonthlyOffer(o: { intervalType?: unknown; interval?: unknown } | null | undefined): boolean {
  if (o?.intervalType !== 'month') return false;
  if (o?.interval == null || o.interval === '') return true;
  return Number(o.interval) === 1;
}

export function matchesCycle(
  o: { intervalType?: unknown; interval?: unknown } | null | undefined,
  spec: CycleSpec,
): boolean {
  if (o?.intervalType !== spec.intervalType) return false;
  if (spec.cycle === 'monthly') return isMonthlyOffer(o);
  if (spec.cycle === 'quarterly') return isQuarterlyOffer(o);
  const interval = o?.interval == null || o.interval === '' ? 1 : Number(o.interval);
  return interval === spec.interval;
}
