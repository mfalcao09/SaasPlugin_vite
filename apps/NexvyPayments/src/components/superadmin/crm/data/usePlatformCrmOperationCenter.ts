import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * CRM de PLATAFORMA (super_admin) — Central de Operação / Dashboard.
 * Port 1:1 do `useOperationCenter` do CRM Vendus, apontando para as tabelas
 * `platform_crm_*` e SEM organization_id / product_id (a RLS super_admin-only
 * isola os dados). Toda a Central é AGREGAÇÃO/LEITURA.
 *
 * Mapeamento de tabelas (tenant → plataforma):
 *   webchat_conversations   → platform_crm_conversations
 *   leads                   → platform_crm_leads
 *   tasks                   → platform_crm_tasks
 *   cadence_enrollments     → platform_crm_cadence_enrollments
 *   cadence_step_runs       → platform_crm_cadence_step_runs
 *   deals                   → platform_crm_deals
 *
 * TODO(migration): agenda/reuniões (calendar_events), mensagens agendadas
 * (scheduled_messages) e presença de atendentes (user_status) NÃO possuem
 * equivalente `platform_crm_*`. As métricas correspondentes retornam 0 e a UI
 * fica inerte até essas tabelas existirem. Nada quebra.
 */

const PLATFORM_CRM_KEY = 'platform-crm';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

// platform_crm_conversations não tem `assigned_user_id`; o atendente ativo é
// `current_agent_id`. `stale` = sem mensagem há +15 min.
const STALE = () => hoursAgo(0.25);

export interface HealthKpis {
  openConversations: number;
  unanswered: number;
  hotLeads: number;
  hotNeedAction: number;
  todayAgenda: number;
  todayMeetings: number;
  overdueActivities: number;
  scheduledMessagesToday: number;
  onlineAttendants: number;
  attendingNow: number;
}

export interface OperationPriorities {
  unansweredConversations: number;
  hotLeadsUnassigned: number;
  meetingsStartingSoon: number;
  /** @deprecated use meetingsStartingSoon */
  pendingMeetings: number;
  overdueTasks: number;
  scheduledMessagesToday: number;
}

export interface SellerPerformance {
  userId: string;
  name: string;
  avatarUrl: string | null;
  conversations: number;
  unansweredConversations: number;
  leads: number;
  overdue: number;
  meetingsToday: number;
  status: 'healthy' | 'attention' | 'critical';
}

export interface RealtimeOps {
  conversations: {
    withAI: number;
    inAttendance: number;
    humanQueue: number;
    resolvedToday: number;
  };
  cadences: {
    activeEnrollments: number;
    executedToday: number;
    responded: number;
    paused: number;
  };
  agenda: {
    todayMeetings: number;
    confirmed: number;
    pending: number;
  };
}

export interface LeadAtRisk {
  id: string;
  name: string;
  assignedName: string | null;
  reason: string;
  lastActionAt: string | null;
}

export interface RadarInsight {
  id: string;
  icon: 'fire' | 'warn' | 'money' | 'calendar' | 'users';
  title: string;
  hint: string;
  navigateTo?: string;
}

