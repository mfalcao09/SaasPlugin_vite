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
import { Plus, Trash2, Edit2, CalendarClock, AlertTriangle, RotateCw, Clock, X } from 'lucide-react';

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

// ── Modo "Personalizado" (pedido Marcelo 07-12) ────────────────────────────
// O campo persistido é `cron_expression` (string cron de 5 posições), então o
// custom NÃO precisa de migração: gera uma expressão cron real e grava no mesmo
// campo. Presets continuam intactos como sugestões.
const CUSTOM_VALUE = '__custom__';

const WEEKDAYS = [
  { id: '*', label: 'Todos os dias' },
  { id: '1', label: 'Segunda-feira' },
  { id: '2', label: 'Terça-feira' },
  { id: '3', label: 'Quarta-feira' },
  { id: '4', label: 'Quinta-feira' },
  { id: '5', label: 'Sexta-feira' },
  { id: '6', label: 'Sábado' },
  { id: '0', label: 'Domingo' },
];

const DOW_SHORT: Record<string, string> = {
  '0': 'Dom', '1': 'Seg', '2': 'Ter', '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb',
};

function fmtTime(h: number, m: number): string {
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Parse de cron "M[,M] H[,H] * * D" → horários (produto hora×min) + dia-da-semana.
 *  Aceita apenas listas numéricas simples (sem passos/intervalos como */6). */
function parseCron(cron: string): { times: { h: number; m: number }[]; dow: string } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minRaw, hrRaw, dom, mon, dowRaw] = parts;
  if (dom !== '*' || mon !== '*') return null;
  const isNumList = (s: string) => /^\d+(,\d+)*$/.test(s);
  if (!isNumList(minRaw) || !isNumList(hrRaw)) return null;
  if (dowRaw !== '*' && !/^\d(,\d)*$/.test(dowRaw)) return null;
  const mins = [...new Set(minRaw.split(',').map(Number))].filter((n) => n >= 0 && n < 60);
  const hrs = [...new Set(hrRaw.split(',').map(Number))].filter((n) => n >= 0 && n < 24);
  if (!mins.length || !hrs.length) return null;
  const times: { h: number; m: number }[] = [];
  for (const h of hrs) for (const m of mins) times.push({ h, m });
  times.sort((a, b) => a.h - b.h || a.m - b.m);
  return { times, dow: dowRaw };
}

/** Rótulo pt-BR de um cron. Presets têm prioridade; senão descreve o custom;
 *  fallback = string crua (nunca quebra a lista). */
function describeCron(cron: string): string {
  const preset = FREQ_OPTIONS.find((f) => f.id === cron);
  if (preset) return preset.label;
  const parsed = parseCron(cron);
  if (!parsed) return cron;
  const timesLabel = parsed.times.map(({ h, m }) => fmtTime(h, m)).join(', ');
  const dowLabel =
    parsed.dow === '*'
      ? 'Todos os dias'
      : parsed.dow.split(',').map((d) => DOW_SHORT[d] ?? d).join(', ');
  return `${dowLabel} às ${timesLabel}`;
}

/** Monta cron a partir de horários "HH:MM" + dia-da-semana. Listas distintas de
 *  minuto e hora (semântica cron padrão = produto hora×minuto). */
function buildCron(timeStrings: string[], dow: string): string {
  const valid = timeStrings
    .map((t) => {
      const [h, m] = t.split(':').map(Number);
      return { h, m };
    })
    .filter(({ h, m }) => Number.isFinite(h) && Number.isFinite(m));
  const mins = [...new Set(valid.map((t) => t.m))].sort((a, b) => a - b);
  const hrs = [...new Set(valid.map((t) => t.h))].sort((a, b) => a - b);
  if (!mins.length || !hrs.length) return '0 8 * * *';
  return `${mins.join(',')} ${hrs.join(',')} * * ${dow}`;
}

