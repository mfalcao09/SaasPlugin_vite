import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Columns3,
  Copy,
  Download,
  Megaphone,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/lib/leadsExport';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { PlatformAdsConnectCard } from '@/components/superadmin/crm/integrations/PlatformAdsConnectCard';
import {
  useAdsAccounts,
  useAdsCampaigns,
  useAdsAdsets,
  useAdsAds,
  useAdsMetrics,
  aggregateMetrics,
  EMPTY_AGG,
  type AdsMetricAgg,
  type AdsMetricRow,
  type AdsAccountRow,
  type AdsCampaignRow,
  type AdsAdsetRow,
  type AdsAdRow,
} from '@/components/superadmin/crm/data/usePlatformAdsCampaigns';
import { fmtMoney, isoDaysAgo, DATE_RANGE_PRESETS } from './adsFormat';
import {
  ALL_CAMPAIGN_COLS,
  DEFAULT_VISIBLE_KEYS,
  fmtByCol,
  metricSortValue,
  type AdsCampaignCol,
} from './adsColumns';
import { campaignsCsvString } from './adsExport';
import { AdsCrudConfirmDialog, type AdsCrudAction } from './AdsCrudConfirmDialog';

/**
 * Aba CAMPANHAS (camada A1) nível-hub — read-only sobre dados, mutações em dry-run.
 * Árvore conta→campanha→adset→ad + métricas de ads_metrics agregadas no intervalo,
 * com: ordenação clicável por coluna, filtro de status, seleção em massa,
 * ColumnCustomizer, export CSV e ações inline por linha (Pausar/Ativar/Duplicar/
 * Editar) via AdsCrudConfirmDialog. ⚠️ ADS_MUTATIONS_ENABLED=false → toda ação é
 * stub/dry-run (toast); nenhuma chamada Graph parte do browser (§11.1).
 */

type StatusFilter = 'all' | 'active' | 'paused';
type SortDir = 'asc' | 'desc';

function statusOf(c: { effective_status: string | null; status: string | null }): string {
  return (c.effective_status ?? c.status ?? '').toUpperCase();
}

/** Agrupa linhas de métrica por FK, no nível pedido, e agrega cada bucket. */
function groupAgg(
  rows: AdsMetricRow[],
  level: AdsMetricRow['level'],
  keyOf: (r: AdsMetricRow) => string | null,
): Map<string, AdsMetricAgg> {
  const buckets = new Map<string, AdsMetricRow[]>();
  for (const r of rows) {
    if (r.level !== level) continue;
    const k = keyOf(r);
    if (!k) continue;
    const arr = buckets.get(k) ?? [];
    arr.push(r);
    buckets.set(k, arr);
  }
  const out = new Map<string, AdsMetricAgg>();
  for (const [k, arr] of buckets) out.set(k, aggregateMetrics(arr));
  return out;
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const active = status.toUpperCase() === 'ACTIVE';
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] capitalize',
        active
          ? 'border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-300'
          : 'text-muted-foreground',
      )}
    >
      {status.toLowerCase()}
    </Badge>
  );
}

/** Célula de uma coluna para um nó (campanha/adset/anúncio) da árvore. */
function ColCell({
  col,
  budget,
  status,
  agg,
  currency,
}: {
  col: AdsCampaignCol;
  budget: number | null;
  status: string | null;
  agg: AdsMetricAgg;
  currency: string;
}) {
  if (col.kind === 'status') {
    return (
      <td className="p-2">
        <StatusPill status={status} />
      </td>
    );
  }
  if (col.kind === 'budget') {
    return (
      <td className="p-2 text-right tabular-nums text-muted-foreground">
        {budget != null ? fmtMoney(budget, currency) : '—'}
      </td>
    );
  }
  const highlight = col.key === 'spend' || col.key === 'roas' || col.key === 'conversions';
  return (
    <td className={cn('p-2 text-right tabular-nums', highlight ? '' : 'text-muted-foreground')}>
      {fmtByCol(col.fmt, col.metricValue ? col.metricValue(agg) : null, currency)}
    </td>
  );
}

