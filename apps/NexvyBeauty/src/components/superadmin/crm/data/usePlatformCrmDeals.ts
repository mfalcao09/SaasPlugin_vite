import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * CRM de PLATAFORMA (super_admin) — deals do pipeline ÚNICO, desacoplado do tenant.
 * Toca APENAS `platform_crm_deals`. Sem organization_id / product_id.
 * A RLS super_admin-only já isola os dados.
 */

export type PlatformCrmDeal = Tables<'platform_crm_deals'>;
export type PlatformCrmDealInsert = TablesInsert<'platform_crm_deals'>;
export type PlatformCrmDealUpdate = TablesUpdate<'platform_crm_deals'>;

export type PlatformCrmDealStatus = 'won' | 'lost' | 'cancelled';

/** Deal com dados básicos do lead embutidos via join FK lead_id. */
export type PlatformCrmDealWithLead = PlatformCrmDeal & {
  lead: {
    name: string;
    company: string | null;
    email: string | null;
  } | null;
};

export interface PlatformCrmDealFilters {
  status?: PlatformCrmDealStatus;
  sellerId?: string;
}

const PLATFORM_CRM_KEY = 'platform-crm';

export function usePlatformCrmDeals(filters?: PlatformCrmDealFilters) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'deals', filters ?? null],
    queryFn: async (): Promise<PlatformCrmDealWithLead[]> => {
      let query = supabase
        .from('platform_crm_deals')
        .select(
          `
          *,
          lead:platform_crm_leads!platform_crm_deals_lead_id_fkey (name, company, email)
        `,
        )
        .order('closed_at', { ascending: false, nullsFirst: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.sellerId) {
        query = query.eq('seller_id', filters.sellerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PlatformCrmDealWithLead[];
    },
  });
}

export function useCreatePlatformCrmDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deal: PlatformCrmDealInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_deals')
        .insert(deal)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmDeal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'deals'] });
      toast.success('Negócio registrado!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM deal:', error);
      toast.error('Erro ao registrar negócio');
    },
  });
}

export function useUpdatePlatformCrmDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmDealUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_deals')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmDeal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'deals'] });
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM deal:', error);
      toast.error('Erro ao atualizar negócio');
    },
  });
}
