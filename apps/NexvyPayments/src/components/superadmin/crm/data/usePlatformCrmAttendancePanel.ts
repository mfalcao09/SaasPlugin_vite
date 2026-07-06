import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * PAINEL de Atendimentos do CRM de PLATAFORMA (super_admin).
 * PORTE 1:1 de `hooks/useAttendancePanel.ts` do CRM Vendus — mesma forma
 * (sections agrupadas Fila / Agentes IA / Humanos + filtros client-side),
 * trocando a fonte de dados:
 *   - tenant: RPC `inbox_list_conversations` (webchat_conversations)
 *   - plataforma: SELECT direto em `platform_crm_conversations` (a RLS
 *     super_admin-only isola; não existe RPC de inbox no platform CRM).
 *
 * DESACOPLAMENTO: zero organization_id / sector_id de tenant. A tabela
 * `platform_crm_conversations` NÃO tem coluna de setor — toda a fila cai no
 * grupo "Sem setor" (`__none__`), mas o filtro de setor da UI continua 1:1,
 * alimentado por `platform_crm_sectors` (setores da PLATAFORMA).
 * Nomes/avatares: `profiles` (atendentes) + `platform_crm_agent_configs` (IA).
 */

export interface PlatformPanelConversation {
  id: string;
  channel: string | null;
  status: string;
  sector_id: string | null;
  sector_name: string | null;
  sector_color: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_user_avatar: string | null;
  current_agent_id: string | null;
  current_agent_name: string | null;
  current_agent_avatar: string | null;
  last_message_at: string | null;
  unread_count_agents: number | null;
  visitor_name: string | null;
  visitor_phone: string | null;
  visitor_avatar_url: string | null;
  lead_name: string | null;
  lead_id: string | null;
}

export interface PlatformPanelFilters {
  search: string;
  channels: string[];
  sectorIds: string[];
  showQueue: boolean;
  showAI: boolean;
  showHumans: boolean;
}

const PLATFORM_CRM_KEY = 'platform-crm';
const PAGE = 200;

async function loadPanelConversations(): Promise<PlatformPanelConversation[]> {
  const { data, error } = await supabase
    .from('platform_crm_conversations')
    .select('*')
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(PAGE * 3);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Enriquecimento client-side (o RPC do tenant devolvia isso pronto):
  // nomes/avatares dos atendentes humanos (profiles) e dos agentes IA
  // (platform_crm_agent_configs) + nome do lead vinculado.
  const userIds = Array.from(
    new Set(rows.map((r) => r.assigned_to).filter(Boolean)),
  ) as string[];
  const agentIds = Array.from(
    new Set(rows.map((r) => r.current_agent_id).filter(Boolean)),
  ) as string[];
  const leadIds = Array.from(
    new Set(rows.map((r) => r.lead_id).filter(Boolean)),
  ) as string[];

  const [profilesRes, agentsRes, leadsRes] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [] as any[] }),
    agentIds.length
      ? supabase.from('platform_crm_agent_configs').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [] as any[] }),
    leadIds.length
      ? supabase.from('platform_crm_leads').select('id, name').in('id', leadIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
  const agentMap = new Map((agentsRes.data ?? []).map((a: any) => [a.id, a]));
  const leadMap = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l]));

  return rows.map((r) => {
    const prof = r.assigned_to ? profileMap.get(r.assigned_to) : null;
    const agent = r.current_agent_id ? agentMap.get(r.current_agent_id) : null;
    const lead = r.lead_id ? leadMap.get(r.lead_id) : null;
    return {
      id: r.id,
      channel: r.channel ?? null,
      status: r.status,
      // platform_crm_conversations não tem setor — grupo único "Sem setor".
      sector_id: null,
      sector_name: null,
      sector_color: null,
      assigned_user_id: r.assigned_to ?? null,
      assigned_user_name: prof?.full_name ?? null,
      assigned_user_avatar: prof?.avatar_url ?? null,
      current_agent_id: r.current_agent_id ?? null,
      current_agent_name: agent?.name ?? null,
      current_agent_avatar: null,
      last_message_at: r.last_message_at ?? null,
      unread_count_agents: r.unread_count_agents ?? 0,
      visitor_name: r.visitor_name ?? null,
      visitor_phone: r.visitor_phone ?? null,
      visitor_avatar_url: null,
      lead_name: lead?.name ?? null,
      lead_id: r.lead_id ?? null,
    } satisfies PlatformPanelConversation;
  });
}

