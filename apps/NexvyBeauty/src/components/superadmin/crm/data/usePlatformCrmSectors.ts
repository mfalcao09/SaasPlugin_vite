import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — SETORES (filas de atendimento).
 * Toca APENAS `platform_crm_sectors` + `platform_crm_sector_members`.
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 *
 * Port 1:1 do `useSectors` do CRM Vendus. Desacoplamento:
 *   - sectors            -> platform_crm_sectors
 *   - sector_members     -> platform_crm_sector_members
 *   - membros (nomes/avatares) enriquecidos via `profiles` num segundo fetch
 *     (a tabela platform_crm_sector_members não declara FK para profiles, então
 *     o embed aninhado do original não é usado — buscamos e mapeamos manualmente,
 *     mesmo padrão de `usePlatformCrmTeam`).
 *
 * TODO(edge): `created_by` usa o super_admin logado; a RPC/trigger de defaults
 * de setor (greeting/rotation) do tenant não existe no schema de plataforma.
 */

const PLATFORM_CRM_KEY = 'platform-crm';

type SectorRow = Tables<'platform_crm_sectors'>;

export interface PlatformCrmSectorMemberRef {
  user_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

export interface PlatformCrmSector extends SectorRow {
  member_count?: number;
  members?: PlatformCrmSectorMemberRef[];
}

export interface UpsertPlatformCrmSectorPayload {
  id?: string;
  name: string;
  color?: string;
  icon?: string;
  bot_order?: number;
  is_active?: boolean;
  member_ids?: string[];
}

export function usePlatformCrmSectors() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'sectors'],
    queryFn: async (): Promise<PlatformCrmSector[]> => {
      const { data: sectors, error } = await supabase
        .from('platform_crm_sectors')
        .select('*')
        .order('bot_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;

      const rows = (sectors ?? []) as SectorRow[];
      if (rows.length === 0) return [];

      // membros de todos os setores num único fetch
      const { data: memberRows, error: mErr } = await supabase
        .from('platform_crm_sector_members')
        .select('sector_id, user_id');
      if (mErr) throw mErr;

      const userIds = [
        ...new Set((memberRows ?? []).map((m) => m.user_id).filter(Boolean)),
      ] as string[];

      const profileMap = new Map<
        string,
        { full_name: string | null; avatar_url: string | null }
      >();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);
        (profiles ?? []).forEach((p) =>
          profileMap.set(p.id, {
            full_name: p.full_name ?? null,
            avatar_url: p.avatar_url ?? null,
          }),
        );
      }

      const membersBySector = new Map<string, PlatformCrmSectorMemberRef[]>();
      (memberRows ?? []).forEach((m) => {
        if (!m.sector_id || !m.user_id) return;
        const prof = profileMap.get(m.user_id);
        const arr = membersBySector.get(m.sector_id) ?? [];
        arr.push({
          user_id: m.user_id,
          full_name: prof?.full_name ?? null,
          avatar_url: prof?.avatar_url ?? null,
        });
        membersBySector.set(m.sector_id, arr);
      });

      return rows.map((s) => {
        const members = membersBySector.get(s.id) ?? [];
        return { ...s, member_count: members.length, members };
      });
    },
  });
}

export function useUpsertPlatformCrmSector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpsertPlatformCrmSectorPayload) => {
      const { id, member_ids, ...fields } = payload;
      let sectorId = id;

      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id ?? null;

      if (id) {
        const { error } = await supabase
          .from('platform_crm_sectors')
          .update(fields)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('platform_crm_sectors')
          .insert({ ...fields, created_by: currentUserId })
          .select('id')
          .single();
        if (error) throw error;
        sectorId = data.id;
      }

      if (member_ids && sectorId) {
        // sync membros: delete + insert
        await supabase
          .from('platform_crm_sector_members')
          .delete()
          .eq('sector_id', sectorId);
        if (member_ids.length > 0) {
          const rows = member_ids.map((uid) => ({
            sector_id: sectorId!,
            user_id: uid,
          }));
          const { error } = await supabase
            .from('platform_crm_sector_members')
            .insert(rows);
          if (error) throw error;
        }
      }

      return sectorId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'sectors'] });
    },
  });
}

export function useDeletePlatformCrmSector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_sectors')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'sectors'] });
    },
  });
}
