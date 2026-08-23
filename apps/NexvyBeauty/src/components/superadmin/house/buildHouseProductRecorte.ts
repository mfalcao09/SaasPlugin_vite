/**
 * Recorte da casa SaaS por linha do catálogo `platform_crm_products`.
 *
 * Fonte: catálogo + stats já agregados em `usePlatformCrmProductsStats`
 * (leads / ganhos de `platform_crm_leads` e `platform_crm_deals`).
 * Não inventa produto, não chama won_value de MRR, não preenche buraco.
 */

export type HouseProductRecorteInput = {
  id: string;
  name: string;
  status: string | null;
};

export type HouseProductStats = {
  product_id: string;
  total_leads: number;
  sellers_count: number;
  won_count: number;
  won_value: number;
};

export type HouseProductRecorteRow = {
  productId: string;
  name: string;
  status: string | null;
  leadCount: number;
  wonCount: number;
  wonValue: number;
  sellersCount: number;
};

export type HouseProductRecorteTotals = {
  products: number;
  leadCount: number;
  wonCount: number;
  wonValue: number;
};

export type HouseProductRecorte = {
  rows: HouseProductRecorteRow[];
  totals: HouseProductRecorteTotals;
};

export function buildHouseProductRecorte(
  products: HouseProductRecorteInput[],
  statsByProductId: Map<string, HouseProductStats> | undefined,
  activeProductId: string | null = null,
): HouseProductRecorte {
  const scoped = activeProductId
    ? products.filter((p) => p.id === activeProductId)
    : products;

  const rows: HouseProductRecorteRow[] = scoped.map((p) => {
    const s = statsByProductId?.get(p.id);
    return {
      productId: p.id,
      name: p.name,
      status: p.status,
      leadCount: s?.total_leads ?? 0,
      wonCount: s?.won_count ?? 0,
      wonValue: s?.won_value ?? 0,
      sellersCount: s?.sellers_count ?? 0,
    };
  });

  const totals = rows.reduce<HouseProductRecorteTotals>(
    (acc, row) => ({
      products: acc.products + 1,
      leadCount: acc.leadCount + row.leadCount,
      wonCount: acc.wonCount + row.wonCount,
      wonValue: acc.wonValue + row.wonValue,
    }),
    { products: 0, leadCount: 0, wonCount: 0, wonValue: 0 },
  );

  return { rows, totals };
}
