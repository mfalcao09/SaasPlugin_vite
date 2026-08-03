import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  Eye,
  Gauge,
  MousePointerClick,
  Percent,
  RefreshCw,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { PlatformAdsConnectCard } from '@/components/superadmin/crm/integrations/PlatformAdsConnectCard';
import {
  useAdsAccounts,
  useAdsCampaigns,
  useAdsMetrics,
  aggregateMetrics,
  EMPTY_AGG,
  type AdsMetricAgg,
  type AdsMetricRow,
  type AdsCampaignRow,
} from '@/components/superadmin/crm/data/usePlatformAdsCampaigns';
import {
  fmtCompact,
  fmtMoney,
  fmtPct,
  fmtRoas,
  fmtInt,
  budgetToMajor,
  isoDaysAgo,
  DATE_RANGE_PRESETS,
} from './adsFormat';
import { AdsKpiCard } from './AdsKpiCard';

/**
 * Aba VISÃO GERAL (Dashboard) do NexvyAds — camada A1-UI, read-only.
 *
 * Faixa de KPIs com delta vs período anterior · série temporal Gasto × Conversões ·
 * ritmo de orçamento (gasto de hoje vs soma dos daily_budget ativos) · top campanhas.
 * Tudo derivado de `ads_metrics` (lido pelos hooks server-side; ZERO Graph no
 * browser — §11.1). Fica em empty-state elegante enquanto não há dados (App Review).
 */

const todayISO = () => new Date().toISOString().slice(0, 10);

const ACTIVE_STATUSES = new Set(['ACTIVE']);
function isCampaignActive(c: AdsCampaignRow): boolean {
  const s = (c.effective_status ?? c.status ?? '').toUpperCase();
  return ACTIVE_STATUSES.has(s);
}

/**
 * Escolhe UM nível de `ads_metrics` para os totais do dashboard, evitando
 * dupla contagem (somar todos os níveis multiplicaria gasto/impressões).
 * Preferência: account > campaign > adset > ad — o mais alto disponível.
 */
function pickTotalsRows(rows: AdsMetricRow[]): {
  rows: AdsMetricRow[];
  level: AdsMetricRow['level'] | null;
} {
  for (const level of ['account', 'campaign', 'adset', 'ad'] as const) {
    const subset = rows.filter((r) => r.level === level);
    if (subset.length > 0) return { rows: subset, level };
  }
  return { rows: [], level: null };
}

/** Variação percentual cur vs prev; null quando não há base (prev == 0). */
function deltaPct(cur: number, prev: number): number | null {
  if (!prev || !Number.isFinite(prev)) return null;
  return ((cur - prev) / prev) * 100;
}

interface KpiSpec {
  key: string;
  title: string;
  icon: typeof DollarSign;
  value: (a: AdsMetricAgg) => string;
  metric: (a: AdsMetricAgg) => number;
  higherIsBetter: boolean;
  featured?: boolean;
}

function buildKpiSpecs(currency: string): KpiSpec[] {
  return [
    { key: 'spend', title: 'Gasto', icon: DollarSign, value: (a) => fmtMoney(a.spend, currency), metric: (a) => a.spend, higherIsBetter: false, featured: true },
    { key: 'impressions', title: 'Impressões', icon: Eye, value: (a) => fmtCompact(a.impressions), metric: (a) => a.impressions, higherIsBetter: true },
    { key: 'clicks', title: 'Cliques', icon: MousePointerClick, value: (a) => fmtCompact(a.clicks), metric: (a) => a.clicks, higherIsBetter: true },
    { key: 'ctr', title: 'CTR', icon: Percent, value: (a) => fmtPct(a.ctr), metric: (a) => a.ctr, higherIsBetter: true },
    { key: 'cpc', title: 'CPC', icon: DollarSign, value: (a) => fmtMoney(a.cpc, currency), metric: (a) => a.cpc, higherIsBetter: false },
    { key: 'cpm', title: 'CPM', icon: DollarSign, value: (a) => fmtMoney(a.cpm, currency), metric: (a) => a.cpm, higherIsBetter: false },
    { key: 'conversions', title: 'Conversões', icon: Target, value: (a) => fmtInt(a.conversions), metric: (a) => a.conversions, higherIsBetter: true },
    { key: 'cpa', title: 'CPA', icon: DollarSign, value: (a) => fmtMoney(a.cpa, currency), metric: (a) => a.cpa, higherIsBetter: false },
    { key: 'roas', title: 'ROAS', icon: TrendingUp, value: (a) => fmtRoas(a.roas), metric: (a) => a.roas, higherIsBetter: true, featured: true },
  ];
}

