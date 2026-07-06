import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * Instagram Direct (Meta) do CRM de PLATAFORMA (super_admin).
 * Porte 1:1 do `useInstagramConnections.ts` do CRM Vendus, mas:
 *   • `.from('platform_crm_instagram_connections')`
 *   • Edges `platform-instagram-{draft,connect,test}`
 *   • SEM organization_id / useAuth — RLS super_admin-only isola os dados.
 */

export type PlatformCrmInstagramConnection = Tables<'platform_crm_instagram_connections'>;

export interface PlatformCrmDraftInstagramResponse {
  connection_id: string;
  verify_token: string;
  webhook_url: string;
  webhook_subscribed_at: string | null;
  status: string;
}

export function usePlatformCrmInstagramConnections() {
  return useQuery({
    queryKey: ['platform-crm-instagram-connections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_instagram_connections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlatformCrmInstagramConnection[];
    },
  });
}

export function useDraftPlatformCrmInstagramConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { display_name: string; connection_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('platform-instagram-draft', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as PlatformCrmDraftInstagramResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-crm-instagram-connections'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao criar rascunho'),
  });
}

export function useSavePlatformCrmInstagramConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.functions.invoke('platform-instagram-connect', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-instagram-connections'] });
      toast.success('Conexão Instagram ativa');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao ativar'),
  });
}

export function useTestPlatformCrmInstagramConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connection_id: string) => {
      const { data, error } = await supabase.functions.invoke('platform-instagram-test', { body: { connection_id } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['platform-crm-instagram-connections'] });
      if (data?.ok) toast.success(`Conectado como @${data?.ig?.username ?? 'instagram'}`);
      else toast.error(data?.error ?? 'Falha no teste');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha no teste'),
  });
}

export function useDeletePlatformCrmInstagramConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('platform_crm_instagram_connections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-crm-instagram-connections'] });
      toast.success('Conexão removida');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao remover'),
  });
}
