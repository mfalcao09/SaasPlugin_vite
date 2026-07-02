import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * PAINEL de FOLLOW-UPS do CRM de PLATAFORMA (super_admin).
 * PORTE 1:1 de `hooks/useFollowupPanel.ts` do CRM Vendus, com troca de motor:
 *   - tenant: fila `ai_outreach_queue` + RPC `get_followup_panel_stats`
 *   - plataforma: réguas = Cadências (`platform_crm_cadence_enrollments` +
 *     `platform_crm_cadence_step_runs` + `platform_crm_cadence_steps` +
 *     `platform_crm_cadences`), com TODAS as métricas calculadas CLIENT-SIDE
 *     (não existe RPC no platform CRM).
 *
 * Mapeamento régua→cadência (documentado; runner/edge de disparo é fase futura):
 *   - status 'active'    → aguardando (próxima tentativa futura ou resposta)
 *   - status 'paused'    → em pausa            (followup_enabled=false)
 *   - status 'completed' → régua encerrada     (esgotou tentativas)
 *   - status 'stopped'   + stop_reason 'cancelled_by_user' → cancelado
 *   - status 'stopped'   + stop_reason com 'repl'          → RECUPERADO
 *   - next_followup_at   → menor scheduled_at dos step_runs pendentes
 *   - tentativa          → nº de step_runs executados
 *
 * DESACOPLAMENTO: zero organization_id/product_id/sector de tenant. Filtro de
 * "agente" = `platform_crm_cadences.agent_id` → `platform_crm_agent_configs`.
 */

export type PlatformFollowupStatusKey =
  | 'waiting_next'
  | 'waiting_reply'
  | 'paused'
  | 'cancelled'
  | 'closed'
  | 'recovered';

export type PlatformFollowupFilters = {
  from: string; // ISO
  to: string; // ISO
  agentId?: string | null;
  status?: PlatformFollowupStatusKey | 'all';
};

export type PlatformFollowupPanelStats = {
  kpis: {
    leads_in_followup: number;
    waiting_next: number;
    sent_today: number;
    recovered: number;
    sent_in_period: number;
    rulers_closed: number;
  };
  recovery_by_attempt: Array<{ attempt: number; sent: number; replied: number; rate: number }>;
  sent_trend_7d: Array<{ day: string; count: number }>;
  active_status_breakdown: {
    waiting_next: number;
    waiting_reply: number;
    paused: number;
    others: number;
  };
  upcoming_buckets: {
    in_5m: number;
    in_15m: number;
    in_30m: number;
    in_1h: number;
    in_2h: number;
    after_24h: number;
  };
};

export type PlatformActiveLeadRow = {
  id: string; // enrollment id
  lead_id: string;
  agent_id: string | null;
  status: string; // 'replied' quando recuperado (paridade com o resolveStatus 1:1)
  followup_enabled: boolean;
  ruler_closed: boolean;
  next_followup_at: string | null;
  last_outreach_at: string | null;
  last_attempt_executed: number;
  max_followups: number | null;
  followup_intervals_minutes: number[] | null;
  error_message: string | null;
  lead: { name: string | null; phone: string | null } | null;
  agent: { name: string | null } | null;
};

const PLATFORM_CRM_KEY = 'platform-crm';

const isReplyReason = (reason: string | null | undefined) =>
  !!reason && reason.toLowerCase().includes('repl');

const isRunExecuted = (r: { executed_at: string | null; status: string }) =>
  !!r.executed_at || ['executed', 'sent', 'done', 'success'].includes(r.status);

const isRunPending = (r: { executed_at: string | null; status: string }) =>
  !r.executed_at && ['pending', 'scheduled', 'queued'].includes(r.status);

function delayToMinutes(value: number, unit: string): number {
  switch (unit) {
    case 'minutes':
    case 'minute':
      return value;
    case 'hours':
    case 'hour':
      return value * 60;
    case 'days':
    case 'day':
      return value * 60 * 24;
    default:
      return value;
  }
}

