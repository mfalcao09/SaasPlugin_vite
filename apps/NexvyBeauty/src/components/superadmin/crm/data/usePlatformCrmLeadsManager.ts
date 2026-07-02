import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import type { PlatformCrmStage } from './usePlatformCrmStages';

/**
 * CRM de PLATAFORMA (super_admin) — orquestração da GESTÃO DE LEADS do pipeline
 * ÚNICO, desacoplado do tenant. Porte 1:1 do `useLeadsManager` do CRM de tenant,
 * mas SEM organization_id / product_id: a RLS super_admin-only isola os dados.
 *
 * Toca APENAS `platform_crm_*` (+ `profiles` p/ nome de rep, resolvido nas tabelas
 * irmãs). Abas, filtros avançados (temperatura, origem, canal, etiquetas any/all,
 * exclusões, campos personalizados via metadata, squad, data), ordenação, paginação,
 * seleção múltipla, criação, transferência em massa e exclusão em massa.
 */

type PlatformCrmLead = Tables<'platform_crm_leads'> & {
  stage?: Tables<'platform_crm_pipeline_stages'> | null;
};

export type CustomFieldOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'is_empty'
  | 'is_not_empty';

export type CustomFieldRule = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: 'text' | 'number' | 'select' | 'boolean' | 'date';
  operator: CustomFieldOperator;
  value?: string | number | boolean | null;
  valueTo?: string | number | null;
};

export type DatePreset = 'today' | '7d' | '30d' | 'month' | 'custom' | null;

export type PlatformCrmLeadFilters = {
  search: string;
  temperature: string[];
  origin: string[];
  channel: string[];
  stageId: string | null;
  squadId: string | null;
  assignedTo: string | null;
  unassigned: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
  datePreset: DatePreset;
  utmCampaign: string | null;
  tagIds: string[];
  tagsMatchMode: 'any' | 'all' | 'none';
  excludeTagIds: string[];
  excludeOrigin: string[];
  excludeChannel: string[];
  customFieldRules: CustomFieldRule[];
};

export type PlatformCrmLeadSort = {
  column: string;
  direction: 'asc' | 'desc';
};

/** Abas disponíveis (Por Produto DROPADO — plataforma não tem catálogo de produto). */
export type PlatformCrmLeadsTabId =
  | 'all'
  | 'my-leads'
  | 'my-squad'
  | 'unassigned';

const defaultFilters: PlatformCrmLeadFilters = {
  search: '',
  temperature: [],
  origin: [],
  channel: [],
  stageId: null,
  squadId: null,
  assignedTo: null,
  unassigned: false,
  dateFrom: null,
  dateTo: null,
  datePreset: null,
  utmCampaign: null,
  tagIds: [],
  tagsMatchMode: 'any',
  excludeTagIds: [],
  excludeOrigin: [],
  excludeChannel: [],
  customFieldRules: [],
};

