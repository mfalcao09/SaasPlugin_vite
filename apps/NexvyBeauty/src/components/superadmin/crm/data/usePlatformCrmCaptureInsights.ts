import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — RESULTADOS + ANALYTICS de captação (leitura),
 * desacoplados do tenant. Toca APENAS `platform_crm_leads` (lead_origin='funnel'),
 * `platform_crm_form_submissions` e `platform_crm_funnel_analytics`.
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 *
 * Porte das queries inline de `CaptureResultsSection` / `CaptureAnalyticsSection`
 * do CRM original (que liam `leads` do tenant com `.eq('organization_id', ...)`).
 * Adaptações:
 * - `leads` (tenant) → `platform_crm_leads`, mantendo o recorte `lead_origin='funnel'`
 *   e o vínculo funil←lead via `metadata.funnel_id` (mesmo contrato do original).
 * - Submissões de formulário agregadas de TODOS os forms (o original só via um form
 *   por vez); nome do form resolvido client-side via `usePlatformCrmForms`.
 * - Conversão por canal derivada de `platform_crm_funnel_analytics` (o original não
 *   tinha essa tabela e estimava só por quiz).
 */

export type PlatformCrmCaptureLead = Pick<
  Tables<'platform_crm_leads'>,
  'id' | 'name' | 'email' | 'phone' | 'temperature' | 'created_at' | 'metadata'
>;
export type PlatformCrmFormSubmissionRow = Tables<'platform_crm_form_submissions'>;
export type PlatformCrmFunnelAnalyticsRow = Tables<'platform_crm_funnel_analytics'>;

const PLATFORM_CRM_KEY = 'platform-crm';

/**
 * Leads captados por funil (lead_origin='funnel').
 * `days` recorta por created_at; `limit` protege a listagem (default 500, igual ao original).
 */
export function usePlatformCrmFunnelLeads(options?: { days?: number; limit?: number }) {
  const days = options?.days;
  const limit = options?.limit ?? 500;

  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'capture-funnel-leads', days ?? null, limit],
    queryFn: async (): Promise<PlatformCrmCaptureLead[]> => {
      let query = supabase
        .from('platform_crm_leads')
        .select('id, name, email, phone, temperature, created_at, metadata')
        .eq('lead_origin', 'funnel')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (days) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte('created_at', since.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PlatformCrmCaptureLead[];
    },
  });
}

/** Submissões de TODOS os formulários da plataforma (mais recentes primeiro). */
export function usePlatformCrmAllFormSubmissions(limit = 500) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'capture-all-form-submissions', limit],
    queryFn: async (): Promise<PlatformCrmFormSubmissionRow[]> => {
      const { data, error } = await supabase
        .from('platform_crm_form_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as PlatformCrmFormSubmissionRow[];
    },
  });
}

/** Linhas diárias de analytics de TODOS os funis na janela de N dias. */
export function usePlatformCrmAllFunnelAnalytics(days = 30) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'capture-all-funnel-analytics', days],
    queryFn: async (): Promise<PlatformCrmFunnelAnalyticsRow[]> => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from('platform_crm_funnel_analytics')
        .select('*')
        .gte('date', since.toISOString().slice(0, 10))
        .order('date', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmFunnelAnalyticsRow[];
    },
  });
}
