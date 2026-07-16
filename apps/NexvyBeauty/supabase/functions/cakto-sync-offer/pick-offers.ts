// Decisão PURA (sem rede) do cakto-sync-offer, extraída para ser unit-testável
// sem importar o index.ts (que chama Deno.serve no top-level).

// intervalTypes que ESTA sync gerencia (mensal/anual). Ofertas de outros
// intervalTypes (week/lifetime) são SKUs alheios ao nosso ciclo e NÃO se tocam.
export const MANAGED_INTERVAL_TYPES = ['month', 'year'] as const;

/**
 * Dado o array de ofertas do produto e os ids das ofertas desejadas (as
 * recém-assentadas mensal/anual), devolve os ids das ofertas ANTIGAS/divergentes
 * que devem ser desabilitadas — colapsando os links de preço defasado que
 * continuariam vendendo.
 *
 * Regras (todas simultâneas):
 *  - só type=subscription && status=active;
 *  - só intervalType gerenciado por nós (month/year) — protege SKU de outro
 *    intervalType/plano no mesmo produto;
 *  - NUNCA um id em keepIds (as desejadas atuais);
 *  - dedupe. Idempotente: rodar 2x devolve [] na 2ª (as antigas já saíram de active).
 */
export function pickOffersToDisable(
  offers: any[],
  keepIds: Iterable<string | null | undefined>,
  managedIntervalTypes: readonly string[] = MANAGED_INTERVAL_TYPES,
): string[] {
  const keep = new Set<string>();
  for (const id of keepIds) if (id) keep.add(String(id));
  const managed = new Set(managedIntervalTypes);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const o of offers ?? []) {
    const id = o?.id != null ? String(o.id) : null;
    if (!id) continue;
    if (o?.type !== 'subscription') continue;
    if (o?.status !== 'active') continue;
    if (!managed.has(o?.intervalType)) continue;
    if (keep.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
