// ─────────────────────────────────────────────────────────────────────────────
// usePlatformCrmAdminMonitoredProducts — "produtos sob acompanhamento" do Agente Admin
// Religa o `AdminExecutivePanel` product-scoped (super_admin). Twin conceitual do
// campo org-scoped `auto_notification_settings.monitored_product_ids` da fonte Bizon,
// porém normalizado numa tabela de junção product-scoped:
//   platform_crm_admin_monitored_products(admin_agent_id, product_id, is_active).
// SEM organization_id. Chave = admin_agent_id (FK → platform_crm_product_agents).
//
// Também expõe a chamada do relatório executivo ON-DEMAND (edge
// `platform-admin-executive-report`), que agrega leads/conversas/vendas/agentes
// dos produtos monitorados e sintetiza via IA.
//
// (supabase as any) na tabela nova: os tipos gerados só refletem a tabela depois
// da migration ser aplicada + regeneração — mesmo padrão de usePlatformCrmAgentConnections.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const KEY = 'platform-crm';

export interface PlatformAdminExecutiveReport {
  report: string;
  ai_used: boolean;
  generated_at: string;
  period_days: number;
  product_count: number;
  totals: {
    leads_created: number;
    hot_leads: number;
    active_conversations: number;
    conversations_needing_human: number;
    deals_won: number;
    revenue_won: number;
    open_pipeline: number;
    active_agents: number;
  };
  per_product: Array<{
    product_id: string;
    product_name: string;
    leads_created: number;
    hot_leads: number;
    active_conversations: number;
    conversations_needing_human: number;
    deals_won: number;
    revenue_won: number;
    open_pipeline: number;
    active_agents: number;
  }>;
}

/** Ids dos produtos monitorados (ativos) por um Agente Admin. Sem agente = []. */
export function usePlatformCrmAdminMonitoredProducts(adminAgentId?: string | null) {
  return useQuery({
    queryKey: [KEY, 'admin-monitored-products', adminAgentId],
    enabled: !!adminAgentId,
    queryFn: async (): Promise<string[]> => {
      if (!adminAgentId) return [];
      // (supabase as any): tabela nova, pende regeneração dos tipos pós-migration.
      const { data, error } = await (supabase as any)
        .from('platform_crm_admin_monitored_products')
        .select('product_id')
        .eq('admin_agent_id', adminAgentId)
        .eq('is_active', true);
      if (error) throw error;
      return ((data ?? []) as Array<{ product_id: string }>).map((r) => r.product_id).filter(Boolean);
    },
    placeholderData: [] as string[],
  });
}

/**
 * Sincroniza os produtos monitorados de um Agente Admin (delete-all + insert).
 * Lista pequena → estratégia simples. Espelha o `syncPlatformCrmAgentConnections`.
 */
export function useSavePlatformCrmAdminMonitoredProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      adminAgentId,
      productIds,
    }: {
      adminAgentId: string;
      productIds: string[];
    }) => {
      // (supabase as any): tabela nova, pende regeneração dos tipos pós-migration.
      const { error: delError } = await (supabase as any)
        .from('platform_crm_admin_monitored_products')
        .delete()
        .eq('admin_agent_id', adminAgentId);
      if (delError) throw delError;

      if (productIds.length === 0) return;

      const rows = productIds.map((productId) => ({
        admin_agent_id: adminAgentId,
        product_id: productId,
        is_active: true,
      }));
      const { error } = await (supabase as any)
        .from('platform_crm_admin_monitored_products')
        .insert(rows);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [KEY, 'admin-monitored-products', variables.adminAgentId],
      });
    },
  });
}

/**
 * Gera o relatório executivo ON-DEMAND via edge `platform-admin-executive-report`.
 * O gate super_admin roda no edge (authenticatePlatformAgent); aqui só invocamos.
 */
export function useGeneratePlatformAdminExecutiveReport() {
  return useMutation({
    mutationFn: async (params: {
      adminAgentId?: string | null;
      productIds?: string[];
      periodDays?: number;
    }): Promise<PlatformAdminExecutiveReport> => {
      const { data, error } = await supabase.functions.invoke('platform-admin-executive-report', {
        body: {
          admin_agent_id: params.adminAgentId ?? undefined,
          product_ids: params.productIds && params.productIds.length ? params.productIds : undefined,
          period_days: params.periodDays,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as PlatformAdminExecutiveReport;
    },
  });
}
