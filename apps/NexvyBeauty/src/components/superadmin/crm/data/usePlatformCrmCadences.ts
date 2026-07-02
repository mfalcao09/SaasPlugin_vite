import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

/**
 * CRM de PLATAFORMA (super_admin) — Cadências Inteligentes do pipeline ÚNICO,
 * desacopladas do tenant. Toca APENAS `platform_crm_cadences`,
 * `platform_crm_cadence_steps` e `platform_crm_cadence_enrollments`.
 *
 * Sem organization_id / product_id — a RLS super_admin-only isola os dados.
 * Porte 1:1 de `useCadences` do CRM de tenant: mesma forma, apenas dados
 * (`platform_crm_*`) e desacoplamento. Diferenças de schema vs. tenant:
 *   - `platform_crm_cadences` NÃO tem `organization_id`.
 *   - `platform_crm_cadence_steps` NÃO tem `context_id`,
 *     `reengagement_template_id` nem `reengagement_variable_mapping`
 *     (features cross-módulo — ver TODO no CadenceWizard).
 */

export type CadenceStatus = 'draft' | 'active' | 'paused' | 'archived';

export type Cadence = Tables<'platform_crm_cadences'>;
export type CadenceStep = Tables<'platform_crm_cadence_steps'>;

export type CadenceEnrollmentStats = {
  active: number;
  completed: number;
  stopped: number;
  paused: number;
  total: number;
};

export function usePlatformCrmCadences() {
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [stats, setStats] = useState<Record<string, CadenceEnrollmentStats>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_crm_cadences')
      .select('*')
      .order('created_at', { ascending: false });
    const list = (data as Cadence[]) ?? [];
    setCadences(list);

    if (list.length) {
      const ids = list.map((c) => c.id);
      const { data: enrollments } = await supabase
        .from('platform_crm_cadence_enrollments')
        .select('cadence_id, status')
        .in('cadence_id', ids);
      const agg: Record<string, CadenceEnrollmentStats> = {};
      ids.forEach((id) => {
        agg[id] = { active: 0, completed: 0, stopped: 0, paused: 0, total: 0 };
      });
      (enrollments ?? []).forEach((e) => {
        const a = agg[e.cadence_id];
        if (!a) return;
        a.total++;
        if ((a as any)[e.status] !== undefined) (a as any)[e.status]++;
      });
      setStats(agg);
    } else {
      setStats({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const ch = supabase
      .channel('platform-crm-cadences-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_cadences' },
        refresh,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  return { cadences, stats, loading, refresh };
}

export function usePlatformCrmCadenceSteps(cadenceId: string | null) {
  const [steps, setSteps] = useState<CadenceStep[]>([]);

  const refresh = useCallback(async () => {
    if (!cadenceId) {
      setSteps([]);
      return;
    }
    const { data } = await supabase
      .from('platform_crm_cadence_steps')
      .select('*')
      .eq('cadence_id', cadenceId)
      .order('order_index', { ascending: true });
    setSteps((data as CadenceStep[]) ?? []);
  }, [cadenceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { steps, refresh };
}
