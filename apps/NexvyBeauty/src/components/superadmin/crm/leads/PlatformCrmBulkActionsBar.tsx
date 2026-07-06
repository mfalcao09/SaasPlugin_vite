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
    // Barra flutuante Lux — navy-gradient sobre branco (texto claro), acento dourado
    // no ícone/contador, glow de marca. Substitui bg-foreground pela superfície navy.
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'navy-gradient text-white rounded-xl shadow-2xl brand-glow',
        'px-4 py-3 flex items-center gap-4',
        'animate-in slide-in-from-bottom-4 fade-in duration-300',
      )}
    >
      <div className="flex items-center gap-2">
        <CheckCircle className="h-5 w-5" style={{ color: 'var(--gold-bright)' }} />
        <span className="font-medium tabular-nums">
          {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
        </span>
      </div>

      <div className="h-6 w-px bg-white/20" />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onTransfer}
          className="text-white hover:text-white hover:bg-white/10"
        >
          <ArrowRightLeft className="h-4 w-4 mr-1" />
          Transferir
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={onExport}
          className="text-white hover:text-white hover:bg-white/10"
        >
          <Download className="h-4 w-4 mr-1" />
          Exportar
        </Button>

        <PlatformCrmBulkTagPopover selectedLeadIds={selectedLeadIds} />

        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-red-300 hover:text-red-200 hover:bg-red-500/15"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Excluir
        </Button>
      </div>

      <div className="h-6 w-px bg-white/20" />

      <Button
        size="icon"
        variant="ghost"
        onClick={onClearSelection}
        className="h-8 w-8 text-white hover:text-white hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
