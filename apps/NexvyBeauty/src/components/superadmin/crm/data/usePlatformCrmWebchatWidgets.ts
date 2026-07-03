import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — captação: WIDGETS de webchat, desacoplados do tenant.
 * Toca APENAS `platform_crm_webchat_widgets` (+ leitura de `platform_crm_webchat_agent_configs`).
 * Sem organization_id (sem tenant) — a RLS super_admin-only isola os dados.
 * DIMENSÃO PRODUTO (D3 F1c): grava `product_id` na criação/edição, espelhando as
 * fontes `WidgetManager` (l.71 create) + `WidgetSettingsTab` (l.23/l.80 edit) — o
 * lead nascido do widget herda esse produto no edge platform-webchat-api.
 */

export type PlatformCrmWebchatWidget = Tables<'platform_crm_webchat_widgets'>;
export type PlatformCrmWebchatWidgetInsert = TablesInsert<'platform_crm_webchat_widgets'>;
export type PlatformCrmWebchatWidgetUpdate = TablesUpdate<'platform_crm_webchat_widgets'>;
export type PlatformCrmWebchatAgentConfig = Tables<'platform_crm_webchat_agent_configs'>;

const PLATFORM_CRM_KEY = 'platform-crm';

/** Gera a public_key do widget (usada pelo snippet de embed). */
function generateWidgetPublicKey(): string {
  return `wc_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function usePlatformCrmWebchatWidgets() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'webchat-widgets'],
    queryFn: async (): Promise<PlatformCrmWebchatWidget[]> => {
      const { data, error } = await supabase
        .from('platform_crm_webchat_widgets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmWebchatWidget[];
    },
  });
}

export function usePlatformCrmWebchatAgentConfigs(widgetId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'webchat-agent-configs', widgetId],
    enabled: !!widgetId,
    queryFn: async (): Promise<PlatformCrmWebchatAgentConfig[]> => {
      const { data, error } = await supabase
        .from('platform_crm_webchat_agent_configs')
        .select('*')
        .eq('widget_id', widgetId!);

      if (error) throw error;
      return (data ?? []) as PlatformCrmWebchatAgentConfig[];
    },
  });
}

export function useCreatePlatformCrmWebchatWidget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      welcome_message?: string | null;
      product_id?: string | null;
    }) => {
      const payload: PlatformCrmWebchatWidgetInsert = {
        name: input.name,
        welcome_message: input.welcome_message ?? null,
        // Carimba o produto da superfície de captação (fonte WidgetManager l.71).
        product_id: input.product_id ?? null,
        public_key: generateWidgetPublicKey(),
        is_active: false,
        settings: {},
      };
      const { data, error } = await supabase
        .from('platform_crm_webchat_widgets')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmWebchatWidget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webchat-widgets'] });
      toast.success('Widget criado!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM webchat widget:', error);
      toast.error('Erro ao criar widget');
    },
  });
}

export function useUpdatePlatformCrmWebchatWidget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: PlatformCrmWebchatWidgetUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_webchat_widgets')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmWebchatWidget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webchat-widgets'] });
      toast.success('Widget atualizado!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM webchat widget:', error);
      toast.error('Erro ao atualizar widget');
    },
  });
}

/** Liga/desliga o widget sem toast de sucesso (uso em Switch inline). */
export function useTogglePlatformCrmWebchatWidget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('platform_crm_webchat_widgets')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webchat-widgets'] });
    },
    onError: (error: any) => {
      console.error('Error toggling platform CRM webchat widget:', error);
      toast.error('Erro ao alterar status do widget');
    },
  });
}

export function useDeletePlatformCrmWebchatWidget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_webchat_widgets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webchat-widgets'] });
      toast.success('Widget removido!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM webchat widget:', error);
      toast.error('Erro ao remover widget');
    },
  });
}
