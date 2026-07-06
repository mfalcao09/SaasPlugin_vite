import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — notas de atendimento do lead, pipeline ÚNICO
 * desacoplado do tenant. Toca APENAS `platform_crm_lead_notes`. Sem
 * organization_id / product_id — a RLS super_admin-only isola os dados.
 *
 * O autor (author_id) é resolvido contra `profiles` num passo separado (não há FK
 * declarada de author_id → profiles no schema), espelhando o padrão do CRM original.
 */

export type PlatformCrmLeadNote = Tables<'platform_crm_lead_notes'>;

/** Nota com o perfil do autor embutido (resolvido client-side). */
export type PlatformCrmLeadNoteWithAuthor = PlatformCrmLeadNote & {
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmLeadNotes(leadId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'lead-notes', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<PlatformCrmLeadNoteWithAuthor[]> => {
      const { data, error } = await supabase
        .from('platform_crm_lead_notes')
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const notes = (data ?? []) as PlatformCrmLeadNote[];

      // Resolve os autores (author_id) em `profiles` num passo separado — não há FK
      // declarada, então não dá pra usar embed do PostgREST.
      const authorIds = [...new Set(notes.map((n) => n.author_id).filter(Boolean))];
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};

      if (authorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', authorIds);

        profilesMap = (profilesData ?? []).reduce(
          (acc, p) => ({ ...acc, [p.id]: { full_name: p.full_name, avatar_url: p.avatar_url } }),
          {},
        );
      }

      return notes.map((n) => ({ ...n, profiles: profilesMap[n.author_id] ?? null }));
    },
  });
}

export function useCreatePlatformCrmLeadNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { lead_id: string; content: string; role_label?: string | null }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('platform_crm_lead_notes')
        .insert({
          lead_id: params.lead_id,
          author_id: user.id,
          content: params.content,
          role_label: params.role_label ?? 'Vendedor',
        })
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmLeadNote;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'lead-notes', vars.lead_id],
      });
    },
  });
}
