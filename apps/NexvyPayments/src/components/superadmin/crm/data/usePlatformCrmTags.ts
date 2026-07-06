import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — etiquetas do pipeline ÚNICO, desacopladas do tenant.
 * Toca APENAS `platform_crm_lead_tags` + `platform_crm_lead_tag_assignments`.
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 */

export type PlatformCrmTag = Tables<'platform_crm_lead_tags'>;
export type PlatformCrmTagInsert = TablesInsert<'platform_crm_lead_tags'>;
export type PlatformCrmTagUpdate = TablesUpdate<'platform_crm_lead_tags'>;

export type PlatformCrmTagAssignment = Tables<'platform_crm_lead_tag_assignments'>;

/** Assignment com a tag embutida via join FK tag_id. */
export type PlatformCrmTagAssignmentWithTag = PlatformCrmTagAssignment & {
  tag: PlatformCrmTag | null;
};

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmTags() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'tags'],
    queryFn: async (): Promise<PlatformCrmTag[]> => {
      const { data, error } = await supabase
        .from('platform_crm_lead_tags')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmTag[];
    },
  });
}

/** Etiquetas atribuídas a um lead específico. */
export function usePlatformCrmTagsForLead(leadId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'tag-assignments', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<PlatformCrmTagAssignmentWithTag[]> => {
      const { data, error } = await supabase
        .from('platform_crm_lead_tag_assignments')
        .select(
          `
          *,
          tag:platform_crm_lead_tags!platform_crm_lead_tag_assignments_tag_id_fkey (*)
        `,
        )
        .eq('lead_id', leadId!);

      if (error) throw error;
      return (data ?? []) as unknown as PlatformCrmTagAssignmentWithTag[];
    },
  });
}

export function useCreatePlatformCrmTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tag: PlatformCrmTagInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_lead_tags')
        .insert(tag)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmTag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tags'] });
      toast.success('Etiqueta criada!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM tag:', error);
      toast.error('Erro ao criar etiqueta');
    },
  });
}

export function useUpdatePlatformCrmTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmTagUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_lead_tags')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmTag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tags'] });
      toast.success('Etiqueta atualizada!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM tag:', error);
      toast.error('Erro ao atualizar etiqueta');
    },
  });
}

export function useDeletePlatformCrmTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_lead_tags')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tags'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tag-assignments'] });
      toast.success('Etiqueta removida!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM tag:', error);
      toast.error('Erro ao remover etiqueta');
    },
  });
}

/** Atribui uma etiqueta a um lead. Ignora conflito de duplicidade (já atribuída). */
export function useAssignPlatformCrmTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      tagId,
      source = 'manual',
      appliedBy,
    }: {
      leadId: string;
      tagId: string;
      source?: string;
      appliedBy?: string | null;
    }) => {
      const { error } = await supabase
        .from('platform_crm_lead_tag_assignments')
        .insert({
          lead_id: leadId,
          tag_id: tagId,
          source,
          applied_by: appliedBy ?? null,
        });

      // Ignora violação de duplicidade (etiqueta já atribuída ao lead).
      if (error && !error.message.includes('duplicate')) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'tag-assignments', vars.leadId],
      });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tags'] });
    },
    onError: (error: any) => {
      console.error('Error assigning platform CRM tag:', error);
      toast.error('Erro ao aplicar etiqueta');
    },
  });
}

/** Remove a atribuição de uma etiqueta de um lead. */
export function useRemovePlatformCrmTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, tagId }: { leadId: string; tagId: string }) => {
      const { error } = await supabase
        .from('platform_crm_lead_tag_assignments')
        .delete()
        .eq('lead_id', leadId)
        .eq('tag_id', tagId);

      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'tag-assignments', vars.leadId],
      });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tags'] });
    },
    onError: (error: any) => {
      console.error('Error removing platform CRM tag:', error);
      toast.error('Erro ao remover etiqueta');
    },
  });
}
