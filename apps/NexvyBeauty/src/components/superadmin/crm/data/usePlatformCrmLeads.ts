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
};

export interface PlatformCrmLeadFilters {
  /** Busca livre por nome, empresa ou email. */
  search?: string;
  /** Filtra por etapa (current_stage_id). */
  stageId?: string;
}

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmLeads(filters?: PlatformCrmLeadFilters) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'leads', filters ?? null],
    queryFn: async (): Promise<PlatformCrmLeadWithStage[]> => {
      let query = supabase
        .from('platform_crm_leads')
        .select(
          `
          *,
          stage:platform_crm_pipeline_stages!platform_crm_leads_current_stage_id_fkey (*)
        `,
        )
        .order('created_at', { ascending: false });

      if (filters?.stageId) {
        query = query.eq('current_stage_id', filters.stageId);
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
      return (data ?? []) as unknown as PlatformCrmLeadWithStage[];
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
