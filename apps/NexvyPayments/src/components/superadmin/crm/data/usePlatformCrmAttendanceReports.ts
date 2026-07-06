import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * RELATÓRIOS de Atendimento do CRM de PLATAFORMA (super_admin).
 * PORTE 1:1 de `hooks/useAttendanceReports.ts` + `lib/attendanceInsights.ts`
 * do CRM Vendus — mesmos KPIs/breakdowns/insights, todos calculados
 * CLIENT-SIDE (como o original), trocando a fonte:
 *   - webchat_conversations → platform_crm_conversations
 *   - deals                 → platform_crm_deals
 *   - profiles via FK       → profiles buscados por .in('id', ...)
 *
 * Adaptações de schema documentadas:
 *   - `assigned_user_id`  → `assigned_to`
 *   - `first_response_at` NÃO existe na tabela platform → usamos `accepted_at`
 *     (momento do aceite humano) como proxy do tempo de 1ª resposta.
 *   - `product_id` NÃO existe (plataforma vende 1 SaaS) → filtro de produto
 *     removido do contrato (desacoplamento).
 * DESACOPLAMENTO: zero organization_id / sector de tenant.
 */

export type PlatformReportsPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'custom';
export type PlatformReportsChannel =
  | 'all'
  | 'whatsapp'
  | 'webchat'
  | 'instagram'
  | 'facebook'
  | 'form'
  | 'quiz';

export interface PlatformReportsFilters {
  period: PlatformReportsPeriod;
  customFrom?: string; // ISO date
  customTo?: string;
  channel?: PlatformReportsChannel;
  userId?: string | null;
  agentId?: string | null;
}

export interface PlatformReportsRange {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

export function resolvePlatformReportsRange(filters: PlatformReportsFilters): PlatformReportsRange {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  let from: Date;
  let to: Date;
  switch (filters.period) {
    case 'today':
      from = startOfDay(now);
      to = endOfDay(now);
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = startOfDay(y);
      to = endOfDay(y);
      break;
    }
    case '7d':
      from = startOfDay(new Date(now.getTime() - 6 * 86400000));
      to = endOfDay(now);
      break;
    case 'custom':
      from = filters.customFrom
        ? startOfDay(new Date(filters.customFrom))
        : startOfDay(new Date(now.getTime() - 29 * 86400000));
      to = filters.customTo ? endOfDay(new Date(filters.customTo)) : endOfDay(now);
      break;
    case '30d':
    default:
      from = startOfDay(new Date(now.getTime() - 29 * 86400000));
      to = endOfDay(now);
  }
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from, to, prevFrom, prevTo };
}

type ConvRow = {
  id: string;
  status: 'bot_active' | 'waiting_human' | 'human_active' | 'closed';
  channel: string;
  assigned_to: string | null;
  current_agent_id: string | null;
  visitor_name: string | null;
  visitor_phone: string | null;
  lead_id: string | null;
  accepted_at: string | null; // proxy de first_response_at
  last_message_at: string | null;
  created_at: string;
  profile?: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

type DealRow = {
  id: string;
  lead_id: string | null;
  seller_id: string | null;
  deal_value: number | null;
  status: string | null;
  closed_at: string | null;
};

export interface PlatformKpiDelta {
  current: number;
  previous: number;
  pct: number | null; // null = sem comparação
}

export interface PlatformTeamRankingRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  conversations: number;
  avgResponseMs: number | null;
  conversions: number;
}

export interface PlatformChannelStatRow {
  channel: string;
  conversations: number;
  conversions: number;
  pct: number;
}

export interface PlatformRiskLeadRow {
  conversationId: string;
  leadName: string;
  channel: string;
  idleMinutes: number;
  responsible: string;
}

export interface PlatformAttendanceReportsData {
  isLoading: boolean;
  totalConversations: PlatformKpiDelta;
  activeConversations: PlatformKpiDelta;
  waiting: PlatformKpiDelta;
  avgResponseMs: PlatformKpiDelta;
  aiResolutionPct: PlatformKpiDelta;
  conversions: PlatformKpiDelta;
  risks: PlatformKpiDelta;
  statusBreakdown: {
    key: string;
    label: string;
    value: number;
    pct: number;
    tone: 'primary' | 'amber' | 'success' | 'muted';
  }[];
  team: PlatformTeamRankingRow[];
  channels: PlatformChannelStatRow[];
  riskList: PlatformRiskLeadRow[];
}

