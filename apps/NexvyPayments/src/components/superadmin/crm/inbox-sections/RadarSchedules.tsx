import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  usePlatformCrmOpportunitySchedules,
  useUpsertPlatformCrmScanSchedule,
  useDeletePlatformCrmScanSchedule,
  type PlatformScanFilters,
  type PlatformActionsConfig,
  type PlatformScanSchedule,
} from '../data/usePlatformCrmRadar';
import { Plus, Trash2, Edit2, CalendarClock, AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Agendamentos automáticos do Radar IA.
 * PORTE 1:1 de `admin/radar/RadarSchedules.tsx` do CRM Vendus.
 * Persistência via hooks stub (TODO(edge): tabela + pg_cron do platform) —
 * a UI completa (lista, dialog de criação/edição) permanece 1:1.
 */

const FREQ_OPTIONS = [
  { id: '0 8 * * *', label: 'Diariamente às 8h' },
  { id: '0 8,14 * * *', label: '2x ao dia (8h e 14h)' },
  { id: '0 9 * * 1', label: 'Toda segunda às 9h' },
  { id: '0 */6 * * *', label: 'A cada 6 horas' },
];

export function RadarSchedules({
  defaultFilters,
  defaultActions,
}: {
  defaultFilters: PlatformScanFilters;
  defaultActions: PlatformActionsConfig;
}) {
  const { data: schedules, isLoading, isError, refetch } = usePlatformCrmOpportunitySchedules();
  const upsert = useUpsertPlatformCrmScanSchedule();
  const del = useDeletePlatformCrmScanSchedule();
  const [editing, setEditing] = useState<PlatformScanSchedule | null>(null);
  const [open, setOpen] = useState(false);
  // Alvo da confirmação destrutiva (§3.7): AlertDialog antes de del.mutate.
  const [deleteTarget, setDeleteTarget] = useState<PlatformScanSchedule | null>(null);

  function openNew() {
    setEditing({
      name: 'Novo agendamento',
      cron_expression: '0 8 * * *',
      is_active: true,
      filters: defaultFilters,
      actions_config: defaultActions,
    });
    setOpen(true);
  }

  function openEdit(s: PlatformScanSchedule) {
    setEditing(s);
    setOpen(true);
  }

  async function save() {
    if (!editing) return;
    await upsert.mutateAsync(editing);
    setOpen(false);
  }

  function confirmDelete() {
    if (deleteTarget?.id) del.mutate(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    // Agendamentos = surface-card lux; linhas de agendamento com hairline + hover.
    <div className="surface-card p-4">
      <div className="flex items-center justify-between pb-3">
        <div>
          <h3 className="text-base font-semibold">Agendamentos automáticos</h3>
          <p className="text-sm text-muted-foreground">
            Configure o radar para rodar automaticamente
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      </div>
      <div className="space-y-2">
        {/* Carregando (§3.1): skeleton anatômico (linha de agendamento), nunca
            spinner central. */}
        {isLoading &&
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="border hairline rounded-lg p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex gap-1">
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-9 w-9 rounded-md" />
              </div>
            </div>
          ))}

        {/* Erro-com-retry (§3.1): acionável, estado preservado. */}
        {!isLoading && isError && (
          <div className="text-center py-8 flex flex-col items-center gap-3">
            <AlertTriangle className="h-10 w-10 text-destructive opacity-80" />
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar os agendamentos.
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
              <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
            </Button>
          </div>
        )}

        {!isLoading && !isError && !schedules?.length && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <CalendarClock className="h-12 w-12 mx-auto mb-2 opacity-30" />
            Nenhum agendamento configurado
          </div>
        )}

        {!isLoading &&
          !isError &&
          schedules?.map((s) => (
            <div
              key={s.id}
              className="surface-card surface-card-hover p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate" title={s.name}>
                    {s.name}
                  </span>
                  {s.is_active ? (
                    <Badge variant="default" className="text-[10px]">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Pausado
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {FREQ_OPTIONS.find((f) => f.id === s.cron_expression)?.label || s.cron_expression}
                  {s.last_run_at && ` • Última: ${new Date(s.last_run_at).toLocaleString('pt-BR')}`}
                </div>
              </div>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar agendamento ${s.name}`}
                      onClick={() => openEdit(s)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Editar</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Excluir agendamento ${s.name}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(s)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Excluir</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar' : 'Novo'} agendamento</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Frequência</Label>
                <Select
                  value={editing.cron_expression}
                  onValueChange={(v) => setEditing({ ...editing, cron_expression: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQ_OPTIONS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Os filtros e ações usados serão os configurados na aba{' '}
                <strong>Rodar Análise</strong> no momento da criação.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={upsert.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação destrutiva (§3.7): nome do alvo no texto, nunca del direto. */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O agendamento <strong>{deleteTarget?.name}</strong> será removido e o radar deixará de
              rodar automaticamente nessa frequência. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