const chartConfig = {
  spend: { label: 'Gasto', color: 'hsl(var(--chart-1))' },
  conversions: { label: 'Conversões', color: 'hsl(var(--chart-5))' },
} satisfies ChartConfig;

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
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

export function AdsDashboardTab() {
  const { effectiveProductId } = useActivePlatformProduct();
  const qc = useQueryClient();
  const [rangeValue, setRangeValue] = useState('30');

  const preset = DATE_RANGE_PRESETS.find((p) => p.value === rangeValue) ?? DATE_RANGE_PRESETS[2];
  const days = preset.days;
  const sinceCurrent = isoDaysAgo(days);
  // Busca 2× o intervalo p/ derivar o período anterior no cliente (sem hook novo).
  const sinceWindow = isoDaysAgo(days * 2);

  const accountsQ = useAdsAccounts(effectiveProductId);
  const campaignsQ = useAdsCampaigns(effectiveProductId);
  const metricsQ = useAdsMetrics(effectiveProductId, sinceWindow);

  const accounts = accountsQ.data ?? [];
  const campaigns = campaignsQ.data ?? [];
  const metrics = metricsQ.data ?? [];

  const isLoading = accountsQ.isLoading || campaignsQ.isLoading || metricsQ.isLoading;
  const hasError = accountsQ.isError || campaignsQ.isError || metricsQ.isError;

  const currency = accounts[0]?.currency ?? 'BRL';
  const kpiSpecs = useMemo(() => buildKpiSpecs(currency), [currency]);

  // Partição current vs previous e agregados (nível único p/ evitar dupla contagem).
  const { curAgg, prevAgg, curLevelRows, series, todaySpend } = useMemo(() => {
    const current = metrics.filter((r) => r.date_start >= sinceCurrent);
    const previous = metrics.filter((r) => r.date_start < sinceCurrent);
    const curPick = pickTotalsRows(current);
    const prevPick = pickTotalsRows(previous);

    // série diária Gasto × Conversões (nível único do período atual)
    const byDate = new Map<string, { spend: number; conversions: number }>();
    for (const r of curPick.rows) {
      const b = byDate.get(r.date_start) ?? { spend: 0, conversions: 0 };
      b.spend += Number(r.spend ?? 0);
      b.conversions += Number(r.conversions ?? 0);
      byDate.set(r.date_start, b);
    }
    const seriesArr = [...byDate.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const today = todayISO();
    const todaySpendVal = curPick.rows
      .filter((r) => r.date_start === today)
      .reduce((acc, r) => acc + Number(r.spend ?? 0), 0);

    return {
      curAgg: aggregateMetrics(curPick.rows),
      prevAgg: aggregateMetrics(prevPick.rows),
      curLevelRows: curPick.rows,
      series: seriesArr,
      todaySpend: todaySpendVal,
    };
  }, [metrics, sinceCurrent]);

  // Ritmo de orçamento: gasto de hoje vs soma dos daily_budget das campanhas ativas.
  // O `ads-sync` grava daily_budget CRU da Graph = MINOR UNITS (centavos p/ BRL);
  // convertemos p/ unidade da moeda antes de comparar com o gasto (que já é maior).
  const totalDailyBudget = useMemo(
    () =>
      campaigns
        .filter(isCampaignActive)
        .reduce((acc, c) => acc + (budgetToMajor(c.daily_budget, currency) ?? 0), 0),
    [campaigns, currency],
  );
  const pacePct = totalDailyBudget > 0 ? Math.min((todaySpend / totalDailyBudget) * 100, 100) : 0;

  // Top campanhas do período atual por ROAS (fallback gasto), com agg por campanha.
  const topCampaigns = useMemo(() => {
    const byCampaign = new Map<string, AdsMetricRow[]>();
    for (const r of curLevelRows) {
      if (!r.campaign_id) continue;
      const arr = byCampaign.get(r.campaign_id) ?? [];
      arr.push(r);
      byCampaign.set(r.campaign_id, arr);
    }
    return campaigns
      .map((c) => ({
        campaign: c,
        agg: byCampaign.has(c.id) ? aggregateMetrics(byCampaign.get(c.id)!) : EMPTY_AGG,
      }))
      .filter((x) => x.agg.spend > 0)
      .sort((a, b) => b.agg.roas - a.agg.roas || b.agg.spend - a.agg.spend)
      .slice(0, 5);
  }, [curLevelRows, campaigns]);

  const handleRefresh = () => {
    for (const key of ['platform-ads-accounts', 'platform-ads-campaigns', 'platform-ads-metrics']) {
      qc.invalidateQueries({ queryKey: [key, effectiveProductId] });
    }
  };

  const isEmpty = !isLoading && metrics.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Visão geral</h2>
          <p className="text-sm text-muted-foreground">
            Desempenho consolidado do produto no intervalo escolhido, com variação vs o período
            imediatamente anterior.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={rangeValue} onValueChange={setRangeValue}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
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
              'Falha ao ler as métricas.'}
          </span>
        </div>
      )}

      {/* KPIs (sempre visíveis; em loading mostram skeleton) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpiSpecs.map((spec) => (
          <AdsKpiCard
            key={spec.key}
            title={spec.title}
            icon={spec.icon}
            isLoading={isLoading}
            value={spec.value(curAgg)}
            delta={isEmpty ? null : deltaPct(spec.metric(curAgg), spec.metric(prevAgg))}
            higherIsBetter={spec.higherIsBetter}
            featured={spec.featured}
          />
        ))}
      </div>

      {isLoading && <Skeleton className="h-72 w-full" />}

      {isEmpty && !hasError && (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-3 font-medium">Aguardando liberação de dados da Meta</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Ainda não há métricas sincronizadas para este produto. Conecte a conta Meta e
              sincronize abaixo — gasto, conversões, ROAS e a série temporal passam a aparecer aqui
              após a liberação de dados (App Review da Meta).
            </p>
          </div>
          <PlatformAdsConnectCard />
        </div>
      )}

      {!isLoading && !isEmpty && (
        <>
          {/* Série temporal + ritmo de orçamento */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Gasto × Conversões por dia</h3>
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <TrendingUp className="h-3 w-3" /> {preset.label.toLowerCase()}
                </Badge>
              </div>
              {series.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Sem série diária no intervalo.
                </p>
              ) : (
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <LineChart data={series} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                      tickFormatter={(v: string) => v.slice(5)}
                      className="text-[10px]"
                    />
                    <YAxis
                      yAxisId="spend"
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tickFormatter={(v: number) => fmtCompact(v)}
                      className="text-[10px]"
                    />
                    <YAxis yAxisId="conv" orientation="right" hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      yAxisId="spend"
                      type="monotone"
                      dataKey="spend"
                      stroke="var(--color-spend)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="conv"
                      type="monotone"
                      dataKey="conversions"
                      stroke="var(--color-conversions)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </Card>

            <Card className="flex flex-col p-4">
              <div className="mb-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Ritmo de orçamento (hoje)</h3>
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="font-mono text-2xl font-semibold tabular-nums">
                      {fmtMoney(todaySpend, currency)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      de {fmtMoney(totalDailyBudget, currency)}
                    </span>
                  </div>
                  <Progress value={pacePct} className="h-2" />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {totalDailyBudget > 0
                      ? `${pacePct.toFixed(0)}% do orçamento diário das campanhas ativas consumido hoje.`
                      : 'Nenhuma campanha ativa com orçamento diário definido.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium tabular-nums">
                        {campaigns.filter(isCampaignActive).length}
                      </div>
                      <div className="text-[11px] text-muted-foreground">campanhas ativas</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium tabular-nums">{fmtMoney(curAgg.spend, currency)}</div>
                      <div className="text-[11px] text-muted-foreground">gasto no período</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Top campanhas */}
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-muted/30 p-3">
              <h3 className="text-sm font-semibold">Top campanhas por ROAS</h3>
            </div>
            {topCampaigns.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma campanha com gasto no intervalo.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left font-medium">Campanha</th>
                      <th className="p-2 text-right font-medium">Gasto</th>
                      <th className="p-2 text-right font-medium">Conv.</th>
                      <th className="p-2 text-right font-medium">CPA</th>
                      <th className="p-2 text-right font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCampaigns.map(({ campaign, agg }) => (
                      <tr key={campaign.id} className="border-t border-border hover:bg-muted/30">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {campaign.name ?? campaign.external_id}
                            </span>
                            <StatusPill status={campaign.effective_status ?? campaign.status} />
                          </div>
                        </td>
                        <td className="p-2 text-right tabular-nums">{fmtMoney(agg.spend, currency)}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtInt(agg.conversions)}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoney(agg.cpa, currency)}</td>
                        <td className="p-2 text-right font-medium tabular-nums">{fmtRoas(agg.roas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-xs text-muted-foreground">
            Totais derivados de {metrics.length} linha(s) de insight diário (nível único p/ evitar
            dupla contagem). Delta compara com o período anterior de mesmo tamanho.
          </p>
        </>
      )}
    </div>
  );
}

export default AdsDashboardTab;
