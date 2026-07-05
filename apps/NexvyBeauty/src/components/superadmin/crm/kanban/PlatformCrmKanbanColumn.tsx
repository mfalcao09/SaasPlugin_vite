import { useState } from 'react';
import { Trophy, XCircle, MousePointerClick, AlertCircle } from 'lucide-react';
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
  /** Erro no carregamento dos leads — exibe estado de erro por coluna (§3.1). */
  isError?: boolean;
  /** Retry do carregamento (refetch do board). */
  onRetry?: () => void;
}

// Soma da coluna: BRL compacto (R$ 12k / R$ 1,2M) — cabe no header estreito.
function formatCompactBRL(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`;
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
  isError,
  onRetry,
}: PlatformCrmKanbanColumnProps) {
  // Cor de estágio no banco (dado). Fallback = token muted (nunca hex de marca).
  const stageColor = column.color || 'hsl(var(--muted-foreground))';
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
        'flex flex-col h-full w-[300px] shrink-0 bg-muted/20 rounded-lg border border-border/60 overflow-hidden transition-colors',
        isOver && 'ring-2 ring-primary/40 border-primary/40',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header sticky — dot da cor do banco + nome + contagem + soma R$ (F2 §2) */}
      <div className="sticky top-0 z-10 px-3 py-2.5 border-b border-border/60 bg-muted/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          {/* Cor de estágio no banco (dado) — único literal permitido no header. */}
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: stageColor }}
            aria-hidden
          />
          {column.is_won && <Trophy className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
          {column.is_lost && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
          <h3
            className="text-[11px] font-semibold uppercase tracking-wide truncate text-foreground/80"
            title={column.name}
          >
            {column.name}
          </h3>
          <span className="ml-auto shrink-0 inline-flex items-center justify-center h-5 min-w-[22px] px-1.5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold tabular-nums">
            {column.leadCount}
          </span>
        </div>
        {column.totalValue > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {formatCompactBRL(column.totalValue)}
          </p>
        )}
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1">
        <div className="p-2.5 space-y-2.5">
          {isError ? (
            // Estado de erro por coluna (§3.1) — banner com retry, nunca silenciar.
            <div className="flex flex-col items-center justify-center gap-2 py-8 px-3 text-center">
              <AlertCircle className="h-8 w-8 text-destructive/60" />
              <p className="text-xs text-muted-foreground">Falha ao carregar os leads.</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          ) : column.leads.length === 0 ? (
            // Vazio (§2 F2) — mini empty com dica de ação.
            <div className="flex flex-col items-center justify-center gap-2 py-8 px-3 text-center">
              <MousePointerClick className="h-8 w-8 text-muted-foreground opacity-30" />
              <p className="text-xs text-muted-foreground">
                {isUnassigned ? 'Nenhum lead sem etapa' : 'Arraste um lead para cá'}
              </p>
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
