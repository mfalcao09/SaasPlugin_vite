import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — configuração de auto-dispatch de um squad.
 * Port do `SquadDistributionConfig` do CRM Vendus para as tabelas
 * `platform_crm_distribution_config` + `platform_crm_lead_queue`, SEM
 * organization_id / product_id (a tabela de plataforma não tem essas colunas;
 * a RLS super_admin-only isola os dados).
 */

const PLATFORM_CRM_KEY = 'platform-crm';

export interface PlatformCrmDistConfig {
  method: string;
  auto_reassign: boolean;
  max_accept_time_minutes: number;
}

const DEFAULT_CONFIG: PlatformCrmDistConfig = {
  method: 'round_robin',
  auto_reassign: true,
  max_accept_time_minutes: 5,
};

export function usePlatformCrmDistributionConfig(squadId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'distribution-config', squadId],
    enabled: !!squadId,
    queryFn: async (): Promise<PlatformCrmDistConfig> => {
      const { data } = await supabase
        .from('platform_crm_distribution_config')
        .select('*')
        .eq('squad_id', squadId!)
        .maybeSingle();

      if (!data) return DEFAULT_CONFIG;
      return {
        method: data.method,
        auto_reassign: data.auto_reassign,
        max_accept_time_minutes: data.max_accept_time_minutes ?? 5,
      };
    },
  });
}

/** Nº de leads pendentes na fila do squad (`platform_crm_lead_queue`). */
export function usePlatformCrmPendingQueueCount(squadId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'lead-queue-pending', squadId],
    enabled: !!squadId,
    queryFn: async (): Promise<number> => {
      const { count } = await supabase
        .from('platform_crm_lead_queue')
        .select('*', { count: 'exact', head: true })
        .eq('squad_id', squadId!)
        .eq('status', 'pending');
      return count ?? 0;
    },
  });
}

export function useUpdatePlatformCrmDistributionConfig(squadId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: PlatformCrmDistConfig) => {
      if (!squadId) throw new Error('squadId ausente');
      // upsert por squad_id — a tabela de plataforma não tem organization_id.
      const { error } = await supabase
        .from('platform_crm_distribution_config')
        .upsert(
          {
            squad_id: squadId,
            method: config.method,
            auto_reassign: config.auto_reassign,
            max_accept_time_minutes: config.max_accept_time_minutes,
          },
          { onConflict: 'squad_id' },
        );

      if (error) throw error;
      return config;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'distribution-config', squadId],
      });
      toast.success('Configuração salva');
    },
    onError: (error: any) => {
      console.error('Error saving platform CRM distribution config:', error);
      toast.error('Erro ao salvar configuração');
    },
  });
}
