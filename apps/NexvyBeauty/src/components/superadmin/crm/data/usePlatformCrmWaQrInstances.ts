import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * Conexões WhatsApp via QR (Z-API) do CRM de plataforma (super_admin).
 */

export type PlatformCrmWaQrInstance = Tables<'platform_crm_wa_qr_instances'>;

async function proxy(body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke('platform-whatsapp-qr-proxy', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

const QUERY_KEY = ['platform-crm-wa-qr-instances'] as const;

export function usePlatformCrmWaQrInstances() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<PlatformCrmWaQrInstance[]> => {
      const { data, error } = await supabase
        .from('platform_crm_wa_qr_instances')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlatformCrmWaQrInstance[];
    },
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as PlatformCrmWaQrInstance[];
      if (!rows.length) return 30_000;
      return rows.some((r) => r.status !== 'connected') ? 3_000 : 30_000;
    },
    refetchOnWindowFocus: true,
  });
}


function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  };
}

export function useCreatePlatformCrmWaQrInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: { name: string; product_id?: string | null; agent_ids?: string[] }) =>
      proxy({
        action: 'create_instance_self',
        name: vars.name,
        product_id: vars.product_id ?? null,
        agent_ids: vars.agent_ids ?? [],
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Conexão criada! Escaneie o QR Code para ativar.');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao criar conexão'),
  });
}

export function useConnectPlatformCrmWaQrInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'connect_instance', id }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error('Erro ao conectar: ' + e.message),
  });
}

export function useDisconnectPlatformCrmWaQrInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'disconnect_instance', id }),
    onSuccess: () => {
      invalidate();
      toast.success('Sessão pausada. Reconecte quando quiser — o número fica salvo.');
    },
    onError: (e: any) => toast.error('Erro ao pausar sessão: ' + e.message),
  });
}

export function useLogoutPlatformCrmWaQrInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'logout_instance', id }),
    onSuccess: () => {
      invalidate();
      toast.success('WhatsApp desvinculado. Escaneie um novo QR para conectar outro número.');
    },
    onError: (e: any) => toast.error('Erro ao desvincular: ' + e.message),
  });
}

export function useDeletePlatformCrmWaQrInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'delete_instance', id }),
    onSuccess: () => {
      invalidate();
      toast.success('Conexão excluída');
    },
    onError: (e: any) => toast.error('Erro ao excluir: ' + e.message),
  });
}

export function useRenamePlatformCrmWaQrInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      proxy({ action: 'rename_instance_self', id: vars.id, name: vars.name }),
    onSuccess: () => {
      invalidate();
      toast.success('Conexão renomeada');
    },
    onError: (e: any) => toast.error('Erro ao renomear: ' + e.message),
  });
}

export function useSetDefaultPlatformCrmWaQrInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'set_default', id }),
    onSuccess: () => {
      invalidate();
      toast.success('Instância padrão definida');
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}
