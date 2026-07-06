import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import {
  FlowBlock,
  TriggerConditions,
  CollectedVariable,
  TriggerType,
} from '@/types/chatFlow';
import { toast } from 'sonner';

/**
 * FLUXOS DE CHATBOT (FlowBuilder) do CRM de PLATAFORMA (super_admin) —
 * TOTALMENTE DESACOPLADO do tenant. Toca APENAS `platform_crm_chat_flows`.
 *
 * Sem organization_id (sem tenant) — a RLS super_admin-only isola os dados.
 * Diferenças vs. original (CRM Vendus — src/hooks/useChatFlows.ts):
 *   - Sem organization_id: a tabela de plataforma não tem essa coluna.
 *   - `created_by` resolvido via supabase.auth.getUser() (desacoplado de useAuth/org).
 *   - `product_id` é opcional/null: a plataforma é org-agnóstica; o vínculo a um
 *     `platform_crm_products` é opcional (FK nullable).
 *   - `toggleActive`: alterna o flag do fluxo alvo. No original, ativar desativava
 *     os demais fluxos do MESMO produto (exclusividade por produto). Aqui o toggle
 *     é simples — sem produto obrigatório não há chave de escopo natural para a
 *     exclusividade; o UI trata múltiplos fluxos ativos como aceitável.
 */

export type PlatformCrmChatFlow = Tables<'platform_crm_chat_flows'>;
type PlatformCrmChatFlowInsert = TablesInsert<'platform_crm_chat_flows'>;

const PLATFORM_CRM_KEY = 'platform-crm';

/** Tipo de domínio (parseado do row cru), reaproveitando os tipos de `@/types/chatFlow`. */
export interface PlatformCrmChatFlowParsed {
  id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  blocks: FlowBlock[];
  start_block_id: string | null;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_conditions: TriggerConditions;
  collected_variables: CollectedVariable[];
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

/** Converte o row cru (JSONB solto) no shape de domínio tipado. */
function parseChatFlow(data: PlatformCrmChatFlow): PlatformCrmChatFlowParsed {
  return {
    id: data.id,
    product_id: data.product_id,
    name: data.name,
    description: data.description,
    blocks: (data.blocks || []) as unknown as FlowBlock[],
    start_block_id: data.start_block_id,
    is_active: data.is_active ?? true,
    trigger_type: (data.trigger_type || 'always') as TriggerType,
    trigger_conditions: (data.trigger_conditions || {}) as unknown as TriggerConditions,
    collected_variables: (data.collected_variables || []) as unknown as CollectedVariable[],
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by,
  };
}

/** Resolve o UUID do usuário logado (super_admin) — desacoplado de `useAuth`/org. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── Listagem ────────────────────────────────────────────────────────────────
/**
 * Lista fluxos da plataforma. `productId` é opcional: quando informado, filtra
 * por produto; quando omitido, lista todos (comportamento org-agnóstico).
 */
export function usePlatformCrmChatFlows(productId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'chat-flows', productId ?? 'all'],
    queryFn: async (): Promise<PlatformCrmChatFlowParsed[]> => {
      let query = supabase
        .from('platform_crm_chat_flows')
        .select('*')
        .order('created_at', { ascending: false });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(parseChatFlow);
    },
  });
}

// ── Fluxo único ───────────────────────────────────────────────────────────────
export function usePlatformCrmChatFlow(flowId?: string) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'chat-flow', flowId],
    enabled: !!flowId,
    queryFn: async (): Promise<PlatformCrmChatFlowParsed | null> => {
      if (!flowId) return null;
      const { data, error } = await supabase
        .from('platform_crm_chat_flows')
        .select('*')
        .eq('id', flowId)
        .single();

      if (error) throw error;
      return parseChatFlow(data);
    },
  });
}

// ── Criar ──────────────────────────────────────────────────────────────────
export function useCreatePlatformCrmChatFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      name?: string;
      description?: string | null;
      productId?: string | null;
    }) => {
      const createdBy = await currentUserId();
      const payload: PlatformCrmChatFlowInsert = {
        name: params.name || 'Novo Fluxo',
        description: params.description ?? null,
        product_id: params.productId ?? null,
        blocks: [],
        start_block_id: null,
        is_active: false,
        trigger_type: 'always',
        trigger_conditions: {},
        collected_variables: [],
        created_by: createdBy,
      };

      const { data, error } = await supabase
        .from('platform_crm_chat_flows')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flows'] });
      toast.success('Fluxo criado com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error creating platform CRM chat flow:', error);
      toast.error('Erro ao criar fluxo: ' + error.message);
    },
  });
}

