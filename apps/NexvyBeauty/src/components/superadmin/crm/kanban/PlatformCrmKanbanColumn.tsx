import { useState } from 'react';
import { Trophy, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PlatformCrmKanbanLeadCard } from './PlatformCrmKanbanLeadCard';
import type { PlatformCrmLeadWithStage } from '../data/usePlatformCrmLeads';
import type { PlatformCrmStage } from '../data/usePlatformCrmStages';
import type { PlatformCrmSeller } from '../data/usePlatformCrmSellers';

/** Coluna do board = etapa + seus leads (agrupados por current_stage_id). */
export interface PlatformCrmKanbanColumnData {
  /** `id` real da etapa, ou 'unassigned' para leads sem etapa. */
  id: string;
  name: string;
  color: string | null;
  is_won: boolean | null;
  is_lost: boolean | null;
  leads: PlatformCrmLeadWithStage[];
  leadCount: number;
  totalValue: number;
  /** Referência à etapa original (null para 'unassigned'). */
  stage: PlatformCrmStage | null;
}

interface PlatformCrmKanbanColumnProps {
  column: PlatformCrmKanbanColumnData;
  draggedLeadId?: string | null;
  onDragStartLead?: (leadId: string) => void;
  onDropLead?: (stageId: string) => void;
  /** Abre o detalhe de um lead (modal) ao clicar no card. */
  onViewLead?: (leadId: string) => void;
  /** Mapa id -> vendedor (rep de venda da plataforma) para o rodapé do card. */
  sellersMap?: Record<string, PlatformCrmSeller>;
}

function formatCurrency(value: number) {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}k`;
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function PlatformCrmKanbanColumn({
  column,
  draggedLeadId,
  onDragStartLead,
  onDropLead,
  onViewLead,
  sellersMap,
}: PlatformCrmKanbanColumnProps) {
  const stageColor = column.color || '#6b7280';
  const [isOver, setIsOver] = useState(false);
  const isUnassigned = column.id === 'unassigned';

  const handleDragOver = (e: React.DragEvent) => {
    if (!onDropLead || isUnassigned) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isOver) setIsOver(true);
  };

  const handleDragLeave = () => setIsOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    if (isUnassigned) return;
    onDropLead?.(column.id);
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full w-[300px] shrink-0 bg-muted/30 rounded-xl overflow-hidden transition-colors',
        isOver && 'ring-2 ring-primary/60 bg-primary/5',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div
        className="p-4 text-white"
        style={{ background: `linear-gradient(135deg, ${stageColor}, ${stageColor}cc)` }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {column.is_won && <Trophy className="h-4 w-4" />}
            {column.is_lost && <XCircle className="h-4 w-4" />}
            <h3 className="font-semibold text-sm uppercase tracking-wide">{column.name}</h3>
          </div>
          <Badge
            variant="secondary"
            className="bg-white/20 text-white hover:bg-white/30 text-xs"
          >
            {column.leadCount}
          </Badge>
        </div>

        <div className="text-xl font-bold">{formatCurrency(column.totalValue)}</div>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {column.leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div
                className="w-12 h-12 rounded-full mb-3 flex items-center justify-center opacity-30"
                style={{ backgroundColor: stageColor }}
              >
                <span className="text-white text-lg">0</span>
              </div>
              <p className="text-sm text-muted-foreground">Nenhum lead</p>
            </div>
          ) : (
            column.leads.map((lead) => (
              <PlatformCrmKanbanLeadCard
                key={lead.id}
                lead={lead}
                stageColor={stageColor}
                seller={
                  lead.assigned_to ? sellersMap?.[lead.assigned_to] ?? null : null
                }
                onViewDetails={() => onViewLead?.(lead.id)}
                isDragging={draggedLeadId === lead.id}
                onDragStart={() => onDragStartLead?.(lead.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
