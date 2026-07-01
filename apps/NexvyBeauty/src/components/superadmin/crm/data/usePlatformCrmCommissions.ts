import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * COMISSÕES do CRM de PLATAFORMA (super_admin) — desacopladas do tenant.
 * Toca APENAS `platform_crm_commissions` + `platform_crm_commission_rules`.
 * Sem organization_id / product_id. A RLS super_admin-only já isola os dados.
 */

export type PlatformCrmCommission = Tables<'platform_crm_commissions'>;
export type PlatformCrmCommissionInsert = TablesInsert<'platform_crm_commissions'>;
export type PlatformCrmCommissionUpdate = TablesUpdate<'platform_crm_commissions'>;

export type PlatformCrmCommissionRule = Tables<'platform_crm_commission_rules'>;
export type PlatformCrmCommissionRuleInsert = TablesInsert<'platform_crm_commission_rules'>;
export type PlatformCrmCommissionRuleUpdate = TablesUpdate<'platform_crm_commission_rules'>;

export type PlatformCrmCommissionStatus = 'pending' | 'approved' | 'paid';
export type PlatformCrmCommissionRuleType = 'percentage' | 'fixed';

/** Comissão com dados básicos do deal (e lead) embutidos via joins FK. */
export type PlatformCrmCommissionWithDeal = PlatformCrmCommission & {
  deal: {
    id: string;
    deal_value: number;
    plan_name: string | null;
    status: string | null;
    lead: { name: string; company: string | null } | null;
  } | null;
};

const PLATFORM_CRM_KEY = 'platform-crm';

/* ============================ COMISSÕES ============================ */

export function usePlatformCrmCommissions(status?: PlatformCrmCommissionStatus) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'commissions', status ?? null],
    queryFn: async (): Promise<PlatformCrmCommissionWithDeal[]> => {
      let query = supabase
        .from('platform_crm_commissions')
        .select(
          `
          *,
          deal:platform_crm_deals!platform_crm_commissions_deal_id_fkey (
            id, deal_value, plan_name, status,
            lead:platform_crm_leads!platform_crm_deals_lead_id_fkey (name, company)
          )
        `,
        )
        .order('created_at', { ascending: false, nullsFirst: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PlatformCrmCommissionWithDeal[];
    },
  });
}

/** Marca comissão como aprovada (status='approved', approved_at=now). */
export function useApprovePlatformCrmCommission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('platform_crm_commissions')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCommission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'commissions'] });
      toast.success('Comissão aprovada!');
    },
    onError: (error: any) => {
      console.error('Error approving platform CRM commission:', error);
      toast.error('Erro ao aprovar comissão');
    },
  });
}

/** Marca comissão como paga (status='paid', paid_at=now). */
export function usePayPlatformCrmCommission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('platform_crm_commissions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCommission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'commissions'] });
      toast.success('Comissão marcada como paga!');
    },
    onError: (error: any) => {
      console.error('Error paying platform CRM commission:', error);
      toast.error('Erro ao pagar comissão');
    },
  });
}

/* ========================= REGRAS DE COMISSÃO ========================= */

export function usePlatformCrmCommissionRules() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'commission-rules'],
    queryFn: async (): Promise<PlatformCrmCommissionRule[]> => {
      const { data, error } = await supabase
        .from('platform_crm_commission_rules')
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmCommissionRule[];
    },
  });
}

export function useCreatePlatformCrmCommissionRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: PlatformCrmCommissionRuleInsert) => {
      const { data, error } = await supabase
        .from('platform_crm_commission_rules')
        .insert(rule)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCommissionRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'commission-rules'] });
      toast.success('Regra de comissão criada!');
    },
    onError: (error: any) => {
      console.error('Error creating platform CRM commission rule:', error);
      toast.error('Erro ao criar regra');
    },
  });
}

export function useUpdatePlatformCrmCommissionRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformCrmCommissionRuleUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_crm_commission_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmCommissionRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'commission-rules'] });
      toast.success('Regra atualizada!');
    },
    onError: (error: any) => {
      console.error('Error updating platform CRM commission rule:', error);
      toast.error('Erro ao atualizar regra');
    },
  });
}

export function useDeletePlatformCrmCommissionRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_crm_commission_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'commission-rules'] });
      toast.success('Regra removida!');
    },
    onError: (error: any) => {
      console.error('Error deleting platform CRM commission rule:', error);
      toast.error('Erro ao remover regra');
    },
  });
}
