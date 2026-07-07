// Matching de cenários pós-venda contra os fatos do pedido Cakto.
// Extraído do index.ts para ser testável isoladamente (deno test).

export type Scenario = {
  name: string;
  instruction: string;
  links: Array<{ label: string; url: string; when_to_offer?: string }> | null;
  tags_to_apply: string[] | null;
  filters: Record<string, unknown> | null;
  priority: number;
};

export type OrderFacts = {
  product_cakto_id: string | null;
  amount: number | null;
  items: Array<{ product_cakto_id: string | null; role: string } | null>;
};

// Filtra cenários pelos filters (ex: produto específico, valor mínimo/máximo,
// order bumps obrigatórios). Sem filters → cenário sempre casa.
export function matchScenario(s: Scenario, order: OrderFacts): boolean {
  const f = s.filters || {};
  if (f.product_cakto_id && order.product_cakto_id !== f.product_cakto_id) return false;
  if (typeof f.min_amount === 'number' && (order.amount ?? 0) < f.min_amount) return false;
  if (typeof f.max_amount === 'number' && (order.amount ?? 0) > f.max_amount) return false;
  if (Array.isArray(f.required_orderbumps) && f.required_orderbumps.length > 0) {
    const bumpIds = order.items
      .filter((i) => i?.role === 'orderbump')
      .map((i) => i?.product_cakto_id);
    if (!f.required_orderbumps.every((id: string) => bumpIds.includes(id))) return false;
  }
  return true;
}