interface FollowupBase {
  rows: PlatformActiveLeadRow[];
  /** step_runs executados (para trend / recuperação por tentativa). */
  executedRuns: Array<{ enrollment_id: string; executed_at: string; attempt: number }>;
  /** encerramentos por enrollment (para KPIs de período). */
  closures: Array<{ enrollment_id: string; at: string | null; recovered: boolean; attempt: number }>;
}

async function fetchFollowupBase(agentId: string | null): Promise<FollowupBase> {
  const { data: enrollments, error } = await supabase
    .from('platform_crm_cadence_enrollments')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const list = enrollments ?? [];
  if (list.length === 0) return { rows: [], executedRuns: [], closures: [] };

  const cadenceIds = Array.from(new Set(list.map((e) => e.cadence_id)));
  const enrollmentIds = list.map((e) => e.id);
  const leadIds = Array.from(new Set(list.map((e) => e.lead_id)));

  const [cadRes, stepsRes, runsRes, leadsRes] = await Promise.all([
    supabase.from('platform_crm_cadences').select('id, name, agent_id').in('id', cadenceIds),
    supabase
      .from('platform_crm_cadence_steps')
      .select('id, cadence_id, order_index, delay_value, delay_unit')
      .in('cadence_id', cadenceIds)
      .order('order_index', { ascending: true }),
    supabase
      .from('platform_crm_cadence_step_runs')
      .select('id, enrollment_id, step_id, status, scheduled_at, executed_at, skip_reason')
      .in('enrollment_id', enrollmentIds)
      .order('scheduled_at', { ascending: true })
      .limit(3000),
    supabase.from('platform_crm_leads').select('id, name, phone').in('id', leadIds),
  ]);

  const cadences = cadRes.data ?? [];
  const steps = stepsRes.data ?? [];
  const runs = runsRes.data ?? [];
  const leads = leadsRes.data ?? [];

  const agentIds = Array.from(new Set(cadences.map((c) => c.agent_id).filter(Boolean))) as string[];
  const { data: agents } = agentIds.length
    ? await supabase.from('platform_crm_agent_configs').select('id, name').in('id', agentIds)
    : { data: [] as any[] };

  const cadenceMap = new Map(cadences.map((c) => [c.id, c]));
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const agentMap = new Map((agents ?? []).map((a: any) => [a.id, a]));
  const stepsByCadence = new Map<string, typeof steps>();
  for (const s of steps) {
    const arr = stepsByCadence.get(s.cadence_id) ?? [];
    arr.push(s);
    stepsByCadence.set(s.cadence_id, arr);
  }
  const stepOrderById = new Map(steps.map((s) => [s.id, s.order_index]));
  const runsByEnrollment = new Map<string, typeof runs>();
  for (const r of runs) {
    const arr = runsByEnrollment.get(r.enrollment_id) ?? [];
    arr.push(r);
    runsByEnrollment.set(r.enrollment_id, arr);
  }

  const rows: PlatformActiveLeadRow[] = [];
  const executedRuns: FollowupBase['executedRuns'] = [];
  const closures: FollowupBase['closures'] = [];

  for (const e of list) {
    const cadence = cadenceMap.get(e.cadence_id);
    if (agentId && cadence?.agent_id !== agentId) continue;

    const eRuns = runsByEnrollment.get(e.id) ?? [];
    const executed = eRuns.filter(isRunExecuted);
    const pending = eRuns.filter(isRunPending);

    const nextFollowupAt =
      pending.length > 0
        ? pending.reduce(
            (min, r) => (r.scheduled_at < min ? r.scheduled_at : min),
            pending[0].scheduled_at,
          )
        : null;
    const lastOutreachAt =
      executed.length > 0
        ? executed.reduce(
            (max, r) => ((r.executed_at ?? '') > max ? (r.executed_at ?? max) : max),
            executed[0].executed_at ?? '',
          ) || null
        : null;

    const cadenceSteps = stepsByCadence.get(e.cadence_id) ?? [];
    const intervals = cadenceSteps.map((s) => delayToMinutes(s.delay_value, s.delay_unit));

    const recovered = e.status === 'stopped' && isReplyReason(e.stop_reason);
    const rulerClosed = e.status === 'completed' || e.status === 'stopped';

    for (const r of executed) {
      executedRuns.push({
        enrollment_id: e.id,
        executed_at: r.executed_at ?? e.updated_at,
        attempt: (stepOrderById.get(r.step_id) ?? 0) + 1,
      });
    }
    if (rulerClosed) {
      closures.push({
        enrollment_id: e.id,
        at: e.stopped_at ?? e.completed_at ?? e.updated_at ?? null,
        recovered,
        attempt: executed.length,
      });
    }

    rows.push({
      id: e.id,
      lead_id: e.lead_id,
      agent_id: cadence?.agent_id ?? null,
      // Paridade com o resolveStatus 1:1 do tenant: recuperado vira 'replied'.
      status: recovered ? 'replied' : e.status,
      followup_enabled: e.status !== 'paused',
      ruler_closed: rulerClosed,
      next_followup_at: nextFollowupAt,
      last_outreach_at: lastOutreachAt,
      last_attempt_executed: executed.length,
      max_followups: cadenceSteps.length || null,
      followup_intervals_minutes: intervals.length ? intervals : null,
      error_message: e.stop_reason ?? null,
      lead: leadMap.get(e.lead_id)
        ? { name: leadMap.get(e.lead_id)!.name, phone: leadMap.get(e.lead_id)!.phone }
        : null,
      agent:
        cadence?.agent_id && agentMap.get(cadence.agent_id)
          ? { name: agentMap.get(cadence.agent_id)!.name }
          : cadence
            ? { name: cadence.name }
            : null,
    });
  }

  return { rows, executedRuns, closures };
}

