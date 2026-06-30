import { useAuth } from '@/hooks/useAuth';
import { useOrganizationEffectivePlan, type EffectivePlan } from '@/hooks/useOrganizationPlan';

/** Plano efetivo da org logada (features + limites resolvidos). */
export function useEffectivePlan() {
  const { profile } = useAuth();
  return useOrganizationEffectivePlan(profile?.organization_id);
}

export interface FeatureFlagResult {
  /** true se a feature está liberada no plano (ou enquanto carrega — fail-open suave). */
  enabled: boolean;
  loading: boolean;
  planName?: string;
}

/**
 * Gate de FEATURE por plano. Regra: `feature_X=true ⟺ liberado`.
 * Fail-open enquanto carrega ou se o plano é desconhecido (não pisca cadeado nem
 * quebra a UI em edge cases) — o gating é camada de packaging/UX, não fronteira de
 * segurança; o enforcement de custo real (conexões/agentes) tem trigger no banco.
 */
export function useFeatureFlag(flag: string): FeatureFlagResult {
  const { data, isLoading } = useEffectivePlan();
  if (isLoading || !data) return { enabled: true, loading: isLoading };
  return {
    enabled: data.features?.[flag] === true,
    loading: false,
    planName: data.plan_name,
  };
}

export interface PlanLimitResult {
  /** teto do plano (null = ilimitado / não definido). */
  limit: number | null;
  loading: boolean;
  planName?: string;
}

/** Lê um limite numérico do plano efetivo (ex.: 'max_connections', 'max_professionals'). */
export function usePlanLimit(key: keyof EffectivePlan['limits']): PlanLimitResult {
  const { data, isLoading } = useEffectivePlan();
  if (isLoading || !data) return { limit: null, loading: isLoading };
  const v = data.limits?.[key];
  return { limit: typeof v === 'number' ? v : null, loading: false, planName: data.plan_name };
}
