import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — automações de etiqueta por EVENTO, do pipeline
 * ÚNICO, desacopladas do tenant. Toca APENAS `platform_crm_tag_automations`.
 *
 * Regra: "quando evento X acontecer → aplicar tag Y (e opcionalmente remover tag Z)".
 * A tabela NÃO possui coluna `product_id` no schema atual — a dimensão "por produto"
 * fica como TODO(produto), pendente de decisão de Produtos (ver TODO abaixo).
 * Sem organization_id — a RLS super_admin-only isola os dados.
 */

export type PlatformCrmTagAutomation = Tables<'platform_crm_tag_automations'>;
export type PlatformCrmTagAutomationInsert = TablesInsert<'platform_crm_tag_automations'>;

const PLATFORM_CRM_KEY = 'platform-crm';

/**
 * Eventos de checkout suportados pela automação de etiquetas.
 * Espelha os event_type gravados em `platform_crm_tag_automations.event_type`.
 */
export const PLATFORM_CRM_TAG_EVENT_LABELS: Record<string, string> = {
  pix_gerado: 'PIX gerado',
  boleto_gerado: 'Boleto gerado',
  aguardando_pagamento: 'Aguardando pagamento',
  checkout_abandonado: 'Checkout abandonado',
  compra_aprovada: 'Compra aprovada',
  reembolso: 'Reembolso',
  chargeback: 'Chargeback',
  assinatura_cancelada: 'Assinatura cancelada',
};

export type PlatformCrmTagEvent = keyof typeof PLATFORM_CRM_TAG_EVENT_LABELS;

export function usePlatformCrmTagAutomations() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'tag-automations'],
    queryFn: async (): Promise<PlatformCrmTagAutomation[]> => {
      const { data, error } = await supabase
        .from('platform_crm_tag_automations')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmTagAutomation[];
    },
  });
}

/** Cria ou atualiza uma automação (upsert por id quando presente). */
export function useUpsertPlatformCrmTagAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      automation: PlatformCrmTagAutomationInsert & { id?: string },
    ) => {
      const { id, ...payload } = automation;

      if (id) {
        const { data, error } = await supabase
          .from('platform_crm_tag_automations')
          .update(payload)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data as PlatformCrmTagAutomation;
      }

      const { data, error } = await supabase
        .from('platform_crm_tag_automations')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmTagAutomation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tag-automations'] });
      toast.success('Automação salva!');
    },
    onError: (error: any) => {
      console.error('Error saving platform CRM tag automation:', error);
      toast.error('Erro ao salvar automação');
    },
  });
}

/** Liga/desliga uma automação sem abrir o dialog. */
export function useTogglePlatformCrmTagAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('platform_crm_tag_automations')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tag-automations'] });
    },
    onError: (error: any) => {
      console.error('Error toggling platform CRM tag automation:', error);
      toast.error('Erro ao atualizar automação');
    },
  });
}

export function useDeletePlatformCrmTagAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_tag_automations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tag-automations'] });
      toast.success('Automação removida!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM tag automation:', error);
      toast.error('Erro ao remover automação');
    },
  });
}
