import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { generateFunnelSlug } from './usePlatformCrmCaptureFunnels';

/**
 * CRM de PLATAFORMA (super_admin) — captação: FORMULÁRIOS, desacoplados do tenant.
 * Toca APENAS `platform_crm_forms` (+ leitura de blocos/submissions/templates).
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 */

export type PlatformCrmForm = Tables<'platform_crm_forms'>;
export type PlatformCrmFormInsert = TablesInsert<'platform_crm_forms'>;
export type PlatformCrmFormUpdate = TablesUpdate<'platform_crm_forms'>;
export type PlatformCrmFormBlock = Tables<'platform_crm_form_blocks'>;
export type PlatformCrmFormSubmission = Tables<'platform_crm_form_submissions'>;
export type PlatformCrmFormTemplate = Tables<'platform_crm_form_templates'>;

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmForms() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'forms'],
    queryFn: async (): Promise<PlatformCrmForm[]> => {
      const { data, error } = await supabase
        .from('platform_crm_forms')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmForm[];
    },
  });
}

export function usePlatformCrmForm(formId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'form', formId],
    enabled: !!formId,
    queryFn: async (): Promise<PlatformCrmForm | null> => {
      const { data, error } = await supabase
        .from('platform_crm_forms')
        .select('*')
        .eq('id', formId!)
        .single();

      if (error) throw error;
      return data as PlatformCrmForm;
    },
  });
}

export function usePlatformCrmFormBlocks(formId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'form-blocks', formId],
    enabled: !!formId,
    queryFn: async (): Promise<PlatformCrmFormBlock[]> => {
      const { data, error } = await supabase
        .from('platform_crm_form_blocks')
        .select('*')
        .eq('form_id', formId!)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmFormBlock[];
    },
  });
}

export function usePlatformCrmFormSubmissions(formId: string | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'form-submissions', formId],
    enabled: !!formId,
    queryFn: async (): Promise<PlatformCrmFormSubmission[]> => {
      const { data, error } = await supabase
        .from('platform_crm_form_submissions')
        .select('*')
        .eq('form_id', formId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmFormSubmission[];
    },
  });
}

export function usePlatformCrmFormTemplates() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'form-templates'],
    queryFn: async (): Promise<PlatformCrmFormTemplate[]> => {
      const { data, error } = await supabase
        .from('platform_crm_form_templates')
        .select('*')
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmFormTemplate[];
    },
  });
}

export function useCreatePlatformCrmForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string | null;
      distribution_rule?: string;
      status?: string;
    }) => {
      const slug = generateFunnelSlug(input.name) || `form-${Date.now()}`;
      const payload: PlatformCrmFormInsert = {
        name: input.name,
        description: input.description ?? null,
        slug,
        distribution_rule: input.distribution_rule ?? 'round_robin',
        status: input.status ?? 'draft',
        settings: {},
        theme: {},
      };
      const { data, error } = await supabase
        .from('platform_crm_forms')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmForm;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'forms'] });
      toast.success('Formulário criado!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM form:', error);
      toast.error('Erro ao criar formulário');
    },
  });
}

export function useUpdatePlatformCrmForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmFormUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_forms')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmForm;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'forms'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'form', vars.id] });
      toast.success('Formulário atualizado!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM form:', error);
      toast.error('Erro ao atualizar formulário');
    },
  });
}

export function useDeletePlatformCrmForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('platform_crm_forms').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'forms'] });
      toast.success('Formulário removido!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM form:', error);
      toast.error('Erro ao remover formulário');
    },
  });
}

/** Alterna status (draft/active/paused) do formulário. */
export function useTogglePlatformCrmFormStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('platform_crm_forms')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'forms'] });
    },
    onError: (error: any) => {
      console.error('Error toggling platform CRM form status:', error);
      toast.error('Erro ao alterar status');
    },
  });
}
