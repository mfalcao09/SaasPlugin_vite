import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — pipeline POR PRODUTO (dimensão restaurada D3).
 * Toca APENAS `platform_crm_pipeline_stages`. Sem organization_id / tenant.
 * A RLS super_admin-only isola os dados; o escopo por produto é opcional (null/undefined
 * = todos os funis, mesma semântica da fonte quando o produto ainda não foi escolhido).
 *
 * Porte 1:1 de `.vendus-src-reference/src/hooks/useProductPipelineStages.ts:12-26`
 * (`useProductPipelineStages(productId)` → `.eq('product_id', productId)`). Aqui o
 * filtro é opcional para preservar a chamada sem-argumento das telas que ainda não
 * passaram por multiproduto (ex.: LeadsManager usa a lista completa de etapas).
 */

export type PlatformCrmStage = Tables<'platform_crm_pipeline_stages'>;
export type PlatformCrmStageInsert = TablesInsert<'platform_crm_pipeline_stages'>;
export type PlatformCrmStageUpdate = TablesUpdate<'platform_crm_pipeline_stages'>;

const PLATFORM_CRM_KEY = 'platform-crm';

/**
 * Etapas do pipeline. Com `productId` informado, filtra o funil daquele produto
 * (`.eq('product_id', productId)`, espelho de useProductPipelineStages:19). Sem
 * `productId`, retorna todas as etapas (compat com chamadas legadas mono-produto).
 */
export function usePlatformCrmStages(productId?: string | null) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'stages', productId ?? null],
    queryFn: async (): Promise<PlatformCrmStage[]> => {
      let query = supabase
        .from('platform_crm_pipeline_stages')
        .select('*')
        .order('order_index', { ascending: true });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
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
