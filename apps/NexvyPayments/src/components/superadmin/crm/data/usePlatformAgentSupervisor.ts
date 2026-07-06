import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Supervisor multi-agente do CRM de PLATAFORMA (super_admin) — F2 (O Cérebro).
 * Toca apenas `platform_crm_agent_specialists` / `platform_crm_agent_routing_rules`
 * (migration 20260705_platform_agent_supervisor.sql). RLS super_admin-only isola
 * os dados; SEM organization_id.
 *
 * RESTRIÇÃO: usa SOMENTE as colunas da migration — NÃO inventar campos.
 *   specialists:    id, agent_id, name, role, focus, is_active, created_at, updated_at
 *   routing_rules:  id, agent_id, trigger_description, target_specialist_id,
 *                   priority, is_active, created_at, updated_at
 *
 * As tabelas são novas e ainda não estão nos tipos gerados (`types.ts`), então
 * usamos `supabase as any` — mesmo padrão de AgentOrchestratorRoutingTab.
 */

const PLATFORM_CRM_KEY = 'platform-crm';
const SPECIALISTS_KEY = [PLATFORM_CRM_KEY, 'agent-supervisor', 'specialists'];
const RULES_KEY = [PLATFORM_CRM_KEY, 'agent-supervisor', 'routing-rules'];

// Shapes 1:1 com as colunas reais da migration (contrato duro).
export interface PlatformAgentSpecialist {
  id: string;
  agent_id: string;
  name: string;
  role: string | null;
  focus: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformAgentRoutingRule {
  id: string;
  agent_id: string;
  trigger_description: string | null;
  target_specialist_id: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Entradas de upsert: só os campos editáveis pela UI (sem timestamps/id no create).
export type SpecialistUpsertInput = {
  id?: string;
  agent_id: string;
  name: string;
  role?: string | null;
  focus?: string | null;
  is_active?: boolean;
};

export type RoutingRuleUpsertInput = {
  id?: string;
  agent_id: string;
  trigger_description?: string | null;
  target_specialist_id?: string | null;
  priority?: number;
  is_active?: boolean;
};

/** Hook único: lista + CRUD de especialistas e regras de roteamento da plataforma. */
export function usePlatformAgentSupervisor() {
  const queryClient = useQueryClient();
  const sb = supabase as any;

  // ---- LISTAS ----
  const specialistsQuery = useQuery({
    queryKey: SPECIALISTS_KEY,
    queryFn: async (): Promise<PlatformAgentSpecialist[]> => {
      const { data, error } = await sb
        .from('platform_crm_agent_specialists')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as PlatformAgentSpecialist[];
    },
  });

  const rulesQuery = useQuery({
    queryKey: RULES_KEY,
    queryFn: async (): Promise<PlatformAgentRoutingRule[]> => {
      const { data, error } = await sb
        .from('platform_crm_agent_routing_rules')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlatformAgentRoutingRule[];
    },
  });

  // ---- ESPECIALISTAS: upsert (create/update) ----
  const upsertSpecialist = useMutation({
    mutationFn: async (input: SpecialistUpsertInput): Promise<PlatformAgentSpecialist> => {
      // Só colunas reais chegam ao banco.
      const payload = {
        agent_id: input.agent_id,
        name: input.name,
        role: input.role ?? null,
        focus: input.focus ?? null,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await sb
          .from('platform_crm_agent_specialists')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', input.id)
          .select('*')
          .single();
        if (error) throw error;
        return data as PlatformAgentSpecialist;
      }
      const { data, error } = await sb
        .from('platform_crm_agent_specialists')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data as PlatformAgentSpecialist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SPECIALISTS_KEY });
      toast.success('Especialista salvo.');
    },
    onError: (error: Error) => {
      console.error('[platform-supervisor] upsert specialist failed', error);
      toast.error(error.message || 'Falha ao salvar o especialista.');
    },
  });

  // ---- ESPECIALISTAS: delete ----
  const deleteSpecialist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('platform_crm_agent_specialists')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      // ON DELETE SET NULL zera target_specialist_id das regras → recarrega ambas.
      queryClient.invalidateQueries({ queryKey: SPECIALISTS_KEY });
      queryClient.invalidateQueries({ queryKey: RULES_KEY });
      toast.success('Especialista removido.');
    },
    onError: (error: Error) => {
      console.error('[platform-supervisor] delete specialist failed', error);
      toast.error(error.message || 'Falha ao remover o especialista.');
    },
  });

  // ---- REGRAS: upsert (create/update) ----
  const upsertRule = useMutation({
    mutationFn: async (input: RoutingRuleUpsertInput): Promise<PlatformAgentRoutingRule> => {
      const payload = {
        agent_id: input.agent_id,
        trigger_description: input.trigger_description ?? null,
        target_specialist_id: input.target_specialist_id ?? null,
        priority: input.priority ?? 0,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await sb
          .from('platform_crm_agent_routing_rules')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', input.id)
          .select('*')
          .single();
        if (error) throw error;
        return data as PlatformAgentRoutingRule;
      }
      const { data, error } = await sb
        .from('platform_crm_agent_routing_rules')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return data as PlatformAgentRoutingRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY });
      toast.success('Regra salva.');
    },
    onError: (error: Error) => {
      console.error('[platform-supervisor] upsert rule failed', error);
      toast.error(error.message || 'Falha ao salvar a regra.');
    },
  });

  // ---- REGRAS: delete ----
  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('platform_crm_agent_routing_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY });
      toast.success('Regra removida.');
    },
    onError: (error: Error) => {
      console.error('[platform-supervisor] delete rule failed', error);
      toast.error(error.message || 'Falha ao remover a regra.');
    },
  });

  return {
    specialists: specialistsQuery.data ?? [],
    specialistsLoading: specialistsQuery.isLoading,
    specialistsError: specialistsQuery.error as Error | null,
    rules: rulesQuery.data ?? [],
    rulesLoading: rulesQuery.isLoading,
    rulesError: rulesQuery.error as Error | null,
    upsertSpecialist: upsertSpecialist.mutate,
    upsertSpecialistAsync: upsertSpecialist.mutateAsync,
    isUpsertingSpecialist: upsertSpecialist.isPending,
    deleteSpecialist: deleteSpecialist.mutate,
    isDeletingSpecialist: deleteSpecialist.isPending,
    upsertRule: upsertRule.mutate,
    upsertRuleAsync: upsertRule.mutateAsync,
    isUpsertingRule: upsertRule.isPending,
    deleteRule: deleteRule.mutate,
    isDeletingRule: deleteRule.isPending,
  };
}
