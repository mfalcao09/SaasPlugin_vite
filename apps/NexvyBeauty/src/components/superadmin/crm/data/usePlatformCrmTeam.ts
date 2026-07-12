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
 * ATUALIZAÇÃO (2026-07-12): existe SIM a tabela de atribuição produto↔usuário —
 * `platform_crm_user_product_assignments` (user_id, product_id, assigned_by,
 * monthly_goal). Ela agora é a 3ª fonte de `user_ids` da equipe (além de
 * squad_members + leads), para que um usuário recém-criado e atribuído a um
 * produto apareça na lista mesmo sem squad/lead.
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

      // 3ª fonte: usuários atribuídos a um produto (aparecem mesmo sem squad/lead)
      const { data: productAssigns, error: paErr } = await supabase
        .from('platform_crm_user_product_assignments')
        .select('user_id');
      if (paErr) throw paErr;

      const ids = new Set<string>();
      (squadMembers ?? []).forEach((m) => m.user_id && ids.add(m.user_id));
      (assigned ?? []).forEach((l) => {
        if (l.assigned_to) ids.add(l.assigned_to);
        if (l.sdr_id) ids.add(l.sdr_id);
        if (l.closer_id) ids.add(l.closer_id);
      });
      (productAssigns ?? []).forEach((a) => a.user_id && ids.add(a.user_id));

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

export interface CreatePlatformCrmTeamMemberInput {
  email: string;
  password: string;
  full_name: string;
  role: AppRole;
  recovery_whatsapp?: string;
  /** Produto ativo (effectiveProductId). null = "Todos os produtos" (sem atribuição). */
  product_id: string | null;
  monthly_goal?: number | null;
  sector_ids?: string[];
  squad_id?: string | null;
  avatar_url?: string | null;
}

/**
 * Criação de usuário da PLATAFORMA (super_admin) — port do fluxo "Adicionar Usuário"
 * do CRM Vendus, porém PRODUCT-SCOPED e SEM organization_id.
 *
 * ⚠️ HITL / PENDÊNCIA DE INFRA (verificado 2026-07-12, proj fzhlbwhdejumkyqosuvq):
 * a edge server-side `create-platform-team-member` **AINDA NÃO EXISTE**. As edges
 * de criação hoje deployadas — `create-team-member` e `create-organization-admin`
 * — são ORG/TENANT-scoped (gravam `profiles.organization_id`, usam `sector_members`
 * / `evolution_instances` / `initialize_user_permissions` do tenant) e NÃO servem
 * ao time da plataforma, cujo universo é `platform_crm_*` sem org. Reusá-las criaria
 * um usuário de tenant que sequer apareceria nesta tela. Por isso NÃO reaproveitamos.
 *
 * Contrato esperado da edge a construir (service-role; senha NUNCA logada — Seção 11):
 *   body: CreatePlatformCrmTeamMemberInput
 *   passos server-side:
 *     1. is_super_admin(caller) — gate de permissão.
 *     2. admin.auth.admin.createUser({ email, password, email_confirm:true,
 *        user_metadata:{ full_name } }).
 *     3. profiles.upsert({ id, full_name, email, avatar_url, recovery_whatsapp })
 *        — SEM organization_id.
 *     4. user_roles: delete + insert { user_id, role }.
 *     5. platform_crm_user_product_assignments.insert({ user_id, product_id,
 *        assigned_by: caller, monthly_goal }) quando product_id != null.
 *     6. platform_crm_sector_members.insert(sector_ids.map(...)).
 *     7. platform_crm_squad_members.insert({ squad_id, user_id, role:'member' })
 *        quando squad_id != null.
 *   retorno: { success:true, user_id }.
 *
 * Enquanto a edge não existir, o submit devolve erro (exibido via toast) — sem
 * fallback silencioso e sem gravar em tabela de tenant errada.
 */
export function useCreatePlatformCrmTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePlatformCrmTeamMemberInput) => {
      const { data, error } = await supabase.functions.invoke(
        'create-platform-team-member',
        { body: input },
      );
      if (error) throw error;
      const payload = data as { success?: boolean; user_id?: string; error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'team-members'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'sellers'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'sectors'] });
    },
  });
}
