import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ============================================================================
// Portal self-service do afiliado — leitura via RLS (user_id = auth.uid()).
// NÃO usa edge function: as policies 'affiliate reads self / own *'
// (20260619_affiliates_tracking.sql) garantem que cada afiliado só enxerga o
// próprio vínculo. O "papel" afiliado = existência de linha em affiliates.
// ============================================================================

export interface Affiliate {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  pix_key: string | null;
  status: string; // active | paused | blocked
  commission_pct: number; // percentual inteiro (30 = 30%)
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateLink {
  id: string;
  affiliate_id: string;
  ref_code: string;
  label: string | null;
  default_utm_source: string | null;
  default_utm_medium: string | null;
  default_utm_campaign: string | null;
  clicks: number;
  created_at: string;
}

export interface AffiliateCommission {
  id: string;
  affiliate_id: string;
  lead_id: string | null;
  order_ref: string | null;
  organization_id: string | null;
  amount_cents: number;
  pct_applied: number;
  currency: string;
  status: string; // pending | approved | paid | cancelled
  idempotency_key: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateSummary {
  affiliate_id: string;
  user_id: string | null;
  pending_cents: number;
  approved_cents: number;
  paid_cents: number;
  cancelled_cents: number;
  commissions_count: number;
}

/** O afiliado logado lê o próprio cadastro (RLS 'affiliate reads self'). */
export function useCurrentAffiliate() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-portal', 'me', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Affiliate | null> => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from('affiliates')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Affiliate | null) ?? null;
    },
  });
}

/** Links do afiliado logado (RLS 'affiliate reads own links'). */
export function useMyAffiliateLinks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-portal', 'links', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AffiliateLink[]> => {
      const { data, error } = await (supabase as any)
        .from('affiliate_links')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as AffiliateLink[]) ?? [];
    },
  });
}

/** Comissões do afiliado logado (RLS 'affiliate reads own commissions'). */
export function useMyCommissions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-portal', 'commissions', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AffiliateCommission[]> => {
      const { data, error } = await (supabase as any)
        .from('affiliate_commissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as AffiliateCommission[]) ?? [];
    },
  });
}

/** Resumo agregado (view affiliate_commission_summary, security_invoker = RLS self). */
export function useMyCommissionSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-portal', 'summary', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AffiliateSummary | null> => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from('affiliate_commission_summary')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as AffiliateSummary | null) ?? null;
    },
  });
}