// ============ KPIs Linha 1 ============
export function useHealthKpis() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'op-health-kpis'],
    staleTime: 30_000,
    queryFn: async (): Promise<HealthKpis> => {
      const stale = STALE();
      const now = new Date().toISOString();

      const [openConvs, unanswered, hot, hotUnassigned, overdueTasks, attending] =
        await Promise.all([
          supabase.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
            .in('status', ['bot_active', 'human_active', 'waiting_human']),
          supabase.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
            .in('status', ['waiting_human', 'human_active']).lt('last_message_at', stale),
          supabase.from('platform_crm_leads').select('id', { count: 'exact', head: true })
            .eq('temperature', 'hot'),
          supabase.from('platform_crm_leads').select('id', { count: 'exact', head: true })
            .eq('temperature', 'hot').is('assigned_to', null),
          supabase.from('platform_crm_tasks').select('id', { count: 'exact', head: true })
            .lt('due_date', now).neq('status', 'completed'),
          supabase.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
            .eq('status', 'human_active'),
        ]);

      return {
        openConversations: openConvs.count ?? 0,
        unanswered: unanswered.count ?? 0,
        hotLeads: hot.count ?? 0,
        hotNeedAction: hotUnassigned.count ?? 0,
        // TODO(migration): sem platform_crm_calendar_events → agenda/reuniões = 0
        todayAgenda: 0,
        todayMeetings: 0,
        overdueActivities: overdueTasks.count ?? 0,
        // TODO(migration): sem platform_crm_scheduled_messages → 0
        scheduledMessagesToday: 0,
        // TODO(migration): sem platform_crm_user_status → presença = 0
        onlineAttendants: 0,
        attendingNow: attending.count ?? 0,
      };
    },
  });
}

// ============ Linha 2: Prioridades ============
export function useOperationPriorities() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'op-priorities'],
    staleTime: 30_000,
    queryFn: async (): Promise<OperationPriorities> => {
      const stale = STALE();
      const now = new Date().toISOString();

      const [unanswered, hotUnassigned, overdue] = await Promise.all([
        supabase.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
          .in('status', ['waiting_human', 'human_active']).lt('last_message_at', stale),
        supabase.from('platform_crm_leads').select('id', { count: 'exact', head: true })
          .eq('temperature', 'hot').is('assigned_to', null),
        supabase.from('platform_crm_tasks').select('id', { count: 'exact', head: true })
          .lt('due_date', now).neq('status', 'completed'),
      ]);

      return {
        unansweredConversations: unanswered.count ?? 0,
        hotLeadsUnassigned: hotUnassigned.count ?? 0,
        // TODO(migration): sem platform_crm_calendar_events → 0
        meetingsStartingSoon: 0,
        pendingMeetings: 0,
        overdueTasks: overdue.count ?? 0,
        // TODO(migration): sem platform_crm_scheduled_messages → 0
        scheduledMessagesToday: 0,
      };
    },
  });
}

// ============ Linha 3: Performance da Equipe ============
export function useTeamPerformance() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'op-team-performance'],
    staleTime: 60_000,
    queryFn: async (): Promise<SellerPerformance[]> => {
      const stale = STALE();
      const now = new Date().toISOString();

      // 1. Universo de reps de venda da plataforma = membros de squads.
      //    (mesmo universo do usePlatformCrmTeam/usePlatformCrmSellers)
      const { data: squadMembers } = await supabase
        .from('platform_crm_squad_members')
        .select('user_id');

      const sellerIds = [
        ...new Set((squadMembers ?? []).map((m) => m.user_id).filter(Boolean)),
      ] as string[];
      if (sellerIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', sellerIds);

      // 2. Agregações em paralelo (só platform_crm_*)
      const [convsRes, unansRes, leadsRes, tasksRes] = await Promise.all([
        supabase.from('platform_crm_conversations').select('current_agent_id')
          .in('status', ['human_active', 'waiting_human']).not('current_agent_id', 'is', null),
        supabase.from('platform_crm_conversations').select('current_agent_id')
          .in('status', ['human_active', 'waiting_human']).lt('last_message_at', stale)
          .not('current_agent_id', 'is', null),
        supabase.from('platform_crm_leads').select('assigned_to')
          .not('assigned_to', 'is', null),
        supabase.from('platform_crm_tasks').select('user_id')
          .lt('due_date', now).neq('status', 'completed'),
      ]);

      const tally = (rows: Array<Record<string, unknown>> | null | undefined, key: string) => {
        const map = new Map<string, number>();
        (rows ?? []).forEach((r) => {
          const k = r?.[key] as string | undefined;
          if (!k) return;
          map.set(k, (map.get(k) ?? 0) + 1);
        });
        return map;
      };

      const convMap = tally(convsRes.data, 'current_agent_id');
      const unansMap = tally(unansRes.data, 'current_agent_id');
      const leadMap = tally(leadsRes.data, 'assigned_to');
      const taskMap = tally(tasksRes.data, 'user_id');

      const result: SellerPerformance[] = (profiles ?? []).map((p) => {
        const overdue = taskMap.get(p.id) ?? 0;
        const unanswered = unansMap.get(p.id) ?? 0;
        let status: SellerPerformance['status'] = 'healthy';
        if (overdue >= 5 || unanswered >= 10) status = 'critical';
        else if (overdue >= 2 || unanswered >= 5) status = 'attention';
        return {
          userId: p.id,
          name: p.full_name || 'Sem nome',
          avatarUrl: p.avatar_url,
          conversations: convMap.get(p.id) ?? 0,
          unansweredConversations: unanswered,
          leads: leadMap.get(p.id) ?? 0,
          overdue,
          // TODO(migration): sem platform_crm_calendar_events → reuniões/dia = 0
          meetingsToday: 0,
          status,
        };
      });

      // Mostra quem tem atividade primeiro
      return result.sort(
        (a, b) =>
          b.conversations + b.leads + b.overdue + b.meetingsToday -
          (a.conversations + a.leads + a.overdue + a.meetingsToday),
      );
    },
  });
}

