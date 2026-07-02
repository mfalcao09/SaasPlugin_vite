import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — histórico de etapas do lead (jornada no funil),
 * pipeline ÚNICO desacoplado do tenant. Toca APENAS `platform_crm_lead_stage_history`.
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 */

export type PlatformCrmLeadStageHistory = Tables<'platform_crm_lead_stage_history'>;

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmLeadStageHistory(leadId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'lead-stage-history', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<PlatformCrmLeadStageHistory[]> => {
      const { data, error } = await supabase
        .from('platform_crm_lead_stage_history')
        .select('*')
        .eq('lead_id', leadId!)
        .order('entered_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmLeadStageHistory[];
    },
  });
}