function useFollowupBase(filters: PlatformFollowupFilters) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'followup', 'base', filters.agentId ?? null],
    queryFn: () => fetchFollowupBase(filters.agentId ?? null),
    refetchInterval: 30_000,
  });
}

/** Resolve a chave de status de uma linha — mesma semântica do tenant. */
export function resolvePlatformFollowupStatusKey(
  r: PlatformActiveLeadRow,
): PlatformFollowupStatusKey {
  if (r.status === 'replied') return 'recovered';
  if (r.ruler_closed && r.error_message === 'cancelled_by_user') return 'cancelled';
  if (r.ruler_closed) return 'closed';
  if (!r.followup_enabled) return 'paused';
  if (r.next_followup_at && new Date(r.next_followup_at) > new Date()) return 'waiting_next';
  return 'waiting_reply';
}

export function usePlatformCrmFollowupStats(filters: PlatformFollowupFilters) {
  const base = useFollowupBase(filters);

  const data = useMemo<PlatformFollowupPanelStats | undefined>(() => {
    if (!base.data) return undefined;
    const { rows, executedRuns, closures } = base.data;

    const now = Date.now();
    const from = new Date(filters.from).getTime();
    const to = new Date(filters.to).getTime();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const activeRows = rows.filter((r) => !r.ruler_closed && r.status !== 'replied');
    const waitingNext = activeRows.filter(
      (r) =>
        r.followup_enabled && r.next_followup_at && new Date(r.next_followup_at).getTime() > now,
    );
    const waitingReply = activeRows.filter(
      (r) =>
        r.followup_enabled && (!r.next_followup_at || new Date(r.next_followup_at).getTime() <= now),
    );
    const paused = activeRows.filter((r) => !r.followup_enabled);

    const sentInPeriod = executedRuns.filter((r) => {
      const t = new Date(r.executed_at).getTime();
      return t >= from && t <= to;
    });
    const sentToday = executedRuns.filter(
      (r) => new Date(r.executed_at).getTime() >= startOfToday.getTime(),
    );
    const recoveredInPeriod = closures.filter((c) => {
      if (!c.recovered) return false;
      const t = c.at ? new Date(c.at).getTime() : 0;
      return t >= from && t <= to;
    });
    const closedInPeriod = closures.filter((c) => {
      if (c.recovered) return false;
      const t = c.at ? new Date(c.at).getTime() : 0;
      return t >= from && t <= to;
    });

    // Recuperação por tentativa (aproximação client-side; o RPC do tenant fazia
    // isso no banco): sent = execuções na tentativa N; replied = réguas
    // recuperadas cuja última tentativa executada foi N.
    const maxAttempt = Math.max(
      1,
      ...executedRuns.map((r) => r.attempt),
      ...closures.map((c) => c.attempt),
    );
    const recoveryByAttempt = Array.from({ length: Math.min(maxAttempt, 5) }, (_, i) => {
      const attempt = i + 1;
      const sent = sentInPeriod.filter((r) => r.attempt === attempt).length;
      const replied = recoveredInPeriod.filter((c) => c.attempt === attempt).length;
      return { attempt, sent, replied, rate: sent > 0 ? Math.round((replied / sent) * 100) : 0 };
    });

    // Tendência de envios — últimos 7 dias.
    const trend: Array<{ day: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 86_400_000;
      const count = executedRuns.filter((r) => {
        const t = new Date(r.executed_at).getTime();
        return t >= dayStart && t < dayEnd;
      }).length;
      trend.push({ day: d.toISOString().slice(0, 10), count });
    }

    // Próximos disparos por janela.
    const buckets = { in_5m: 0, in_15m: 0, in_30m: 0, in_1h: 0, in_2h: 0, after_24h: 0 };
    for (const r of waitingNext) {
      const diffMin = (new Date(r.next_followup_at!).getTime() - now) / 60_000;
      if (diffMin <= 5) buckets.in_5m++;
      else if (diffMin <= 15) buckets.in_15m++;
      else if (diffMin <= 30) buckets.in_30m++;
      else if (diffMin <= 60) buckets.in_1h++;
      else if (diffMin <= 120) buckets.in_2h++;
      else if (diffMin > 1440) buckets.after_24h++;
    }

    return {
      kpis: {
        leads_in_followup: activeRows.length,
        waiting_next: waitingNext.length,
        sent_today: sentToday.length,
        recovered: recoveredInPeriod.length,
        sent_in_period: sentInPeriod.length,
        rulers_closed: closedInPeriod.length,
      },
      recovery_by_attempt: recoveryByAttempt,
      sent_trend_7d: trend,
      active_status_breakdown: {
        waiting_next: waitingNext.length,
        waiting_reply: waitingReply.length,
        paused: paused.length,
        others: Math.max(
          0,
          activeRows.length - waitingNext.length - waitingReply.length - paused.length,
        ),
      },
      upcoming_buckets: buckets,
    };
  }, [base.data, filters.from, filters.to]);

  return { data, isLoading: base.isLoading };
}