// ============ Linha 4: Operação em Tempo Real ============
export function useRealtimeOps() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'op-realtime'],
    staleTime: 30_000,
    queryFn: async (): Promise<RealtimeOps> => {
      const today = startOfToday();

      const [withAI, inAttendance, humanQueue, resolvedToday, activeEnroll, execToday, responded, paused] =
        await Promise.all([
          supabase.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
            .eq('status', 'bot_active'),
          supabase.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
            .eq('status', 'human_active'),
          supabase.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
            .eq('status', 'waiting_human').is('current_agent_id', null),
          // platform_crm_conversations não tem closed_at → usa updated_at do dia
          supabase.from('platform_crm_conversations').select('id', { count: 'exact', head: true })
            .eq('status', 'closed').gte('updated_at', today),
          supabase.from('platform_crm_cadence_enrollments').select('id', { count: 'exact', head: true })
            .eq('status', 'active'),
          supabase.from('platform_crm_cadence_step_runs').select('id', { count: 'exact', head: true })
            .gte('executed_at', today),
          supabase.from('platform_crm_cadence_enrollments').select('id', { count: 'exact', head: true })
            .eq('stop_reason', 'response').gte('updated_at', today),
          supabase.from('platform_crm_cadence_enrollments').select('id', { count: 'exact', head: true })
            .eq('status', 'paused'),
        ]);

      return {
        conversations: {
          withAI: withAI.count ?? 0,
          inAttendance: inAttendance.count ?? 0,
          humanQueue: humanQueue.count ?? 0,
          resolvedToday: resolvedToday.count ?? 0,
        },
        cadences: {
          activeEnrollments: activeEnroll.count ?? 0,
          executedToday: execToday.count ?? 0,
          responded: responded.count ?? 0,
          paused: paused.count ?? 0,
        },
        agenda: {
          // TODO(migration): sem platform_crm_calendar_events → agenda = 0
          todayMeetings: 0,
          confirmed: 0,
          pending: 0,
        },
      };
    },
  });
}

