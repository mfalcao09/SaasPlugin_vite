import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * Agentes de IA do CRM de PLATAFORMA (super_admin) — configuração CORE de cada
 * agente (persona/typing/handoff) do pipeline ÚNICO, desacoplada do tenant.
 * Toca APENAS `platform_crm_agent_configs`. Sem organization_id / product_id —
 * a RLS super_admin-only isola os dados. A tabela não tem created_by.
 *
 * TODO(edge): orquestração / tools / routing / test-chat / import dependem de
 * Edge Function + canais externos e ficam fora deste core.
 */

export type PlatformCrmAgentConfig = Tables<'platform_crm_agent_configs'>;
export type PlatformCrmAgentConfigInsert = TablesInsert<'platform_crm_agent_configs'>;
export type PlatformCrmAgentConfigUpdate = TablesUpdate<'platform_crm_agent_configs'>;

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmAgentConfigs() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'agent-configs'],
    queryFn: async (): Promise<PlatformCrmAgentConfig[]> => {
      const { data, error } = await supabase
        .from('platform_crm_agent_configs')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmAgentConfig[];
    },
  });
}

export function useCreatePlatformCrmAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PlatformCrmAgentConfigInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_agent_configs')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmAgentConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'agent-configs'] });
      toast.success('Agente criado!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM agent config:', error);
      toast.error('Erro ao criar agente');
    },
  });
}

export function useUpdatePlatformCrmAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmAgentConfigUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_agent_configs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmAgentConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'agent-configs'] });
      toast.success('Agente atualizado!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM agent config:', error);
      toast.error('Erro ao atualizar agente');
    },
  });
}

export function useTogglePlatformCrmAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('platform_crm_agent_configs')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
      return { id, isActive };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'agent-configs'] });
    },
    onError: (error: any) => {
      console.error('Error toggling platform CRM agent config:', error);
      toast.error('Erro ao alterar status do agente');
    },
  });
}

export function useDeletePlatformCrmAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_agent_configs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'agent-configs'] });
      toast.success('Agente excluído!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM agent config:', error);
      toast.error('Erro ao remover agente');
    },
  });
}
