import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Users, CheckCircle2, XCircle, Send, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Cadence, CadenceEnrollmentStats } from '../data/usePlatformCrmCadences';

interface Props {
  cadences: Cadence[];
  stats: Record<string, CadenceEnrollmentStats>;
}

type RunRow = { id: string; status: string; step_id: string; scheduled_at: string; executed_at: string | null; error: string | null };

export function CadenceReports({ cadences, stats }: Props) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [stepMap, setStepMap] = useState<Record<string, { name: string; cadence_id: string }>>({});

  useEffect(() => {
    (async () => {
      const ids = cadences.map((c) => c.id);
      if (!ids.length) {
        setRuns([]);
        setStepMap({});
        return;
      }

      // `platform_crm_cadence_step_runs` NÃO tem `organization_id` (a RLS
      // super_admin-only isola os dados) — escopamos por step_id das cadências
      // carregadas em vez de por organização.
      const { data: steps } = await supabase
        .from('platform_crm_cadence_steps')
        .select('id,name,cadence_id')
        .in('cadence_id', ids);
      const map: Record<string, { name: string; cadence_id: string }> = {};
      (steps as any[] ?? []).forEach((s) => { map[s.id] = { name: s.name, cadence_id: s.cadence_id }; });
      setStepMap(map);

      const stepIds = Object.keys(map);
      if (!stepIds.length) {
        setRuns([]);
        return;
      }
      const { data: rs } = await supabase
        .from('platform_crm_cadence_step_runs')
        .select('id,status,step_id,scheduled_at,executed_at,error')
        .in('step_id', stepIds)
        .order('scheduled_at', { ascending: false })
        .limit(500);
      setRuns((rs as any[]) ?? []);
    })();
  }, [cadences.length]);

  const totals = Object.values(stats).reduce(
    (acc, s) => ({
      active: acc.active + s.active,
      completed: acc.completed + s.completed,
      stopped: acc.stopped + s.stopped,
      total: acc.total + s.total,
    }),
    { active: 0, completed: 0, stopped: 0, total: 0 }
  );
  const respRate = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0;
  const stopRate = totals.total ? Math.round((totals.stopped / totals.total) * 100) : 0;

  const runStats = runs.reduce(
    (acc, r) => {
      acc.total++;
      if (r.status === 'sent') acc.sent++;
      else if (r.status === 'failed') acc.failed++;
      else if (r.status === 'scheduled') acc.scheduled++;
      else if (r.status === 'skipped') acc.skipped++;
      return acc;
    },
    { total: 0, sent: 0, failed: 0, scheduled: 0, skipped: 0 }
  );

  // breakdown por step
  const byStep: Record<string, { sent: number; failed: number; skipped: number; scheduled: number }> = {};
  runs.forEach((r) => {
    if (!byStep[r.step_id]) byStep[r.step_id] = { sent: 0, failed: 0, skipped: 0, scheduled: 0 };
    (byStep[r.step_id] as any)[r.status] = ((byStep[r.step_id] as any)[r.status] ?? 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi icon={Users} label="Leads ativos" value={totals.active} />
        <Kpi icon={CheckCircle2} label="Concluídos" value={totals.completed} hint={`${respRate}% taxa`} />
        <Kpi icon={XCircle} label="Interrompidos" value={totals.stopped} hint={`${stopRate}% taxa`} />
        <Kpi icon={BarChart3} label="Cadências" value={cadences.length} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi icon={Send} label="Mensagens enviadas" value={runStats.sent} />
        <Kpi icon={Clock} label="Agendadas" value={runStats.scheduled} />
        <Kpi icon={AlertTriangle} label="Falhas" value={runStats.failed} hint={runStats.total ? `${Math.round(runStats.failed / runStats.total * 100)}%` : undefined} />
        <Kpi icon={XCircle} label="Puladas (condições)" value={runStats.skipped} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Desempenho por cadência</CardTitle></CardHeader>
        <CardContent>
          {cadences.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma cadência criada ainda.</p>
          ) : (
            <div className="space-y-3">
              {cadences.map((c) => {
                const s = stats[c.id] ?? { active: 0, completed: 0, stopped: 0, paused: 0, total: 0 };
                const rate = s.total ? Math.round((s.completed / s.total) * 100) : 0;
                return (
                  <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.objective ?? '—'}</div>
                    </div>
                    <div className="flex gap-6 text-sm shrink-0">
                      <Cell label="Ativos" value={s.active} />
                      <Cell label="Concluídos" value={s.completed} />
                      <Cell label="Interrompidos" value={s.stopped} />
                      <Cell label="Taxa" value={`${rate}%`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Desempenho por etapa</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(byStep).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem execuções registradas ainda.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(byStep).map(([stepId, s]) => {
                const meta = stepMap[stepId];
                const cadence = cadences.find((c) => c.id === meta?.cadence_id);
                const total = s.sent + s.failed + s.skipped + s.scheduled;
                const success = total ? Math.round((s.sent / total) * 100) : 0;
                return (
                  <div key={stepId} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{meta?.name ?? 'Etapa removida'}</div>
                      <div className="text-xs text-muted-foreground">{cadence?.name ?? '—'}</div>
                    </div>
                    <div className="flex gap-6 shrink-0">
                      <Cell label="Enviadas" value={s.sent} />
                      <Cell label="Falhas" value={s.failed} />
                      <Cell label="Puladas" value={s.skipped} />
                      <Cell label="Sucesso" value={`${success}%`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimas execuções</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma execução ainda.</p>
          ) : (
            <div className="max-h-96 overflow-auto divide-y text-sm">
              {runs.slice(0, 50).map((r) => (
                <div key={r.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate">{stepMap[r.step_id]?.name ?? 'Etapa removida'}</div>
                    {r.error && <div className="text-xs text-destructive truncate">{r.error}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    <span className="uppercase font-medium">{r.status}</span>
                    <span>{new Date(r.executed_at ?? r.scheduled_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: any; label: string; value: any; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold leading-tight">{value}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: any }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
