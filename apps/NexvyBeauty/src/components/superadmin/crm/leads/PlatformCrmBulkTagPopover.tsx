import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Tag, Loader2 } from 'lucide-react';
import {
  usePlatformCrmTags,
  useAssignPlatformCrmTag,
  useRemovePlatformCrmTag,
} from '../data/usePlatformCrmTags';
import { toast } from 'sonner';

/**
 * Popover de etiquetagem em massa da GESTÃO DE LEADS do CRM de PLATAFORMA (super_admin).
 * Aplica/remove `platform_crm_lead_tags` em vários leads de uma vez. Desacoplado do tenant.
 */
interface PlatformCrmBulkTagPopoverProps {
  trigger?: React.ReactNode;
  selectedLeadIds: string[];
  onDone?: () => void;
}

export function PlatformCrmBulkTagPopover({
  trigger,
  selectedLeadIds,
  onDone,
}: PlatformCrmBulkTagPopoverProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: tags = [] } = usePlatformCrmTags();
  const assign = useAssignPlatformCrmTag();
  const remove = useRemovePlatformCrmTag();

  const apply = async (tagId: string, mode: 'add' | 'remove') => {
    if (selectedLeadIds.length === 0) return;
    setBusy(tagId + mode);
    try {
      const calls = selectedLeadIds.map((leadId) =>
        mode === 'add'
          ? assign.mutateAsync({ leadId, tagId })
          : remove.mutateAsync({ leadId, tagId }),
      );
      await Promise.allSettled(calls);
      toast.success(
        mode === 'add'
          ? `Etiqueta aplicada em ${selectedLeadIds.length} lead(s)`
          : `Etiqueta removida de ${selectedLeadIds.length} lead(s)`,
      );
      onDone?.();
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button
            size="sm"
            variant="ghost"
            className="text-background hover:text-background hover:bg-background/10"
          >
            <Tag className="h-4 w-4 mr-1" />
            Etiquetar
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3 border-b">
          <p className="text-sm font-medium">Etiquetar {selectedLeadIds.length} lead(s)</p>
          <p className="text-xs text-muted-foreground">Clique para aplicar ou em Remover</p>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">
              Nenhuma etiqueta cadastrada
            </p>
          ) : (
            tags.map((t) => {
              const isAdding = busy === t.id + 'add';
              const isRemoving = busy === t.id + 'remove';
              return (
                <div key={t.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
                  <button
                    onClick={() => apply(t.id, 'add')}
                    disabled={!!busy}
                    className="flex items-center gap-2 flex-1 text-left text-sm min-w-0"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="truncate">{t.name}</span>
                    {isAdding && <Loader2 className="h-3 w-3 animate-spin" />}
                  </button>
                  <button
                    onClick={() => apply(t.id, 'remove')}
                    disabled={!!busy}
                    className="text-xs text-destructive px-2 py-0.5 rounded hover:bg-destructive/10"
                    aria-label="Remover etiqueta"
                  >
                    {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remover'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
