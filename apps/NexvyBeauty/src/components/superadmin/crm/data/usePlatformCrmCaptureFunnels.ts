import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — captação: FUNIS multicanal, desacoplados do tenant.
 * Toca APENAS `platform_crm_capture_funnels` + `platform_crm_funnel_analytics`.
 * Sem organization_id (sem tenant) — a RLS super_admin-only isola os dados.
 * DIMENSÃO PRODUTO (D3 F1c): grava `product_id` na criação, espelhando as fontes
 * `WidgetManager`/`ChatBotManager`/`QuizManager` (l.71: `product_id: productId` no
 * insert de capture_funnels) — chatbot/quiz/widget/chat são `channel_type` deste
 * mesmo funil. O lead herda o produto no edge (funnel-submit l.192).
 */

export type PlatformCrmCaptureFunnel = Tables<'platform_crm_capture_funnels'>;
export type PlatformCrmCaptureFunnelInsert = TablesInsert<'platform_crm_capture_funnels'>;
export type PlatformCrmCaptureFunnelUpdate = TablesUpdate<'platform_crm_capture_funnels'>;
export type PlatformCrmFunnelAnalytics = Tables<'platform_crm_funnel_analytics'>;

const PLATFORM_CRM_KEY = 'platform-crm';

/** Gera um slug a partir de um nome (kebab-case, sem acentos). */
export function generateFunnelSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export function usePlatformCrmCaptureFunnels() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'capture-funnels'],
    queryFn: async (): Promise<PlatformCrmCaptureFunnel[]> => {
      const { data, error } = await supabase
        .from('platform_crm_capture_funnels')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmCaptureFunnel[];
    },
  });
}

export function usePlatformCrmCaptureFunnel(funnelId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'capture-funnel', funnelId],
    enabled: !!funnelId,
    queryFn: async (): Promise<PlatformCrmCaptureFunnel | null> => {
      const { data, error } = await supabase
        .from('platform_crm_capture_funnels')
        .select('*')
        .eq('id', funnelId!)
        .single();

      if (error) throw error;
      return data as PlatformCrmCaptureFunnel;
    },
  });
}

/** Analytics agregadas do funil (janela de N dias). */
export function usePlatformCrmFunnelAnalytics(funnelId: string | undefined, days = 30) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'funnel-analytics', funnelId, days],
    enabled: !!funnelId,
    queryFn: async (): Promise<PlatformCrmFunnelAnalytics[]> => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from('platform_crm_funnel_analytics')
        .select('*')
        .eq('funnel_id', funnelId!)
        .gte('date', since.toISOString().slice(0, 10))
        .order('date', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmFunnelAnalytics[];
    },
  });
}

export function useCreatePlatformCrmCaptureFunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string | null;
      product_id?: string | null;
      channel_type?: string;
      distribution_rule?: string;
      status?: string;
      // Sementes de blocos do funil (IA/scratch/template). Default: []
      // preserva o comportamento atual quando não informados.
      flow_blocks?: PlatformCrmCaptureFunnelInsert['flow_blocks'];
      start_block_id?: string | null;
    }) => {
      const slug = generateFunnelSlug(input.name) || `funil-${Date.now()}`;
      const payload: PlatformCrmCaptureFunnelInsert = {
        name: input.name,
        description: input.description ?? null,
        // Carimba o produto da superfície de captação (fonte WidgetManager l.71).
        product_id: input.product_id ?? null,
        slug,
        channel_type: input.channel_type ?? 'chat',
        distribution_rule: input.distribution_rule ?? 'round_robin',
        status: input.status ?? 'draft',
        channels: {
          chat: { enabled: true, slug_override: null },
          form: { enabled: false, slug_override: null },
          widget: { enabled: false },
        },
        // Semeia os blocos quando presentes; default [] mantém o insert atual.
        flow_blocks: input.flow_blocks ?? [],
        // start_block_id só entra no insert quando informado (coluna nullable).
        ...(input.start_block_id != null
          ? { start_block_id: input.start_block_id }
          : {}),
      };
      const { data, error } = await supabase
        .from('platform_crm_capture_funnels')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCaptureFunnel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'capture-funnels'] });
      toast.success('Funil criado!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM funnel:', error);
      toast.error('Erro ao criar funil');
    },
  });
}

export function useUpdatePlatformCrmCaptureFunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: PlatformCrmCaptureFunnelUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_capture_funnels')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCaptureFunnel;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'capture-funnels'] });
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'capture-funnel', vars.id],
      });
      toast.success('Funil atualizado!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM funnel:', error);
      toast.error('Erro ao atualizar funil');
    },
  });
}

export function useDeletePlatformCrmCaptureFunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_capture_funnels')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'capture-funnels'] });
      toast.success('Funil removido!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM funnel:', error);
      toast.error('Erro ao remover funil');
    },
  });
}

/** Alterna status (draft/active/paused) do funil. */
export function useTogglePlatformCrmFunnelStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('platform_crm_capture_funnels')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'capture-funnels'] });
    },
    onError: (error: any) => {
      console.error('Error toggling platform CRM funnel status:', error);
      toast.error('Erro ao alterar status');
    },
  });
}