async function fetchConversations(
  from: Date,
  to: Date,
  filters: PlatformReportsFilters,
): Promise<ConvRow[]> {
  let q = supabase
    .from('platform_crm_conversations')
    .select(
      'id,status,channel,assigned_to,current_agent_id,visitor_name,visitor_phone,lead_id,accepted_at,last_message_at,created_at',
    )
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at', { ascending: false })
    .limit(1500);
  if (filters.channel && filters.channel !== 'all') q = q.eq('channel', filters.channel);
  if (filters.userId) q = q.eq('assigned_to', filters.userId);
  if (filters.agentId) q = q.eq('current_agent_id', filters.agentId);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as unknown as ConvRow[];

  // Enriquecimento com o nome/avatar do atendente (o tenant usava FK embed).
  const userIds = Array.from(new Set(rows.map((r) => r.assigned_to).filter(Boolean))) as string[];
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds);
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    for (const r of rows) {
      r.profile = r.assigned_to ? (map.get(r.assigned_to) ?? null) : null;
    }
  }
  return rows;
}

async function fetchDeals(
  from: Date,
  to: Date,
  filters: PlatformReportsFilters,
): Promise<DealRow[]> {
  let q = supabase
    .from('platform_crm_deals')
    .select('id,lead_id,seller_id,deal_value,status,closed_at')
    .eq('status', 'won')
    .gte('closed_at', from.toISOString())
    .lte('closed_at', to.toISOString())
    .limit(2000);
  if (filters.userId) q = q.eq('seller_id', filters.userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as DealRow[];
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function computeMetrics(convs: ConvRow[], deals: DealRow[]) {
  const total = convs.length;
  const active = convs.filter(
    (c) => c.status === 'bot_active' || c.status === 'waiting_human' || c.status === 'human_active',
  ).length;
  const waiting = convs.filter((c) => c.status === 'waiting_human').length;
  const closed = convs.filter((c) => c.status === 'closed').length;
  const withResp = convs.filter((c) => c.accepted_at && c.created_at);
  const avgResponseMs =
    withResp.length > 0
      ? withResp.reduce(
          (s, c) => s + (new Date(c.accepted_at!).getTime() - new Date(c.created_at).getTime()),
          0,
        ) / withResp.length
      : 0;
  const closedByAI = convs.filter(
    (c) => c.status === 'closed' && !c.assigned_to && c.current_agent_id,
  ).length;
  const aiPct = closed > 0 ? Math.round((closedByAI / closed) * 100) : 0;

  const now = Date.now();
  const riskList: ConvRow[] = convs.filter((c) => {
    if (c.status === 'closed') return false;
    if (c.status === 'human_active') return false;
    const last = c.last_message_at
      ? new Date(c.last_message_at).getTime()
      : new Date(c.created_at).getTime();
    return now - last > 30 * 60 * 1000;
  });

  return {
    total,
    active,
    waiting,
    closed,
    avgResponseMs,
    aiPct,
    conversions: deals.length,
    risks: riskList.length,
    riskList,
  };
}

export function usePlatformCrmAttendanceReports(
  filters: PlatformReportsFilters,
): PlatformAttendanceReportsData {
  const range = useMemo(
    () => resolvePlatformReportsRange(filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.period, filters.customFrom, filters.customTo],
  );

  const key = [
    'platform-crm',
    'attendance-reports',
    filters.period,
    filters.customFrom,
    filters.customTo,
    filters.channel,
    filters.userId,
    filters.agentId,
  ];

  const current = useQuery({
    queryKey: [...key, 'current'],
    queryFn: async () => {
      const [convs, deals] = await Promise.all([
        fetchConversations(range.from, range.to, filters),
        fetchDeals(range.from, range.to, filters),
      ]);
      return { convs, deals };
    },
    staleTime: 60_000,
  });

  const previous = useQuery({
    queryKey: [...key, 'previous'],
    queryFn: async () => {
      const [convs, deals] = await Promise.all([
        fetchConversations(range.prevFrom, range.prevTo, filters),
        fetchDeals(range.prevFrom, range.prevTo, filters),
      ]);
      return { convs, deals };
    },
    staleTime: 60_000,
  });

  return useMemo<PlatformAttendanceReportsData>(() => {
    const c = current.data ?? { convs: [], deals: [] };
    const p = previous.data ?? { convs: [], deals: [] };
    const cm = computeMetrics(c.convs, c.deals);
    const pm = computeMetrics(p.convs, p.deals);

    // Status breakdown
    const buckets = [
      { key: 'bot_active', label: 'Com IA', tone: 'primary' as const },
      { key: 'waiting_human', label: 'Aguardando Humano', tone: 'amber' as const },
      { key: 'human_active', label: 'Em Atendimento', tone: 'success' as const },
      { key: 'closed', label: 'Fechadas', tone: 'muted' as const },
    ];
    const statusBreakdown = buckets.map((b) => {
      const value = c.convs.filter((x) => x.status === b.key).length;
      return { ...b, value, pct: cm.total > 0 ? Math.round((value / cm.total) * 100) : 0 };
    });

    // Team ranking
    const byUser = new Map<string, PlatformTeamRankingRow>();
    for (const cv of c.convs) {
      if (!cv.assigned_to) continue;
      const row = byUser.get(cv.assigned_to) ?? {
        userId: cv.assigned_to,
        name: cv.profile?.full_name ?? 'Sem nome',
        avatarUrl: cv.profile?.avatar_url ?? null,
        conversations: 0,
        avgResponseMs: null,
        conversions: 0,
      };
      row.conversations += 1;
      if (cv.accepted_at) {
        const dt = new Date(cv.accepted_at).getTime() - new Date(cv.created_at).getTime();
        row.avgResponseMs = row.avgResponseMs == null ? dt : (row.avgResponseMs + dt) / 2;
      }
      byUser.set(cv.assigned_to, row);
    }
    for (const d of c.deals) {
      if (!d.seller_id) continue;
      const row = byUser.get(d.seller_id) ?? {
        userId: d.seller_id,
        name: 'Vendedor',
        avatarUrl: null,
        conversations: 0,
        avgResponseMs: null,
        conversions: 0,
      };
      row.conversions += 1;
      byUser.set(d.seller_id, row);
    }
    const team = Array.from(byUser.values())
      .sort((a, b) => b.conversions - a.conversions || b.conversations - a.conversations)
      .slice(0, 8);

    // Channels — conversões = deals cujo lead aparece numa conversa daquele canal
    const leadsByChannel = new Map<string, Set<string>>();
    for (const cv of c.convs) {
      if (!cv.lead_id) continue;
      const s = leadsByChannel.get(cv.channel) ?? new Set<string>();
      s.add(cv.lead_id);
      leadsByChannel.set(cv.channel, s);
    }
    const knownChannels = ['whatsapp', 'webchat', 'instagram', 'facebook'];
    const channelsSet = new Set<string>([...knownChannels, ...c.convs.map((x) => x.channel)]);
    const channels: PlatformChannelStatRow[] = Array.from(channelsSet)
      .map((ch) => {
        const conversations = c.convs.filter((x) => x.channel === ch).length;
        const leadIds = leadsByChannel.get(ch) ?? new Set();
        const conversions = c.deals.filter((d) => d.lead_id && leadIds.has(d.lead_id)).length;
        const pct = cm.total > 0 ? Math.round((conversations / cm.total) * 100) : 0;
        return { channel: ch, conversations, conversions, pct };
      })
      .sort((a, b) => b.conversations - a.conversations);

    // Risk list (até 25)
    const userMap = new Map(team.map((t) => [t.userId, t.name]));
    const riskList: PlatformRiskLeadRow[] = cm.riskList.slice(0, 25).map((cv) => {
      const last = cv.last_message_at
        ? new Date(cv.last_message_at).getTime()
        : new Date(cv.created_at).getTime();
      return {
        conversationId: cv.id,
        leadName: cv.visitor_name || cv.visitor_phone || 'Visitante anônimo',
        channel: cv.channel,
        idleMinutes: Math.round((Date.now() - last) / 60000),
        responsible: cv.assigned_to
          ? cv.profile?.full_name || userMap.get(cv.assigned_to) || 'Atribuído'
          : 'Sem responsável',
      };
    });

    const isLoading = current.isLoading || previous.isLoading;

    return {
      isLoading,
      totalConversations: {
        current: cm.total,
        previous: pm.total,
        pct: pctDelta(cm.total, pm.total),
      },
      activeConversations: {
        current: cm.active,
        previous: pm.active,
        pct: pctDelta(cm.active, pm.active),
      },
      waiting: { current: cm.waiting, previous: pm.waiting, pct: pctDelta(cm.waiting, pm.waiting) },
      avgResponseMs: {
        current: cm.avgResponseMs,
        previous: pm.avgResponseMs,
        pct: pctDelta(cm.avgResponseMs, pm.avgResponseMs),
      },
      aiResolutionPct: { current: cm.aiPct, previous: pm.aiPct, pct: pctDelta(cm.aiPct, pm.aiPct) },
      conversions: {
        current: cm.conversions,
        previous: pm.conversions,
        pct: pctDelta(cm.conversions, pm.conversions),
      },
      risks: { current: cm.risks, previous: pm.risks, pct: pctDelta(cm.risks, pm.risks) },
      statusBreakdown,
      team,
      channels,
      riskList,
    };
  }, [current.data, previous.data, current.isLoading, previous.isLoading]);
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '--';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function channelLabel(ch: string): string {
  switch (ch) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'webchat':
    case 'web_chat':
      return 'Chat do Site';
    case 'instagram':
      return 'Instagram';
    case 'facebook':
      return 'Facebook';
    case 'form':
      return 'Formulário';
    case 'quiz':
      return 'Quiz';
    default:
      return ch;
  }
}

/* ------------------------------------------------------------------ */
/* Insights inteligentes — porte 1:1 de `lib/attendanceInsights.ts`.  */
/* ------------------------------------------------------------------ */

export type PlatformAlertSeverity = 'danger' | 'warning' | 'success';

export interface PlatformInsight {
  id: string;
  emoji: string;
  text: string;
  severity: PlatformAlertSeverity;
}

const sevOrder: Record<PlatformAlertSeverity, number> = { danger: 0, warning: 1, success: 2 };

export function buildPlatformInsights(data: PlatformAttendanceReportsData): PlatformInsight[] {
  const out: PlatformInsight[] = [];

  if (data.risks.current > 0) {
    out.push({
      id: 'risk',
      emoji: '🚨',
      severity: 'danger',
      text: `${data.risks.current} ${data.risks.current === 1 ? 'lead aguarda' : 'leads aguardam'} resposta há mais de 30 minutos.`,
    });
  }

  if (
    data.avgResponseMs.pct != null &&
    data.avgResponseMs.pct > 15 &&
    data.avgResponseMs.current > 0
  ) {
    out.push({
      id: 'slower',
      emoji: '⚠️',
      severity: 'warning',
      text: `O tempo médio de resposta aumentou ${Math.abs(Math.round(data.avgResponseMs.pct))}% — agora está em ${formatDuration(data.avgResponseMs.current)}.`,
    });
  }

  // Canal líder em conversões
  const totalConvFromChannels = data.channels.reduce((s, c) => s + c.conversions, 0);
  if (totalConvFromChannels > 0) {
    const leader = [...data.channels].sort((a, b) => b.conversions - a.conversions)[0];
    if (leader && leader.conversions > 0) {
      const share = Math.round((leader.conversions / totalConvFromChannels) * 100);
      if (share >= 60) {
        out.push({
          id: 'channel-winner',
          emoji: '💰',
          severity: 'success',
          text: `O ${channelLabel(leader.channel)} gerou ${share}% das conversões do período.`,
        });
      }
    }
  }

  // Top performer
  if (data.team.length >= 2) {
    const totalConv = data.team.reduce((s, t) => s + t.conversions, 0);
    const top = data.team[0];
    if (top.conversions > 0 && totalConv > 0) {
      const share = Math.round((top.conversions / totalConv) * 100);
      if (share >= 35) {
        out.push({
          id: 'top-performer',
          emoji: '🔥',
          severity: 'success',
          text: `${top.name} foi responsável por ${share}% das vendas.`,
        });
      }
    }

    // Underperformer
    const withConv = data.team.filter((t) => t.conversations >= 5);
    if (withConv.length >= 3) {
      const avg = withConv.reduce((s, t) => s + t.conversions, 0) / withConv.length;
      const under = [...withConv].sort((a, b) => a.conversions - b.conversions)[0];
      if (under && avg > 0 && under.conversions < avg * 0.5) {
        out.push({
          id: 'underperformer',
          emoji: '📉',
          severity: 'warning',
          text: `${under.name} está convertendo abaixo da média do time.`,
        });
      }
    }
  }

  // IA resolvendo bem
  if (data.aiResolutionPct.current >= 70) {
    out.push({
      id: 'ai-strong',
      emoji: '✅',
      severity: 'success',
      text: `A IA resolveu ${data.aiResolutionPct.current}% das conversas sem intervenção humana.`,
    });
  }

  return out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]).slice(0, 5);
}
