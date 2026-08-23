/**
 * Fase 4 — alçada da casa + contexto Mia cross-produto.
 *
 * Motor existente: `platform-mia` get_lead_context (um lead) e
 * `platform_crm_mia_actions` (confirmar tarefa/follow-up). Este módulo
 * liga o grafo party (N produtos SaaS) e define o gate da CASA
 * (desconto, impersonation, publish de agente, cold) — não do tenant salão.
 *
 * Sem lente CNPJ. Sem NOT NULL em product_id. Sem tesouraria.
 * Puro (sem I/O) — UI e edge importam o mesmo arquivo.
 */

/** Mesma regra do grafo party: nunca inclui null/vazio; sem duplicata. */
function productIdsForFilter(ids: Array<string | null | undefined>): string[] {
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

export const HOUSE_AUTHORITY_ACTIONS = [
  'discount',
  'impersonate',
  'publish_agent',
  'cold',
] as const;

export type HouseAuthorityAction = (typeof HOUSE_AUTHORITY_ACTIONS)[number];
export type HouseAuthorityScope = 'house' | 'tenant';
export type HouseAuthorityDecision = 'allow' | 'require_approval' | 'deny';

export const HOUSE_AUTHORITY_POLICY = {
  scope: 'house' as const,
  maxDiscountPercentWithoutApproval: 10,
};

export type HousePartyMembership = {
  product_id: string | null | undefined;
  lead_id?: string | null;
};

export type HouseCatalogProduct = {
  id: string;
  name: string;
};

export type HouseMiaPartyProduct = {
  productId: string;
  name: string;
  leadId: string | null;
  isCurrent: boolean;
};

export type HouseMiaPartyContext = {
  partyId: string | null;
  lens: 'saas_products';
  products: HouseMiaPartyProduct[];
  productIds: string[];
  seesMultipleProducts: boolean;
  crossSellHint: string | null;
};

export type HouseAuthorityOk = {
  ok: true;
  decision: Exclude<HouseAuthorityDecision, 'deny'>;
  scope: 'house';
  reason: string;
  partyProductIds: string[];
};

export type HouseAuthorityDenied = {
  ok: false;
  decision: 'deny';
  scope: 'house';
  reason: string;
  partyProductIds: string[];
};

export type HouseAuthorityResult = HouseAuthorityOk | HouseAuthorityDenied;

export type HouseAuthorityRow = {
  action: HouseAuthorityAction;
  decision: HouseAuthorityDecision;
  scope: 'house';
  reason: string;
};

export type HouseAuthoritySnapshot = {
  scope: 'house';
  partyProductIds: string[];
  gates: HouseAuthorityRow[];
};

export type HouseMiaLeadAttach = {
  produtos_da_casa: HouseMiaPartyProduct[];
  alcada: HouseAuthoritySnapshot;
  casa: { lens: 'saas_products'; party_id: string | null };
};

function nameOf(catalog: HouseCatalogProduct[], productId: string): string {
  return catalog.find((p) => p.id === productId)?.name ?? 'Produto';
}

export function buildHouseMiaPartyContext(input: {
  partyId?: string | null;
  currentLeadId?: string | null;
  currentProductId?: string | null;
  memberships: HousePartyMembership[];
  catalog: HouseCatalogProduct[];
}): HouseMiaPartyContext {
  const leadIdByProduct = new Map<string, string | null>();
  const currentProductId = input.currentProductId?.trim() || null;

  if (currentProductId) {
    leadIdByProduct.set(currentProductId, input.currentLeadId ?? null);
  }
  for (const row of input.memberships) {
    const id = row.product_id?.trim();
    if (!id) continue;
    if (!leadIdByProduct.has(id) || row.lead_id) {
      leadIdByProduct.set(id, row.lead_id ?? leadIdByProduct.get(id) ?? null);
    }
  }

  const productIds = productIdsForFilter([
    currentProductId,
    ...input.memberships.map((m) => m.product_id),
  ]);

  const products: HouseMiaPartyProduct[] = productIds.map((productId) => ({
    productId,
    name: nameOf(input.catalog, productId),
    leadId: leadIdByProduct.get(productId) ?? null,
    isCurrent: productId === currentProductId,
  }));

  const linked = new Set(productIds);
  const offer = input.catalog.find((p) => p.id && !linked.has(p.id));
  let crossSellHint: string | null = null;
  if (products.length >= 2) {
    const names = products.map((p) => p.name);
    const last = names.pop();
    crossSellHint = `mesmo contato em ${names.join(', ')} e ${last}`;
  } else if (products.length === 1 && offer) {
    crossSellHint = `já é tenant ${products[0].name}; oferecer ${offer.name}`;
  }

  return {
    partyId: input.partyId ?? null,
    lens: 'saas_products',
    products,
    productIds,
    seesMultipleProducts: productIds.length > 1,
    crossSellHint,
  };
}

export function evaluateHouseAuthority(input: {
  action: HouseAuthorityAction;
  requestedScope?: HouseAuthorityScope;
  payload?: { discountPercent?: number; organizationId?: string | null };
  partyContext?: HouseMiaPartyContext;
}): HouseAuthorityResult {
  const partyProductIds = input.partyContext?.productIds ?? [];

  if (input.requestedScope === 'tenant') {
    return {
      ok: false,
      decision: 'deny',
      scope: 'house',
      reason: 'Alçada é da casa, não do tenant/salão',
      partyProductIds,
    };
  }

  if (input.action === 'discount') {
    const pct = input.payload?.discountPercent;
    if (pct == null || Number.isNaN(pct)) {
      return {
        ok: true,
        decision: 'require_approval',
        scope: 'house',
        reason: 'Desconto sem percentual — aprovação da casa',
        partyProductIds,
      };
    }
    if (pct < 0 || pct > 100) {
      return {
        ok: false,
        decision: 'deny',
        scope: 'house',
        reason: 'Percentual de desconto inválido',
        partyProductIds,
      };
    }
    if (pct <= HOUSE_AUTHORITY_POLICY.maxDiscountPercentWithoutApproval) {
      return {
        ok: true,
        decision: 'allow',
        scope: 'house',
        reason: `Desconto até ${HOUSE_AUTHORITY_POLICY.maxDiscountPercentWithoutApproval}% na alçada da casa`,
        partyProductIds,
      };
    }
    return {
      ok: true,
      decision: 'require_approval',
      scope: 'house',
      reason: `Desconto acima de ${HOUSE_AUTHORITY_POLICY.maxDiscountPercentWithoutApproval}% — aprovação da casa`,
      partyProductIds,
    };
  }

  const labels: Record<Exclude<HouseAuthorityAction, 'discount'>, string> = {
    impersonate: 'Impersonation de cliente',
    publish_agent: 'Publicar agente',
    cold: 'Cold outreach',
  };
  return {
    ok: true,
    decision: 'require_approval',
    scope: 'house',
    reason: `${labels[input.action]} — aprovação da casa`,
    partyProductIds,
  };
}

export function listHouseAuthoritySnapshot(
  partyContext: HouseMiaPartyContext,
): HouseAuthoritySnapshot {
  const gates: HouseAuthorityRow[] = HOUSE_AUTHORITY_ACTIONS.map((action) => {
    const r = evaluateHouseAuthority({
      action,
      requestedScope: 'house',
      partyContext,
    });
    return {
      action,
      decision: r.decision,
      scope: 'house',
      reason: r.reason,
    };
  });
  return {
    scope: 'house',
    partyProductIds: partyContext.productIds,
    gates,
  };
}

export function attachHouseMiaToLeadContext<T extends Record<string, unknown>>(
  leadContext: T,
  partyContext: HouseMiaPartyContext,
): T & HouseMiaLeadAttach {
  return {
    ...leadContext,
    produtos_da_casa: partyContext.products,
    alcada: listHouseAuthoritySnapshot(partyContext),
    casa: { lens: 'saas_products', party_id: partyContext.partyId },
  };
}
