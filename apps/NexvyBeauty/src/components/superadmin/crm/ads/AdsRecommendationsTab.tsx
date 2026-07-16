import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  useAdsRecommendations,
  useAdsMutationsLog,
  useSetRecommendationStatus,
  useApplyRecommendation,
  isMutationDryRun,
  type AdsRecommendationRow,
  type AdsMutationStatus,
} from '@/components/superadmin/crm/data/usePlatformAdsRecommendations';
import { fmtDateTime } from './adsFormat';

/**
 * Aba RECOMENDAÇÕES (camada A2-UI). Fila de ads_recommendations `pending`:
 * Aprovar (→ edge ads-apply-recommendation, dry-run) / Rejeitar (update status).
 * Histórico de ads_mutations_log (action, alvo, status, simulação vs real).
 */

const MUT_STATUS_META: Record<AdsMutationStatus, { label: string; cls: string }> = {
  success: { label: 'Sucesso', cls: 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30' },
  pending: { label: 'Pendente', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30' },
  error: { label: 'Erro', cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
};

function confidenceLabel(c: number | null): string {
  if (c == null) return '—';
  const pct = c <= 1 ? c * 100 : c;
  return `${Math.round(pct)}%`;
}

function RecommendationCard({
  rec,
  productId,
}: {
  rec: AdsRecommendationRow;
  productId: string | null;
}) {
  const [showAction, setShowAction] = useState(false);
  const setStatus = useSetRecommendationStatus(productId);
  const apply = useApplyRecommendation(productId);

  const busy = setStatus.isPending || apply.isPending;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[11px]">
              {rec.kind}
            </Badge>
            {rec.priority > 0 && (
              <Badge variant="outline" className="text-[11px] text-muted-foreground">
                prioridade {rec.priority}
              </Badge>
            )}
            <Badge variant="outline" className="text-[11px] text-muted-foreground">
              confiança {confidenceLabel(rec.confidence)}
            </Badge>
          </div>
          <div className="font-medium">{rec.title ?? rec.kind}</div>
          {rec.rationale && (
            <p className="max-w-2xl text-sm text-muted-foreground">{rec.rationale}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={busy}
            onClick={() => setStatus.mutate({ id: rec.id, status: 'rejected' })}
          >
            {setStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Rejeitar
          </Button>
          <Button
            size="sm"
            className="gap-1"
            disabled={busy}
            onClick={() => apply.mutate(rec.id)}
          >
            {apply.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Aprovar e aplicar
          </Button>
        </div>
      </div>

      {rec.proposed_action && Object.keys(rec.proposed_action).length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowAction((v) => !v)}
          >
            {showAction ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Ação proposta (dry-run ao aplicar)
          </button>
          {showAction && (
            <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
              {JSON.stringify(rec.proposed_action, null, 2)}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}

export function AdsRecommendationsTab() {
  const { effectiveProductId } = useActivePlatformProduct();
  const qc = useQueryClient();

  const recsQ = useAdsRecommendations(effectiveProductId, 'pending');
  const logQ = useAdsMutationsLog(effectiveProductId);

  const recs = recsQ.data ?? [];
  const log = logQ.data ?? [];

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['platform-ads-recommendations', effectiveProductId] });
    qc.invalidateQueries({ queryKey: ['platform-ads-mutations-log', effectiveProductId] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Recomendações do agente</h2>
          <p className="text-sm text-muted-foreground">
            Fila HITL do agente ads-optimize. Aprovar aplica a mutação (nesta fase, em
            simulação/dry-run); rejeitar arquiva a sugestão.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {recsQ.isError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-all">
            {(recsQ.error as Error)?.message ?? 'Falha ao ler as recomendações.'}
          </span>
        </div>
      )}

      {/* Fila pendente */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Pendentes de revisão</h3>
        {recsQ.isLoading ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : recs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lightbulb className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-3 font-medium">Nenhuma recomendação pendente</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              O agente ads-optimize ainda não gerou sugestões para este produto (ou todas já
              foram tratadas). Novas recomendações aparecem aqui para aprovação.
            </p>
          </div>
        ) : (
          recs.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} productId={effectiveProductId} />
          ))
        )}
      </section>

      {/* Histórico de mutações */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Histórico de mutações</h3>
        <Card className="overflow-hidden">
          {logQ.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : log.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma mutação aplicada ainda. Ao aprovar uma recomendação, o registro (dry-run
              ou real) aparece aqui.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Quando</th>
                    <th className="p-2 text-left font-medium">Ação</th>
                    <th className="p-2 text-left font-medium">Alvo</th>
                    <th className="p-2 text-left font-medium">Modo</th>
                    <th className="p-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((m) => {
                    const dry = isMutationDryRun(m);
                    const st = MUT_STATUS_META[m.status];
                    return (
                      <tr key={m.id} className="border-t border-border hover:bg-muted/30">
                        <td className="p-2 whitespace-nowrap text-muted-foreground">{fmtDateTime(m.created_at)}</td>
                        <td className="p-2 font-medium">{m.action}</td>
                        <td className="p-2 text-muted-foreground">
                          <span className="capitalize">{m.target_level}</span>
                          <span className="ml-1 font-mono text-xs">#{m.target_external_id.slice(0, 14)}</span>
                        </td>
                        <td className="p-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[11px]',
                              dry
                                ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300',
                            )}
                          >
                            {dry ? 'Simulação' : 'Real'}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className={cn('text-[11px]', st.cls)}>
                            {st.label}
                          </Badge>
                          {m.status === 'error' && m.error && (
                            <span className="ml-2 text-xs text-destructive break-all">{m.error}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
