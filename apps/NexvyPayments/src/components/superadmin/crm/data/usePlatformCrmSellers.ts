import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * CRM de PLATAFORMA (super_admin) — "vendedores" = os reps de venda DA PLATAFORMA
 * (nossos times comerciais), NÃO usuários de tenant. São os `user_id` presentes em
 * `platform_crm_squad_members` + os já atribuídos a leads (assigned_to / sdr_id /
 * closer_id). Os nomes são resolvidos contra `profiles` num passo separado, já que
 * não há FK declarada de squad_members.user_id → profiles.
 *
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 */

export interface PlatformCrmSeller {
  id: string;
  full_name: string;
  avatar_url: string | null;
  email: string | null;
}

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmSellers() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'sellers'],
    queryFn: async (): Promise<PlatformCrmSeller[]> => {
      // 1) user_ids dos membros dos squads da plataforma
      const { data: members, error: membersErr } = await supabase
        .from('platform_crm_squad_members')
        .select('user_id');
      if (membersErr) throw membersErr;

      // 2) user_ids já atribuídos a leads (responsável / SDR / closer)
      const { data: assigned, error: assignedErr } = await supabase
        .from('platform_crm_leads')
        .select('assigned_to, sdr_id, closer_id');
      if (assignedErr) throw assignedErr;

      const ids = new Set<string>();
      (members ?? []).forEach((m) => m.user_id && ids.add(m.user_id));
      (assigned ?? []).forEach((l) => {
        if (l.assigned_to) ids.add(l.assigned_to);
        if (l.sdr_id) ids.add(l.sdr_id);
        if (l.closer_id) ids.add(l.closer_id);
      });

      if (ids.size === 0) return [];

      // 3) resolve nomes/avatars em `profiles`
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .in('id', [...ids]);
      if (profilesErr) throw profilesErr;

      return (profilesData ?? [])
        .map((p) => ({
          id: p.id,
          full_name: p.full_name || p.email || 'Sem nome',
          avatar_url: p.avatar_url,
          email: p.email ?? null,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });
}

/** Devolve um mapa id -> vendedor para lookup O(1) nos cards/detalhe. */
export function usePlatformCrmSellersMap() {
  const query = usePlatformCrmSellers();
  const map: Record<string, PlatformCrmSeller> = {};
  (query.data ?? []).forEach((s) => {
    map[s.id] = s;
  });
  return { ...query, map };
}
