import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import type { PlatformCrmStage } from './usePlatformCrmStages';

/**
 * CRM de PLATAFORMA (super_admin) — leads do pipeline ÚNICO, desacoplado do tenant.
 * Toca APENAS `platform_crm_leads` (join do stage via `platform_crm_pipeline_stages`).
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 */

export type PlatformCrmLead = Tables<'platform_crm_leads'>;
export type PlatformCrmLeadInsert = TablesInsert<'platform_crm_leads'>;
export type PlatformCrmLeadUpdate = TablesUpdate<'platform_crm_leads'>;

/** Lead com a etapa (stage) embutida via join FK current_stage_id. */
export type PlatformCrmLeadWithStage = PlatformCrmLead & {
  stage: PlatformCrmStage | null;
  /**
   * Perfil do vendedor responsável (assigned_to), resolvido client-side contra
   * `profiles` — não há FK declarada de assigned_to → profiles. Espelha o campo
   * `profiles` do KanbanLead original.
   */
  profiles?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

/** Direção da ordenação do board/lista. */
export type PlatformCrmLeadSortBy = 'created_at' | 'deal_value' | 'last_contact_at';
export type PlatformCrmLeadSortDirection = 'asc' | 'desc';

export interface PlatformCrmLeadFilters {
  /** Busca livre por nome, empresa ou email. */
  search?: string;
  /** Filtra por etapa (current_stage_id). */
  stageId?: string;
  /** Filtra por vendedor responsável (assigned_to) — rep de venda da plataforma. */
  sellerId?: string;
  /** Valor mínimo de negociação (deal_value >=). */
  minValue?: number | null;
  /** Recorte por created_at (>=). */
  dateFrom?: Date | null;
  /** Recorte por created_at (<=). */
  dateTo?: Date | null;
  /** Campo de ordenação. */
  sortBy?: PlatformCrmLeadSortBy;
  /** Direção da ordenação. */
  sortDirection?: PlatformCrmLeadSortDirection;
  /**
   * Filtra pelos leads de um produto (pipeline por produto — dimensão D3).
   * Espelho de `useKanbanData`/`useLeads` da fonte (`.eq('product_id', productId)`).
   * `null`/`undefined` = todos os produtos (mesma semântica de "todos" da fonte).
   */
  productId?: string | null;
}

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmLeads(filters?: PlatformCrmLeadFilters) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'leads', filters ?? null],
    queryFn: async (): Promise<PlatformCrmLeadWithStage[]> => {
      const sortBy = filters?.sortBy ?? 'created_at';
      const ascending = (filters?.sortDirection ?? 'desc') === 'asc';

      let query = supabase
        .from('platform_crm_leads')
        .select(
          `
          *,
          stage:platform_crm_pipeline_stages!platform_crm_leads_current_stage_id_fkey (*)
        `,
        )
        .order(sortBy, { ascending });

      // Escopo por produto (pipeline por produto — dimensão D3). Espelho de
      // useKanbanData:76 (`.eq('product_id', productId)`). null = todos os produtos.
      if (filters?.productId) {
        query = query.eq('product_id', filters.productId);
      }

      if (filters?.stageId) {
        query = query.eq('current_stage_id', filters.stageId);
      }

      // Filtro por vendedor (assigned_to) — rep de venda da plataforma, não tenant.
      if (filters?.sellerId) {
        query = query.eq('assigned_to', filters.sellerId);
      }

      if (filters?.minValue != null) {
        query = query.gte('deal_value', filters.minValue);
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }

      const search = filters?.search?.trim();
      if (search) {
        // Busca por nome, empresa ou email (case-insensitive).
        query = query.or(
          `name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      const leads = (data ?? []) as unknown as PlatformCrmLeadWithStage[];

      // Resolve o vendedor (assigned_to) em `profiles` num passo separado — sem FK
      // declarada, então não há embed. Espelha o profilesMap do useKanbanData original.
      const assignedIds = [
        ...new Set(leads.map((l) => l.assigned_to).filter((v): v is string => !!v)),
      ];
      let profilesMap: Record<string, { id: string; full_name: string | null; avatar_url: string | null }> = {};

      if (assignedIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', assignedIds);

        profilesMap = (profilesData ?? []).reduce(
          (acc, p) => ({ ...acc, [p.id]: p }),
          {},
        );
      }

      return leads.map((l) => ({
        ...l,
        profiles: l.assigned_to ? profilesMap[l.assigned_to] ?? null : null,
      }));
    },
  });
}

export function usePlatformCrmLead(id: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'lead', id],
    enabled: !!id,
    queryFn: async (): Promise<PlatformCrmLeadWithStage> => {
      const { data, error } = await supabase
        .from('platform_crm_leads')
        .select(
          `
          *,
          stage:platform_crm_pipeline_stages!platform_crm_leads_current_stage_id_fkey (*)
        `,
        )
        .eq('id', id!)
        .single();

      if (error) throw error;
      return data as unknown as PlatformCrmLeadWithStage;
    },
  });
}

export function useCreatePlatformCrmLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (lead: PlatformCrmLeadInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_leads')
        .insert(lead)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmLead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      toast.success('Lead criado!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM lead:', error);
      toast.error('Erro ao criar lead');
    },
  });
}

export function useUpdatePlatformCrmLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmLeadUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'lead', data.id] });
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM lead:', error);
      toast.error('Erro ao atualizar lead');
    },
  });
}

/**
 * Move um lead para outra etapa do pipeline (drag-and-drop no board).
 * Faz update otimista da lista para UX fluida e reverte em erro.
 */
export function useMovePlatformCrmLeadToStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, stageId }: { leadId: string; stageId: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_leads')
        .update({ current_stage_id: stageId })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmLead;
    },
    onMutate: async ({ leadId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      const snapshots: Array<{ key: unknown; data: unknown }> = [];
      queryClient
        .getQueriesData({ queryKey: [PLATFORM_CRM_KEY, 'leads'] })
        .forEach(([key, data]) => {
          snapshots.push({ key, data });
          if (Array.isArray(data)) {
            queryClient.setQueryData(
              key,
              (data as any[]).map((l) =>
                l?.id === leadId ? { ...l, current_stage_id: stageId } : l,
              ),
            );
          }
        });
      return { snapshots };
    },
    onError: (error: any, _vars, ctx) => {
      ctx?.snapshots.forEach(({ key, data }) => {
        queryClient.setQueryData(key as any, data);
      });
      console.error('Error moving platform CRM lead:', error);
      toast.error('Erro ao mover lead');
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'lead', vars.leadId] });
    },
  });
}

export function useDeletePlatformCrmLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_leads')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'leads'] });
      toast.success('Lead removido!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM lead:', error);
      toast.error('Erro ao remover lead');
    },
  });
}
