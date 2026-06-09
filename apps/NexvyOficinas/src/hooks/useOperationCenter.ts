import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const startOfYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

export interface OperationKpis {
  newLeadsToday: number;
  newLeadsDelta: number;
  openConversations: number;
  unansweredConversations: number;
  hotLeads: number;
  hotLeadsNeedingAction: number;
  todayAgenda: number;
  upcomingSoon: number;
}

export interface OperationPriorities {
  unansweredConversations: number;
  hotLeadsUnassigned: number;
  pendingMeetings: number;
  overdueTasks: number;
}

export interface AgendaItem {
  id: string;
  type: 'meeting' | 'task' | 'call';
  time: string;
  title: string;
  subtitle: string;
}

export interface RecentLead {
  id: string;
  name: string;
  company: string | null;
  channel: string | null;
  interest: string | null;
  assignedName: string | null;
  temperature: string | null;
  nextAction: string | null;
  nextActionTime: string | null;
}

export function useOperationKpis() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['operation-kpis', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<OperationKpis> => {
      const today = startOfToday();
      const yesterday = startOfYesterday();
      const eod = endOfToday();
      const stale = new Date(Date.now() - 15 * 60_000).toISOString();

      const [
        leadsToday,
        leadsYesterday,
        openConvs,
        unanswered,
        hot,
        hotUnassigned,
        agendaToday,
        agendaSoon,
      ] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('created_at', today),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('created_at', yesterday).lt('created_at', today),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).in('status', ['bot_active', 'human_active', 'waiting_human']),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).in('status', ['waiting_human', 'human_active'])
          .lt('last_message_at', stale),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('temperature', 'hot'),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('temperature', 'hot').is('assigned_to', null),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('start_time', today).lte('start_time', eod),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('start_time', new Date().toISOString())
          .lte('start_time', new Date(Date.now() + 30 * 60_000).toISOString()),
      ]);

      const a = leadsToday.count ?? 0;
      const b = leadsYesterday.count ?? 0;
      const delta = b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 100);

      return {
        newLeadsToday: a,
        newLeadsDelta: delta,
        openConversations: openConvs.count ?? 0,
        unansweredConversations: unanswered.count ?? 0,
        hotLeads: hot.count ?? 0,
        hotLeadsNeedingAction: hotUnassigned.count ?? 0,
        todayAgenda: agendaToday.count ?? 0,
        upcomingSoon: agendaSoon.count ?? 0,
      };
    },
  });
}

export function useOperationPriorities() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['operation-priorities', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<OperationPriorities> => {
      const stale = new Date(Date.now() - 15 * 60_000).toISOString();
      const today = startOfToday();
      const eod = endOfToday();
      const now = new Date().toISOString();

      const [unanswered, hotUnassigned, pendingMeetings, overdueTasks] = await Promise.all([
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).in('status', ['waiting_human', 'human_active'])
          .lt('last_message_at', stale),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('temperature', 'hot').is('assigned_to', null),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('start_time', today).lte('start_time', eod)
          .in('status', ['pending', 'scheduled']),
        supabase.from('tasks').select('id', { count: 'exact', head: true })
          .lt('due_date', now).neq('status', 'completed'),
      ]);

      return {
        unansweredConversations: unanswered.count ?? 0,
        hotLeadsUnassigned: hotUnassigned.count ?? 0,
        pendingMeetings: pendingMeetings.count ?? 0,
        overdueTasks: overdueTasks.count ?? 0,
      };
    },
  });
}

export function useTodayAgenda() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['operation-agenda-today', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<AgendaItem[]> => {
      const today = startOfToday();
      const eod = endOfToday();

      const [eventsRes, tasksRes] = await Promise.all([
        supabase.from('calendar_events')
          .select('id, title, start_time, lead_id, leads:leads(name)')
          .eq('organization_id', orgId)
          .gte('start_time', today).lte('start_time', eod)
          .order('start_time', { ascending: true })
          .limit(6),
        supabase.from('tasks')
          .select('id, title, due_date, lead_id, leads:leads(name, organization_id)')
          .gte('due_date', today).lte('due_date', eod)
          .neq('status', 'completed')
          .order('due_date', { ascending: true })
          .limit(6),
      ]);

      const events: AgendaItem[] = (eventsRes.data ?? []).map((e: any) => ({
        id: `evt-${e.id}`,
        type: 'meeting',
        time: e.start_time,
        title: e.title || 'Reunião',
        subtitle: e.leads?.name ? `Com ${e.leads.name}` : '',
      }));

      const tasks: AgendaItem[] = (tasksRes.data ?? [])
        .filter((t: any) => !t.leads || t.leads.organization_id === orgId)
        .map((t: any) => ({
          id: `tsk-${t.id}`,
          type: 'task',
          time: t.due_date,
          title: t.title || 'Tarefa',
          subtitle: t.leads?.name ? `Lead: ${t.leads.name}` : 'Tarefa',
        }));

      return [...events, ...tasks]
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
        .slice(0, 4);
    },
  });
}

export function useRecentLeads() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['operation-recent-leads', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<RecentLead[]> => {
      const { data } = await supabase
        .from('leads')
        .select('id, name, company, source, temperature, assigned_to, created_at, profiles:profiles!leads_assigned_to_fkey(full_name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(6);

      return (data ?? []).map((l: any) => ({
        id: l.id,
        name: l.name || 'Sem nome',
        company: l.company,
        channel: l.source,
        interest: null,
        assignedName: l.profiles?.full_name ?? null,
        temperature: l.temperature,
        nextAction: null,
        nextActionTime: null,
      }));
    },
  });
}
