// ─────────────────────────────────────────────────────────────────────────────
// useProductHubData — consultas ESCOPADAS POR PRODUTO do hub (D3 Fase 1a)
// Espelha os hooks da fonte que recebiam productId (useLeads/useDeals/
// useSalesGoals/useCommissions/usePipelineStages/useProductAgents/useWebChat),
// sempre com `.eq('product_id', …)` nas tabelas platform_crm_* (Fase 0).
// Hub-local de propósito: NÃO altera os hooks globais de crm/data/ (evita
// colisão com as ondas paralelas kanban/leads/capture/agents).
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesUpdate, Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';

const KEY = 'platform-crm';

export type ProductStage = Tables<'platform_crm_pipeline_stages'>;
export type ProductLead = Tables<'platform_crm_leads'> & {
  platform_crm_pipeline_stages?: { name: string; color: string | null; order_index: number } | null;
};
export type ProductDeal = Tables<'platform_crm_deals'>;
export type ProductGoal = Tables<'platform_crm_sales_goals'>;
export type ProductCommission = Tables<'platform_crm_commissions'>;
export type ProductAgent = Tables<'platform_crm_product_agents'>;
export type ProductChatFlow = Tables<'platform_crm_chat_flows'>;
export type ProductWebchatWidget = Tables<'platform_crm_webchat_widgets'>;
export type ProductWebchatAgentConfig = Tables<'platform_crm_webchat_agent_configs'>;

export function usePlatformCrmProductStages(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-stages', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_pipeline_stages')
        .select('*')
        .eq('product_id', productId!)
        .order('order_index');
      if (error) throw error;
      return (data ?? []) as ProductStage[];
    },
    enabled: !!productId,
  });
}

export function usePlatformCrmProductLeads(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-leads', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_leads')
        .select('*, platform_crm_pipeline_stages ( name, color, order_index )')
        .eq('product_id', productId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductLead[];
    },
    enabled: !!productId,
  });
}

export function usePlatformCrmProductDeals(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-deals', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_deals')
        .select('*')
        .eq('product_id', productId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductDeal[];
    },
    enabled: !!productId,
  });
}

export function usePlatformCrmProductGoals(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-goals', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_sales_goals')
        .select('*')
        .eq('product_id', productId!)
        .order('period_start', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductGoal[];
    },
    enabled: !!productId,
  });
}

export function usePlatformCrmProductCommissions(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-commissions', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_commissions')
        .select('*')
        .eq('product_id', productId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductCommission[];
    },
    enabled: !!productId,
  });
}

export function usePlatformCrmProductChatFlows(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-chat-flows', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_chat_flows')
        .select('id, name, is_active')
        .eq('product_id', productId!)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Array<Pick<ProductChatFlow, 'id' | 'name' | 'is_active'>>;
    },
    enabled: !!productId,
  });
}

// ─── Agentes IA do produto (LISTAGEM + ações leves; editor profundo = onda agents) ──
export function usePlatformCrmProductAgents(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-agents', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .select('*')
        .eq('product_id', productId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductAgent[];
    },
    enabled: !!productId,
  });
}

export function useToggleProductAgentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('platform_crm_product_agents')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'product-agents'] }),
    onError: (e: any) => toast.error('Erro ao atualizar agente: ' + e.message),
  });
}

export function useSetDefaultProductAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error: clearError } = await supabase
        .from('platform_crm_product_agents')
        .update({ is_default: false })
        .eq('product_id', productId);
      if (clearError) throw clearError;
      const { error } = await supabase
        .from('platform_crm_product_agents')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-agents'] });
      toast.success('Agente padrão definido');
    },
    onError: (e: any) => toast.error('Erro ao definir padrão: ' + e.message),
  });
}

export function useDeleteProductAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; productId?: string }) => {
      const { error } = await supabase
        .from('platform_crm_product_agents')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-agents'] });
      toast.success('Agente excluído');
    },
    onError: (e: any) => toast.error('Erro ao excluir agente: ' + e.message),
  });
}

export function useDuplicateProductAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agent: ProductAgent) => {
      const { id, created_at, updated_at, created_by, is_default, ...rest } = agent;
      const { error } = await supabase
        .from('platform_crm_product_agents')
        .insert({ ...rest, name: `${agent.name} (cópia)`, is_default: false } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-agents'] });
      toast.success('Agente duplicado');
    },
    onError: (e: any) => toast.error('Erro ao duplicar agente: ' + e.message),
  });
}

// ─── Webchat do produto (widget + config do bot) ─────────────────────────────
export function usePlatformCrmProductWidget(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-webchat-widget', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_webchat_widgets')
        .select('*')
        .eq('product_id', productId!)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProductWebchatWidget | null;
    },
    enabled: !!productId,
  });
}

export function useCreatePlatformCrmProductWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, name }: { productId: string; name: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_webchat_widgets')
        .insert({
          product_id: productId,
          name,
          is_active: true,
          public_key: crypto.randomUUID(),
          welcome_message: 'Olá! Como posso ajudá-lo hoje?',
          settings: {} as Json,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as ProductWebchatWidget;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-webchat-widget'] });
      toast.success('Widget criado!');
    },
    onError: (e: any) => toast.error('Erro ao criar widget: ' + e.message),
  });
}

export function useUpdatePlatformCrmProductWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<'platform_crm_webchat_widgets'> & { id: string }) => {
      const { error } = await supabase
        .from('platform_crm_webchat_widgets')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'product-webchat-widget'] }),
    onError: (e: any) => toast.error('Erro ao salvar widget: ' + e.message),
  });
}

export function usePlatformCrmProductWebchatAgentConfig(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-webchat-agent-config', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_webchat_agent_configs')
        .select('*')
        .eq('product_id', productId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProductWebchatAgentConfig | null;
    },
    enabled: !!productId,
  });
}
