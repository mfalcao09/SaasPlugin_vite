import { useQuery } from '@tanstack/react-query';
import { LeadJourney, type JourneyFilters, type JourneyCategory } from './leadJourney';

/**
 * Hooks React Query do módulo "Jornada do Lead" (CRM de PLATAFORMA, product-scoped).
 * PORTE de `hooks/useLeadJourney.ts` (CRM Vendus). A chave de escopo é
 * `filters.productId` (effectiveProductId do PlatformProductContext).
 */

export function useJourneyMetrics(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'metrics', filters],
    queryFn: () => LeadJourney.getMetrics(filters!),
    enabled: !!filters?.productId,
    staleTime: 60_000,
  });
}

export function useJourneyStages(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'stages', filters],
    queryFn: () => LeadJourney.getStages(filters!),
    enabled: !!filters?.productId,
    staleTime: 60_000,
  });
}

export function useJourneyTouchpoints(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'touchpoints', filters],
    queryFn: () => LeadJourney.getTouchpoints(filters!),
    enabled: !!filters?.productId,
    staleTime: 60_000,
  });
}

export function useJourneyTimeline(leadId: string | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'timeline', leadId],
    queryFn: () => LeadJourney.getTimeline(leadId!),
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

export function useJourneyLeadsInStage(
  filters: JourneyFilters | null,
  category: JourneyCategory | null,
) {
  return useQuery({
    queryKey: ['pcrm-journey', 'stage-leads', filters, category],
    queryFn: () => LeadJourney.getLeadsInStage(filters!, category!),
    enabled: !!filters?.productId && !!category,
    staleTime: 30_000,
  });
}

export function useJourneyOrigins(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'origins', filters],
    queryFn: () => LeadJourney.getAcquisitionByOrigin(filters!),
    enabled: !!filters?.productId,
    staleTime: 60_000,
  });
}

export function useJourneyCampaigns(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'campaigns', filters],
    queryFn: () => LeadJourney.getAcquisitionByCampaign(filters!),
    enabled: !!filters?.productId,
    staleTime: 60_000,
  });
}

export function useJourneyCreatives(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'creatives', filters],
    queryFn: () => LeadJourney.getAcquisitionByCreative(filters!),
    enabled: !!filters?.productId,
    staleTime: 60_000,
  });
}

export function useJourneyLeadSummary(leadId: string | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'lead-summary', leadId],
    queryFn: () => LeadJourney.getLeadSummary(leadId!),
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

export function useJourneyBottlenecks(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'bottlenecks', filters],
    queryFn: () => LeadJourney.getBottlenecks(filters!),
    enabled: !!filters?.productId,
    staleTime: 30_000,
  });
}

export function useJourneyRealtimeFeed(filters: JourneyFilters | null) {
  return useQuery({
    queryKey: ['pcrm-journey', 'realtime-feed', filters],
    queryFn: () => LeadJourney.getRealtimeFeed(filters!, 50),
    enabled: !!filters?.productId,
    staleTime: 15_000,
  });
}
