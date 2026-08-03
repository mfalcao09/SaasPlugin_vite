// ─────────────────────────────────────────────────────────────────────────────
// NexvyAds — modelo de colunas da tabela de campanhas (nível-hub). Puro (sem I/O).
// Usado pela AdsCampaignsTab (render + ordenação + ColumnCustomizer) e pelo export
// CSV. Colunas de métrica leem do AdsMetricAgg; budget/status vêm da entidade.
// ─────────────────────────────────────────────────────────────────────────────
import type { AdsMetricAgg } from '@/components/superadmin/crm/data/usePlatformAdsCampaigns';
import { fmtInt, fmtCompact, fmtMoney, fmtPct, fmtRoas } from './adsFormat';

export type AdsColKind = 'status' | 'budget' | 'metric';
export type AdsColFmt = 'money' | 'int' | 'compact' | 'pct' | 'roas' | 'freq' | 'none';

export interface AdsCampaignCol {
  key: string;
  label: string;
  /** Categoria p/ agrupar no ColumnCustomizer. */
  category: string;
  kind: AdsColKind;
  align: 'left' | 'right';
  sortable: boolean;
  fmt: AdsColFmt;
  /** Valor numérico (métrica) a partir do agregado — usado p/ ordenar e formatar. */
  metricValue?: (a: AdsMetricAgg) => number;
}

/** Frequência = impressões / alcance (média de vezes que cada pessoa viu). */
function frequency(a: AdsMetricAgg): number {
  return a.reach > 0 ? a.impressions / a.reach : 0;
}

export const ALL_CAMPAIGN_COLS: AdsCampaignCol[] = [
  { key: 'status', label: 'Status', category: 'Identificação', kind: 'status', align: 'left', sortable: false, fmt: 'none' },
  { key: 'budget', label: 'Orçamento', category: 'Orçamento', kind: 'budget', align: 'right', sortable: true, fmt: 'money' },
  { key: 'spend', label: 'Gasto', category: 'Custos', kind: 'metric', align: 'right', sortable: true, fmt: 'money', metricValue: (a) => a.spend },
  { key: 'impressions', label: 'Impressões', category: 'Volume', kind: 'metric', align: 'right', sortable: true, fmt: 'compact', metricValue: (a) => a.impressions },
  { key: 'reach', label: 'Alcance', category: 'Volume', kind: 'metric', align: 'right', sortable: true, fmt: 'compact', metricValue: (a) => a.reach },
  { key: 'frequency', label: 'Freq.', category: 'Volume', kind: 'metric', align: 'right', sortable: true, fmt: 'freq', metricValue: frequency },
  { key: 'clicks', label: 'Cliques', category: 'Volume', kind: 'metric', align: 'right', sortable: true, fmt: 'compact', metricValue: (a) => a.clicks },
  { key: 'ctr', label: 'CTR', category: 'Eficiência', kind: 'metric', align: 'right', sortable: true, fmt: 'pct', metricValue: (a) => a.ctr },
  { key: 'cpc', label: 'CPC', category: 'Custos', kind: 'metric', align: 'right', sortable: true, fmt: 'money', metricValue: (a) => a.cpc },
  { key: 'cpm', label: 'CPM', category: 'Custos', kind: 'metric', align: 'right', sortable: true, fmt: 'money', metricValue: (a) => a.cpm },
  { key: 'conversions', label: 'Conv.', category: 'Resultado', kind: 'metric', align: 'right', sortable: true, fmt: 'int', metricValue: (a) => a.conversions },
  { key: 'cpa', label: 'CPA', category: 'Custos', kind: 'metric', align: 'right', sortable: true, fmt: 'money', metricValue: (a) => a.cpa },
  { key: 'roas', label: 'ROAS', category: 'Resultado', kind: 'metric', align: 'right', sortable: true, fmt: 'roas', metricValue: (a) => a.roas },
];

export const DEFAULT_VISIBLE_KEYS = ALL_CAMPAIGN_COLS.map((c) => c.key);

/** Formata um número segundo o `fmt` da coluna (para células de métrica). */
export function fmtByCol(fmt: AdsColFmt, value: number | null, currency: string): string {
  switch (fmt) {
    case 'money':
      return fmtMoney(value, currency);
    case 'int':
      return fmtInt(value);
    case 'compact':
      return fmtCompact(value);
    case 'pct':
      return fmtPct(value);
    case 'roas':
      return fmtRoas(value);
    case 'freq':
      return value == null || Number.isNaN(value) || value === 0 ? '—' : `${value.toFixed(2)}×`;
    default:
      return value == null ? '—' : String(value);
  }
}

/** Valor de ordenação de uma coluna de métrica (0 quando não aplicável). */
export function metricSortValue(col: AdsCampaignCol, agg: AdsMetricAgg): number {
  return col.metricValue ? col.metricValue(agg) : 0;
}