function timesToStrings(times: { h: number; m: number }[]): string[] {
  return times.map(({ h, m }) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
}

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
  // Modo "Personalizado" do dialog: horários (1+) + dia-da-semana → cron gerado.
  const [customMode, setCustomMode] = useState(false);
  const [customTimes, setCustomTimes] = useState<string[]>(['08:00']);
  const [customDow, setCustomDow] = useState('*');

  function openNew() {
    setEditing({
      name: 'Novo agendamento',
      cron_expression: '0 8 * * *',
      is_active: true,
      filters: defaultFilters,
      actions_config: defaultActions,
    });
    setCustomMode(false);
    setCustomTimes(['08:00']);
    setCustomDow('*');
    setOpen(true);
  }

  function openEdit(s: PlatformScanSchedule) {
    setEditing(s);
    // Preset → modo simples; cron custom (não-preset) → abre já em Personalizado
    // com os horários/dia decodificados (round-trip fiel).
    const isPreset = FREQ_OPTIONS.some((f) => f.id === s.cron_expression);
    if (isPreset) {
      setCustomMode(false);
    } else {
      const parsed = parseCron(s.cron_expression);
      setCustomMode(true);
      setCustomTimes(parsed ? timesToStrings(parsed.times) : ['08:00']);
      setCustomDow(parsed ? parsed.dow : '*');
    }
    setOpen(true);
  }

  // Aplica horários+dia ao estado custom E regrava o cron em `editing` numa tacada.
  function applyCustom(times: string[], dow: string) {
    setCustomTimes(times);
    setCustomDow(dow);
    setEditing((prev) => (prev ? { ...prev, cron_expression: buildCron(times, dow) } : prev));
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

  // Aviso SÓ no caso realmente perdedor do cron single-line: minutos diferentes
  // combinados com horas diferentes geram cruzamento hora×minuto (transparência,
  // Seção 5 — nunca esconder comportamento inesperado).
  const distinctMins = new Set(customTimes.map((t) => t.split(':')[1])).size;
  const distinctHrs = new Set(customTimes.map((t) => t.split(':')[0])).size;
  const mixedMinutesWarning = customMode && distinctMins > 1 && distinctHrs > 1;

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
                  {describeCron(s.cron_expression)}
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
                  value={customMode ? CUSTOM_VALUE : editing.cron_expression}
                  onValueChange={(v) => {
                    if (v === CUSTOM_VALUE) {
                      setCustomMode(true);
                      // Semeia o custom a partir do cron atual (se parseável) para
                      // não perder o horário já escolhido no preset.
                      const parsed = parseCron(editing.cron_expression);
                      applyCustom(
                        parsed ? timesToStrings(parsed.times) : customTimes,
                        parsed ? parsed.dow : customDow,
                      );
                    } else {
                      setCustomMode(false);
                      setEditing({ ...editing, cron_expression: v });
                    }
                  }}
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
                    <SelectItem value={CUSTOM_VALUE}>Personalizado…</SelectItem>
                  </SelectContent>
                </Select>

                {/* Painel de horário(s) customizado(s) + dia da semana → gera cron
                    real gravado no mesmo campo `cron_expression`. */}
                {customMode && (
                  <div className="mt-3 space-y-3 rounded-lg border hairline bg-muted/30 p-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Horários</Label>
                      {customTimes.map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Input
                            type="time"
                            value={t}
                            aria-label={`Horário ${i + 1}`}
                            className="h-9 w-36"
                            onChange={(e) =>
                              applyCustom(
                                customTimes.map((x, idx) => (idx === i ? e.target.value : x)),
                                customDow,
                              )
                            }
                          />
                          {customTimes.length > 1 && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              aria-label={`Remover horário ${i + 1}`}
                              onClick={() =>
                                applyCustom(
                                  customTimes.filter((_, idx) => idx !== i),
                                  customDow,
                                )
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => applyCustom([...customTimes, '12:00'], customDow)}
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar horário
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Dia da semana</Label>
                      <Select value={customDow} onValueChange={(v) => applyCustom(customTimes, v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Transparência: mostra exatamente quando o radar vai rodar. */}
                    <p className="text-xs text-muted-foreground">
                      O radar rodará: <strong>{describeCron(editing.cron_expression)}</strong>.
                    </p>
                    {mixedMinutesWarning && (
                      <p className="text-xs text-amber-600">
                        Horários com minutos diferentes são combinados (cada hora × cada
                        minuto). Para controle exato, use o mesmo minuto em todos.
                      </p>
                    )}
                  </div>
                )}
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
