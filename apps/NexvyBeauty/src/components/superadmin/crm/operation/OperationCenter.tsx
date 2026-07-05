import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { RefreshCw } from 'lucide-react';
import {
  useHealthKpis,
  useOperationPriorities,
  useTeamPerformance,
  useRealtimeOps,
  useLeadsAtRisk,
  useAIRadarInsights,
} from '@/components/superadmin/crm/data/usePlatformCrmOperationCenter';
import { HealthKpiRow } from './HealthKpiRow';
import { PrioritiesCard } from './PrioritiesCard';
import { TeamPerformanceTable } from './TeamPerformanceTable';
import { RealtimeOpsCard } from './RealtimeOpsCard';
import { LeadsAtRiskTable } from './LeadsAtRiskTable';
import { AIRadarCard } from './AIRadarCard';
import { PlatformCrmLeadDetail } from '@/components/superadmin/crm/leads/PlatformCrmLeadDetail';

/**
 * CRM de PLATAFORMA (super_admin) — Central de Operação / Dashboard.
 * Port 1:1 do `OperationCenter` do CRM Vendus. Lê SÓ tabelas `platform_crm_*`
 * (via `usePlatformCrmOperationCenter`), tema claro, totalmente desacoplado do
 * CRM do tenant. Este mesmo componente atende os DOIS itens de menu do original
 * (Dashboard e Central de Operação).
 *
 * FORMA — família F3 (Dashboard/tempo real do TEMPLATE-UI-GESTAO): header de
 * página com timestamp vivo + dot pulsante, hierarquia de KPIs, grid responsivo,
 * skeletons e empties anatômicos. NÃO altera contratos de dados nem lógica: só
 * consome `isLoading`/`isError`/`isFetching` dos hooks compartilhados (leitura).
 */
export function PlatformCrmOperationCenter() {
  const [, setSearchParams] = useSearchParams();
  const kpisQuery = useHealthKpis();
  const prioritiesQuery = useOperationPriorities();
  const teamQuery = useTeamPerformance();
  const realtimeQuery = useRealtimeOps();
  const atRiskQuery = useLeadsAtRisk();
  const insightsQuery = useAIRadarInsights();

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const handleNavigate = (section: string) => {
    setSearchParams({ tab: section }, { replace: true });
  };

  // Refresh manual de TODA a operação (o dot/timestamp descrevem o frescor
  // global da tela). Refaz as 6 queries; o ícone gira via `anyFetching`.
  const handleRefreshAll = () => {
    kpisQuery.refetch();
    prioritiesQuery.refetch();
    teamQuery.refetch();
    realtimeQuery.refetch();
    atRiskQuery.refetch();
    insightsQuery.refetch();
  };

  // Timestamp "vivo" da operação: momento da última carga bem-sucedida de KPIs
  // (F3 tempo real). Não é dado de negócio; só rótulo de frescor da tela.
  const updatedLabel = useMemo(() => {
    const ts = kpisQuery.dataUpdatedAt;
    if (!ts) return null;
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [kpisQuery.dataUpdatedAt]);

  const anyFetching =
    kpisQuery.isFetching ||
    prioritiesQuery.isFetching ||
    teamQuery.isFetching ||
    realtimeQuery.isFetching ||
    atRiskQuery.isFetching ||
    insightsQuery.isFetching;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header de página F3: título text-lg + subtítulo + frescor em tempo real */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Central de Operação</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão em tempo real da operação comercial da sua equipe.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Dot pulsante de tempo real (§3.4) + timestamp de atualização */}
          <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500/60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {updatedLabel ? `atualizado às ${updatedLabel}` : 'ao vivo'}
          </span>
          {/* Ação real de atualizar (§3.7: aria-label + Tooltip). Antes era um
              ícone decorativo que parecia acionável — agora refaz o fetch. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleRefreshAll}
                disabled={anyFetching}
                aria-label="Atualizar operação"
                className="h-7 w-7 text-muted-foreground"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${anyFetching ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{anyFetching ? 'Atualizando…' : 'Atualizar operação'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Linha 1 — KPIs de saúde */}
      <HealthKpiRow
        kpis={kpisQuery.data}
        isLoading={kpisQuery.isLoading}
        isError={kpisQuery.isError}
        onRetry={() => kpisQuery.refetch()}
        onNavigate={handleNavigate}
      />

      {/* Linhas 2 + 3 + 6 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-3">
          <PrioritiesCard
            data={prioritiesQuery.data}
            isLoading={prioritiesQuery.isLoading}
            isError={prioritiesQuery.isError}
            onRetry={() => prioritiesQuery.refetch()}
            onNavigate={handleNavigate}
          />
        </div>
        <div className="lg:col-span-6">
          <TeamPerformanceTable
            rows={teamQuery.data}
            isLoading={teamQuery.isLoading}
            isError={teamQuery.isError}
            onRetry={() => teamQuery.refetch()}
            onNavigate={handleNavigate}
          />
        </div>
        <div className="lg:col-span-3">
          <AIRadarCard
            items={insightsQuery.data}
            isLoading={insightsQuery.isLoading}
            isError={insightsQuery.isError}
            onRetry={() => insightsQuery.refetch()}
            onNavigate={handleNavigate}
          />
        </div>
      </div>

      {/* Linha 4 — Operação em tempo real */}
      <RealtimeOpsCard
        data={realtimeQuery.data}
        isLoading={realtimeQuery.isLoading}
        isError={realtimeQuery.isError}
        onRetry={() => realtimeQuery.refetch()}
      />

      {/* Linha 5 — Leads em risco */}
      <LeadsAtRiskTable
        rows={atRiskQuery.data}
        isLoading={atRiskQuery.isLoading}
        isError={atRiskQuery.isError}
        onRetry={() => atRiskQuery.refetch()}
        onResolve={setSelectedLeadId}
      />

      <Dialog open={!!selectedLeadId} onOpenChange={() => setSelectedLeadId(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0">
          <VisuallyHidden>
            <DialogTitle>Detalhes do Lead</DialogTitle>
          </VisuallyHidden>
          {selectedLeadId && (
            <PlatformCrmLeadDetail
              leadId={selectedLeadId}
              onBack={() => setSelectedLeadId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PlatformCrmOperationCenter;