// ============ Linha 5: Leads em Risco ============
export function useLeadsAtRisk() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'op-leads-at-risk'],
    staleTime: 60_000,
    queryFn: async (): Promise<LeadAtRisk[]> => {
      const fourDays = daysAgo(4);

      // Leads não fechados com last_contact_at antigo
      const { data } = await supabase
        .from('platform_crm_leads')
        .select('id, name, last_contact_at, assigned_to, temperature')
        .not('assigned_to', 'is', null)
        .lt('last_contact_at', fourDays)
        .order('last_contact_at', { ascending: true })
        .limit(8);

      const rows = data ?? [];

      // Resolve nome do responsável via profiles (join separado — platform_crm_leads
      // não tem FK nomeada para profiles).
      const assignedIds = [
        ...new Set(rows.map((l) => l.assigned_to).filter(Boolean)),
      ] as string[];
      let nameMap = new Map<string, string>();
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', assignedIds);
        nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '']));
      }

      return rows.map((l) => ({
        id: l.id,
        name: l.name || 'Sem nome',
        assignedName: l.assigned_to ? nameMap.get(l.assigned_to) || null : null,
        reason: l.temperature === 'hot' ? 'Lead quente sem contato' : 'Sem contato há +4 dias',
        lastActionAt: l.last_contact_at,
      }));
    },
  });
}

// ============ Linha 6: Radar IA ============
export function useAIRadarInsights() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'op-radar-insights'],
    staleTime: 60_000,
    queryFn: async (): Promise<RadarInsight[]> => {
      const sevenDays = daysAgo(7);
      const now = new Date().toISOString();
      const yesterday = hoursAgo(24);

      const [topOverdueSeller, hotUnassigned, stalled, recentDeals] = await Promise.all([
        supabase.from('platform_crm_tasks').select('user_id')
          .lt('due_date', now).neq('status', 'completed'),
        supabase.from('platform_crm_leads').select('id', { count: 'exact', head: true })
          .is('assigned_to', null),
        supabase.from('platform_crm_leads').select('id', { count: 'exact', head: true })
          .lt('updated_at', sevenDays).not('current_stage_id', 'is', null),
        supabase.from('platform_crm_deals').select('id', { count: 'exact', head: true })
          .gte('created_at', yesterday),
      ]);

      // Vendedor com mais follow-ups atrasados
      const overdueMap = new Map<string, number>();
      (topOverdueSeller.data ?? []).forEach((t) => {
        if (!t.user_id) return;
        overdueMap.set(t.user_id, (overdueMap.get(t.user_id) ?? 0) + 1);
      });
      let topSellerName = '';
      let topCount = 0;
      if (overdueMap.size > 0) {
        const [topId, count] = [...overdueMap.entries()].sort((a, b) => b[1] - a[1])[0];
        topCount = count;
        const { data: p } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', topId)
          .maybeSingle();
        topSellerName = p?.full_name ?? 'Vendedor';
      }

      const insights: RadarInsight[] = [];
      if (topCount > 0) {
        insights.push({
          id: 'top-overdue',
          icon: 'fire',
          title: `${topSellerName} possui ${topCount} follow-ups atrasados`,
          hint: 'Prioridade alta',
          navigateTo: 'team',
        });
      }
      const unassignedCount = hotUnassigned.count ?? 0;
      if (unassignedCount > 0) {
        insights.push({
          id: 'unassigned',
          icon: 'users',
          title: `Existem ${unassignedCount} leads sem responsável`,
          hint: 'Atribua responsáveis',
          navigateTo: 'leads',
        });
      }
      const stalledCount = stalled.count ?? 0;
      if (stalledCount > 0) {
        insights.push({
          id: 'stalled',
          icon: 'warn',
          title: `${stalledCount} oportunidades paradas há mais de 7 dias`,
          hint: 'Risco de perda',
          navigateTo: 'pipeline',
        });
      }
      const recentCount = recentDeals.count ?? 0;
      if (recentCount > 0) {
        insights.push({
          id: 'recent-deals',
          icon: 'money',
          title: `${recentCount} propostas abertas nas últimas 24h`,
          hint: 'Acompanhe agora',
          navigateTo: 'pipeline',
        });
      }
      // TODO(migration): "reuniões em <60min" dependia de calendar_events (sem
      // equivalente platform_crm_*) → insight omitido.
      return insights;
    },
  });
}
