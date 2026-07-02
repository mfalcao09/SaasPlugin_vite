import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * Respostas Rápidas do CRM de PLATAFORMA (super_admin) — atalhos de mensagens
 * prontas do pipeline ÚNICO, desacoplados do tenant.
 * Toca APENAS `platform_crm_quick_replies`. Sem organization_id / product_id —
 * a RLS super_admin-only isola os dados. `created_by` vem de auth.users.
 */

export type PlatformCrmQuickReply = Tables<'platform_crm_quick_replies'>;
export type PlatformCrmQuickReplyInsert = TablesInsert<'platform_crm_quick_replies'>;
export type PlatformCrmQuickReplyUpdate = TablesUpdate<'platform_crm_quick_replies'>;

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmQuickReplies() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'quick-replies'],
    queryFn: async (): Promise<PlatformCrmQuickReply[]> => {
      const { data, error } = await supabase
        .from('platform_crm_quick_replies')
        .select('*')
        .order('category', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmQuickReply[];
    },
  });
}

export function useCreatePlatformCrmQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: Omit<PlatformCrmQuickReplyInsert, 'created_by'>,
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('platform_crm_quick_replies')
        .insert({ ...payload, created_by: user.id })
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmQuickReply;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'quick-replies'] });
      toast.success('Resposta rápida salva!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM quick reply:', error);
      toast.error('Erro ao salvar resposta rápida');
    },
  });
}

export function useUpdatePlatformCrmQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmQuickReplyUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_quick_replies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmQuickReply;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'quick-replies'] });
      toast.success('Resposta rápida atualizada!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM quick reply:', error);
      toast.error('Erro ao atualizar resposta rápida');
    },
  });
}

export function useDeletePlatformCrmQuickReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_quick_replies')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'quick-replies'] });
      toast.success('Resposta excluída!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM quick reply:', error);
      toast.error('Erro ao remover resposta rápida');
    },
  });
}
