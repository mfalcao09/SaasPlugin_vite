import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  MousePointerClick,
  RefreshCw,
  Send,
  UserCheck,
  Users,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  useAdsAttribution,
  useAdsCapiEvents,
  CAPI_EVENT_ORDER,
  CAPI_STATUS_ORDER,
  type AdsCapiEventName,
  type AdsCapiStatus,
} from '@/components/superadmin/crm/data/usePlatformAdsAttribution';
import { fmtInt, fmtDateTime, fmtMoney } from './adsFormat';

/**
 * Aba ATRIBUIÇÃO (camada B) — read-only. Fecha o loop CTWA→lead→conversão:
 * funil visual (cliques CTWA → leads → qualificados → conversões CAPI enviadas)
 * + quebra dos eventos da Conversions API por tipo e status (dry_run vs sent) +
 * tabela dos cliques CTWA recentes (gancho/headline do anúncio, canal, occurred_at).
 */

const STATUS_META: Record<
  AdsCapiStatus,
  { label: string; cls: string }
> = {
  sent: { label: 'Enviado', cls: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30' },
  dry_run: { label: 'Simulação', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  pending: { label: 'Pendente', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30' },
  skipped: { label: 'Ignorado', cls: 'bg-muted text-muted-foreground border-border' },
  failed: { label: 'Falhou', cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
};

const EVENT_LABEL: Record<AdsCapiEventName, string> = {
  LeadSubmitted: 'Lead enviado',
  QualifiedLead: 'Lead qualificado',
  ViewContent: 'Visualização',
  InitiateCheckout: 'Checkout iniciado',
  Purchase: 'Compra',
};

function CapiStatusBadge({ status }: { status: AdsCapiStatus }) {
  const m = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn('gap-1 text-[11px]', m.cls)}>
      {m.label}
    </Badge>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={cn('h-4 w-4', tone)} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

/** Uma barra do funil (largura proporcional ao topo). */
function FunnelBar({
  label,
  count,
  top,
  prev,
  tone,
}: {
  label: string;
  count: number;
  top: number;
  prev: number | null;
  tone: string;
}) {
  const widthPct = top > 0 ? Math.max(4, Math.round((count / top) * 100)) : 4;
  const convPct = prev != null && prev > 0 ? Math.round((count / prev) * 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {fmtInt(count)}
          {convPct != null && (
            <span className="ml-2 text-xs">({convPct}% do passo anterior)</span>
          )}
        </span>
      </div>
      <div className="h-7 w-full overflow-hidden rounded-md bg-muted">
        <div
          className={cn('flex h-full items-center rounded-md px-2 text-xs font-semibold text-white transition-all', tone)}
          style={{ width: `${widthPct}%` }}
        >
          {count > 0 && <span className="tabular-nums">{fmtInt(count)}</span>}
        </div>
      </div>
    </div>
  );
}

export function AdsAttributionTab() {
  const { effectiveProductId } = useActivePlatformProduct();
  const qc = useQueryClient();

  const attribution = useAdsAttribution(effectiveProductId);
  const capi = useAdsCapiEvents(effectiveProductId);

  const rows = attribution.data ?? [];
  const events = capi.data ?? [];
  const isLoading = attribution.isLoading || capi.isLoading;

  const funnel = useMemo(() => {
    const cliques = rows.length;
    const leads = rows.filter((r) => r.lead_id != null).length;
    const qualificados = events.filter((e) => e.event_name === 'QualifiedLead').length;
    const enviadas = events.filter((e) => e.status === 'sent').length;
    return { cliques, leads, qualificados, enviadas };
  }, [rows, events]);

  const statusCounts = useMemo(() => {
    const c = {} as Record<AdsCapiStatus, number>;
    for (const s of CAPI_STATUS_ORDER) c[s] = 0;
    for (const e of events) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [events]);

  const eventBreakdown = useMemo(() => {
    return CAPI_EVENT_ORDER.map((name) => {
      const ofName = events.filter((e) => e.event_name === name);
      const byStatus = {} as Record<AdsCapiStatus, number>;
      for (const s of CAPI_STATUS_ORDER) byStatus[s] = 0;
      for (const e of ofName) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
      return { name, total: ofName.length, byStatus };
    });
  }, [events]);

  const purchaseValue = useMemo(
    () =>
      events
        .filter((e) => e.event_name === 'Purchase' && e.value != null)
        .reduce((acc, e) => acc + Number(e.value ?? 0), 0),
    [events],
  );
  const purchaseCurrency =
    events.find((e) => e.event_name === 'Purchase' && e.currency)?.currency ?? 'BRL';

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['platform-ads-attribution', effectiveProductId] });
    qc.invalidateQueries({ queryKey: ['platform-ads-capi-events', effectiveProductId] });
  };

  const hasError = attribution.isError || capi.isError;
  const isEmpty = !isLoading && rows.length === 0 && events.length === 0;

  const top = Math.max(funnel.cliques, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Atribuição inbound (CTWA → conversão)</h2>
          <p className="text-sm text-muted-foreground">
            Cliques de anúncio Click-to-WhatsApp/Instagram ligados ao lead e as conversões
            devolvidas ao Meta pela Conversions API (com dedup).
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {hasError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">
            {(attribution.error as Error)?.message ??
              (capi.error as Error)?.message ??
              'Falha ao ler dados de atribuição.'}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {isEmpty && !hasError && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <MousePointerClick className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-3 font-medium">Aguardando o primeiro clique CTWA</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Nenhuma atribuição registrada para este produto ainda. Assim que um anúncio
            Click-to-WhatsApp trouxer a primeira conversa (ou o número inbound for
            conectado), os cliques, leads e conversões da Conversions API aparecem aqui.
          </p>
        </div>
      )}

      {!isLoading && !isEmpty && (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={MousePointerClick}
              label="Cliques CTWA"
              value={fmtInt(funnel.cliques)}
              hint="cliques de anúncio → conversa"
              tone="text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              icon={Users}
              label="Leads atribuídos"
              value={fmtInt(funnel.leads)}
              hint="cliques ligados a um lead"
              tone="text-primary"
            />
            <KpiCard
              icon={UserCheck}
              label="Qualificados (CAPI)"
              value={fmtInt(funnel.qualificados)}
              hint="eventos QualifiedLead"
              tone="text-purple-600 dark:text-purple-400"
            />
            <KpiCard
              icon={Send}
              label="Conversões enviadas"
              value={fmtInt(funnel.enviadas)}
              hint={`${fmtInt(statusCounts.dry_run)} em simulação`}
              tone="text-green-600 dark:text-green-400"
            />
          </div>

          {/* Funil */}
          <Card className="p-4">
            <h3 className="mb-4 text-sm font-semibold">Funil de atribuição</h3>
            <div className="space-y-4">
              <FunnelBar label="Cliques CTWA" count={funnel.cliques} top={top} prev={null} tone="bg-blue-500" />
              <FunnelBar label="Leads atribuídos" count={funnel.leads} top={top} prev={funnel.cliques} tone="bg-primary" />
              <FunnelBar label="Qualificados" count={funnel.qualificados} top={top} prev={funnel.leads} tone="bg-purple-500" />
              <FunnelBar label="Conversões CAPI enviadas" count={funnel.enviadas} top={top} prev={funnel.qualificados} tone="bg-green-500" />
            </div>
            {purchaseValue > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Valor total de compras enviado ao Meta:{' '}
                <span className="font-medium text-foreground">
                  {fmtMoney(purchaseValue, purchaseCurrency)}
                </span>
              </p>
            )}
          </Card>

          {/* Eventos CAPI por tipo + status */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">Conversions API — eventos por tipo</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {CAPI_STATUS_ORDER.filter((s) => statusCounts[s] > 0).map((s) => (
                  <span key={s} className="flex items-center gap-1">
                    <CapiStatusBadge status={s} />
                    <span className="text-xs tabular-nums text-muted-foreground">{statusCounts[s]}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Evento</th>
                    <th className="p-2 text-right font-medium">Total</th>
                    {CAPI_STATUS_ORDER.map((s) => (
                      <th key={s} className="p-2 text-right font-medium">{STATUS_META[s].label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eventBreakdown.map((row) => (
                    <tr key={row.name} className="border-t border-border">
                      <td className="p-2">
                        <span className="font-medium">{EVENT_LABEL[row.name]}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{row.name}</span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmtInt(row.total)}</td>
                      {CAPI_STATUS_ORDER.map((s) => (
                        <td key={s} className="p-2 text-right tabular-nums text-muted-foreground">
                          {row.byStatus[s] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Cliques CTWA recentes */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Cliques CTWA recentes</h3>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ainda sem cliques CTWA (só eventos CAPI). Aguardando a primeira conversa de anúncio.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left font-medium">Quando</th>
                      <th className="p-2 text-left font-medium">Canal</th>
                      <th className="p-2 text-left font-medium">Gancho do anúncio (headline)</th>
                      <th className="p-2 text-left font-medium">Origem</th>
                      <th className="p-2 text-center font-medium">Lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {fmtDateTime(r.occurred_at)}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[11px] capitalize">
                            {r.ctwa_channel}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {r.headline ? (
                            <span className="line-clamp-2 max-w-[360px]">{r.headline}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {r.source_type ?? '—'}
                          {r.source_id ? (
                            <span className="ml-1 font-mono text-xs">#{r.source_id.slice(0, 12)}</span>
                          ) : null}
                        </td>
                        <td className="p-2 text-center">
                          {r.lead_id ? (
                            <Badge variant="outline" className="border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-300 text-[11px]">
                              ✓
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
