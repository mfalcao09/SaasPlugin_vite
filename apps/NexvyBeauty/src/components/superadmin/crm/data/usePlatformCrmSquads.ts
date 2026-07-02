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

/**
 * Squad da plataforma enriquecido com contagem de membros (usado nos cards de
 * performance). `members_count` é resolvido num passo separado — não há FK
 * agregada em `platform_crm_squad_members`.
 */
export type PlatformCrmSquad = Tables<'platform_crm_sales_squads'> & {
  members_count?: number;
};
export type PlatformCrmSquadInsert = TablesInsert<'platform_crm_sales_squads'>;
export type PlatformCrmSquadUpdate = TablesUpdate<'platform_crm_sales_squads'>;

export type PlatformCrmSquadMember = Tables<'platform_crm_squad_members'>;
export type PlatformCrmSquadMemberInsert = TablesInsert<'platform_crm_squad_members'>;

/** Membro de squad já resolvido contra `profiles` (avatar/nome/email). */
export type PlatformCrmSquadMemberWithProfile = PlatformCrmSquadMember & {
  profile?: {
    id: string;
    full_name: string;
    email: string | null;
    avatar_url: string | null;
  };
};

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmSquads() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'squads'],
    queryFn: async (): Promise<PlatformCrmSquad[]> => {
      const { data, error } = await supabase
        .from('platform_crm_sales_squads')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      const squads = (data ?? []) as PlatformCrmSquad[];
      const squadIds = squads.map((s) => s.id);
      if (squadIds.length === 0) return squads;

      // Contagem de membros por squad (sem FK agregada).
      const { data: membersData } = await supabase
        .from('platform_crm_squad_members')
        .select('squad_id')
        .in('squad_id', squadIds);

      const countMap = new Map<string, number>();
      (membersData ?? []).forEach((m) => {
        if (m.squad_id) countMap.set(m.squad_id, (countMap.get(m.squad_id) ?? 0) + 1);
      });

      return squads.map((s) => ({ ...s, members_count: countMap.get(s.id) ?? 0 }));
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

/**
 * Membros de um squad JÁ resolvidos contra `profiles` (avatar/nome/email) — usado
 * no diálogo de membros para exibir o usuário escolhido em vez do UUID cru. Não há
 * FK declarada de `squad_members.user_id → profiles`, então o join é manual.
 */
export function usePlatformCrmSquadMembersWithProfiles(squadId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'squad-members-profiles', squadId],
    enabled: !!squadId,
    queryFn: async (): Promise<PlatformCrmSquadMemberWithProfile[]> => {
      const { data: members, error } = await supabase
        .from('platform_crm_squad_members')
        .select('*')
        .eq('squad_id', squadId!)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      const rows = (members ?? []) as PlatformCrmSquadMember[];
      const userIds = rows.map((m) => m.user_id).filter(Boolean);
      if (userIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      return rows.map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id)
          ? {
              id: m.user_id,
              full_name:
                profileMap.get(m.user_id)!.full_name ||
                profileMap.get(m.user_id)!.email ||
                'Sem nome',
              email: profileMap.get(m.user_id)!.email ?? null,
              avatar_url: profileMap.get(m.user_id)!.avatar_url ?? null,
            }
          : undefined,
      }));
    },
  });
}

/** Atualiza a função (role: 'leader' | 'member') de um membro do squad. */
export function useUpdatePlatformCrmSquadMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: string;
      squadId: string;
    }) => {
      const { error } = await supabase
        .from('platform_crm_squad_members')
        .update({ role })
        .eq('id', memberId);

      if (error) throw error;
      return memberId;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'squad-members-profiles', vars.squadId],
      });
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'squad-members', vars.squadId],
      });
      toast.success('Função atualizada!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM squad member role:', error);
      toast.error('Erro ao atualizar função');
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
      // Soft delete: marca inativo em vez de apagar (paridade com useSquads.ts).
      const { error } = await supabase
        .from('platform_crm_sales_squads')
        .update({ is_active: false })
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
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'squad-members-profiles', vars.squadId],
      });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'squads'] });
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
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'squad-members-profiles', vars.squadId],
      });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'squads'] });
      toast.success('Membro removido!');
    },
    onError: (error: any) => {
      console.error('Error removing platform CRM squad member:', error);
      toast.error('Erro ao remover membro');
    },
  });
}
