import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MODULE_DEFINITIONS, type ModuleId } from '@/config/modules';

// ─── usePlanModules ──────────────────────────────────────────────────────────
// Resolve os módulos disponíveis para a ORG do usuário atual.
//
// SUPOSIÇÃO (documentada): a relação org → plano é
//   organizations.plan_id  ->  platform_plans.id
// confirmada em src/integrations/supabase/types.ts (FK organizations_plan_id_fkey)
// e usada por useOrganizationPlan.ts / usePlatformPlans.ts.
//
// Org atual vem de useAuth().profile.organization_id — mesmo padrão de
// useAIFeedback.ts, useAdminDashboard.ts etc.
//
// Colunas novas (migração 20260610145231_onboarding_modules.sql) ainda não
// estão em types.ts, então usamos cast `as any` no acesso — sem depender de
// regenerar os tipos.
//
// Conceitos:
//   - planModules    : módulos que o PLANO libera     (platform_plans.modules)
//   - enabledModules : módulos que a ORG ativou        (organizations.enabled_modules)
//   - availableModules: interseção liberado ∩ ativado   (o que de fato aparece)
//                       Se a org ainda não ativou nada (enabled vazio), caímos
//                       para os módulos do plano — onboarding não bloqueia o uso.

const ALL_MODULE_IDS = MODULE_DEFINITIONS.map((m) => m.id);

function toModuleIds(value: unknown): ModuleId[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is ModuleId => typeof v === 'string' && (ALL_MODULE_IDS as string[]).includes(v),
  );
}

export interface PlanModulesResult {
  /** Módulos liberados pelo plano da org (platform_plans.modules). */
  planModules: ModuleId[];
  /** Módulos ativados pela org no onboarding (organizations.enabled_modules). */
  enabledModules: ModuleId[];
  /**
   * Módulos efetivamente disponíveis: interseção liberado ∩ ativado.
   * Se a org não ativou nada ainda, cai para planModules (não trava o uso).
   */
  availableModules: ModuleId[];
  planId: string | null;
}

const EMPTY: PlanModulesResult = {
  planModules: [],
  enabledModules: [],
  availableModules: [],
  planId: null,
};

export function usePlanModules() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;

  const query = useQuery({
    queryKey: ['plan-modules', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PlanModulesResult> => {
      if (!orgId) return EMPTY;

      // 1) org -> plan_id + enabled_modules
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('plan_id, enabled_modules')
        .eq('id', orgId)
        .maybeSingle();
      if (orgErr) throw orgErr;

      const planId = (org as any)?.plan_id ?? null;
      const enabledModules = toModuleIds((org as any)?.enabled_modules);

      // 2) plano -> modules
      let planModules: ModuleId[] = [];
      if (planId) {
        const { data: plan, error: planErr } = await supabase
          .from('platform_plans')
          .select('modules')
          .eq('id', planId)
          .maybeSingle();
        if (planErr) throw planErr;
        planModules = toModuleIds((plan as any)?.modules);
      }

      // 3) disponível = liberado ∩ ativado; se a org não ativou nada, usa o plano.
      const availableModules =
        enabledModules.length > 0
          ? planModules.filter((m) => enabledModules.includes(m))
          : planModules;

      return { planModules, enabledModules, availableModules, planId };
    },
  });

  const result = query.data ?? EMPTY;

  /**
   * Utilitário puro: o módulo está disponível para a org atual?
   * (default: avalia contra availableModules — liberado ∩ ativado.)
   */
  const canAccessModule = (id: ModuleId): boolean =>
    result.availableModules.includes(id);

  return {
    ...result,
    canAccessModule,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
