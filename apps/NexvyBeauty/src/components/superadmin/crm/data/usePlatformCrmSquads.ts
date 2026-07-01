import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — times/setores de vendas do pipeline ÚNICO,
 * desacoplados do tenant. Toca APENAS `platform_crm_sales_squads` +
 * `platform_crm_squad_members`. Sem organization_id / product_id — a RLS
 * super_admin-only isola os dados.
 */

export type PlatformCrmSquad = Tables<'platform_crm_sales_squads'>;
export type PlatformCrmSquadInsert = TablesInsert<'platform_crm_sales_squads'>;
export type PlatformCrmSquadUpdate = TablesUpdate<'platform_crm_sales_squads'>;

export type PlatformCrmSquadMember = Tables<'platform_crm_squad_members'>;
export type PlatformCrmSquadMemberInsert = TablesInsert<'platform_crm_squad_members'>;

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmSquads() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'squads'],
    queryFn: async (): Promise<PlatformCrmSquad[]> => {
      const { data, error } = await supabase
        .from('platform_crm_sales_squads')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmSquad[];
    },
  });
}

/** Membros de um squad específico. */
export function usePlatformCrmSquadMembers(squadId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'squad-members', squadId],
    enabled: !!squadId,
    queryFn: async (): Promise<PlatformCrmSquadMember[]> => {
      const { data, error } = await supabase
        .from('platform_crm_squad_members')
        .select('*')
        .eq('squad_id', squadId!)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmSquadMember[];
    },
  });
}

export function useCreatePlatformCrmSquad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (squad: PlatformCrmSquadInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_sales_squads')
        .insert(squad)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmSquad;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'squads'] });
      toast.success('Time criado!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM squad:', error);
      toast.error('Erro ao criar time');
    },
  });
}

export function useUpdatePlatformCrmSquad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmSquadUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_sales_squads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmSquad;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'squads'] });
      toast.success('Time atualizado!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM squad:', error);
      toast.error('Erro ao atualizar time');
    },
  });
}

export function useDeletePlatformCrmSquad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_sales_squads')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'squads'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'squad-members'] });
      toast.success('Time removido!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM squad:', error);
      toast.error('Erro ao remover time');
    },
  });
}

/** Adiciona um membro (user_id) a um squad. */
export function useAddPlatformCrmSquadMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      squadId,
      userId,
      role = 'member',
    }: {
      squadId: string;
      userId: string;
      role?: string;
    }) => {
      const { data, error } = await supabase
        .from('platform_crm_squad_members')
        .insert({ squad_id: squadId, user_id: userId, role })
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmSquadMember;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'squad-members', vars.squadId],
      });
      toast.success('Membro adicionado!');
    },
    onError: (error: any) => {
      console.error('Error adding platform CRM squad member:', error);
      toast.error('Erro ao adicionar membro');
    },
  });
}

/** Remove um membro do squad pelo id da linha de associação. */
export function useRemovePlatformCrmSquadMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId }: { memberId: string; squadId: string }) => {
      const { error } = await supabase
        .from('platform_crm_squad_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      return memberId;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'squad-members', vars.squadId],
      });
      toast.success('Membro removido!');
    },
    onError: (error: any) => {
      console.error('Error removing platform CRM squad member:', error);
      toast.error('Erro ao remover membro');
    },
  });
}
