import { useMemo, useState } from 'react';
import { LayoutGrid, Settings2, TrendingUp, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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

  const { data: stages, isLoading: stagesLoading } = usePlatformCrmStages();
  const { data: leads, isLoading: leadsLoading } = usePlatformCrmLeads({
    search: filters.search.trim() || undefined,
    sellerId: filters.sellerId || undefined,
    minValue: filters.minValue,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
  });
  const moveLead = useMovePlatformCrmLeadToStage();

  // Vendedores = reps de venda da plataforma (squad_members / assigned_to), NÃO tenant.
  const { data: sellers = [], map: sellersMap } = usePlatformCrmSellersMap();

  const isLoading = stagesLoading || leadsLoading;

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
        color: '#6b7280',
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-6 w-6" />
            Pipeline de Vendas
          </h1>
          <p className="text-muted-foreground">Gestão visual de oportunidades da plataforma</p>
        </div>

        <div className="flex items-center gap-3">
          {/*
            DROP: seletor de Produto (pipeline-por-produto) do original omitido por
            design — pipeline único na plataforma (decisão de desacoplamento do tenant).
          */}
          <Button variant="outline" onClick={() => setStageManagerOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Gerenciar Etapas
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <TrendingUp className="h-4 w-4" />
            Valor Total
          </div>
          <div className="text-2xl font-bold text-primary">
            {formatCurrency(totalPipelineValue)}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Users className="h-4 w-4" />
            Total de Leads
          </div>
          <div className="text-2xl font-bold">{totalLeads}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <LayoutGrid className="h-4 w-4" />
            Etapas
          </div>
          <div className="text-2xl font-bold">{stageCount}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            Ticket Médio
          </div>
          <div className="text-2xl font-bold">
            {totalLeads > 0 ? formatCurrency(totalPipelineValue / totalLeads) : 'R$ 0'}
          </div>
        </div>
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
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stageCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhuma etapa configurada</h3>
          <p className="text-muted-foreground mb-4">
            Crie etapas para começar a organizar seu pipeline.
          </p>
          <Button onClick={() => setStageManagerOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Gerenciar Etapas
          </Button>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex gap-4 h-full min-h-[400px]">
            {columns.map((column) => (
              <PlatformCrmKanbanColumn
                key={column.id}
                column={column}
                draggedLeadId={draggedLeadId}
                onDragStartLead={setDraggedLeadId}
                onDropLead={handleDropOnStage}
                onViewLead={setSelectedLeadId}
                sellersMap={sellersMap}
              />
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
