import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — Campanhas Inteligentes do pipeline ÚNICO,
 * desacopladas do tenant. Toca APENAS `platform_crm_campaigns`,
 * `platform_crm_campaign_targets` e `platform_crm_campaign_preparation_jobs`.
 *
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 * Porte 1:1 de `useCampaigns` do CRM de tenant: mesma forma, apenas dados
 * (`platform_crm_*`) e desacoplamento. Diferenças de schema vs. tenant:
 *   - Nenhuma tabela tem `organization_id` (filtro removido — RLS cuida).
 *   - As RPCs de agregação (`get_campaign_stats_for_org`,
 *     `get_campaign_target_counts`) não existem no escopo de plataforma;
 *     as estatísticas são agregadas no cliente a partir de
 *     `platform_crm_campaign_targets`.
 */

export type Campaign = Tables<'platform_crm_campaigns'>;
export type CampaignTarget = Tables<'platform_crm_campaign_targets'>;
export type CampaignPreparation = {
  campaign_id: string;
  status: string;
  total_contacts: number;
  processed_contacts: number;
  error: string | null;
};

export type CampaignStats = {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  responded: number;
  failed: number;
  skipped: number;
  cancelled: number;
};

const EMPTY_STATS = (): CampaignStats => ({
  total: 0, queued: 0, sending: 0, sent: 0, responded: 0, failed: 0, skipped: 0, cancelled: 0,
});

export function usePlatformCrmCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<string, CampaignStats>>({});
  const [preparations, setPreparations] = useState<Record<string, CampaignPreparation>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_crm_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    const list = (data as Campaign[]) ?? [];
    setCampaigns(list);

    if (list.length) {
      const ids = list.map((c) => c.id);
      const [{ data: targets }, { data: prepJobs }] = await Promise.all([
        supabase
          .from('platform_crm_campaign_targets')
          .select('campaign_id, status')
          .in('campaign_id', ids),
        supabase
          .from('platform_crm_campaign_preparation_jobs')
          .select('campaign_id, status, total_contacts, processed_contacts, error')
          .in('campaign_id', ids)
          .in('status', ['pending', 'running', 'failed'])
          .order('created_at', { ascending: false }),
      ]);

      const agg: Record<string, CampaignStats> = {};
      ids.forEach((id) => { agg[id] = EMPTY_STATS(); });
      ((targets as any[]) ?? []).forEach((row) => {
        const a = agg[row.campaign_id];
        if (!a) return;
        a.total += 1;
        if ((a as any)[row.status] !== undefined) (a as any)[row.status] += 1;
      });
      setStats(agg);

      const prepMap: Record<string, CampaignPreparation> = {};
      ((prepJobs as any[]) ?? []).forEach((j) => {
        if (!prepMap[j.campaign_id]) prepMap[j.campaign_id] = j;
      });
      setPreparations(prepMap);
    } else {
      setStats({});
      setPreparations({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel('platform-crm-campaigns-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_campaigns' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_campaign_preparation_jobs' },
        refresh,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  return { campaigns, stats, preparations, loading, refresh };
}

export function usePlatformCrmCampaignTargets(campaignId: string | null) {
  const [targets, setTargets] = useState<CampaignTarget[]>([]);
  const [counts, setCounts] = useState({
    queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, responded: 0, cancelled: 0,
  });

  const refresh = useCallback(async () => {
    if (!campaignId) return;
    const { data } = await supabase
      .from('platform_crm_campaign_targets')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('scheduled_for', { ascending: true })
      .limit(500);
    const list = (data as CampaignTarget[]) ?? [];
    setTargets(list);
    const c = { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, responded: 0, cancelled: 0 };
    list.forEach((t) => {
      if ((c as any)[t.status] !== undefined) (c as any)[t.status] += 1;
    });
    setCounts(c);
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!campaignId) return;
    const ch = supabase
      .channel(`platform-crm-campaign-targets-${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_campaign_targets', filter: `campaign_id=eq.${campaignId}` },
        refresh,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId, refresh]);

  return { targets, counts, refresh };
}
