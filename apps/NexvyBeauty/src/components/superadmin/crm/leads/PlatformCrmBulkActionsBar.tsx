import { Button } from '@/components/ui/button';
import { ArrowRightLeft, Download, Trash2, X, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlatformCrmBulkTagPopover } from './PlatformCrmBulkTagPopover';

/**
 * Barra de ações em massa da GESTÃO DE LEADS do CRM de PLATAFORMA (super_admin).
 * Transferir · Exportar · Etiquetar (via PlatformCrmBulkTagPopover) · Excluir.
 * Desacoplada do tenant — só recebe callbacks + ids selecionados.
 */
interface PlatformCrmBulkActionsBarProps {
  selectedCount: number;
  selectedLeadIds: string[];
  onTransfer: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function PlatformCrmBulkActionsBar({
  selectedCount,
  selectedLeadIds,
  onTransfer,
  onExport,
  onDelete,
  onClearSelection,
}: PlatformCrmBulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'bg-foreground text-background rounded-xl shadow-2xl',
        'px-4 py-3 flex items-center gap-4',
        'animate-in slide-in-from-bottom-4 fade-in duration-300',
      )}
    >
      <div className="flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-primary" />
        <span className="font-medium">
          {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
        </span>
      </div>

      <div className="h-6 w-px bg-background/20" />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onTransfer}
          className="text-background hover:text-background hover:bg-background/10"
        >
          <ArrowRightLeft className="h-4 w-4 mr-1" />
          Transferir
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={onExport}
          className="text-background hover:text-background hover:bg-background/10"
        >
          <Download className="h-4 w-4 mr-1" />
          Exportar
        </Button>

        <PlatformCrmBulkTagPopover selectedLeadIds={selectedLeadIds} />

        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Excluir
        </Button>
      </div>

      <div className="h-6 w-px bg-background/20" />

      <Button
        size="icon"
        variant="ghost"
        onClick={onClearSelection}
        className="h-8 w-8 text-background hover:text-background hover:bg-background/10"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
