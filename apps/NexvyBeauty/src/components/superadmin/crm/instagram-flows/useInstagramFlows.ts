import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — Automações do Instagram do pipeline ÚNICO,
 * PRODUCT-SCOPED (D3-multiproduto: 1 CRM vende N produtos).
 * Porte 1:1 de `useInstagramFlows.ts` do CRM Vendus, mas:
 *   • `.from('platform_crm_instagram_flows')` / `platform_crm_instagram_flow_runs`
 *   • SEM organization_id / useAuth — escopo por `product_id` (useActivePlatformProduct)
 *     e RLS super_admin-only isola os dados.
 *
 * NOTA: as tabelas `platform_crm_instagram_flows` e `platform_crm_instagram_flow_runs`
 * ainda NÃO constam em `integrations/supabase/types.ts` — por isso o acesso usa
 * `('...' as any)` (mesmo padrão do source, que fazia `'instagram_flows' as any`).
 */

export type IGFlowStatus = 'draft' | 'active' | 'paused' | 'archived';
export type IGTriggerType =
  | 'comment_keyword'
  | 'dm_keyword'
  | 'story_reply'
  | 'mention'
  | 'manual'
  | 'new_follower';

export interface IGFlowBlock {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  next_block_id: string | null;
}

export interface InstagramFlow {
  id: string;
  product_id: string;
  connection_id: string | null;
  name: string;
  description: string | null;
  status: IGFlowStatus;
  trigger_type: IGTriggerType;
  trigger_config: Record<string, any>;
  flow_blocks: IGFlowBlock[];
  start_block_id: string | null;
  stats: Record<string, any>;
  throttle_per_sender_hours: number;
  created_at: string;
  updated_at: string;
}

export interface InstagramFlowRun {
  id: string;
  product_id: string;
  flow_id: string;
  connection_id: string | null;
  trigger_source: string;
  source_id: string | null;
  sender_ig_id: string | null;
  conversation_id: string | null;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  error: string | null;
  payload: any;
  started_at: string;
  finished_at: string | null;
}

export function useInstagramFlows() {
  const { effectiveProductId } = useActivePlatformProduct();
  return useQuery({
    queryKey: ['platform-crm-instagram-flows', effectiveProductId],
    enabled: !!effectiveProductId,
    queryFn: async (): Promise<InstagramFlow[]> => {
      const { data, error } = await supabase
        .from('platform_crm_instagram_flows' as any)
        .select('*')
        .eq('product_id', effectiveProductId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });
}

export function useInstagramFlow(id: string | null | undefined) {
  return useQuery({
    queryKey: ['platform-crm-instagram-flow', id],
    enabled: !!id,
    queryFn: async (): Promise<InstagramFlow | null> => {
      const { data, error } = await supabase
        .from('platform_crm_instagram_flows' as any)
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });
}

export function useCreateInstagramFlow() {
  const qc = useQueryClient();
  const { effectiveProductId } = useActivePlatformProduct();
  return useMutation({
    mutationFn: async (payload: Partial<InstagramFlow>) => {
      if (!effectiveProductId) throw new Error('Selecione um produto');
      const { data, error } = await supabase
        .from('platform_crm_instagram_flows' as any)
        .insert({
          product_id: effectiveProductId,
          name: payload.name || 'Nova automação',
          description: payload.description ?? null,
          status: 'draft',
          trigger_type: payload.trigger_type || 'comment_keyword',
          trigger_config: payload.trigger_config ?? {},
          flow_blocks: payload.flow_blocks ?? [],
          start_block_id: payload.start_block_id ?? null,
          connection_id: payload.connection_id ?? null,
        } as any)
        .select('*')
        .single();
      if (error) throw error;
      return data as any as InstagramFlow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-instagram-flows'] });
      toast.success('Automação criada');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao criar automação'),
  });
}

export function useUpdateInstagramFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InstagramFlow> & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_instagram_flows' as any)
        .update(updates as any)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as any as InstagramFlow;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['platform-crm-instagram-flows'] });
      qc.invalidateQueries({ queryKey: ['platform-crm-instagram-flow', vars.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar'),
  });
}

export function useDeleteInstagramFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_instagram_flows' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-instagram-flows'] });
      toast.success('Automação removida');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao remover'),
  });
}

export function useInstagramFlowRuns(flowId: string | null | undefined, limit = 50) {
  return useQuery({
    queryKey: ['platform-crm-instagram-flow-runs', flowId, limit],
    enabled: !!flowId,
    queryFn: async (): Promise<InstagramFlowRun[]> => {
      const { data, error } = await supabase
        .from('platform_crm_instagram_flow_runs' as any)
        .select('*')
        .eq('flow_id', flowId!)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });
}
