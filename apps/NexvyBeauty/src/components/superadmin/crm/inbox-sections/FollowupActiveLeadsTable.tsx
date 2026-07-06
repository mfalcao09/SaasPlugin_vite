import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MoreVertical, Pause, Play, X, Search, AlertTriangle, Repeat, RotateCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  type PlatformActiveLeadRow,
  type PlatformFollowupStatusKey,
  usePlatformCrmFollowupActions,
  resolvePlatformFollowupStatusKey,
} from '../data/usePlatformCrmFollowup';
// Identidade nome→telefone (U3 / §3.3): IMPORTAR do exemplar calibrado — PROIBIDO
// reimplementar. Leads de WhatsApp chegam com nome inútil ("~"/1-2 chars) → o
// telefone formatado vira primário.
import { resolveVisitorIdentity, visitorInitials } from '../inbox/platformCrmIdentity';

/**
 * Tabela "Fila de follow-ups" da seção Follow-Up do CRM de PLATAFORMA (família
 * F5) na anatomia LUX. Restyle de FORMA sobre o porte 1:1 de
 * `admin/followup/FollowupActiveLeadsTable.tsx`: contrato de dados e lógica de
 * negócio (ações pause/resume/cancel via `usePlatformCrmFollowup`) INTACTOS —
 * mudam a casca (`.surface-card`), identidade lux (avatar `navy-gradient`, §3.3),
 * hairlines nas divisórias, tokens de status (§1.3) e estados (§3.1). `th`
 * uppercase + dropdown por linha (padrão F5 do braço leads). Sem drill-down de
 * conversa (a fila é de cadência, não conversa).
 */

interface Props {
  rows: PlatformActiveLeadRow[];
  loading?: boolean;
  /** Erro da query base (derivado no container; retry via `onRetry`). */
  isError?: boolean;
  onRetry?: () => void;
  statusFilter: PlatformFollowupStatusKey | 'all';
  onStatusFilterChange: (s: PlatformFollowupStatusKey | 'all') => void;
}

/**
 * Meta de status → dot de cor (§1.3 — literais de SIGNIFICADO, não de marca) +
 * classe de badge outline. Cores fiéis ao mapa de status do template.
 */
const STATUS_META: Record<
  PlatformFollowupStatusKey,
  { label: string; dot: string; badge: string }
