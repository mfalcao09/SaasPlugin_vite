import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

/**
 * SLUG de booking do vendedor (link público /agendar/:slug) no CRM de
 * PLATAFORMA (super_admin). Port do `ensureBookingSlug`/`bookingSlug.ts` do CRM
 * Vendus, mas com FRONTEIRA CORRIGIDA:
 *
 *  - O slug NÃO mora mais em `profiles.booking_slug` (`profiles` tem
 *    `organization_id` = tabela do TENANT; escrever/ler slug lá viola a fronteira
 *    tenant↔plataforma). Passa a morar em `platform_crm_seller_booking`
 *    (`user_id` PK, `booking_slug` unique, `booking_bio`), tabela `platform_crm_*`
 *    dedicada, sem `organization_id`.
 *  - Nome/avatar do vendedor continuam sendo lidos de `profiles` (apenas para
 *    EXIBIÇÃO — mesma fonte de `usePlatformCrmSellers`/`usePlatformCrmTeamMembers`);
 *    o slug vem de `platform_crm_seller_booking` e é mesclado por `user_id`.
 *  - Universo de vendedores = user_ids de `platform_crm_squad_members`
 *    (+ atribuídos a leads). Nenhum `organization_id` no caminho.
 */

type SellerBookingRow = Tables<'platform_crm_seller_booking'>;

export interface PlatformCrmSellerSlug {
  id: string; // = user_id (auth.users / profiles.id / platform_crm_seller_booking.user_id)
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  booking_slug: string | null;
}

const PLATFORM_CRM_KEY = 'platform-crm';

/** Gera slug a partir do nome — idêntico ao `generateBookingSlug` do original. */
export function generatePlatformCrmBookingSlug(fullName: string): string {
  return fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Garante que o vendedor tenha um slug em `platform_crm_seller_booking`. FONTE
 * DE VERDADE = a própria `platform_crm_seller_booking` (consulta por `user_id`
 * PRIMEIRO); se já existir, retorna; senão gera do full_name (ou fallback
 * `user-<id8>`), checa colisão e faz UPSERT (onConflict `user_id`). NUNCA lê ou
 * escreve `profiles.booking_slug` — `profiles` é a tabela do TENANT (tem a
 * coluna legada `booking_slug`, mas ela é intocável aqui; fronteira tenant↔plat).
 */
export async function ensurePlatformCrmBookingSlug(params: {
  userId: string;
  fullName?: string | null;
}): Promise<string | null> {
  const { userId, fullName } = params;

  // fonte de verdade: slug já existente do vendedor em platform_crm_seller_booking
  const { data: mine } = await supabase
    .from('platform_crm_seller_booking')
    .select('booking_slug')
    .eq('user_id', userId)
    .maybeSingle();
  if (mine?.booking_slug) return mine.booking_slug;

  const base =
    (fullName && generatePlatformCrmBookingSlug(fullName)) || `user-${userId.slice(0, 8)}`;

  // verifica colisão em platform_crm_seller_booking (slug é unique)
  const { data: existing } = await supabase
    .from('platform_crm_seller_booking')
    .select('user_id')
    .eq('booking_slug', base)
    .neq('user_id', userId)
    .maybeSingle();

  const finalSlug = existing ? `${base}-${Date.now().toString(36)}` : base;

  const { error } = await supabase
    .from('platform_crm_seller_booking')
    .upsert(
      { user_id: userId, booking_slug: finalSlug } satisfies Partial<SellerBookingRow>,
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[ensurePlatformCrmBookingSlug] erro ao salvar slug', error);
    return null;
  }
  return finalSlug;
}

/**
 * Lista os vendedores da plataforma com seu `booking_slug` (para a aba "Links
 * da Equipe"). Mesmo universo do `usePlatformCrmSellers`: membros de squads +
 * atribuídos a leads. Nome/avatar de `profiles` (display), slug de
 * `platform_crm_seller_booking` — mesclados por `user_id`.
 */
export function usePlatformCrmSellerSlugs() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'seller-slugs'],
    queryFn: async (): Promise<PlatformCrmSellerSlug[]> => {
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
      const idList = [...ids];

      // 3a) nome/avatar/email em `profiles` (APENAS exibição — sem slug, sem org)
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', idList);
      if (profilesErr) throw profilesErr;

      // 3b) slug em `platform_crm_seller_booking` (fonte de verdade do slug)
      const { data: slugRows, error: slugErr } = await supabase
        .from('platform_crm_seller_booking')
        .select('user_id, booking_slug')
        .in('user_id', idList);
      if (slugErr) throw slugErr;

      const slugByUser = new Map<string, string | null>();
      (slugRows ?? []).forEach((r) => slugByUser.set(r.user_id, r.booking_slug ?? null));

      return (profilesData ?? [])
        .map((p) => ({
          id: p.id,
          full_name: p.full_name || p.email || 'Sem nome',
          email: p.email ?? null,
          avatar_url: p.avatar_url ?? null,
          booking_slug: slugByUser.get(p.id) ?? null,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });
}