export function usePlatformCrmFollowupActiveLeads(filters: PlatformFollowupFilters) {
  const base = useFollowupBase(filters);

  const data = useMemo<PlatformActiveLeadRow[]>(() => {
    const rows = base.data?.rows ?? [];
    const status = filters.status ?? 'all';
    const filtered =
      status === 'all'
        ? rows.filter((r) => !r.ruler_closed)
        : rows.filter((r) => resolvePlatformFollowupStatusKey(r) === status);
    return [...filtered]
      .sort((a, b) => {
        if (!a.next_followup_at) return 1;
        if (!b.next_followup_at) return -1;
        return a.next_followup_at.localeCompare(b.next_followup_at);
      })
      .slice(0, 100);
  }, [base.data, filters.status]);

  return { data, isLoading: base.isLoading };
}

export function usePlatformCrmFollowupRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel('platform-crm-followup-panel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_cadence_enrollments' },
        () => qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'followup'] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_cadence_step_runs' },
        () => qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'followup'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

export function usePlatformCrmFollowupActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'followup'] });
  };

  const pause = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_cadence_enrollments')
        .update({ status: 'paused' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Follow-up pausado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao pausar'),
  });

  const resume = useMutation({
    mutationFn: async (row: PlatformActiveLeadRow) => {
      // TODO(edge): o runner de cadências recalculará o próximo disparo; aqui
      // apenas reativamos a régua (os step_runs pendentes mantêm o scheduled_at).
      const { error } = await supabase
        .from('platform_crm_cadence_enrollments')
        .update({ status: 'active' })
        .eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Follow-up retomado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao retomar'),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_cadence_enrollments')
        .update({
          status: 'stopped',
          stop_reason: 'cancelled_by_user',
          stopped_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Follow-up cancelado');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao cancelar'),
  });

  return { pause, resume, cancel };
}
