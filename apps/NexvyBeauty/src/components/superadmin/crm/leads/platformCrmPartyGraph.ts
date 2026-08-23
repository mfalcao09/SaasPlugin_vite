/**
 * Grafo party — um contato da casa, N produtos SaaS (Fase 2).
 * Nunca inclui null no filtro de produto. Nunca cai em products[0].
 */

export function productIdsForFilter(
  ids: Array<string | null | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const v = id?.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function visiblePartyMemberships<T extends { product_id: string | null }>(
  rows: T[],
): Array<T & { product_id: string }> {
  return rows.filter((r): r is T & { product_id: string } => !!r.product_id);
}

export function collectLinkedProductIds(input: {
  leadProductId: string | null | undefined;
  membershipProductIds: Array<string | null | undefined>;
}): string[] {
  return productIdsForFilter([input.leadProductId, ...input.membershipProductIds]);
}

export function listLinkableCatalogProducts(
  catalog: { id: string; name: string }[],
  linkedProductIds: Array<string | null | undefined>,
): { id: string; name: string }[] {
  const linked = new Set(productIdsForFilter(linkedProductIds));
  return catalog.filter((p) => p.id && !linked.has(p.id));
}

export function validateLinkPartyProduct(input: {
  selectedProductId: string | null | undefined;
  catalogIds: string[];
  alreadyLinkedIds: Array<string | null | undefined>;
}): { ok: true; productId: string } | { ok: false; error: string } {
  const catalogIds = productIdsForFilter(input.catalogIds);
  const selected = input.selectedProductId?.trim() || '';
  if (catalogIds.length === 0) {
    return { ok: false, error: 'Não há produtos no catálogo' };
  }
  if (!selected) {
    return { ok: false, error: 'Selecione o produto' };
  }
  if (!catalogIds.includes(selected)) {
    return { ok: false, error: 'Produto fora do catálogo' };
  }
  const linked = new Set(productIdsForFilter(input.alreadyLinkedIds));
  if (linked.has(selected)) {
    return { ok: false, error: 'Já ligado a este produto' };
  }
  return { ok: true, productId: selected };
}

export function pickExistingLeadForProduct(
  candidates: Array<{
    id: string;
    product_id: string | null;
    email: string | null;
    phone: string | null;
  }>,
  productId: string,
  identity: { email?: string | null; phone?: string | null },
): string | null {
  const email = identity.email?.trim().toLowerCase() || '';
  const phone = identity.phone?.trim() || '';
  if (!productId || (!email && !phone)) return null;
  for (const c of candidates) {
    if (!c.product_id || c.product_id !== productId) continue;
    const cEmail = c.email?.trim().toLowerCase() || '';
    const cPhone = c.phone?.trim() || '';
    if (email && cEmail && cEmail === email) return c.id;
    if (phone && cPhone && cPhone === phone) return c.id;
  }
  return null;
}
