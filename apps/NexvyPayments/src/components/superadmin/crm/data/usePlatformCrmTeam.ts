import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

/**
 * CRM de PLATAFORMA (super_admin) — "equipe" = os reps de venda DA PLATAFORMA
 * (nossos times comerciais), NÃO usuários de tenant. O universo de usuários é o
 * mesmo do `usePlatformCrmSellers`: user_ids presentes em
 * `platform_crm_squad_members` + os já atribuídos a leads (assigned_to / sdr_id
 * / closer_id). Cada usuário é enriquecido com papel (`user_roles`) e squads
 * (`platform_crm_sales_squads` via `platform_crm_squad_members`).
 *
 * Port do `TeamManager`/`useTeam` do CRM Vendus. Sem organization_id /
 * product_id — a RLS super_admin-only isola os dados.
 *
 * TODO(migration): produtos por membro (o original tinha member.products via
 * tabela de atribuição produto↔usuário, que não existe no schema platform_crm_*).
 * TODO(migration): convites pendentes (não há tabela de convites da plataforma).
 */

const PLATFORM_CRM_KEY = 'platform-crm';

export interface PlatformCrmTeamSquadRef {
  id: string;
  name: string;
  color: string | null;
}

export interface PlatformCrmTeamMember {
  id: string; // = user_id
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean;
  role: string; // admin | manager | seller | super_admin
  squads: PlatformCrmTeamSquadRef[];
}

export function usePlatformCrmTeamMembers() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'team-members'],
    queryFn: async (): Promise<PlatformCrmTeamMember[]> => {
      // 1) user_ids: membros de squads + atribuídos a leads
      const { data: squadMembers, error: smErr } = await supabase
        .from('platform_crm_squad_members')
        .select('user_id, squad_id');
      if (smErr) throw smErr;

      const { data: assigned, error: asErr } = await supabase
        .from('platform_crm_leads')
        .select('assigned_to, sdr_id, closer_id');
      if (asErr) throw asErr;

      const ids = new Set<string>();
      (squadMembers ?? []).forEach((m) => m.user_id && ids.add(m.user_id));
      (assigned ?? []).forEach((l) => {
        if (l.assigned_to) ids.add(l.assigned_to);
        if (l.sdr_id) ids.add(l.sdr_id);
        if (l.closer_id) ids.add(l.closer_id);
      });

      if (ids.size === 0) return [];
      const userIds = [...ids];

      // 2) perfis
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, is_active')
        .in('id', userIds);
      if (pErr) throw pErr;

      // 3) papéis
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);
      const roleMap = new Map<string, string>();
      (roles ?? []).forEach((r) => {
        if (r.user_id) roleMap.set(r.user_id, r.role);
      });

      // 4) squads (nome/cor) para cada membro
      const squadIds = [
        ...new Set((squadMembers ?? []).map((m) => m.squad_id).filter(Boolean)),
      ];
      const squadRefMap = new Map<string, PlatformCrmTeamSquadRef>();
      if (squadIds.length > 0) {
        const { data: squads } = await supabase
          .from('platform_crm_sales_squads')
          .select('id, name, color')
          .in('id', squadIds as string[]);
        (squads ?? []).forEach((s) =>
          squadRefMap.set(s.id, { id: s.id, name: s.name, color: s.color }),
        );
      }
      const squadsByUser = new Map<string, PlatformCrmTeamSquadRef[]>();
      (squadMembers ?? []).forEach((m) => {
        if (!m.user_id || !m.squad_id) return;
        const ref = squadRefMap.get(m.squad_id);
        if (!ref) return;
        const arr = squadsByUser.get(m.user_id) ?? [];
        arr.push(ref);
        squadsByUser.set(m.user_id, arr);
      });

      return (profiles ?? [])
        .map((p) => ({
          id: p.id,
          full_name: p.full_name || p.email || 'Sem nome',
          email: p.email ?? null,
          avatar_url: p.avatar_url ?? null,
          is_active: p.is_active ?? true,
          role: roleMap.get(p.id) || 'seller',
          squads: squadsByUser.get(p.id) ?? [],
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });
}

/**
 * Atribuição de papel — port 1:1 do `useUpdateUserRole` do CRM Vendus.
 * Remove o(s) papel(is) existente(s) e insere o novo em `user_roles`.
 * Sem organization_id: a RLS super_admin isola o universo.
 */
export function useUpdatePlatformCrmUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      await supabase.from('user_roles').delete().eq('user_id', userId);

      const { data, error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'team-members'] });
    },
  });
}

/**
 * Remoção de membro — port 1:1 do `useRemoveTeamMember` do CRM Vendus.
 * Reutiliza a RPC `delete_team_member(p_user_id)` já existente no projeto
 * (remove papel, squads e vínculos do usuário de forma atômica no servidor).
 */
export function useRemovePlatformCrmTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('delete_team_member', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'team-members'] });
    },
  });
}
