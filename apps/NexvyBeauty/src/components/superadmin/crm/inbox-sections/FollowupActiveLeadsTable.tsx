import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MoreVertical, Pause, Play, X } from 'lucide-react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  type PlatformActiveLeadRow,
  type PlatformFollowupStatusKey,
  usePlatformCrmFollowupActions,
  resolvePlatformFollowupStatusKey,
} from '../data/usePlatformCrmFollowup';

/**
 * Tabela "Leads em régua ativa" do painel de Follow-ups do CRM de PLATAFORMA.
 * PORTE 1:1 de `admin/followup/FollowupActiveLeadsTable.tsx`, trocando
 * `useFollowupActions`/`resolveStatus` do tenant pelos equivalentes do hook
 * `usePlatformCrmFollowup` (réguas = cadências platform_crm).
 */

interface Props {
  rows: PlatformActiveLeadRow[];
  loading?: boolean;
  statusFilter: PlatformFollowupStatusKey | 'all';
  onStatusFilterChange: (s: PlatformFollowupStatusKey | 'all') => void;
}

type Tone = 'success' | 'info' | 'warn' | 'destructive' | 'muted';

const STATUS_META: Record<PlatformFollowupStatusKey, { label: string; tone: Tone }> = {
  waiting_next: { label: 'Aguardando', tone: 'success' },
  waiting_reply: { label: 'Aguardando resposta', tone: 'info' },
  paused: { label: 'Em pausa', tone: 'warn' },
  cancelled: { label: 'Cancelado', tone: 'destructive' },
  closed: { label: 'Encerrado', tone: 'muted' },
  recovered: { label: 'Recuperado', tone: 'success' },
};

function resolveStatus(r: PlatformActiveLeadRow) {
  const key = resolvePlatformFollowupStatusKey(r);
  return { key, ...STATUS_META[key] };
}

function badgeClass(tone: Tone) {
  switch (tone) {
    case 'success': return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'info': return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20';
    case 'warn': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20';
    case 'destructive': return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20';
    case 'muted': return 'bg-muted text-muted-foreground border-border';
  }
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function FollowupActiveLeadsTable({ rows, loading, statusFilter, onStatusFilterChange }: Props) {
  const { pause, resume, cancel } = usePlatformCrmFollowupActions();
  const [confirm, setConfirm] = useState<{ kind: 'pause' | 'cancel'; row: PlatformActiveLeadRow } | null>(null);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-semibold">Leads em régua ativa</CardTitle>
          <p className="text-xs text-muted-foreground">Leads aguardando próximas tentativas</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as PlatformFollowupStatusKey | 'all')}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
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
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium px-4 py-2">Lead</th>
                <th className="text-left font-medium px-4 py-2">Agente</th>
                <th className="text-left font-medium px-4 py-2">Tentativa</th>
                <th className="text-left font-medium px-4 py-2">Próximo Disparo</th>
                <th className="text-left font-medium px-4 py-2">Tempo Restante</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b"><td colSpan={7} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td></tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum lead nessa visão.</td></tr>
              )}
              {!loading && rows.map((r) => {
                const st = resolveStatus(r);
                const max = r.max_followups ?? 3;
                const attempt = Math.min(r.last_attempt_executed + 1, max);
                const intervalMin = r.followup_intervals_minutes?.[Math.min(r.last_attempt_executed, (r.followup_intervals_minutes?.length ?? 1) - 1)];
                return (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-[11px] font-medium flex items-center justify-center">
                          {initials(r.lead?.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate max-w-[180px]">{r.lead?.name || 'Sem nome'}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.lead?.phone || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {r.agent?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{attempt}ª Tentativa</div>
                      {intervalMin != null && <div className="text-muted-foreground">({intervalMin} min)</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.next_followup_at ? format(new Date(r.next_followup_at), 'dd/MM/yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.next_followup_at && new Date(r.next_followup_at) > new Date()
                        ? formatDistanceToNowStrict(new Date(r.next_followup_at), { locale: ptBR })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border ${badgeClass(st.tone)}`}>{st.label}</Badge>
                    </td>
                    <td className="px-2 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {st.key === 'paused' ? (
                            <DropdownMenuItem onClick={() => resume.mutate(r)}>
                              <Play className="h-4 w-4 mr-2" /> Retomar follow-up
                            </DropdownMenuItem>
                          ) : (st.key === 'waiting_next' || st.key === 'waiting_reply') && (
                            <DropdownMenuItem onClick={() => setConfirm({ kind: 'pause', row: r })}>
                              <Pause className="h-4 w-4 mr-2" /> Pausar follow-up
                            </DropdownMenuItem>
                          )}
                          {!r.ruler_closed && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setConfirm({ kind: 'cancel', row: r })}
                            >
                              <X className="h-4 w-4 mr-2" /> Cancelar follow-up
                            </DropdownMenuItem>
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
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'pause' ? 'Pausar follow-up?' : 'Cancelar follow-up?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'pause'
                ? 'Nenhuma nova tentativa será enviada até que a régua seja reativada.'
                : 'Todos os disparos futuros serão removidos. Esta ação só poderá ser revertida manualmente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.kind === 'cancel' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
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
    </Card>
  );
}