function resolveDateRange(filters: PlatformCrmLeadFilters): { from: Date | null; to: Date | null } {
  if (filters.datePreset && filters.datePreset !== 'custom') {
    const now = new Date();
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(now);
    if (filters.datePreset === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (filters.datePreset === '7d') {
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
    } else if (filters.datePreset === '30d') {
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
    } else if (filters.datePreset === 'month') {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    }
    return { from, to };
  }
  return { from: filters.dateFrom, to: filters.dateTo };
}

function isServerSideRule(rule: CustomFieldRule): boolean {
  if (rule.operator === 'is_empty' || rule.operator === 'is_not_empty') return true;
  if (rule.fieldType === 'select' || rule.fieldType === 'boolean') {
    return ['eq', 'neq'].includes(rule.operator);
  }
  if (rule.fieldType === 'text') {
    return ['eq', 'neq', 'contains'].includes(rule.operator);
  }
  return false;
}

function evaluateClientRule(value: unknown, rule: CustomFieldRule): boolean {
  const empty = value === undefined || value === null || String(value).trim() === '';
  if (rule.operator === 'is_empty') return empty;
  if (rule.operator === 'is_not_empty') return !empty;
  if (empty) return false;

  if (rule.fieldType === 'number') {
    const n = Number(value);
    const a = Number(rule.value);
    const b = Number(rule.valueTo);
    if (Number.isNaN(n)) return false;
    switch (rule.operator) {
      case 'eq': return n === a;
      case 'neq': return n !== a;
      case 'gt': return n > a;
      case 'gte': return n >= a;
      case 'lt': return n < a;
      case 'lte': return n <= a;
      case 'between': return n >= a && n <= b;
    }
  }

  if (rule.fieldType === 'date') {
    const t = new Date(String(value)).getTime();
    const a = rule.value ? new Date(String(rule.value)).getTime() : NaN;
    const b = rule.valueTo ? new Date(String(rule.valueTo)).getTime() : NaN;
    if (Number.isNaN(t)) return false;
    switch (rule.operator) {
      case 'eq': return new Date(t).toDateString() === new Date(a).toDateString();
      case 'neq': return new Date(t).toDateString() !== new Date(a).toDateString();
      case 'gt': return t > a;
      case 'gte': return t >= a;
      case 'lt': return t < a;
      case 'lte': return t <= a;
      case 'between': return t >= a && t <= b;
    }
  }

  const numericOps: CustomFieldRule['operator'][] = ['gt', 'gte', 'lt', 'lte', 'between'];
  if (rule.fieldType === 'text' && numericOps.includes(rule.operator)) {
    const n = Number(String(value).replace(',', '.'));
    const a = Number(String(rule.value ?? '').replace(',', '.'));
    const b = Number(String(rule.valueTo ?? '').replace(',', '.'));
    if (Number.isNaN(n) || Number.isNaN(a)) return false;
    switch (rule.operator) {
      case 'gt': return n > a;
      case 'gte': return n >= a;
      case 'lt': return n < a;
      case 'lte': return n <= a;
      case 'between': return !Number.isNaN(b) && n >= a && n <= b;
    }
  }

  const s = String(value);
  const sv = String(rule.value ?? '');
  switch (rule.operator) {
    case 'eq': return s === sv;
    case 'neq': return s !== sv;
    case 'contains': return s.toLowerCase().includes(sv.toLowerCase());
  }
  return true;
}

const PLATFORM_CRM_KEY = 'platform-crm';
const PAGE_SIZE = 20;

/** Resolve o UUID do usuário logado (super_admin) — desacoplado de `useAuth`/org. */
function useCurrentUserId() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);
  return userId;
}

