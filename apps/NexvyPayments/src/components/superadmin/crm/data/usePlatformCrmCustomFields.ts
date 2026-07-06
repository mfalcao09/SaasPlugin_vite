import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — campos personalizados do pipeline ÚNICO,
 * desacoplados do tenant. Toca APENAS `platform_crm_custom_fields`.
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 */

export type PlatformCrmCustomField = Tables<'platform_crm_custom_fields'>;
export type PlatformCrmCustomFieldInsert = TablesInsert<'platform_crm_custom_fields'>;
export type PlatformCrmCustomFieldUpdate = TablesUpdate<'platform_crm_custom_fields'>;

/** Tipos de campo suportados por `field_type`. */
export type PlatformCrmCustomFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'boolean'
  | 'date';

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmCustomFields() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'custom-fields'],
    queryFn: async (): Promise<PlatformCrmCustomField[]> => {
      const { data, error } = await supabase
        .from('platform_crm_custom_fields')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmCustomField[];
    },
  });
}

export function useCreatePlatformCrmCustomField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (field: PlatformCrmCustomFieldInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_custom_fields')
        .insert(field)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCustomField;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'custom-fields'] });
      toast.success('Campo criado!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM custom field:', error);
      toast.error('Erro ao criar campo');
    },
  });
}

export function useUpdatePlatformCrmCustomField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: PlatformCrmCustomFieldUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_custom_fields')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCustomField;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'custom-fields'] });
      toast.success('Campo atualizado!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM custom field:', error);
      toast.error('Erro ao atualizar campo');
    },
  });
}

export function useDeletePlatformCrmCustomField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_custom_fields')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'custom-fields'] });
      toast.success('Campo removido!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM custom field:', error);
      toast.error('Erro ao remover campo');
    },
  });
}
