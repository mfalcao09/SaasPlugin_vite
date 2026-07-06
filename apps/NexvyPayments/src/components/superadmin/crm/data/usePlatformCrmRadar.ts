import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * RADAR IA do CRM de PLATAFORMA (super_admin).
 * PORTE 1:1 dos TIPOS e da FORMA de `hooks/useOpportunityScan.ts` do CRM Vendus.
 *
 * ⚠️ TODO(edge): o Radar do tenant depende de infra que NÃO existe no platform
 * CRM — tabelas `opportunity_scans` / `opportunity_scan_items` /
 * `opportunity_scan_schedules` (versão platform_crm_*) e a Edge Function LLM
 * `opportunity-scan-run`. Enquanto o edge/tabelas não existem:
 *   - as queries devolvem listas vazias (a UI 1:1 renderiza os empty-states);
 *   - as mutations (rodar análise / salvar-remover agendamento) mantêm o BOTÃO
 *     presente e respondem toast "em breve".
 * Quando a infra platform nascer, basta trocar os stubs por SELECT/invoke reais
 * — os componentes de `inbox-sections/` já consomem este contrato.
 */

export interface PlatformScanFilters {
  // inclusão
  product_ids?: string[];
  assigned_user_ids?: string[];
  agent_ids?: string[];
  tag_ids?: string[];
  sector_ids?: string[];
  channels?: string[];
  statuses?: string[];
  squad_ids?: string[];
  temperatures?: Array<'hot' | 'warm' | 'cold'>;
  min_score?: number;
  min_deal_value?: number;
  // exclusão
  exclude_product_ids?: string[];
  exclude_assigned_user_ids?: string[];
  exclude_agent_ids?: string[];
  exclude_tag_ids?: string[];
  exclude_sector_ids?: string[];
  exclude_channels?: string[];
  exclude_lead_ids?: string[];
  require_no_tags?: boolean;
  require_no_sector?: boolean;
  require_no_assigned?: boolean;
  // gerais
  inactivity_days_min?: number;
  inactivity_days_max?: number;
  min_client_messages?: number;
  include_ai_active?: boolean;
}

export interface PlatformActionConfig {
  apply_tag_id?: string;
  create_task?: { enabled: boolean; due_in_hours?: number };
  notify_owner?: boolean;
  notify_admin?: boolean;
  transfer_to_user_id?: string;
}
export interface PlatformActionsConfig {
  hot?: PlatformActionConfig;
  warm?: PlatformActionConfig;
  cold?: PlatformActionConfig;
  lost?: PlatformActionConfig;
}

export interface PlatformOpportunityScan {
  id: string;
  triggered_by: string | null;
  trigger_type: string;
  status: string;
  filters: PlatformScanFilters;
  actions_config: PlatformActionsConfig;
  total_candidates: number;
  total_analyzed: number;
  hot_count: number;
  warm_count: number;
  cold_count: number;
  lost_count: number;
  potential_revenue: number;
  cost_cents: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  error_message: string | null;
}

export interface PlatformScanItem {
  id: string;
  scan_id: string;
  conversation_id: string | null;
  lead_id: string | null;
  classification: 'hot' | 'warm' | 'cold' | 'lost';
  score: number;
  reason: string | null;
  signals: string[];
  suggested_action: string | null;
  followup_message: string | null;
  lead_snapshot: any;
  action_applied: boolean;
  created_at: string;
}

export interface PlatformScanSchedule {
  id?: string;
  name: string;
  cron_expression: string;
  is_active: boolean;
  filters: PlatformScanFilters;
  actions_config: PlatformActionsConfig;
  last_run_at?: string | null;
  created_at?: string;
}

const PLATFORM_CRM_KEY = 'platform-crm';
const COMING_SOON = 'Radar IA da plataforma em breve — motor de análise em construção.';

export function usePlatformCrmOpportunityScans() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'radar', 'scans'],
    // TODO(edge): SELECT em platform_crm_opportunity_scans quando a tabela existir.
    queryFn: async (): Promise<PlatformOpportunityScan[]> => [],
  });
}

export function usePlatformCrmOpportunityScan(scanId: string | null) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'radar', 'scan', scanId],
    // TODO(edge): SELECT por id + polling de progresso quando a tabela existir.
    queryFn: async (): Promise<PlatformOpportunityScan | null> => null,
    enabled: !!scanId,
  });
}

export function usePlatformCrmScanItems(scanId: string | null) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'radar', 'scan-items', scanId],
    // TODO(edge): SELECT em platform_crm_opportunity_scan_items quando existir.
    queryFn: async (): Promise<PlatformScanItem[]> => [],
    enabled: !!scanId,
  });
}

export function useRunPlatformCrmOpportunityScan() {
  return useMutation({
    mutationFn: async (_params: {
      filters: PlatformScanFilters;
      actions_config: PlatformActionsConfig;
      preview_only?: boolean;
    }) => {
      // TODO(edge): invoke `platform-opportunity-scan-run` (LLM) quando existir.
      toast.info(COMING_SOON);
      return { scan_id: null as string | null };
    },
  });
}

export function usePlatformCrmOpportunitySchedules() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'radar', 'schedules'],
    // TODO(edge): SELECT em platform_crm_opportunity_scan_schedules quando existir.
    queryFn: async (): Promise<PlatformScanSchedule[]> => [],
  });
}

export function useUpsertPlatformCrmScanSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_payload: PlatformScanSchedule) => {
      // TODO(edge): upsert em platform_crm_opportunity_scan_schedules + pg_cron.
      toast.info(COMING_SOON);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'radar', 'schedules'] });
    },
  });
}

export function useDeletePlatformCrmScanSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_id: string) => {
      // TODO(edge): delete em platform_crm_opportunity_scan_schedules.
      toast.info(COMING_SOON);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'radar', 'schedules'] });
    },
  });
}
