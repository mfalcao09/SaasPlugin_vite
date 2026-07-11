import { useMemo, useState } from 'react';
import { LayoutGrid, Package, Settings2, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { toast } from 'sonner';
import {
  PlatformCrmKanbanColumn,
  type PlatformCrmKanbanColumnData,
} from './PlatformCrmKanbanColumn';
import { PlatformCrmStageManagerDialog } from './PlatformCrmStageManagerDialog';
import { PlatformCrmKanbanFilters } from './PlatformCrmKanbanFilters';
import { PlatformCrmLeadDetail } from '../leads/PlatformCrmLeadDetail';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';
import {
  usePlatformCrmLeads,
  useMovePlatformCrmLeadToStage,
} from '../data/usePlatformCrmLeads';
import { usePlatformCrmKanbanFilters } from '../data/usePlatformCrmKanbanFilters';
import { usePlatformCrmSellersMap } from '../data/usePlatformCrmSellers';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';

const UNASSIGNED_ID = 'unassigned';

function formatCurrency(value: number) {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value);
}

export function PlatformCrmKanban() {
  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const { filters, updateFilter, clearFilters, hasActiveFilters } =
    usePlatformCrmKanbanFilters();

  // Produto GLOBAL do painel (A1.3) — ÚNICA fonte de verdade do filtro de produto,
  // mesma semântica do LeadsManager: null ("Todos os produtos") = sem filtro;
  // produto selecionado no switcher da sidebar = filtra etapas + leads.
  // O seletor LOCAL do V5 (selectedProductId + auto-lock no 1º produto) foi
  // removido: ele desobedecia o switcher global e o dono não tinha controle
  // sobre ele — o chip do header agora é só um ESPELHO read-only do global.
  const { activeProductId, activeProduct } = useActivePlatformProduct();
  const effectiveProductId = activeProductId;

  const {
    data: stages,
    isLoading: stagesLoading,
    isError: stagesError,
    refetch: refetchStages,
  } = usePlatformCrmStages(effectiveProductId);
  const {
    data: leads,
    isLoading: leadsLoading,
    isError: leadsError,
    refetch: refetchLeads,
  } = usePlatformCrmLeads({
    search: filters.search.trim() || undefined,
    sellerId: filters.sellerId || undefined,
    minValue: filters.minValue,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
    productId: effectiveProductId,
  });
  const moveLead = useMovePlatformCrmLeadToStage();

  // Vendedores = reps de venda da plataforma (squad_members / assigned_to), NÃO tenant.
  const { data: sellers = [], map: sellersMap } = usePlatformCrmSellersMap();

  const isLoading = stagesLoading || leadsLoading;
  // Erro dos LEADS = estado por coluna (as etapas já carregaram). Erro das ETAPAS
  // não tem board pra render — cai no empty de "nenhuma etapa" já existente.
  const leadsFailed = leadsError && !stagesError;
  const retryBoard = () => {
    void refetchStages();
    void refetchLeads();
  };

  const { columns, leadCountByStage, totalPipelineValue, totalLeads } = useMemo(() => {
    const stageList = [...(stages ?? [])].sort((a, b) => a.order_index - b.order_index);
    const leadList = leads ?? [];

    const byStage = new Map<string, typeof leadList>();
    for (const lead of leadList) {
      const key = lead.current_stage_id ?? UNASSIGNED_ID;
      const bucket = byStage.get(key);
      if (bucket) bucket.push(lead);
      else byStage.set(key, [lead]);
    }

    const counts: Record<string, number> = {};
    const cols: PlatformCrmKanbanColumnData[] = stageList.map((stage) => {
      const stageLeads = byStage.get(stage.id) ?? [];
      const totalValue = stageLeads.reduce((sum, l) => sum + (l.deal_value ?? 0), 0);
      counts[stage.id] = stageLeads.length;
      return {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        is_won: stage.is_won,
        is_lost: stage.is_lost,
        leads: stageLeads,
        leadCount: stageLeads.length,
        totalValue,
        stage,
      };
    });

    const unassignedLeads = byStage.get(UNASSIGNED_ID) ?? [];
    if (unassignedLeads.length > 0) {
      cols.push({
        id: UNASSIGNED_ID,
        name: 'Sem etapa',
        // null → a coluna aplica o token muted-foreground (sem hex hardcoded).
        color: null,
        is_won: false,
        is_lost: false,
        leads: unassignedLeads,
        leadCount: unassignedLeads.length,
        totalValue: unassignedLeads.reduce((sum, l) => sum + (l.deal_value ?? 0), 0),
        stage: null,
      });
    }

    const pipelineValue = leadList.reduce((sum, l) => sum + (l.deal_value ?? 0), 0);

    return {
      columns: cols,
      leadCountByStage: counts,
      totalPipelineValue: pipelineValue,
      totalLeads: leadList.length,
    };
  }, [stages, leads]);

  const handleDropOnStage = async (stageId: string) => {
    if (!draggedLeadId) return;
    const leadId = draggedLeadId;
    setDraggedLeadId(null);
    try {
      await moveLead.mutateAsync({ leadId, stageId });
      toast.success('Lead movido');
    } catch {
      // toast de erro já emitido pelo hook (com rollback otimista)
    }
  };

  const stageCount = (stages ?? []).length;

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] gap-4 -mb-6 min-h-0">
      {/* Header — título text-lg + subtítulo text-sm (escala da rubric §1.4) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Pipeline de Vendas
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestão visual de oportunidades da plataforma
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/*
            Chip de produto EM FOCO — ESPELHO read-only do switcher global da
            sidebar (useActivePlatformProduct). Mesma pílula visual do antigo
            auto-lock do PlatformCrmProductSelector; a troca de produto acontece
            SOMENTE no switcher global (uma fonte de verdade).
          */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-xs text-primary"
            title="Produto em foco — controlado pelo seletor de produto da sidebar"
          >
            <Package className="h-3.5 w-3.5" />
            <span className="font-medium truncate max-w-[160px]">
              {activeProduct?.name ?? 'Todos os produtos'}
            </span>
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setStageManagerOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Gerenciar Etapas
          </Button>
        </div>
      </div>

      {/* KPI cards (§L2 REF) — pílula-ícone (destaque brand-gradient+glow), label
         uppercase 12px, valor 30px tabular. Chip delta só quando houver dado real. */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          {
            label: 'Valor Total',
            value: formatCurrency(totalPipelineValue),
            icon: TrendingUp,
            accent: true,
          },
          { label: 'Total de Leads', value: String(totalLeads), icon: Users },
          { label: 'Etapas', value: String(stageCount), icon: LayoutGrid },
          {
            label: 'Ticket Médio',
            value: totalLeads > 0 ? formatCurrency(totalPipelineValue / totalLeads) : 'R$ 0',
            icon: TrendingUp,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="surface-card surface-card-hover p-5 flex items-start gap-3.5"
          >
            {/* pílula ícone: destaque = brand-gradient + brand-glow; demais = bg-muted + hairline */}
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                kpi.accent
                  ? 'brand-gradient brand-glow text-white'
                  : 'bg-muted border hairline text-muted-foreground',
              )}
            >
              <kpi.icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground truncate">
                {kpi.label}
              </p>
              <p className="mt-1 text-[30px] font-semibold tracking-[-0.03em] tabular-nums leading-none truncate">
                {kpi.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters — 6 controles (busca, dataInício, dataFim, valorMín, ordenar, direção, vendedor) */}
      <PlatformCrmKanbanFilters
        filters={filters}
        onFilterChange={updateFilter}
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        sellers={sellers}
      />

      {/* Kanban Board */}
      {isLoading ? (
        // Skeleton anatômico (§3.1): anatomia LUX nova — colunas sem box (header
        // solto px-1) + cards surface-card p-4, largura w-[320px], sem spinner.
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex gap-3 h-full min-h-[400px]">
            {Array.from({ length: 4 }).map((_, ci) => (
              <div key={ci} className="flex flex-col h-full w-[320px] shrink-0">
                <div className="px-1 pb-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-2 w-2 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="ml-auto h-5 w-6 rounded-full" />
                  </div>
                  <Skeleton className="mt-1.5 h-3 w-20" />
                </div>
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, li) => (
                    <div key={li} className="surface-card p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-xl" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-2.5 w-20" />
                        </div>
                      </div>
                      <Skeleton className="h-5 w-24" />
                      <div className="flex items-center justify-between pt-2.5 border-t hairline">
                        <Skeleton className="h-3.5 w-20 rounded-full" />
                        <Skeleton className="h-2.5 w-14" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : stageCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <LayoutGrid className="h-12 w-12 text-muted-foreground opacity-30 mb-4" />
          <h3 className="text-sm font-medium mb-2">Nenhuma etapa configurada</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">
            Crie etapas para começar a organizar seu pipeline.
          </p>
          <Button size="sm" onClick={() => setStageManagerOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Gerenciar Etapas
          </Button>
        </div>
      ) : (
        // snap-x no mobile (§3.6): scroll horizontal com encaixe; nunca empilhar colunas.
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex gap-3 h-full min-h-[400px] snap-x snap-mandatory lg:snap-none">
            {columns.map((column) => (
              <div key={column.id} className="snap-start shrink-0 h-full">
                <PlatformCrmKanbanColumn
                  column={column}
                  draggedLeadId={draggedLeadId}
                  onDragStartLead={setDraggedLeadId}
                  onDropLead={handleDropOnStage}
                  onViewLead={setSelectedLeadId}
                  sellersMap={sellersMap}
                  isError={leadsFailed}
                  onRetry={retryBoard}
                  onManageStage={() => setStageManagerOpen(true)}
                />
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* Stage Manager Dialog */}
      <PlatformCrmStageManagerDialog
        open={stageManagerOpen}
        onOpenChange={setStageManagerOpen}
        stages={stages ?? []}
        leadCountByStage={leadCountByStage}
      />

      {/* Lead Detail Modal */}
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

export default PlatformCrmKanban;
