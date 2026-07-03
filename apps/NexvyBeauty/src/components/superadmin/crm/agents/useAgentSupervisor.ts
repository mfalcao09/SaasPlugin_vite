// STUB local do supervisor multi-agente (twin de `@/hooks/useAgentSupervisor`).
// D3 P1/F1d — as tabelas `agent_specialists` / `agent_routing_rules` sao tenant
// (organization_id, RLS por org) e NAO tem twin `platform_crm_*` nesta onda.
// Mantemos a MESMA API para a UI ficar completa; persistencia = // TODO(edge)
// (estado em memoria, some ao recarregar). Ver AgentSupervisorPanel.
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export interface AgentSpecialist {
  id: string;
  agent_id: string;
  role: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface AgentRoutingRule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  match_stage_ids: string[] | null;
  match_tag_ids: string[] | null;
  match_product_ids: string[] | null;
  match_channels: string[] | null;
  match_events: string[] | null;
  deal_value_min: number | null;
  deal_value_max: number | null;
  target_specialist_id: string;
  match_count: number;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
}

// Estado em modulo (compartilhado entre hooks) — substitui o backend por ora.
let SPECIALISTS: AgentSpecialist[] = [];
let RULES: AgentRoutingRule[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function useStoreSync() {
  const [, force] = useState(0);
  const subscribe = useCallback(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  useState(() => subscribe());
  return null;
}

export function useAgentSpecialists() {
  useStoreSync();
  return { data: SPECIALISTS, isLoading: false };
}

export function useUpsertSpecialist() {
  return {
    mutate: (
      input: Partial<AgentSpecialist> & { id?: string },
      opts?: { onSuccess?: () => void },
    ) => {
      // TODO(edge): persistir em `agent_specialists` (sem twin platform).
      const now = new Date().toISOString();
      if (input.id) {
        SPECIALISTS = SPECIALISTS.map((s) =>
          s.id === input.id ? { ...s, ...input, updated_at: now } as AgentSpecialist : s,
        );
      } else {
        SPECIALISTS = [
          ...SPECIALISTS,
          {
            id: `local-${Date.now()}`,
            agent_id: input.agent_id ?? '',
            role: input.role ?? 'sdr',
            display_name: input.display_name ?? '',
            description: input.description ?? null,
            is_active: input.is_active ?? true,
            priority: input.priority ?? 100,
            created_at: now,
            updated_at: now,
          },
        ];
      }
      notify();
      toast.success('Especialista salvo (local — persistencia via Edge em breve)');
      opts?.onSuccess?.();
    },
  };
}

export function useDeleteSpecialist() {
  return {
    mutate: (id: string) => {
      SPECIALISTS = SPECIALISTS.filter((s) => s.id !== id);
      RULES = RULES.filter((r) => r.target_specialist_id !== id);
      notify();
      toast.success('Especialista removido');
    },
  };
}

export function useAgentRoutingRules() {
  useStoreSync();
  return { data: RULES, isLoading: false };
}

export function useUpsertRoutingRule() {
  return {
    mutate: (
      input: Partial<AgentRoutingRule> & { id?: string },
      opts?: { onSuccess?: () => void },
    ) => {
      // TODO(edge): persistir em `agent_routing_rules` (sem twin platform).
      const now = new Date().toISOString();
      if (input.id) {
        RULES = RULES.map((r) =>
          r.id === input.id ? { ...r, ...input, updated_at: now } as AgentRoutingRule : r,
        );
      } else {
        RULES = [
          ...RULES,
          {
            id: `local-${Date.now()}`,
            name: input.name ?? '',
            description: input.description ?? null,
            is_active: input.is_active ?? true,
            priority: input.priority ?? 100,
            match_stage_ids: input.match_stage_ids ?? null,
            match_tag_ids: input.match_tag_ids ?? null,
            match_product_ids: input.match_product_ids ?? null,
            match_channels: input.match_channels ?? null,
            match_events: input.match_events ?? null,
            deal_value_min: input.deal_value_min ?? null,
            deal_value_max: input.deal_value_max ?? null,
            target_specialist_id: input.target_specialist_id ?? '',
            match_count: 0,
            last_matched_at: null,
            created_at: now,
            updated_at: now,
          },
        ];
      }
      notify();
      toast.success('Regra salva (local — persistencia via Edge em breve)');
      opts?.onSuccess?.();
    },
  };
}

export function useDeleteRoutingRule() {
  return {
    mutate: (id: string) => {
      RULES = RULES.filter((r) => r.id !== id);
      notify();
      toast.success('Regra removida');
    },
  };
}