// ── Atualizar ─────────────────────────────────────────────────────────────────
export function useUpdatePlatformCrmChatFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      flowId: string;
      updates: Partial<{
        name: string;
        description: string | null;
        blocks: FlowBlock[];
        start_block_id: string | null;
        is_active: boolean;
        trigger_type: TriggerType;
        trigger_conditions: TriggerConditions;
        collected_variables: CollectedVariable[];
      }>;
    }) => {
      const updatePayload = {
        ...params.updates,
        blocks: params.updates.blocks as unknown as PlatformCrmChatFlow['blocks'],
        trigger_conditions: params.updates
          .trigger_conditions as unknown as PlatformCrmChatFlow['trigger_conditions'],
        collected_variables: params.updates
          .collected_variables as unknown as PlatformCrmChatFlow['collected_variables'],
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('platform_crm_chat_flows')
        .update(updatePayload)
        .eq('id', params.flowId)
        .select()
        .single();

      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flows'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flow', data.id] });
    },
    onError: (error: Error) => {
      console.error('Error updating platform CRM chat flow:', error);
      toast.error('Erro ao atualizar fluxo: ' + error.message);
    },
  });
}

// ── Salvar blocos (blocks + start_block_id + collected_variables) ─────────────
export function useSavePlatformCrmChatFlowBlocks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      flowId: string;
      blocks: FlowBlock[];
      startBlockId: string | null;
      collectedVariables: CollectedVariable[];
    }) => {
      const { data, error } = await supabase
        .from('platform_crm_chat_flows')
        .update({
          blocks: params.blocks as unknown as PlatformCrmChatFlow['blocks'],
          start_block_id: params.startBlockId,
          collected_variables:
            params.collectedVariables as unknown as PlatformCrmChatFlow['collected_variables'],
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.flowId)
        .select()
        .single();

      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flows'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flow', data.id] });
      toast.success('Fluxo salvo!');
    },
    onError: (error: Error) => {
      console.error('Error saving platform CRM chat flow blocks:', error);
      toast.error('Erro ao salvar fluxo: ' + error.message);
    },
  });
}

// ── Ativar/Desativar ──────────────────────────────────────────────────────────
export function useTogglePlatformCrmChatFlowActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { flowId: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('platform_crm_chat_flows')
        .update({
          is_active: params.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.flowId)
        .select()
        .single();

      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flows'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flow', data.id] });
      toast.success(data.is_active ? 'Fluxo ativado!' : 'Fluxo desativado!');
    },
    onError: (error: Error) => {
      console.error('Error toggling platform CRM chat flow status:', error);
      toast.error('Erro ao alterar status: ' + error.message);
    },
  });
}

// ── Deletar ───────────────────────────────────────────────────────────────────
export function useDeletePlatformCrmChatFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { flowId: string }) => {
      const { error } = await supabase
        .from('platform_crm_chat_flows')
        .delete()
        .eq('id', params.flowId);

      if (error) throw error;
      return params;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flows'] });
      toast.success('Fluxo excluído!');
    },
    onError: (error: Error) => {
      console.error('Error deleting platform CRM chat flow:', error);
      toast.error('Erro ao excluir fluxo: ' + error.message);
    },
  });
}

// ── Duplicar ──────────────────────────────────────────────────────────────────
export function useDuplicatePlatformCrmChatFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (flowId: string) => {
      const { data: original, error: fetchError } = await supabase
        .from('platform_crm_chat_flows')
        .select('*')
        .eq('id', flowId)
        .single();

      if (fetchError) throw fetchError;

      const createdBy = await currentUserId();
      const payload: PlatformCrmChatFlowInsert = {
        name: `${original.name} (cópia)`,
        description: original.description,
        product_id: original.product_id,
        blocks: original.blocks,
        start_block_id: original.start_block_id,
        is_active: false,
        trigger_type: original.trigger_type ?? 'always',
        trigger_conditions: original.trigger_conditions ?? {},
        collected_variables: original.collected_variables ?? [],
        created_by: createdBy,
      };

      const { data, error } = await supabase
        .from('platform_crm_chat_flows')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'chat-flows'] });
      toast.success('Fluxo duplicado!');
    },
    onError: (error: Error) => {
      console.error('Error duplicating platform CRM chat flow:', error);
      toast.error('Erro ao duplicar fluxo: ' + error.message);
    },
  });
}
