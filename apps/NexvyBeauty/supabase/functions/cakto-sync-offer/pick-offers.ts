// Decisão PURA (sem rede) do cakto-sync-offer, extraída para ser unit-testável
// sem importar o index.ts (que chama Deno.serve no top-level).

import { isQuarterlyOffer } from './cycles.ts';

// intervalTypes que ESTA sync gerencia (mensal/trimestral/anual). Ofertas de
// outros intervalTypes (week/lifetime) são SKUs alheios e NÃO se tocam.
// Trimestral Cakto é month+interval=3 — mesmo intervalType que o mensal.
export const MANAGED_INTERVAL_TYPES = ['month', 'year'] as const;

/**
 * Dado o array de ofertas do produto e os ids das ofertas desejadas (as
 * recém-assentadas mensal/trimestral/anual), devolve os ids das ofertas
 * ANTIGAS/divergentes que devem ser desabilitadas.
 *
 * Regras (todas simultâneas):
 *  - só type=subscription && status=active;
 *  - só intervalType gerenciado por nós (month/year) — protege SKU de outro
 *    intervalType/plano no mesmo produto;
 *  - month+interval=3 (trimestral gerenciada) SÓ entra se esta rodada também
 *    está gerindo trimestral (algum keepId é month+interval=3). Sem isso, um
 *    sync só mensal/anual derrubaria a oferta trimestral vigente;
 *  - NUNCA um id em keepIds (as desejadas atuais);
 *  - dedupe. Idempotente: rodar 2x devolve [] na 2ª (as antigas já saíram de active).
 */
export function pickOffersToDisable(
  offers: any[],
  keepIds: Iterable<string | null | undefined>,
  managedIntervalTypes: readonly string[] = MANAGED_INTERVAL_TYPES,
  /** true quando esta rodada assenta oferta trimestral (mesmo se o GET anterior ainda não a lista). */
  managingQuarterly?: boolean,
): string[] {
  const keep = new Set<string>();
  for (const id of keepIds) if (id) keep.add(String(id));
  const managed = new Set(managedIntervalTypes);
  const list = offers ?? [];
  const inferredQuarterly = list.some((o) => {
    const id = o?.id != null ? String(o.id) : null;
    return !!id && keep.has(id) && isQuarterlyOffer(o);
  });
  const collapsingQuarterly = managingQuarterly === true || inferredQuarterly;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const o of list) {
    const id = o?.id != null ? String(o.id) : null;
    if (!id) continue;
    if (o?.type !== 'subscription') continue;
    if (o?.status !== 'active') continue;
    if (!managed.has(o?.intervalType)) continue;
    if (isQuarterlyOffer(o) && !collapsingQuarterly) continue;
    if (keep.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
