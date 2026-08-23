/**
 * Regra B — produto no CREATE de lead/import/agenda/tarefa.
 *
 * - Switcher com produto: carimba `lockedProductId` (activeProductId).
 * - Switcher em “Todos” + catálogo não vazio: selected é obrigatório.
 * - Catálogo vazio: product_id null (degenerado).
 * - NUNCA usa effectiveProductId / products[0].
 */

export function isCreateLeadProductRequired(
  lockedProductId: string | null,
  catalogHasProducts: boolean,
): boolean {
  return lockedProductId == null && catalogHasProducts;
}

export function resolveCreateLeadProductId(input: {
  lockedProductId: string | null;
  selectedProductId: string | null | undefined;
  catalogHasProducts: boolean;
}): string | null {
  if (input.lockedProductId) return input.lockedProductId;
  if (!input.catalogHasProducts) return null;
  const selected = input.selectedProductId?.trim();
  return selected ? selected : null;
}

export function validateCreateLeadProduct(input: {
  lockedProductId: string | null;
  selectedProductId: string | null | undefined;
  catalogHasProducts: boolean;
}): { ok: true; productId: string | null } | { ok: false; error: string } {
  const productId = resolveCreateLeadProductId(input);
  if (isCreateLeadProductRequired(input.lockedProductId, input.catalogHasProducts) && !productId) {
    return { ok: false, error: 'Selecione o produto' };
  }
  return { ok: true, productId };
}