export function usePlatformCrmAttendancePanel(filters: PlatformPanelFilters) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'attendance-panel'],
    queryFn: loadPanelConversations,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Realtime — espelha o original (postgres_changes na tabela de conversas).
  useEffect(() => {
    const channel = supabase
      .channel('platform-crm-attendance-panel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_conversations' },
        () => {
          qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'attendance-panel'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const sections = useMemo(() => {
    const applyFilters = (list: PlatformPanelConversation[]) => {
      const term = filters.search.trim().toLowerCase();
      return list.filter((c) => {
        if (filters.channels.length && !filters.channels.includes(c.channel || 'webchat')) return false;
        if (filters.sectorIds.length) {
          const sid = c.sector_id || '__none__';
          if (!filters.sectorIds.includes(sid)) return false;
        }
        if (term) {
          const hay = `${c.lead_name || ''} ${c.visitor_name || ''} ${c.visitor_phone || ''}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      });
    };

    const all = query.data || [];

    // Mesmos recortes do tenant: fila = waiting_human sem agente IA;
    // IA = bot_active com current_agent_id; humanos = human_active.
    const queueRaw = all.filter((c) => c.status === 'waiting_human' && !c.current_agent_id);
    const aiRaw = all.filter((c) => c.status === 'bot_active' && !!c.current_agent_id);
    const humansRaw = all.filter((c) => c.status === 'human_active');

    const queue = applyFilters(queueRaw);
    const ai = applyFilters(aiRaw);
    const humans = applyFilters(humansRaw);

    // Group queue by sector (plataforma: tudo em "Sem setor")
    const queueBySector = new Map<
      string,
      { sectorId: string | null; name: string; color: string | null; items: PlatformPanelConversation[] }
    >();
    for (const c of queue) {
      const key = c.sector_id || '__none__';
      if (!queueBySector.has(key)) {
        queueBySector.set(key, {
          sectorId: c.sector_id,
          name: c.sector_name || 'Sem setor',
          color: c.sector_color,
          items: [],
        });
      }
      queueBySector.get(key)!.items.push(c);
    }

    // Group AI by agent
    const aiByAgent = new Map<
      string,
      { agentId: string; name: string; avatar: string | null; items: PlatformPanelConversation[] }
    >();
    for (const c of ai) {
      const key = c.current_agent_id!;
      if (!aiByAgent.has(key)) {
        aiByAgent.set(key, {
          agentId: key,
          name: c.current_agent_name || 'Agente IA',
          avatar: c.current_agent_avatar,
          items: [],
        });
      }
      aiByAgent.get(key)!.items.push(c);
    }

    // Group humans by user
    const humansByUser = new Map<
      string,
      { userId: string; name: string; avatar: string | null; items: PlatformPanelConversation[] }
    >();
    for (const c of humans) {
      const key = c.assigned_user_id || '__none__';
      if (!humansByUser.has(key)) {
        humansByUser.set(key, {
          userId: key,
          name: c.assigned_user_name || 'Sem atendente',
          avatar: c.assigned_user_avatar,
          items: [],
        });
      }
      humansByUser.get(key)!.items.push(c);
    }

    return {
      queueBySector: Array.from(queueBySector.values()).sort((a, b) => b.items.length - a.items.length),
      aiByAgent: Array.from(aiByAgent.values()).sort((a, b) => b.items.length - a.items.length),
      humansByUser: Array.from(humansByUser.values()).sort((a, b) => b.items.length - a.items.length),
      totals: {
        queue: queue.length,
        ai: ai.length,
        humans: humans.length,
      },
    };
  }, [query.data, filters]);

  return {
    sections,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    // §3.1: erro NUNCA silenciado — exposto p/ banner com retry na UI. Aditivo,
    // retrocompatível (nenhum consumidor existente lê estes campos).
    isError: query.isError,
    error: query.error as Error | null,
    refetch: () => {
      query.refetch();
    },
  };
}

export function usePlatformCrmPanelFiltersState() {
  const [filters, setFilters] = useState<PlatformPanelFilters>({
    search: '',
    channels: [],
    sectorIds: [],
    showQueue: true,
    showAI: true,
    showHumans: true,
  });
  return { filters, setFilters };
}
