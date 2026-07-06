import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import type { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — WEBHOOKS de ingestão do pipeline ÚNICO,
 * desacoplados do tenant. Toca APENAS `platform_crm_webhook*`.
 *
 * Diferenças de desacoplamento vs. o webhook de tenant original:
 *  - SEM `organization_id` (RLS super_admin-only isola os dados).
 *  - SEM `product_id` na tabela `platform_crm_webhooks` (dimensão "por produto"
 *    fica como TODO(produto), pendente de decisão de Produtos).
 *  - `created_by` referencia `auth.users` diretamente (setado no insert).
 *  - Logs vinculam a `platform_crm_leads` (lead_id), não a leads de tenant.
 *
 * ESCOPO CORE: CRUD de webhooks + leitura de logs/samples. O disparo/entrega
 * real (recepção HTTP, parsing, execução de ações) roda numa Edge Function
 * dedicada — ver TODO(edge) nos componentes.
 */

export type PlatformCrmWebhook = Tables<'platform_crm_webhooks'>;
export type PlatformCrmWebhookInsert = TablesInsert<'platform_crm_webhooks'>;
export type PlatformCrmWebhookLog = Tables<'platform_crm_webhook_logs'>;
export type PlatformCrmWebhookSample = Tables<'platform_crm_webhook_sample_requests'>;

const PLATFORM_CRM_KEY = 'platform-crm';

/** Lista todos os webhooks da plataforma (mais recentes primeiro). */
export function usePlatformCrmWebhooks() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'webhooks'],
    queryFn: async (): Promise<PlatformCrmWebhook[]> => {
      const { data, error } = await supabase
        .from('platform_crm_webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmWebhook[];
    },
  });
}

/** Busca um webhook único por id. */
export function usePlatformCrmWebhook(id: string | null) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'webhook', id],
    queryFn: async (): Promise<PlatformCrmWebhook | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('platform_crm_webhooks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as PlatformCrmWebhook;
    },
    enabled: !!id,
  });
}

/** Gera slug a partir do nome (sem acentos, kebab-case) + sufixo único. */
function buildSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base}-${Date.now().toString(36)}`;
}

/** Cria um novo webhook (inativo + modo teste por padrão). */
export function useCreatePlatformCrmWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const payload: PlatformCrmWebhookInsert = {
        name: input.name,
        slug: buildSlug(input.name),
        description: input.description || null,
        created_by: user.id,
        is_active: false,
        is_test_mode: true,
        actions: [] as unknown as Json,
        identification_config: { lookup_strategy: 'email_first' } as unknown as Json,
      };

      const { data, error } = await supabase
        .from('platform_crm_webhooks')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmWebhook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webhooks'] });
      toast.success('Webhook criado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM webhook:', error);
      toast.error(`Erro ao criar webhook: ${error?.message ?? 'desconhecido'}`);
    },
  });
}

/** Atualiza campos de um webhook (nome, descrição, flags, ações, etc.). */
export function useUpdatePlatformCrmWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Partial<PlatformCrmWebhook> & { id: string }) => {
      const { error } = await supabase
        .from('platform_crm_webhooks')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webhooks'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webhook', id] });
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM webhook:', error);
      toast.error(`Erro ao atualizar webhook: ${error?.message ?? 'desconhecido'}`);
    },
  });
}

/** Remove um webhook (logs/samples caem por FK cascade no schema). */
export function useDeletePlatformCrmWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_webhooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webhooks'] });
      toast.success('Webhook excluído com sucesso!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM webhook:', error);
      toast.error(`Erro ao excluir webhook: ${error?.message ?? 'desconhecido'}`);
    },
  });
}

/** Últimas 100 requisições logadas de um webhook. */
export function usePlatformCrmWebhookLogs(webhookId: string | null) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'webhook-logs', webhookId],
    queryFn: async (): Promise<PlatformCrmWebhookLog[]> => {
      if (!webhookId) return [];

      const { data, error } = await supabase
        .from('platform_crm_webhook_logs')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as PlatformCrmWebhookLog[];
    },
    enabled: !!webhookId,
  });
}

/** Amostras de payload capturadas (usadas para mapear campos → ações). */
export function usePlatformCrmWebhookSamples(webhookId: string | null) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'webhook-samples', webhookId],
    queryFn: async (): Promise<PlatformCrmWebhookSample[]> => {
      if (!webhookId) return [];

      const { data, error } = await supabase
        .from('platform_crm_webhook_sample_requests')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmWebhookSample[];
    },
    enabled: !!webhookId,
  });
}

/** Remove uma amostra de payload capturada (usada pelo RequestsPanel). */
export function useDeletePlatformCrmWebhookSample() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sampleId: string) => {
      const { error } = await supabase
        .from('platform_crm_webhook_sample_requests')
        .delete()
        .eq('id', sampleId);

      if (error) throw error;
      return sampleId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'webhook-samples'] });
      toast.success('Amostra removida');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM webhook sample:', error);
      toast.error(`Erro ao remover amostra: ${error?.message ?? 'desconhecido'}`);
    },
  });
}