> = {
  waiting_next: {
    label: 'Aguardando',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  },
  waiting_reply: {
    label: 'Aguardando resposta',
    dot: 'bg-blue-500',
    badge: 'bg-primary/10 text-primary border-primary/30',
  },
  paused: {
    label: 'Em pausa',
    dot: 'bg-yellow-500',
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  },
  cancelled: {
    label: 'Cancelado',
    dot: 'bg-destructive',
    badge: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  closed: {
    label: 'Encerrado',
    dot: 'bg-muted-foreground/50',
    badge: 'bg-muted text-muted-foreground border-border',
  },
  recovered: {
    label: 'Recuperado',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  },
};

function resolveStatus(r: PlatformActiveLeadRow) {
  const key = resolvePlatformFollowupStatusKey(r);
  return { key, ...STATUS_META[key] };
}

export function FollowupActiveLeadsTable({
  rows,
  loading,
  isError,
  onRetry,
  statusFilter,
  onStatusFilterChange,
}: Props) {
  const { pause, resume, cancel } = usePlatformCrmFollowupActions();
  const [confirm, setConfirm] = useState<{ kind: 'pause' | 'cancel'; row: PlatformActiveLeadRow } | null>(null);
  const [search, setSearch] = useState('');

  // Busca local (§F5): identidade (nome útil OU telefone) + agente.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const identity = resolveVisitorIdentity(r.lead?.name, r.lead?.phone);
      return (
        identity.primary.toLowerCase().includes(q) ||
        (identity.secondary?.toLowerCase().includes(q) ?? false) ||
        (r.lead?.phone?.includes(search.trim()) ?? false) ||
        (r.agent?.name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search]);

  const showEmpty = !loading && !isError && visibleRows.length === 0;

  return (
    <div className="surface-card h-full flex flex-col overflow-hidden">
      <div className="p-5 pb-3 flex flex-col gap-3">
        <div className="flex flex-row items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Fila de follow-ups</h3>
            <p className="text-[11px] text-muted-foreground">Leads aguardando as próximas tentativas</p>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => onStatusFilterChange(v as PlatformFollowupStatusKey | 'all')}
          >
            <SelectTrigger className="w-[180px] h-9 text-xs" aria-label="Filtrar por status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ativos</SelectItem>
              <SelectItem value="waiting_next">Aguardando próxima</SelectItem>
              <SelectItem value="waiting_reply">Aguardando resposta</SelectItem>
              <SelectItem value="paused">Em pausa</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="closed">Encerrado</SelectItem>
              <SelectItem value="recovered">Recuperado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Toolbar §F5: busca com Ctrl+K hook (data-*-search) */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar lead ou agente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 border hairline bg-card"
            data-followup-search
            aria-label="Buscar na fila de follow-ups"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Mobile (§3.6/§F5): só colunas essenciais — Lead (com métrica
                  embutida) + Status + ações. As demais entram a partir de md;
                  elimina o scroll horizontal acidental (rubric §4 crit. 6). */}
              <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground border-b hairline">
                <th className="text-left font-medium px-4 py-2.5">Lead</th>
                <th className="hidden md:table-cell text-left font-medium px-4 py-2.5">Agente</th>
                <th className="hidden lg:table-cell text-left font-medium px-4 py-2.5">Tentativa</th>
                <th className="hidden lg:table-cell text-left font-medium px-4 py-2.5">Próximo disparo</th>
                <th className="hidden md:table-cell text-left font-medium px-4 py-2.5">Tempo restante</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {/* Skeleton anatômico (§3.1): reproduz avatar + 2 linhas por célula */}
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3"><Skeleton className="h-3.5 w-24" /></td>
                    <td className="hidden lg:table-cell px-4 py-3"><Skeleton className="h-3.5 w-16" /></td>
                    <td className="hidden lg:table-cell px-4 py-3"><Skeleton className="h-3.5 w-28" /></td>
                    <td className="hidden md:table-cell px-4 py-3"><Skeleton className="h-3.5 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-2 py-3"><Skeleton className="h-8 w-8 rounded-md" /></td>
                  </tr>
                ))}

              {/* Erro com retry (§3.1) — nunca silenciar */}
              {!loading && isError && (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <div className="flex flex-col items-center text-center">
                      <AlertTriangle className="h-12 w-12 text-destructive/60" />
                      <p className="mt-3 text-sm font-medium">Não foi possível carregar a fila</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ocorreu um erro ao buscar os follow-ups.
                      </p>
                      {onRetry && (
                        <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={onRetry}>
                          <RotateCw className="h-3.5 w-3.5" />
                          Tentar novamente
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {/* Vazio (§3.1): ícone + título + dica contextual à busca/filtro */}
              {showEmpty && (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <div className="flex flex-col items-center text-center">
                      <Repeat className="h-12 w-12 text-muted-foreground opacity-30" />
                      <p className="mt-3 text-sm font-medium">Nenhum follow-up na fila</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {search.trim()
                          ? 'Nenhum lead corresponde à sua busca.'
                          : statusFilter !== 'all'
                            ? 'Nenhum lead neste status no período selecionado.'
                            : 'Assim que uma cadência agendar tentativas, os leads aparecem aqui.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                !isError &&
                visibleRows.map((r) => {
                  const st = resolveStatus(r);
                  const max = r.max_followups ?? 3;
                  const attempt = Math.min(r.last_attempt_executed + 1, max);
                  const intervalMin =
                    r.followup_intervals_minutes?.[
                      Math.min(r.last_attempt_executed, (r.followup_intervals_minutes?.length ?? 1) - 1)
                    ];
                  const identity = resolveVisitorIdentity(r.lead?.name, r.lead?.phone);
                  const canPause = st.key === 'waiting_next' || st.key === 'waiting_reply';
                  const nextDate = r.next_followup_at ? new Date(r.next_followup_at) : null;
                  const remaining =
                    nextDate && nextDate > new Date()
                      ? formatDistanceToNowStrict(nextDate, { locale: ptBR })
                      : null;

                  return (
                    <tr key={r.id} className="border-b hairline last:border-b-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-9 w-9 flex-shrink-0">
                            <AvatarFallback className="navy-gradient text-white text-[11px] font-semibold">
                              {visitorInitials(r.lead?.name, r.lead?.phone)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div
                              className="text-[14px] font-semibold leading-tight truncate max-w-[180px]"
                              title={identity.primary}
                            >
                              {identity.primary}
                            </div>
                            <div
                              className="text-[11px] text-muted-foreground truncate max-w-[180px]"
                              title={identity.secondary ?? undefined}
                            >
                              {identity.secondary ?? '—'}
                            </div>
                            {/* Mobile-only (§3.6): métrica essencial da fila
                                (tentativa + tempo restante) embutida quando as
                                colunas somem em <md — não perder a informação. */}
                            <div className="md:hidden mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                              {attempt}ª de {max}
                              {remaining ? ` · em ${remaining}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                          <span className="truncate max-w-[140px]" title={r.agent?.name ?? undefined}>
                            {r.agent?.name || '—'}
                          </span>
                        </span>
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-xs tabular-nums">
                        <div>
                          {attempt}ª de {max}
                        </div>
                        {intervalMin != null && (
                          <div className="text-[11px] text-muted-foreground">({intervalMin} min)</div>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-xs tabular-nums">
                        {nextDate ? format(nextDate, 'dd/MM/yyyy HH:mm') : '—'}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-xs tabular-nums">{remaining ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-2 py-0.5 border font-medium inline-flex items-center gap-1.5',
                            st.badge,
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', st.dot)} />
                          {st.label}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label={`Ações do follow-up de ${identity.primary}`}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Ações</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="end">
                            {st.key === 'paused' ? (
                              <DropdownMenuItem onClick={() => resume.mutate(r)}>
                                <Play className="h-4 w-4 mr-2" /> Retomar follow-up
                              </DropdownMenuItem>
                            ) : (
                              canPause && (
                                <DropdownMenuItem onClick={() => setConfirm({ kind: 'pause', row: r })}>
                                  <Pause className="h-4 w-4 mr-2" /> Pausar follow-up
                                </DropdownMenuItem>
                              )
                            )}
                            {!r.ruler_closed && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setConfirm({ kind: 'cancel', row: r })}
                                >
                                  <X className="h-4 w-4 mr-2" /> Cancelar follow-up
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'pause' ? 'Pausar follow-up?' : 'Cancelar follow-up?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? confirm.kind === 'pause'
                  ? `Nenhuma nova tentativa será enviada para ${resolveVisitorIdentity(confirm.row.lead?.name, confirm.row.lead?.phone).primary} até a régua ser reativada.`
                  : `Todos os disparos futuros de ${resolveVisitorIdentity(confirm.row.lead?.name, confirm.row.lead?.phone).primary} serão removidos. Esta ação só poderá ser revertida manualmente.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm?.kind === 'cancel'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === 'pause') pause.mutate(confirm.row.id);
                else cancel.mutate(confirm.row.id);
                setConfirm(null);
              }}
            >
              {confirm?.kind === 'pause' ? 'Pausar' : 'Cancelar follow-up'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
