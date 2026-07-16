import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * NexvyAds — camada A1 (GESTÃO de campanhas). super_admin, PRODUCT-scoped. Read-only.
 *
 * Hierarquia conta→campanha→adset→ad lendo `ads_accounts / ads_campaigns /
 * ads_adsets / ads_ads` + insights diários de `ads_metrics` (agregados por
 * intervalo de datas, no nível pedido). Estende o padrão de
 * usePlatformAdsConnection.ts.
 *
 * ⚠️ Tabelas ads_* fora dos types gerados → cast `as never` + interface local
 * (nunca regenerar types).
 */

export interface AdsAccountRow {
  id: string;
  product_id: string;
  connection_id: string;
  external_account_id: string;
  name: string | null;
  currency: string | null;
  timezone_name: string | null;
  account_status: number | null;
  business_id: string | null;
  business_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdsCampaignRow {
  id: string;
  product_id: string;
  account_id: string;
  connection_id: string | null;
  external_id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  buying_type: string | null;
  start_time: string | null;
  stop_time: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdsAdsetRow {
  id: string;
  product_id: string;
  campaign_id: string;
  account_id: string;
  external_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  optimization_goal: string | null;
  billing_event: string | null;
  bid_amount: number | null;
  start_time: string | null;
  end_time: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdsAdRow {
  id: string;
  product_id: string;
  adset_id: string;
  campaign_id: string;
  account_id: string;
  external_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  preview_url: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AdsMetricLevel = 'account' | 'campaign' | 'adset' | 'ad';

export interface AdsMetricRow {
  id: string;
  product_id: string;
  account_id: string;
  level: AdsMetricLevel;
  external_entity_id: string;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  date_start: string; // date 'YYYY-MM-DD'
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  spend: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  conversions: number | null;
  conversion_value: number | null;
  cpa: number | null;
  roas: number | null;
}

/** Métrica agregada (derivada) usada nas linhas da árvore. */
export interface AdsMetricAgg {
  impressions: number;
  clicks: number;
  reach: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  // derivadas (recalculadas sobre os agregados — nunca somadas)
  ctr: number; // clicks / impressions
  cpc: number; // spend / clicks
  cpm: number; // spend / impressions * 1000
  cpa: number; // spend / conversions
  roas: number; // conversion_value / spend
  rows: number; // nº de dias/linhas agregados
}

export const EMPTY_AGG: AdsMetricAgg = {
  impressions: 0,
  clicks: 0,
  reach: 0,
  spend: 0,
  conversions: 0,
  conversion_value: 0,
  ctr: 0,
  cpc: 0,
  cpm: 0,
  cpa: 0,
  roas: 0,
  rows: 0,
};

/** Soma somativos + recalcula derivadas (NUNCA soma ctr/cpc/cpm/cpa/roas). */
export function aggregateMetrics(rows: AdsMetricRow[]): AdsMetricAgg {
  const acc: AdsMetricAgg = { ...EMPTY_AGG };
  for (const r of rows) {
    acc.impressions += r.impressions ?? 0;
    acc.clicks += r.clicks ?? 0;
    acc.reach += r.reach ?? 0;
    acc.spend += Number(r.spend ?? 0);
    acc.conversions += Number(r.conversions ?? 0);
    acc.conversion_value += Number(r.conversion_value ?? 0);
    acc.rows += 1;
  }
  acc.ctr = acc.impressions > 0 ? acc.clicks / acc.impressions : 0;
  acc.cpc = acc.clicks > 0 ? acc.spend / acc.clicks : 0;
  acc.cpm = acc.impressions > 0 ? (acc.spend / acc.impressions) * 1000 : 0;
  acc.cpa = acc.conversions > 0 ? acc.spend / acc.conversions : 0;
  acc.roas = acc.spend > 0 ? acc.conversion_value / acc.spend : 0;
  return acc;
}

export function useAdsAccounts(productId: string | null) {
  return useQuery({
    queryKey: ['platform-ads-accounts', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads_accounts' as never)
        .select('*')
        .eq('product_id', productId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AdsAccountRow[];
    },
  });
}

export function useAdsCampaigns(productId: string | null) {
  return useQuery({
    queryKey: ['platform-ads-campaigns', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads_campaigns' as never)
        .select('*')
        .eq('product_id', productId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AdsCampaignRow[];
    },
  });
}

export function useAdsAdsets(productId: string | null) {
  return useQuery({
    queryKey: ['platform-ads-adsets', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads_adsets' as never)
        .select('*')
        .eq('product_id', productId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AdsAdsetRow[];
    },
  });
}

export function useAdsAds(productId: string | null) {
  return useQuery({
    queryKey: ['platform-ads-ads', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads_ads' as never)
        .select('*')
        .eq('product_id', productId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AdsAdRow[];
    },
  });
}

/**
 * Métricas do produto a partir de `sinceDate` (YYYY-MM-DD, inclusive). O filtro
 * de intervalo é aplicado no servidor (date_start >= sinceDate); o agrupamento
 * por nível/entidade é feito no cliente (aggregateMetrics).
 */
export function useAdsMetrics(productId: string | null, sinceDate: string | null) {
  return useQuery({
    queryKey: ['platform-ads-metrics', productId, sinceDate],
    enabled: !!productId,
    queryFn: async () => {
      let q = supabase
        .from('ads_metrics' as never)
        .select('*')
        .eq('product_id', productId as string);
      if (sinceDate) q = q.gte('date_start', sinceDate);
      const { data, error } = await q
        .order('date_start', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as AdsMetricRow[];
    },
  });
}
