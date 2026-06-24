import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AffiliateStatus = 'active' | 'paused' | 'blocked';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'cancelled';

export interface AffiliateSummary {
  pending_cents: number;
  approved_cents: number;
  paid_cents: number;
  cancelled_cents: number;
  commissions_count: number;
}

export interface Affiliate {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  pix_key: string | null;
  status: AffiliateStatus;
  commission_pct: number; // percentual inteiro (30 = 30%)
  notes: string | null;
  created_at: string;
  updated_at: string;
  links_count?: number;
  summary?: AffiliateSummary;
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
  affiliate_name?: string;
  lead_id: string | null;
  order_ref: string;
  organization_id: string | null;
  amount_cents: number;
  pct_applied: number;
  currency: string;
  status: CommissionStatus;
  review_status?: 'clear' | 'flagged';
  idempotency_key: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

async function invoke<T = any>(action: string, payload: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('affiliate-admin', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

interface ListAffiliatesParams {
  search?: string;
  status?: AffiliateStatus;
  limit?: number;
  offset?: number;
}

export function useAffiliates(params: ListAffiliatesParams = {}) {
  return useQuery({
    queryKey: ['affiliates', 'list', params],
    queryFn: async () => {
      const data = await invoke<{ affiliates: Affiliate[]; total: number }>('list_affiliates', params);
      return data;
    },
  });
}

export function useAffiliateLinks(affiliateId: string) {
  return useQuery({
    queryKey: ['affiliates', 'links', affiliateId],
    enabled: !!affiliateId,
    queryFn: async () => {
      const data = await invoke<{ links: AffiliateLink[] }>('list_links', { affiliate_id: affiliateId });
      return data.links;
    },
  });
}

interface ListCommissionsParams {
  affiliate_id?: string;
  status?: CommissionStatus;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function useAffiliateCommissions(params: ListCommissionsParams = {}) {
  return useQuery({
    queryKey: ['affiliates', 'commissions', params],
    queryFn: async () => {
      const data = await invoke<{ commissions: AffiliateCommission[]; total: number }>('list_commissions', params);
      return data;
    },
  });
}

interface CreateAffiliateInput {
  name: string;
  email: string;
  phone?: string | null;
  pix_key?: string | null;
  commission_pct: number; // percentual humano (30)
  status: AffiliateStatus;
  notes?: string | null;
  send_welcome: boolean;
}

export function useCreateAffiliate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAffiliateInput) => invoke('create_affiliate', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliates', 'list'] }),
  });
}

interface UpdateAffiliateInput {
  id: string;
  patch: {
    name?: string;
    phone?: string | null;
    pix_key?: string | null;
    status?: AffiliateStatus;
    commission_pct?: number; // percentual humano
    notes?: string | null;
  };
}

export function useUpdateAffiliate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAffiliateInput) => invoke('update_affiliate', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliates', 'list'] }),
  });
}

interface GenerateLinkInput {
  affiliate_id: string;
  ref_code?: string;
  label?: string;
  default_utm_source?: string;
  default_utm_medium?: string;
  default_utm_campaign?: string;
}

export function useGenerateAffiliateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateLinkInput) =>
      invoke<{ link: AffiliateLink; public_url: string }>('generate_link', input),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['affiliates', 'links', vars.affiliate_id] }),
  });
}

export function useApproveCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => invoke('approve_commission', { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliates', 'commissions'] }),
  });
}

export function useCancelCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => invoke('cancel_commission', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliates', 'commissions'] }),
  });
}
