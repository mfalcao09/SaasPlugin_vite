import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — Biblioteca de Contextos das campanhas.
 * Toca APENAS `platform_crm_campaign_contexts`. Sem organization_id (a RLS
 * super_admin-only isola os dados). Porte 1:1 de `useContextLibrary` do CRM
 * de tenant, apenas dados (`platform_crm_*`) e desacoplamento.
 */

export type CampaignContext = Tables<'platform_crm_campaign_contexts'>;

export function usePlatformCrmCampaignContexts() {
  const [contexts, setContexts] = useState<CampaignContext[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_crm_campaign_contexts')
      .select('*')
      .order('created_at', { ascending: false });
    setContexts((data as CampaignContext[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel('platform-crm-campaign-contexts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_campaign_contexts' },
        refresh,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  return { contexts, loading, refresh };
}
