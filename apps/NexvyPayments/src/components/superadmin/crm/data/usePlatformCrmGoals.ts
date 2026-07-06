import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * METAS de vendas do CRM de PLATAFORMA (super_admin) — desacopladas do tenant.
 * Toca APENAS `platform_crm_sales_goals`. Sem organization_id / product_id.
 * A RLS super_admin-only já isola os dados.
 */

export type PlatformCrmGoal = Tables<'platform_crm_sales_goals'>;
export type PlatformCrmGoalInsert = TablesInsert<'platform_crm_sales_goals'>;
export type PlatformCrmGoalUpdate = TablesUpdate<'platform_crm_sales_goals'>;

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmGoals() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'goals'],
    queryFn: async (): Promise<PlatformCrmGoal[]> => {
      const { data, error } = await supabase
        .from('platform_crm_sales_goals')
        .select('*')
        .order('period_start', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmGoal[];
    },
  });
}

export function useCreatePlatformCrmGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goal: PlatformCrmGoalInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_sales_goals')
        .insert(goal)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmGoal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'goals'] });
      toast.success('Meta criada!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM goal:', error);
      toast.error('Erro ao criar meta');
    },
  });
}

export function useUpdatePlatformCrmGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmGoalUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_sales_goals')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmGoal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'goals'] });
      toast.success('Meta atualizada!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM goal:', error);
      toast.error('Erro ao atualizar meta');
    },
  });
}
