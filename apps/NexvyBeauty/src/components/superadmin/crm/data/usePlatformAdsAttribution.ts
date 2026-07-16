import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * NexvyAds — camada B (ATRIBUIÇÃO inbound CTWA + funil de conversões CAPI).
 * super_admin, PRODUCT-scoped. Read-only.
 *
 * Fonte de verdade: tabelas `ads_attribution` (cliques Click-to-WhatsApp →
 * lead/conversa + gancho do anúncio) e `ads_capi_events` (outbox da Conversions
 * API — cada conversão do funil com status pending/sent/skipped/failed/dry_run).
 *
 * ⚠️ `ads_attribution` / `ads_capi_events` NÃO estão nos types gerados do supabase
 * (schema recém-criado, regen numa fase posterior). Mantém-se o padrão da casa:
 * cast localizado (`as never` no nome da tabela) + interface local — sem inventar
 * tipos no arquivo gerado. (Idêntico a usePlatformAdsConnection.ts.)
 */

export type AdsCtwaChannel = 'whatsapp' | 'instagram';

export interface AdsAttributionRow {
  id: string;
  product_id: string;
  lead_id: string | null;
  conversation_id: string | null;
  connection_id: string | null;
  ctwa_clid: string | null;
  source_id: string | null;
  source_type: string | null; // 'ad' | 'post'
  source_url: string | null;
  headline: string | null;
  body: string | null;
  media_type: string | null; // 'image' | 'video'
  ctwa_channel: AdsCtwaChannel;
  ad_ref: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export type AdsCapiEventName =
  | 'LeadSubmitted'
  | 'QualifiedLead'
  | 'ViewContent'
  | 'InitiateCheckout'
  | 'Purchase';

export type AdsCapiStatus = 'pending' | 'sent' | 'skipped' | 'failed' | 'dry_run';

export interface AdsCapiEventRow {
  id: string;
  product_id: string;
  lead_id: string | null;
  conversation_id: string | null;
  attribution_id: string | null;
  journey_event_id: string | null;
  event_name: AdsCapiEventName;
  event_id: string;
  ctwa_clid: string | null;
  action_source: string;
  value: number | null;
  currency: string | null;
  event_time: string;
  status: AdsCapiStatus;
  attempts: number;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** Ordem canônica do funil de conversões CAPI-CTWA (doc Meta Business Messaging). */
export const CAPI_EVENT_ORDER: AdsCapiEventName[] = [
  'LeadSubmitted',
  'QualifiedLead',
  'ViewContent',
  'InitiateCheckout',
  'Purchase',
];

export const CAPI_STATUS_ORDER: AdsCapiStatus[] = [
  'sent',
  'dry_run',
  'pending',
  'skipped',
  'failed',
];

/** Cliques CTWA → lead/conversa (mais recentes primeiro). */
export function useAdsAttribution(productId: string | null) {
  return useQuery({
    queryKey: ['platform-ads-attribution', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads_attribution' as never)
        .select('*')
        .eq('product_id', productId as string)
        .order('occurred_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as AdsAttributionRow[];
    },
  });
}

/** Fila/histórico de conversões devolvidas ao Meta (Conversions API). */
export function useAdsCapiEvents(productId: string | null) {
  return useQuery({
    queryKey: ['platform-ads-capi-events', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads_capi_events' as never)
        .select('*')
        .eq('product_id', productId as string)
        .order('event_time', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as AdsCapiEventRow[];
    },
  });
}