interface SortState {
  key: string;
  dir: SortDir;
}

function SortHeader({
  col,
  sort,
  onSort,
}: {
  col: AdsCampaignCol;
  sort: SortState;
  onSort: (key: string) => void;
}) {
  const active = sort.key === col.key;
  if (!col.sortable) {
    return (
      <th className={cn('p-2 font-medium', col.align === 'right' ? 'text-right' : 'text-left')}>
        {col.label}
      </th>
    );
  }
  return (
    <th className={cn('p-2 font-medium', col.align === 'right' ? 'text-right' : 'text-left')}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground',
          col.align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
        onClick={() => onSort(col.key)}
      >
        {col.label}
        {active ? (
          sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

interface CrudTarget {
  action: AdsCrudAction;
  campaign: AdsCampaignRow;
  agg: AdsMetricAgg;
  currency: string;
}

interface AccountBlockProps {
  account: AdsAccountRow;
  campaigns: AdsCampaignRow[];
  adsets: AdsAdsetRow[];
  ads: AdsAdRow[];
  byCampaign: Map<string, AdsMetricAgg>;
  byAdset: Map<string, AdsMetricAgg>;
  byAd: Map<string, AdsMetricAgg>;
  byAccount: Map<string, AdsMetricAgg>;
  visibleCols: AdsCampaignCol[];
  sort: SortState;
  onSort: (key: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onRequestAction: (t: CrudTarget) => void;
}

function AccountBlock({
  account,
  campaigns,
  adsets,
  ads,
  byCampaign,
  byAdset,
  byAd,
  byAccount,
  visibleCols,
  sort,
  onSort,
  selected,
  onToggleSelect,
  onRequestAction,
}: AccountBlockProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const currency = account.currency ?? 'BRL';
  const accAgg = byAccount.get(account.id) ?? EMPTY_AGG;

  const adsetsByCampaign = useMemo(() => {
    const m = new Map<string, AdsAdsetRow[]>();
    for (const a of adsets) {
      const arr = m.get(a.campaign_id) ?? [];
      arr.push(a);
      m.set(a.campaign_id, arr);
    }
    return m;
  }, [adsets]);

  const adsByAdset = useMemo(() => {
    const m = new Map<string, AdsAdRow[]>();
    for (const a of ads) {
      const arr = m.get(a.adset_id) ?? [];
      arr.push(a);
      m.set(a.adset_id, arr);
    }
    return m;
  }, [ads]);

  const colSpan = 2 + visibleCols.length + 1; // checkbox + name + cols + actions

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <span className="truncate font-semibold">{account.name ?? account.external_account_id}</span>
            {!account.is_active && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">inativa</Badge>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {account.external_account_id}
            {account.business_name ? ` · ${account.business_name}` : ''} · {currency}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="font-medium text-foreground">{fmtMoney(accAgg.spend, currency)}</div>
          <div>gasto no período</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="w-8 p-2" />
              <th className="p-2 text-left font-medium">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => onSort('name')}
                >
                  Campanha / conjunto / anúncio
                  {sort.key === 'name' ? (
                    sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  ) : (
                    <ChevronsUpDown className="h-3 w-3 opacity-40" />
                  )}
                </button>
              </th>
              {visibleCols.map((c) => (
                <SortHeader key={c.key} col={c} sort={sort} onSort={onSort} />
              ))}
              <th className="w-10 p-2" />
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="p-6 text-center text-muted-foreground">
                  Nenhuma campanha nesta conta no filtro atual.
                </td>
              </tr>
            )}
            {campaigns.map((camp) => {
              const cAgg = byCampaign.get(camp.id) ?? EMPTY_AGG;
              const cAdsets = adsetsByCampaign.get(camp.id) ?? [];
              const cOpen = expanded.has(camp.id);
              const isActive = statusOf(camp) === 'ACTIVE';
              const isSel = selected.has(camp.id);
              return (
                <ExpandableGroup key={camp.id}>
                  <tr className={cn('border-t border-border hover:bg-muted/30', isSel && 'bg-primary/5')}>
                    <td className="p-2 align-middle">
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => onToggleSelect(camp.id)}
                        aria-label="Selecionar campanha"
                      />
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-left"
                        onClick={() => toggle(camp.id)}
                        disabled={cAdsets.length === 0}
                      >
                        {cAdsets.length > 0 ? (
                          cOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
                        ) : (
                          <span className="inline-block w-4" />
                        )}
                        <span className="font-medium">{camp.name ?? camp.external_id}</span>
                      </button>
                    </td>
                    {visibleCols.map((col) => (
                      <ColCell
                        key={col.key}
                        col={col}
                        budget={camp.daily_budget}
                        status={camp.effective_status ?? camp.status}
                        agg={cAgg}
                        currency={currency}
                      />
                    ))}
                    <td className="p-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isActive ? (
                            <DropdownMenuItem
                              onSelect={() => onRequestAction({ action: 'pause', campaign: camp, agg: cAgg, currency })}
                            >
                              <Pause className="mr-2 h-4 w-4" /> Pausar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() => onRequestAction({ action: 'activate', campaign: camp, agg: cAgg, currency })}
                            >
                              <Play className="mr-2 h-4 w-4" /> Ativar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onSelect={() => onRequestAction({ action: 'duplicate', campaign: camp, agg: cAgg, currency })}
                          >
                            <Copy className="mr-2 h-4 w-4" /> Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => onRequestAction({ action: 'edit', campaign: camp, agg: cAgg, currency })}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => onRequestAction({ action: 'archive', campaign: camp, agg: cAgg, currency })}
                          >
                            <Archive className="mr-2 h-4 w-4" /> Arquivar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>

                  {cOpen &&
                    cAdsets.map((adset) => {
                      const aAgg = byAdset.get(adset.id) ?? EMPTY_AGG;
                      const aAds = adsByAdset.get(adset.id) ?? [];
                      const aOpen = expanded.has(adset.id);
                      return (
                        <ExpandableGroup key={adset.id}>
                          <tr className="border-t border-border/60 bg-muted/10 hover:bg-muted/30">
                            <td className="p-2" />
                            <td className="p-2 pl-6">
                              <button
                                type="button"
                                className="flex items-center gap-1.5 text-left"
                                onClick={() => toggle(adset.id)}
                                disabled={aAds.length === 0}
                              >
                                {aAds.length > 0 ? (
                                  aOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
                                ) : (
                                  <span className="inline-block w-4" />
                                )}
                                <span>{adset.name ?? adset.external_id}</span>
                              </button>
                            </td>
                            {visibleCols.map((col) => (
                              <ColCell
                                key={col.key}
                                col={col}
                                budget={adset.daily_budget}
                                status={adset.effective_status ?? adset.status}
                                agg={aAgg}
                                currency={currency}
                              />
                            ))}
                            <td className="p-2" />
                          </tr>

                          {aOpen &&
                            aAds.map((ad) => (
                              <tr key={ad.id} className="border-t border-border/40 bg-muted/20 hover:bg-muted/30">
                                <td className="p-2" />
                                <td className="p-2 pl-12">
                                  <span className="inline-block w-4" />
                                  <span className="text-muted-foreground">{ad.name ?? ad.external_id}</span>
                                </td>
                                {visibleCols.map((col) => (
                                  <ColCell
                                    key={col.key}
                                    col={col}
                                    budget={null}
                                    status={ad.effective_status ?? ad.status}
                                    agg={byAd.get(ad.id) ?? EMPTY_AGG}
                                    currency={currency}
                                  />
                                ))}
                                <td className="p-2" />
                              </tr>
                            ))}
                        </ExpandableGroup>
                      );
                    })}
                </ExpandableGroup>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Wrapper transparente só para agrupar fragmentos de <tr> com uma key estável. */
function ExpandableGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Barra flutuante de ação em massa (stub/dry-run — mutações gated OFF). */
function BulkActionBar({
  count,
  onAction,
  onClear,
}: {
  count: number;
  onAction: (action: 'activate' | 'pause' | 'archive') => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/95 px-5 py-3 shadow-lg backdrop-blur-sm">
        <span className="text-sm font-medium">{count} selecionada(s)</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onAction('activate')}>
            <Play className="mr-1 h-3 w-3" /> Ativar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('pause')}>
            <Pause className="mr-1 h-3 w-3" /> Pausar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onAction('archive')}>
            <Archive className="mr-1 h-3 w-3" /> Arquivar
          </Button>
        </div>
        <Button size="icon" variant="ghost" className="ml-1 h-7 w-7" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Diálogo de personalização de colunas (mostrar/ocultar), agrupado por categoria. */
function ColumnCustomizer({
  visibleKeys,
  onToggle,
  onReset,
}: {
  visibleKeys: string[];
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const categories = [...new Set(ALL_CAMPAIGN_COLS.map((c) => c.category))];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Columns3 className="h-4 w-4" /> Colunas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Personalizar colunas</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{cat}</p>
              <div className="space-y-2">
                {ALL_CAMPAIGN_COLS.filter((c) => c.category === cat).map((col) => (
                  <div key={col.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`adscol-${col.key}`}
                      checked={visibleKeys.includes(col.key)}
                      onCheckedChange={() => onToggle(col.key)}
                    />
                    <Label htmlFor={`adscol-${col.key}`} className="cursor-pointer text-sm">
                      {col.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Restaurar padrão
          </Button>
          <DialogClose asChild>
            <Button size="sm">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdsCampaignsTab() {
  const { effectiveProductId } = useActivePlatformProduct();
  const qc = useQueryClient();

  const [rangeValue, setRangeValue] = useState('30');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [visibleKeys, setVisibleKeys] = useState<string[]>(DEFAULT_VISIBLE_KEYS);
  const [sort, setSort] = useState<SortState>({ key: 'spend', dir: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [crudTarget, setCrudTarget] = useState<CrudTarget | null>(null);

  const preset = DATE_RANGE_PRESETS.find((p) => p.value === rangeValue) ?? DATE_RANGE_PRESETS[2];
  const sinceDate = isoDaysAgo(preset.days);

  const accountsQ = useAdsAccounts(effectiveProductId);
  const campaignsQ = useAdsCampaigns(effectiveProductId);
  const adsetsQ = useAdsAdsets(effectiveProductId);
  const adsQ = useAdsAds(effectiveProductId);
  const metricsQ = useAdsMetrics(effectiveProductId, sinceDate);

  const accounts = accountsQ.data ?? [];
  const campaigns = campaignsQ.data ?? [];
  const adsets = adsetsQ.data ?? [];
  const ads = adsQ.data ?? [];
  const metrics = metricsQ.data ?? [];

  const isLoading =
    accountsQ.isLoading ||
    campaignsQ.isLoading ||
    adsetsQ.isLoading ||
    adsQ.isLoading ||
    metricsQ.isLoading;
  const hasError =
    accountsQ.isError || campaignsQ.isError || adsetsQ.isError || adsQ.isError || metricsQ.isError;

  const byAccount = useMemo(() => groupAgg(metrics, 'account', (r) => r.account_id), [metrics]);
  const byCampaign = useMemo(() => groupAgg(metrics, 'campaign', (r) => r.campaign_id), [metrics]);
  const byAdset = useMemo(() => groupAgg(metrics, 'adset', (r) => r.adset_id), [metrics]);
  const byAd = useMemo(() => groupAgg(metrics, 'ad', (r) => r.ad_id), [metrics]);

  const visibleCols = useMemo(
    () => ALL_CAMPAIGN_COLS.filter((c) => visibleKeys.includes(c.key)),
    [visibleKeys],
  );

  const passesStatus = (c: AdsCampaignRow) => {
    if (statusFilter === 'all') return true;
    const s = statusOf(c);
    return statusFilter === 'active' ? s === 'ACTIVE' : s !== 'ACTIVE';
  };

  const campaignsByAccount = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const compare = (a: AdsCampaignRow, b: AdsCampaignRow): number => {
      if (sort.key === 'name') {
        return (a.name ?? a.external_id).localeCompare(b.name ?? b.external_id) * dir;
      }
      const col = ALL_CAMPAIGN_COLS.find((c) => c.key === sort.key);
      if (col?.kind === 'budget') {
        return ((a.daily_budget ?? 0) - (b.daily_budget ?? 0)) * dir;
      }
      if (col?.kind === 'metric') {
        const av = metricSortValue(col, byCampaign.get(a.id) ?? EMPTY_AGG);
        const bv = metricSortValue(col, byCampaign.get(b.id) ?? EMPTY_AGG);
        return (av - bv) * dir;
      }
      return 0;
    };
    const m = new Map<string, AdsCampaignRow[]>();
    for (const c of campaigns) {
      if (!passesStatus(c)) continue;
      const arr = m.get(c.account_id) ?? [];
      arr.push(c);
      m.set(c.account_id, arr);
    }
    for (const arr of m.values()) arr.sort(compare);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, statusFilter, sort, byCampaign]);

  const filteredCampaignIds = useMemo(
    () => campaigns.filter(passesStatus).map((c) => c.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaigns, statusFilter],
  );

  const allSelected = filteredCampaignIds.length > 0 && filteredCampaignIds.every((id) => selected.has(id));
  const someSelected = filteredCampaignIds.some((id) => selected.has(id));

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(filteredCampaignIds));

  const onSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const toggleColumn = (key: string) =>
    setVisibleKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  const handleRefresh = () => {
    for (const key of [
      'platform-ads-accounts',
      'platform-ads-campaigns',
      'platform-ads-adsets',
      'platform-ads-ads',
      'platform-ads-metrics',
    ]) {
      qc.invalidateQueries({ queryKey: [key, effectiveProductId] });
    }
  };

  // Mutações estão gated (ADS_MUTATIONS_ENABLED=false) → toda ação é dry-run/stub.
  // TODO(mutations): ligar ao edge `ads-apply-recommendation` quando o gate abrir.
  const ACTION_LABEL: Record<AdsCrudAction, string> = {
    pause: 'Pausar',
    activate: 'Ativar',
    archive: 'Arquivar',
    duplicate: 'Duplicar',
    edit: 'Editar',
  };
  const handleCrudConfirm = () => {
    if (!crudTarget) return;
    const name = crudTarget.campaign.name ?? crudTarget.campaign.external_id;
    toast.info(`Ação "${ACTION_LABEL[crudTarget.action]}" registrada (dry-run) para "${name}".`, {
      description: 'Mutações reais estão desativadas nesta fase (ADS_MUTATIONS_ENABLED=false).',
    });
    setCrudTarget(null);
  };

  const handleBulk = (action: 'activate' | 'pause' | 'archive') => {
    const n = selected.size;
    toast.info(`${ACTION_LABEL[action]} em massa registrado (dry-run) para ${n} campanha(s).`, {
      description: 'Mutações reais estão desativadas nesta fase (ADS_MUTATIONS_ENABLED=false).',
    });
    setSelected(new Set());
  };

  const handleExport = () => {
    const headers = ['Conta', 'Campanha', ...visibleCols.map((c) => c.label)];
    const rows: string[][] = [];
    for (const acc of accounts) {
      const accName = acc.name ?? acc.external_account_id;
      const currency = acc.currency ?? 'BRL';
      for (const camp of campaignsByAccount.get(acc.id) ?? []) {
        const agg = byCampaign.get(camp.id) ?? EMPTY_AGG;
        const cells = visibleCols.map((col) => {
          if (col.kind === 'status') return camp.effective_status ?? camp.status ?? '—';
          if (col.kind === 'budget') return camp.daily_budget != null ? fmtMoney(camp.daily_budget, currency) : '—';
          return fmtByCol(col.fmt, col.metricValue ? col.metricValue(agg) : null, currency);
        });
        rows.push([accName, camp.name ?? camp.external_id, ...cells]);
      }
    }
    if (rows.length === 0) {
      toast.error('Nada para exportar no filtro atual.');
      return;
    }
    downloadCsv(`campanhas-${new Date().toISOString().slice(0, 10)}.csv`, campaignsCsvString(headers, rows));
    toast.success(`${rows.length} campanha(s) exportada(s).`);
  };

  const isEmpty = !isLoading && accounts.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Campanhas (conta → campanha → conjunto → anúncio)</h2>
          <p className="text-sm text-muted-foreground">
            Hierarquia e métricas do Gerenciador de Anúncios da Meta, no intervalo escolhido.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="paused">Pausadas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rangeValue} onValueChange={setRangeValue}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ColumnCustomizer
            visibleKeys={visibleKeys}
            onToggle={toggleColumn}
            onReset={() => setVisibleKeys(DEFAULT_VISIBLE_KEYS)}
          />
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExport}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {!isLoading && !isEmpty && filteredCampaignIds.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={toggleSelectAll}
            aria-label="Selecionar todas as campanhas"
          />
          <span>
            {selected.size > 0
              ? `${selected.size} de ${filteredCampaignIds.length} selecionada(s)`
              : `${filteredCampaignIds.length} campanha(s) no filtro`}
          </span>
        </div>
      )}

      {hasError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">
            {(accountsQ.error as Error)?.message ??
              (metricsQ.error as Error)?.message ??
              'Falha ao ler campanhas/métricas.'}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {isEmpty && !hasError && (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Megaphone className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-3 font-medium">Aguardando liberação de dados da Meta</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Nenhuma conta de anúncios sincronizada para este produto. Conecte a conta Meta e
              sincronize abaixo. Contas, campanhas e métricas passam a aparecer aqui após a
              liberação de dados (App Review da Meta).
            </p>
          </div>
          <PlatformAdsConnectCard />
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div className="space-y-4">
          {accounts.map((acc) => (
            <AccountBlock
              key={acc.id}
              account={acc}
              campaigns={campaignsByAccount.get(acc.id) ?? []}
              adsets={adsets}
              ads={ads}
              byCampaign={byCampaign}
              byAdset={byAdset}
              byAd={byAd}
              byAccount={byAccount}
              visibleCols={visibleCols}
              sort={sort}
              onSort={onSort}
              selected={selected}
              onToggleSelect={toggleSelect}
              onRequestAction={setCrudTarget}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            Métricas agregadas de {preset.label.toLowerCase()} ({metrics.length} linha(s) de insight
            diário). Taxas derivadas recalculadas sobre os totais. Ações de mutação estão em modo
            simulação (dry-run) nesta fase.
          </p>
        </div>
      )}

      <BulkActionBar count={selected.size} onAction={handleBulk} onClear={() => setSelected(new Set())} />

      {crudTarget && (
        <AdsCrudConfirmDialog
          open={!!crudTarget}
          onOpenChange={(o) => !o && setCrudTarget(null)}
          action={crudTarget.action}
          entityType="campanha"
          entityName={crudTarget.campaign.name ?? crudTarget.campaign.external_id}
          budget={
            crudTarget.campaign.daily_budget != null
              ? fmtMoney(crudTarget.campaign.daily_budget, crudTarget.currency)
              : undefined
          }
          spend={fmtMoney(crudTarget.agg.spend, crudTarget.currency)}
          onConfirm={handleCrudConfirm}
        />
      )}
    </div>
  );
}
