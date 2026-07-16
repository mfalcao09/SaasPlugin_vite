import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * NexvyAds — camada A2 (RECOMENDAÇÕES do agente + HITL). super_admin, PRODUCT-scoped.
 *
 * Lê a fila de `ads_recommendations` (o agente ads-optimize grava `pending`) e o
 * histórico de `ads_mutations_log` (auditoria de mutações aplicadas). O super_admin
 * aprova/rejeita; aprovar dispara a edge `ads-apply-recommendation`, que (nesta
 * fase) roda em modo simulação (dry-run) e devolve `{ ok, mutation_id, dry_run }`.
 *
 * ⚠️ Tabelas ads_* fora dos types gerados → cast `as never` + interface local.
 * ⚠️ A edge `ads-apply-recommendation` está sendo construída em paralelo por outro
 *    builder — programa-se CONTRA O CONTRATO e trata-se a ausência dela com graça.
 */

export type AdsRecommendationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'expired';

export interface AdsRecommendationRow {
  id: string;
  product_id: string;
  account_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  kind: string;
  title: string | null;
  rationale: string | null;
  proposed_action: Record<string, unknown>;
  expected_impact: Record<string, unknown>;
  confidence: number | null; // 0..1
  priority: number;
  status: AdsRecommendationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_mutation_id: string | null;
  source: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type AdsMutationStatus = 'pending' | 'success' | 'error';
export type AdsMutationTargetLevel = 'campaign' | 'adset' | 'ad';

export interface AdsMutationLogRow {
  id: string;
  product_id: string;
  recommendation_id: string | null;
  account_id: string | null;
  connection_id: string | null;
  target_level: AdsMutationTargetLevel;
  target_external_id: string;
  action: string;
  payload: Record<string, unknown> | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  status: AdsMutationStatus;
  error: string | null;
  graph_response: Record<string, unknown> | null;
  applied_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Contrato de resposta da edge `ads-apply-recommendation`. */
export interface ApplyRecommendationResult {
  ok: boolean;
  mutation_id?: string;
  dry_run?: boolean;
  error?: string;
}

/**
 * `ads_mutations_log` não tem coluna `dry_run` própria — a mutação em modo
 * simulação carrega a marca no payload/graph_response. Deriva-se defensivamente
 * (best-effort) para o rótulo "Simulação vs Real" da UI.
 */
export function isMutationDryRun(m: AdsMutationLogRow): boolean {
  const p = m.payload as { dry_run?: unknown } | null;
  const g = m.graph_response as { dry_run?: unknown } | null;
  return p?.dry_run === true || g?.dry_run === true;
}

/** Fila de recomendações do produto no status pedido (default: pending). */
export function useAdsRecommendations(
  productId: string | null,
  status: AdsRecommendationStatus | 'all' = 'pending',
) {
  return useQuery({
    queryKey: ['platform-ads-recommendations', productId, status],
    enabled: !!productId,
    queryFn: async () => {
      let q = supabase
        .from('ads_recommendations' as never)
        .select('*')
        .eq('product_id', productId as string);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AdsRecommendationRow[];
    },
  });
}

/** Histórico de mutações aplicadas (auditoria). */
export function useAdsMutationsLog(productId: string | null) {
  return useQuery({
    queryKey: ['platform-ads-mutations-log', productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ads_mutations_log' as never)
        .select('*')
        .eq('product_id', productId as string)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AdsMutationLogRow[];
    },
  });
}

/**
 * Atualiza o status de uma recomendação (aprovar/rejeitar). Grava `reviewed_at`.
 * Não aplica a mutação — a aplicação é a edge (useApplyRecommendation).
 */
export function useSetRecommendationStatus(productId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: AdsRecommendationStatus }) => {
      const { error } = await supabase
        .from('ads_recommendations' as never)
        .update({ status: input.status, reviewed_at: new Date().toISOString() } as never)
        .eq('id', input.id);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: ['platform-ads-recommendations', productId] });
      toast.success(
        input.status === 'rejected' ? 'Recomendação rejeitada' : 'Recomendação atualizada',
      );
    },
    onError: (e: unknown) =>
      toast.error((e as Error)?.message ?? 'Falha ao atualizar a recomendação'),
  });
}

/**
 * Aprova E aplica: chama a edge `ads-apply-recommendation` com
 * `{ recommendation_id, confirm:true }`. Nesta fase a edge roda dry-run e
 * devolve `{ ok, mutation_id, dry_run }`. Se a edge ainda não existir no
 * ambiente, o erro é tratado com graça (toast informativo, sem quebrar a UI).
 */
export function useApplyRecommendation(productId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recommendation_id: string): Promise<ApplyRecommendationResult> => {
      const { data, error } = await supabase.functions.invoke('ads-apply-recommendation', {
        body: { recommendation_id, confirm: true },
      });
      if (error) {
        // Edge ausente/erro de transporte: mensagem amigável (não é falha do usuário).
        const msg = error.message ?? '';
        if (/not found|404|failed to (send|fetch)|non-2xx|functionsfetch/i.test(msg)) {
          throw new Error(
            'A edge ads-apply-recommendation ainda não está disponível neste ambiente. A recomendação foi mantida na fila.',
          );
        }
        throw error;
      }
      const res = (data ?? {}) as ApplyRecommendationResult;
      if (res.ok === false) throw new Error(res.error ?? 'Falha ao aplicar a recomendação');
      return res;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['platform-ads-recommendations', productId] });
      qc.invalidateQueries({ queryKey: ['platform-ads-mutations-log', productId] });
      toast.success(
        res.dry_run ? 'Aplicado em modo simulação (dry-run)' : 'Recomendação aplicada',
        {
          description: res.mutation_id
            ? `Mutação registrada: ${res.mutation_id.slice(0, 8)}…`
            : undefined,
        },
      );
    },
    onError: (e: unknown) =>
      toast.error((e as Error)?.message ?? 'Falha ao aplicar a recomendação'),
  });
}
