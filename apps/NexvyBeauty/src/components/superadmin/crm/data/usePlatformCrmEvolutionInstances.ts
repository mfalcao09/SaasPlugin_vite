import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * Conexões de WhatsApp via QR (Evolution) do CRM de PLATAFORMA (super_admin).
 * Porte 1:1 do `useEvolutionInstances.ts` do CRM Vendus, mas:
 *   • `.from('platform_crm_evolution_instances')` (não `evolution_instances`)
 *   • Edge `platform-evolution-proxy` (roteia por `body.action`)
 *   • SEM organization_id / useAuth — a RLS super_admin-only isola os dados.
 *   • Operador = ILIMITADO: nenhum gate de plano/`max_connections`.
 */

export type PlatformCrmEvolutionInstance = Tables<'platform_crm_evolution_instances'>;

async function proxy(body: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke('platform-evolution-proxy', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function usePlatformCrmEvolutionInstances() {
  return useQuery({
    queryKey: ['platform-crm-evolution-instances'],
    queryFn: async (): Promise<PlatformCrmEvolutionInstance[]> => {
      const { data, error } = await supabase
        .from('platform_crm_evolution_instances')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlatformCrmEvolutionInstance[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['platform-crm-evolution-instances'] });
}

export function useCreatePlatformCrmEvolutionInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: { name: string }) => proxy({ action: 'create_instance_self', name: vars.name }),
    onSuccess: () => {
      invalidate();
      toast.success('Conexão criada! Escaneie o QR Code para ativar.');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao criar conexão'),
  });
}

export function useConnectPlatformCrmEvolutionInstance() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'connect_instance', id }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error('Erro ao conectar: ' + e.message),
  });
}

export function useDisconnectPlatformCrmEvolutionInstance() {
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

export function useLogoutPlatformCrmEvolutionInstance() {
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

export function useDeletePlatformCrmEvolutionInstance() {
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

export function useRenamePlatformCrmEvolutionInstance() {
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

export function useSetDefaultPlatformCrmEvolutionInstance() {
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