export function usePlatformCrmLeadsManager() {
  const queryClient = useQueryClient();
  const currentUserId = useCurrentUserId();

  const [filters, setFilters] = useState<PlatformCrmLeadFilters>(defaultFilters);
  const [sort, setSort] = useState<PlatformCrmLeadSort>({ column: 'created_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<PlatformCrmLeadsTabId>('all');

  const { data: leadsData, isLoading, refetch } = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'leads-manager', filters, sort, page, activeTab, currentUserId],
    queryFn: async () => {
      // Pré-filtro por etiquetas (inclusão)
      let restrictToIds: string[] | null = null;
      let excludeLeadIds: string[] = [];
      if (filters.tagIds.length > 0) {
        const { data: assigns } = await supabase
          .from('platform_crm_lead_tag_assignments')
          .select('lead_id, tag_id')
          .in('tag_id', filters.tagIds);
        const counts = new Map<string, number>();
        (assigns ?? []).forEach((a) => {
          counts.set(a.lead_id, (counts.get(a.lead_id) ?? 0) + 1);
        });
        if (filters.tagsMatchMode === 'none') {
          excludeLeadIds = Array.from(counts.keys());
        } else {
          const ids =
            filters.tagsMatchMode === 'all'
              ? Array.from(counts.entries())
                  .filter(([, n]) => n === filters.tagIds.length)
                  .map(([id]) => id)
              : Array.from(counts.keys());
          restrictToIds = ids;
          if (restrictToIds.length === 0) {
            return { leads: [], total: 0, totalPages: 0 };
          }
        }
      }

      // Pré-filtro por etiquetas a excluir (lista independente)
      if (filters.excludeTagIds.length > 0) {
        const { data: assigns } = await supabase
          .from('platform_crm_lead_tag_assignments')
          .select('lead_id')
          .in('tag_id', filters.excludeTagIds);
        const extra = (assigns ?? []).map((a) => a.lead_id);
        excludeLeadIds = Array.from(new Set([...excludeLeadIds, ...extra]));
      }

      const hasClientRules = filters.customFieldRules.some((r) => !isServerSideRule(r));

      let query = supabase
        .from('platform_crm_leads')
        .select(
          `
          *,
          stage:platform_crm_pipeline_stages!platform_crm_leads_current_stage_id_fkey (*)
        `,
          { count: 'exact' },
        );

      if (restrictToIds) {
        query = query.in('id', restrictToIds);
      }
      if (excludeLeadIds.length > 0) {
        query = query.not('id', 'in', `(${excludeLeadIds.join(',')})`);
      }

      // Abas
      if (activeTab === 'unassigned') {
        query = query.is('assigned_to', null);
      } else if (activeTab === 'my-leads' && currentUserId) {
        query = query.or(
          `assigned_to.eq.${currentUserId},sdr_id.eq.${currentUserId},closer_id.eq.${currentUserId}`,
        );
      } else if (activeTab === 'my-squad' && currentUserId) {
        const { data: squadRows } = await supabase
          .from('platform_crm_squad_members')
          .select('squad_id')
          .eq('user_id', currentUserId);
        const squadIds = (squadRows ?? []).map((s) => s.squad_id);
        if (squadIds.length === 0) {
          return { leads: [], total: 0, totalPages: 0 };
        }
        query = query.in('squad_id', squadIds);
      }

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,company.ilike.%${filters.search}%`,
        );
      }

      if (filters.temperature.length > 0) {
        query = query.in('temperature', filters.temperature as ('hot' | 'warm' | 'cold')[]);
      }
      if (filters.origin.length > 0) {
        query = query.in('lead_origin', filters.origin);
      }
      if (filters.channel.length > 0) {
        query = query.in('lead_channel', filters.channel);
      }
      if (filters.excludeOrigin.length > 0) {
        query = query.not('lead_origin', 'in', `(${filters.excludeOrigin.map((v) => `"${v}"`).join(',')})`);
      }
      if (filters.excludeChannel.length > 0) {
        query = query.not('lead_channel', 'in', `(${filters.excludeChannel.map((v) => `"${v}"`).join(',')})`);
      }
      if (filters.stageId) query = query.eq('current_stage_id', filters.stageId);
      if (filters.squadId) query = query.eq('squad_id', filters.squadId);
      if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
      if (filters.unassigned) query = query.is('assigned_to', null);

      const range = resolveDateRange(filters);
      if (range.from) query = query.gte('created_at', range.from.toISOString());
      if (range.to) query = query.lte('created_at', range.to.toISOString());

      if (filters.utmCampaign) query = query.eq('utm_campaign', filters.utmCampaign);

      // Regras de campo personalizado server-side (text/select/boolean + checagens vazio)
      for (const rule of filters.customFieldRules) {
        if (!isServerSideRule(rule)) continue;
        const path = `metadata->custom_fields->>${rule.fieldKey}`;
        if (rule.operator === 'is_empty') {
          query = query.is(path as never, null);
        } else if (rule.operator === 'is_not_empty') {
          query = query.not(path as never, 'is', null);
        } else if (rule.operator === 'eq') {
          query = query.eq(path as never, String(rule.value ?? ''));
        } else if (rule.operator === 'neq') {
          query = query.neq(path as never, String(rule.value ?? ''));
        } else if (rule.operator === 'contains') {
          query = query.ilike(path as never, `%${String(rule.value ?? '')}%`);
        }
      }

      query = query.order(sort.column, { ascending: sort.direction === 'asc' });

      if (hasClientRules) {
        query = query.range(0, 999);
      } else {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      let rows = (data ?? []) as unknown as PlatformCrmLead[];
      let totalCount = count ?? 0;

      if (hasClientRules) {
        const clientRules = filters.customFieldRules.filter((r) => !isServerSideRule(r));
        rows = rows.filter((lead) => {
          const cf =
            (lead.metadata as { custom_fields?: Record<string, unknown> } | null)?.custom_fields ??
            {};
          return clientRules.every((r) => evaluateClientRule(cf[r.fieldKey], r));
        });
        totalCount = rows.length;
        const startIdx = (page - 1) * PAGE_SIZE;
        rows = rows.slice(startIdx, startIdx + PAGE_SIZE);
      }

      return {
        leads: rows,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
      };
    },
  });

  // Stats (contagens por temperatura + sem carteira)
  const { data: stats } = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'leads-stats'],
    queryFn: async () => {
      const base = () =>
        supabase.from('platform_crm_leads').select('id', { count: 'exact', head: true });

      const [totalRes, hotRes, warmRes, coldRes, unassignedRes] = await Promise.all([
        base(),
        base().eq('temperature', 'hot'),
        base().eq('temperature', 'warm'),
        base().eq('temperature', 'cold'),
        base().is('assigned_to', null),
      ]);

      if (totalRes.error) throw totalRes.error;

      return {
        total: totalRes.count ?? 0,
        hot: hotRes.count ?? 0,
        warm: warmRes.count ?? 0,
        cold: coldRes.count ?? 0,
        unassigned: unassignedRes.count ?? 0,
      };
    },
  });

  // Criar lead
  const createLead = useMutation({
    mutationFn: async (lead: TablesInsert<'platform_crm_leads'>) => {
      const { data, error } = await supabase
        .from('platform_crm_leads')
        .insert(lead)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads-manager'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads-stats'] });
      toast.success('Lead criado com sucesso');
    },
    onError: (error: { code?: string; message?: string }) => {
      if (error?.code === '23505') {
        toast.error('Já existe um contato com este telefone.');
      } else {
        toast.error('Erro ao criar lead: ' + (error?.message ?? 'desconhecido'));
      }
    },
  });

  // Transferência em massa (vendedor/squad + motivo)
  const bulkTransfer = useMutation({
    mutationFn: async ({
      leadIds,
      assignedTo,
      squadId,
      reason,
    }: {
      leadIds: string[];
      assignedTo: string | null;
      squadId: string | null;
      reason?: string;
    }) => {
      const updates = leadIds.map((id) =>
        supabase
          .from('platform_crm_leads')
          .update({
            assigned_to: assignedTo,
            squad_id: squadId,
            transfer_reason: reason ?? null,
            transferred_at: new Date().toISOString(),
            transferred_by: currentUserId,
          })
          .eq('id', id),
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads-manager'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads-stats'] });
      setSelectedLeads([]);
      toast.success('Leads transferidos com sucesso');
    },
    onError: (error: { message?: string }) => {
      toast.error('Erro ao transferir leads: ' + (error?.message ?? ''));
    },
  });

  // Exclusão em massa (sem RPC de cascade na plataforma — delete direto via `.in`)
  const bulkDelete = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const { error } = await supabase
        .from('platform_crm_leads')
        .delete()
        .in('id', leadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads-manager'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads-stats'] });
      setSelectedLeads([]);
      toast.success('Leads excluídos com sucesso');
    },
    onError: (error: { message?: string }) => {
      toast.error('Erro ao excluir leads: ' + (error?.message ?? ''));
    },
  });

  // Seleção
  const toggleSelectLead = (leadId: string) => {
    setSelectedLeads((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId],
    );
  };

  const toggleSelectAll = () => {
    const rows = leadsData?.leads ?? [];
    if (rows.length === 0) return;
    if (selectedLeads.length === rows.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(rows.map((l) => l.id));
    }
  };

  const clearSelection = () => setSelectedLeads([]);

  // Filtros
  const updateFilter = <K extends keyof PlatformCrmLeadFilters>(
    key: K,
    value: PlatformCrmLeadFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    setPage(1);
  };

  // Ordenação
  const updateSort = (column: string) => {
    setSort((prev) => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return {
    leads: (leadsData?.leads ?? []) as PlatformCrmLead[],
    total: leadsData?.total ?? 0,
    totalPages: leadsData?.totalPages ?? 1,
    stats,
    isLoading,

    page,
    setPage,

    filters,
    updateFilter,
    clearFilters,

    sort,
    updateSort,

    selectedLeads,
    toggleSelectLead,
    toggleSelectAll,
    clearSelection,

    activeTab,
    setActiveTab,

    createLead,
    bulkTransfer,
    bulkDelete,

    refetch,
  };
}

export type { PlatformCrmLead, PlatformCrmStage };
