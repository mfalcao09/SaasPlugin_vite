import { Pause, Play, Archive, Copy, Pencil, DollarSign, TrendingDown } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * NexvyAds — diálogo de confirmação de ação sobre uma entidade de ads. Portado do
 * CrudConfirmDialog do hub, re-tematizado com os tokens do NexvyBeauty. Mostra
 * orçamento + gasto antes de confirmar. NÃO executa mutação — quem consome liga o
 * onConfirm a um handler (nesta fase, dry-run/stub, pois ADS_MUTATIONS_ENABLED=false).
 */
export type AdsCrudAction = 'pause' | 'activate' | 'archive' | 'duplicate' | 'edit';

export interface AdsCrudConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: AdsCrudAction;
  entityType: 'campanha' | 'conjunto' | 'anúncio';
  entityName: string;
  budget?: string;
  spend?: string;
  onConfirm: () => void;
}

const ACTION_CONFIG: Record<
  AdsCrudAction,
  {
    Icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    title: (type: string) => string;
    consequence: string;
    actionLabel: string;
    actionClass: string;
  }
> = {
  pause: {
    Icon: Pause,
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    title: (t) => `Pausar ${t}?`,
    consequence:
      'Os anúncios param de veicular e o gasto é interrompido. Você pode reativar a qualquer momento.',
    actionLabel: 'Pausar',
    actionClass: 'bg-warning text-warning-foreground hover:bg-warning/90',
  },
  activate: {
    Icon: Play,
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    title: (t) => `Ativar ${t}?`,
    consequence: 'Os anúncios voltam a veicular imediatamente e o orçamento começa a ser consumido.',
    actionLabel: 'Ativar',
    actionClass: 'bg-success text-success-foreground hover:bg-success/90',
  },
  archive: {
    Icon: Archive,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
    title: (t) => `Arquivar ${t}?`,
    consequence:
      'A entidade arquivada não veicula mais — apenas consulta. O histórico de performance é preservado.',
    actionLabel: 'Arquivar',
    actionClass: '',
  },
  duplicate: {
    Icon: Copy,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: (t) => `Duplicar ${t}?`,
    consequence:
      'Cria uma cópia da entidade (pausada) com as mesmas configurações, para você ajustar antes de veicular.',
    actionLabel: 'Duplicar',
    actionClass: '',
  },
  edit: {
    Icon: Pencil,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: (t) => `Editar ${t}?`,
    consequence:
      'Abre a edição de orçamento/veiculação. As mutações estão em modo simulação nesta fase.',
    actionLabel: 'Continuar',
    actionClass: '',
  },
};

export function AdsCrudConfirmDialog({
  open,
  onOpenChange,
  action,
  entityType,
  entityName,
  budget,
  spend,
  onConfirm,
}: AdsCrudConfirmDialogProps) {
  const cfg = ACTION_CONFIG[action];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                cfg.iconBg,
              )}
            >
              <cfg.Icon className={cn('h-5 w-5', cfg.iconColor)} />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="leading-snug">{cfg.title(entityType)}</AlertDialogTitle>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground" title={entityName}>
                &ldquo;{entityName}&rdquo;
              </p>
            </div>
          </div>

          <AlertDialogDescription className="mt-3 text-sm leading-relaxed">
            {cfg.consequence}
          </AlertDialogDescription>

          {(budget || spend) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {budget && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  {budget}
                </span>
              )}
              {spend && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground">
                  <TrendingDown className="h-3 w-3 text-muted-foreground" />
                  {spend} no período
                </span>
              )}
            </div>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className={cfg.actionClass} onClick={onConfirm}>
            {cfg.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default AdsCrudConfirmDialog;
