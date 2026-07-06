import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * Ações + memória da Mia do CRM de PLATAFORMA (super_admin) — D5.
 * Toca apenas `platform_crm_mia_actions` / `platform_crm_mia_user_memory`
 * (RLS super_admin-only isola os dados; SEM organization_id).
 *
 * Fluxo: a Mia PROPÕE uma ação (edge `platform-mia` → draftAction grava
 * `waiting_confirmation`); a UI mostra botões inline; confirmar invoca o edge
 * `platform-mia-execute-action`; cancelar marca `cancelled` direto (RLS permite).
 */

const PLATFORM_CRM_KEY = 'platform-crm';

export type PlatformCrmMiaAction = Tables<'platform_crm_mia_actions'>;
export type PlatformCrmMiaUserMemory = Tables<'platform_crm_mia_user_memory'>;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Ações pendentes do usuário logado + mutations de confirmar/cancelar.
 * A RLS super_admin vê ações de TODOS os super-admins, então filtramos por user_id.
 */
export function usePlatformCrmMiaActions() {
  const queryClient = useQueryClient();
  const pendingKey = [PLATFORM_CRM_KEY, 'mia', 'actions', 'pending'];

  const pending = useQuery({
    queryKey: pendingKey,
    queryFn: async (): Promise<PlatformCrmMiaAction[]> => {
      const uid = await currentUserId();
      if (!uid) return [];
      const { data, error } = await supabase
        .from('platform_crm_mia_actions')
        .select('*')
        .eq('user_id', uid)
        .eq('status', 'waiting_confirmation')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlatformCrmMiaAction[];
    },
  });

  const confirm = useMutation({
    mutationFn: async (actionId: string) => {
      const { data, error } = await supabase.functions.invoke('platform-mia-execute-action', {
        body: { action_id: actionId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pendingKey });
      toast.success('Ação confirmada — executando.');
    },
    onError: (error: Error) => {
      console.error('[platform-mia] confirm action failed', error);
      toast.error(error.message || 'Falha ao confirmar a ação.');
    },
  });

  const cancel = useMutation({
    mutationFn: async (actionId: string) => {
      const { error } = await supabase
        .from('platform_crm_mia_actions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', actionId);
      if (error) throw error;
      return actionId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pendingKey });
      toast.success('Ação cancelada.');
    },
    onError: (error: Error) => {
      console.error('[platform-mia] cancel action failed', error);
      toast.error(error.message || 'Falha ao cancelar a ação.');
    },
  });

  return {
    pending: pending.data ?? [],
    isLoading: pending.isLoading,
    refetch: pending.refetch,
    confirm: confirm.mutate,
    confirmAsync: confirm.mutateAsync,
    cancel: cancel.mutate,
    cancelAsync: cancel.mutateAsync,
    isConfirming: confirm.isPending,
    isCancelling: cancel.isPending,
  };
}

/** Memória pessoal do usuário logado (leitura; a escrita acontece via edge platform-mia). */
export function usePlatformCrmMiaMemory() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'mia', 'memory'],
    queryFn: async (): Promise<PlatformCrmMiaUserMemory | null> => {
      const uid = await currentUserId();
      if (!uid) return null;
      const { data, error } = await supabase
        .from('platform_crm_mia_user_memory')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PlatformCrmMiaUserMemory | null;
    },
    staleTime: 5 * 60_000,
  });
}
