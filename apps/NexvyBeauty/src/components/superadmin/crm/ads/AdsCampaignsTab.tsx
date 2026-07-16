import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Megaphone,
  RefreshCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
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
import {
  fmtInt,
  fmtCompact,
  fmtMoney,
  fmtPct,
  fmtRoas,
  isoDaysAgo,
  DATE_RANGE_PRESETS,
} from './adsFormat';

/**
 * Aba CAMPANHAS (camada A1) — read-only. Árvore conta→campanha→adset→ad com as
 * métricas de ads_metrics agregadas no intervalo escolhido (spend, impressions,
 * clicks, ctr, cpc, cpm, conversions, cpa, roas). Empty state pré-App-Review
 * reaproveita o PlatformAdsConnectCard (conectar + sincronizar).
 */

/** Agrupa linhas de métrica por uma FK (campaign_id/adset_id/ad_id/account). */
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

const COLS = ['Gasto', 'Impr.', 'Cliques', 'CTR', 'CPC', 'CPM', 'Conv.', 'CPA', 'ROAS'];

function MetricCells({ agg, currency }: { agg: AdsMetricAgg; currency: string }) {
  return (
    <>
      <td className="p-2 text-right tabular-nums">{fmtMoney(agg.spend, currency)}</td>
      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtCompact(agg.impressions)}</td>
      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtCompact(agg.clicks)}</td>
      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtPct(agg.ctr)}</td>
      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoney(agg.cpc, currency)}</td>
      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoney(agg.cpm, currency)}</td>
      <td className="p-2 text-right tabular-nums">{fmtInt(agg.conversions)}</td>
      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoney(agg.cpa, currency)}</td>
      <td className="p-2 text-right tabular-nums font-medium">{fmtRoas(agg.roas)}</td>
    </>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const up = status.toUpperCase();
  const active = up === 'ACTIVE';
  return (
    <Badge
      variant="outline"
      className={cn(
        'ml-2 text-[10px] capitalize',
        active
          ? 'border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-300'
          : 'text-muted-foreground',
      )}
    >
      {status.toLowerCase()}
    </Badge>
  );
}

interface AccountBlockProps {
  account: AdsAccountRow;
  campaigns: AdsCampaignRow[];
  adsets: AdsAdsetRow[];
  ads: AdsAdRow[];
  byAccount: Map<string, AdsMetricAgg>;
  byCampaign: Map<string, AdsMetricAgg>;
  byAdset: Map<string, AdsMetricAgg>;
  byAd: Map<string, AdsMetricAgg>;
}

function AccountBlock({
  account,
  campaigns,
  adsets,
  ads,
  byAccount,
  byCampaign,
  byAdset,
  byAd,
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
  const accCampaigns = campaigns.filter((c) => c.account_id === account.id);

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
          <div>gasto no período · ROAS {fmtRoas(accAgg.roas)}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-2 text-left font-medium">Campanha / conjunto / anúncio</th>
              {COLS.map((c) => (
                <th key={c} className="p-2 text-right font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accCampaigns.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 1} className="p-6 text-center text-muted-foreground">
                  Nenhuma campanha sincronizada nesta conta ainda.
                </td>
              </tr>
            )}
            {accCampaigns.map((camp) => {
              const cAgg = byCampaign.get(camp.id) ?? EMPTY_AGG;
              const cAdsets = adsetsByCampaign.get(camp.id) ?? [];
              const cOpen = expanded.has(camp.id);
              return (
                <ExpandableGroup key={camp.id}>
                  <tr className="border-t border-border hover:bg-muted/30">
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
                        <StatusPill status={camp.effective_status ?? camp.status} />
                      </button>
                    </td>
                    <MetricCells agg={cAgg} currency={currency} />
                  </tr>

                  {cOpen &&
                    cAdsets.map((adset) => {
                      const aAgg = byAdset.get(adset.id) ?? EMPTY_AGG;
                      const aAds = adsByAdset.get(adset.id) ?? [];
                      const aOpen = expanded.has(adset.id);
                      return (
                        <ExpandableGroup key={adset.id}>
                          <tr className="border-t border-border/60 bg-muted/10 hover:bg-muted/30">
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
                                <StatusPill status={adset.effective_status ?? adset.status} />
                              </button>
                            </td>
                            <MetricCells agg={aAgg} currency={currency} />
                          </tr>

                          {aOpen &&
                            aAds.map((ad) => (
                              <tr key={ad.id} className="border-t border-border/40 bg-muted/20 hover:bg-muted/30">
                                <td className="p-2 pl-12">
                                  <span className="inline-block w-4" />
                                  <span className="text-muted-foreground">{ad.name ?? ad.external_id}</span>
                                  <StatusPill status={ad.effective_status ?? ad.status} />
                                </td>
                                <MetricCells agg={byAd.get(ad.id) ?? EMPTY_AGG} currency={currency} />
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

export function AdsCampaignsTab() {
  const { effectiveProductId } = useActivePlatformProduct();
  const qc = useQueryClient();
  const [rangeValue, setRangeValue] = useState('30');

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
        <div className="flex items-center gap-2">
          <Select value={rangeValue} onValueChange={setRangeValue}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

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
              campaigns={campaigns}
              adsets={adsets}
              ads={ads}
              byAccount={byAccount}
              byCampaign={byCampaign}
              byAdset={byAdset}
              byAd={byAd}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            Métricas agregadas de {preset.label.toLowerCase()} ({metrics.length} linha(s) de insight
            diário). Valores por nível (conta/campanha/conjunto/anúncio); taxas derivadas
            recalculadas sobre os totais.
          </p>
        </div>
      )}
    </div>
  );
}
