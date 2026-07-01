import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — pipeline ÚNICO, desacoplado do tenant.
 * Toca APENAS `platform_crm_pipeline_stages`. Sem organization_id / product_id.
 * A RLS super_admin-only já isola os dados; não há filtro por escopo aqui.
 */

export type PlatformCrmStage = Tables<'platform_crm_pipeline_stages'>;
export type PlatformCrmStageInsert = TablesInsert<'platform_crm_pipeline_stages'>;
export type PlatformCrmStageUpdate = TablesUpdate<'platform_crm_pipeline_stages'>;

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmStages() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'stages'],
    queryFn: async (): Promise<PlatformCrmStage[]> => {
      const { data, error } = await supabase
        .from('platform_crm_pipeline_stages')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmStage[];
    },
  });
}

export function useCreatePlatformCrmStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stage: PlatformCrmStageInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_pipeline_stages')
        .insert(stage)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'stages'] });
      toast.success('Etapa criada!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM stage:', error);
      toast.error('Erro ao criar etapa');
    },
  });
}

export function useUpdatePlatformCrmStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmStageUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_pipeline_stages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'stages'] });
      toast.success('Etapa atualizada!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM stage:', error);
      toast.error('Erro ao atualizar etapa');
    },
  });
}

/**
 * Reordena etapas: recebe a lista de { id, order_index } na nova ordem
 * e persiste cada order_index individualmente.
 */
export function useReorderPlatformCrmStages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ordered: Array<{ id: string; order_index: number }>) => {
      const results = await Promise.all(
        ordered.map(({ id, order_index }) =>
          supabase
            .from('platform_crm_pipeline_stages')
            .update({ order_index })
            .eq('id', id),
        ),
      );

      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;

      return ordered;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'stages'] });
    },
    onError: (error: any) => {
      console.error('Error reordering platform CRM stages:', error);
      toast.error('Erro ao reordenar etapas');
    },
  });
}

export function useDeletePlatformCrmStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_pipeline_stages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'stages'] });
      toast.success('Etapa removida!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM stage:', error);
      toast.error('Erro ao remover etapa');
    },
  });
}
