import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  is_active: boolean;
  is_default: boolean;
  display_order: number;

  price_monthly: number;
  price_yearly: number;
  trial_days: number;
  grace_period_days: number;

  max_users: number;
  max_professionals: number | null;
  max_connections: number;
  max_sectors: number;
  max_products: number;
  max_contacts: number;
  max_messages_month: number;
  max_ai_tokens_month: number;
  max_ai_agents: number;

  // Módulos liberados pelo plano. No banco é jsonb (default '[]'); aqui tratamos
  // como string[] de IDs de MODULE_DEFINITIONS (ex.: 'erp_salao','crm_vendas').
  modules: string[] | null;

  feature_whatsapp: boolean;
  feature_facebook: boolean;
  feature_instagram: boolean;
  feature_campaigns: boolean;
  feature_scheduling: boolean;
  feature_internal_chat: boolean;
  feature_external_api: boolean;
  feature_kanban: boolean;
  feature_pipeline: boolean;
  feature_integrations: boolean;
  feature_audio_transcription_ai: boolean;
  feature_text_correction_ai: boolean;
  feature_ai_agents: boolean;
  feature_voice_agents: boolean;
  feature_outreach: boolean;
  feature_capture_funnels: boolean;
  feature_forms: boolean;
  feature_webhooks: boolean;

  checkout_url: string | null;
  checkout_url_yearly: string | null;
  highlight_label: string | null;

  extra_features: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type PlatformPlanInput = Partial<Omit<PlatformPlan, 'id' | 'created_at' | 'updated_at'>> & {
  name: string;
  slug: string;
};

export function useAllPlans() {
  return useQuery({
    queryKey: ['platform-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_plans')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as PlatformPlan[];
    },
  });
}

export function useActivePlans() {
  return useQuery({
    queryKey: ['platform-plans', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as PlatformPlan[];
    },
  });
}

// Vitrine pública (LP/apex): lê a view `public_plans` (migration 20260704),
// que tem SELECT anônimo — platform_plans segue fechada por RLS. A view expõe
// só colunas de exibição (sem max_*/extra_features), então o tipo é um
// subconjunto de PlatformPlan; o cast é seguro para os campos que a LP usa.
export type PublicPlan = Pick<PlatformPlan,
  'id' | 'name' | 'slug' | 'description' | 'price_monthly' | 'price_yearly' |
  'trial_days' | 'highlight_label' | 'display_order' | 'is_public' |
  'checkout_url' | 'checkout_url_yearly' |
  'feature_whatsapp' | 'feature_instagram' | 'feature_facebook' |
  'feature_scheduling' | 'feature_kanban' | 'feature_pipeline' |
  'feature_campaigns' | 'feature_outreach' | 'feature_capture_funnels' |
  'feature_forms' | 'feature_internal_chat' | 'feature_ai_agents' |
  'feature_voice_agents' | 'feature_audio_transcription_ai' |
  'feature_text_correction_ai' | 'feature_webhooks' | 'feature_external_api' |
  'feature_integrations'>;

export function usePublicPlans() {
  return useQuery({
    queryKey: ['public-plans'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('public_plans')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as PublicPlan[];
    },
  });
}

export function usePlan(id?: string | null) {
  return useQuery({
    queryKey: ['platform-plan', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('platform_plans')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as PlatformPlan | null;
    },
    enabled: !!id,
  });
}

export function usePlanUsageCounts() {
  return useQuery({
    queryKey: ['platform-plans', 'usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('plan_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.plan_id) counts[row.plan_id] = (counts[row.plan_id] || 0) + 1;
      });
      return counts;
    },
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: PlatformPlanInput) => {
      const { data, error } = await supabase
        .from('platform_plans')
        .insert(plan as any)
        .select()
        .single();
      if (error) throw error;
      return data as PlatformPlan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
    },
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformPlanInput & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_plans')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as PlatformPlan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_plans')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
    },
  });
}

// ---- Sincronização de ofertas Cakto ----------------------------------------
// Aciona a Edge Function cakto-sync-offer, que cria/reaproveita as ofertas
// (mensal + anual) na Cakto e grava as URLs de checkout no plano.

export interface CaktoCycleResult {
  cycle: 'monthly' | 'yearly';
  action: 'created' | 'recreated' | 'unchanged' | 'skipped_min_price';
  slug: string | null;
  url: string | null;
}

export interface CaktoSyncResult {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  plan_id?: string;
  monthly?: CaktoCycleResult;
  yearly?: CaktoCycleResult;
}

export function useSyncCaktoOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string): Promise<CaktoSyncResult> => {
      const { data, error } = await supabase.functions.invoke('cakto-sync-offer', {
        body: { plan_id: planId },
      });
      if (error) {
        // FunctionsHttpError esconde a mensagem real no corpo da Response.
        let msg = error.message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        try {
          const body = await ctx?.json?.();
          if (body?.error) msg = body.error;
        } catch {
          /* mantém error.message */
        }
        throw new Error(msg);
      }
      const result = (data ?? {}) as CaktoSyncResult & { error?: string };
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
      qc.invalidateQueries({ queryKey: ['platform-plans-cakto'] });
    },
  });
}

export interface CaktoPlanSyncResult {
  plan_id: string;
  plan_name: string;
  product_id: string | null;
  product_name?: string | null;
  matched_by: 'existing' | 'name' | 'price' | null;
  status: 'synced' | 'no_product_match' | 'skipped_free' | 'error';
  monthly?: CaktoCycleResult;
  yearly?: CaktoCycleResult;
  error?: string;
}

// Sincroniza TODOS os planos de uma vez (1 clique): auto-match produto↔plano +
// geração de ofertas + URLs. Retorna um relatório por plano.
export function useSyncAllCaktoPlans() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CaktoPlanSyncResult[]> => {
      const { data, error } = await supabase.functions.invoke('cakto-sync-offer', {
        body: { all: true },
      });
      if (error) {
        let msg = error.message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        try {
          const b = await ctx?.json?.();
          if (b?.error) msg = b.error;
        } catch {
          /* mantém error.message */
        }
        throw new Error(msg);
      }
      const payload = (data ?? {}) as { error?: string; results?: CaktoPlanSyncResult[] };
      if (payload.error) throw new Error(payload.error);
      return payload.results ?? [];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
      qc.invalidateQueries({ queryKey: ['platform-plans-cakto'] });
    },
  });
}
