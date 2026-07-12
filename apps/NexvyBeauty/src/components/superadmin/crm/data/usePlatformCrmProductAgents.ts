// ─────────────────────────────────────────────────────────────────────────────
// usePlatformCrmProductAgents — CRUD do subsistema de AGENTES IA por produto (D3 P1/F1d)
// Twin 1:1 de `useProductAgents` da fonte Bizon, porém:
//   • grava em `platform_crm_product_agents` (twin da `product_agents`)
//   • SEM `organization_id` / tenant — escopo é o PRODUTO (`product_id`)
//   • lista/CRUD por produto + duplicar/toggle/default
// Fonte: `.vendus-src-reference/src/hooks/useProductAgents.ts`
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import type { ProductAgent } from '@/components/superadmin/crm/agents/types';
import { syncPlatformCrmAgentConnections } from '@/components/superadmin/crm/data/usePlatformCrmAgentConnections';

const KEY = 'platform-crm';

/** Row cru da tabela twin (81 colunas). O tipo de UI `ProductAgent` estende isto. */
export type PlatformCrmProductAgentRow = Tables<'platform_crm_product_agents'>;

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist de colunas reais de `platform_crm_product_agents` (fonte da verdade = DB).
// Qualquer campo fora deste set (ex.: `dedicated_connections` transiente) é
// descartado antes de insert/update p/ evitar "column does not exist".
// Espelha `PRODUCT_AGENTS_COLUMNS` da fonte, SEM `organization_id`.
// ─────────────────────────────────────────────────────────────────────────────
const PRODUCT_AGENTS_COLUMNS = new Set<string>([
  'id', 'product_id', 'created_by', 'created_at', 'updated_at',
  'name', 'description', 'avatar_url', 'agent_type', 'primary_objective',
  'can_do', 'cannot_do', 'handoff_triggers', 'end_conversation_triggers',
  'tone_style', 'message_style', 'always_end_with_question', 'additional_prompt',
  'required_phrases', 'prohibited_phrases',
  'auto_tag_leads', 'default_tags',
  'can_update_pipeline', 'can_create_tasks', 'can_schedule_meetings',
  'can_apply_tags', 'can_update_lead', 'can_send_emails', 'can_send_materials',
  'can_trigger_flows', 'can_transfer', 'can_notify', 'can_add_notes',
  'can_start_cadence', 'can_qualify', 'qualification_schema',
  'tool_configs',
  'active_in_funnels', 'active_in_chat', 'active_in_widget', 'active_in_inbox',
  'active_in_copilot', 'active_in_whatsapp', 'active_in_instagram', 'active_in_facebook',
  'is_active', 'is_default',
  'activation_keywords', 'activation_phrases', 'activation_priority', 'activation_scope',
  'takeover_on_match', 'evolution_instance_id', 'humanization',
  'allowed_event_type_ids', 'default_schedule_user_id',
  'booking_notification_user_ids', 'booking_notify_org_admins',
  'enable_audio_transcription', 'enable_image_vision',
  'handoff_delay_seconds', 'handoff_include_summary',
  'handoff_incoming_message', 'handoff_outgoing_message',
  'message_delay_seconds',
  'quick_menu_intro', 'quick_menu_invalid_message', 'quick_menu_mode', 'quick_menu_options',
  'welcome_enabled', 'welcome_message',
  // Follow-up automático por agente
  'followup_enabled', 'followup_max_attempts', 'followup_intervals_minutes',
  'followup_tone', 'followup_extra_instructions', 'followup_respect_business_hours',
  'followup_stop_on_human', 'followup_stop_on_booking', 'followup_channels',
  'followup_attempt_hints',
]);

function pickAgentFields<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (PRODUCT_AGENTS_COLUMNS.has(k)) out[k] = v;
  }
  return out as Partial<T>;
}

// ─── Listagem por produto ────────────────────────────────────────────────────
export function usePlatformCrmProductAgents(productId?: string) {
  return useQuery({
    queryKey: [KEY, 'product-agents', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .select('*')
        .eq('product_id', productId!)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductAgent[];
    },
    enabled: !!productId,
  });
}

/** Um agente por id (para editor / deep-link). */
export function usePlatformCrmProductAgent(agentId?: string | null) {
  return useQuery({
    queryKey: [KEY, 'product-agent', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .select('*')
        .eq('id', agentId!)
        .single();
      if (error) throw error;
      return data as unknown as ProductAgent;
    },
    enabled: !!agentId,
  });
}

// ─── Criar ────────────────────────────────────────────────────────────────────
export function useCreatePlatformCrmProductAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agentRaw: Partial<ProductAgent>) => {
      const agent = pickAgentFields(agentRaw as Record<string, unknown>) as Partial<ProductAgent>;
      const insertData = {
        name: agent.name || '',
        product_id: agent.product_id ?? null,
        primary_objective: agent.primary_objective || '',
        agent_type: agent.agent_type || 'custom',
        description: agent.description,
        avatar_url: agent.avatar_url,
        can_do: agent.can_do || [],
        cannot_do: agent.cannot_do || [],
        handoff_triggers: agent.handoff_triggers || [],
        end_conversation_triggers: agent.end_conversation_triggers || [],
        tone_style: agent.tone_style || 'friendly',
        message_style: agent.message_style || 'balanced',
        always_end_with_question: agent.always_end_with_question ?? true,
        additional_prompt: agent.additional_prompt,
        required_phrases: agent.required_phrases || [],
        prohibited_phrases: agent.prohibited_phrases || [],
        auto_tag_leads: agent.auto_tag_leads ?? true,
        default_tags: agent.default_tags || [],
        can_update_pipeline: agent.can_update_pipeline ?? true,
        can_create_tasks: agent.can_create_tasks ?? true,
        can_schedule_meetings: agent.can_schedule_meetings ?? true,
        can_apply_tags: agent.can_apply_tags ?? false,
        can_update_lead: agent.can_update_lead ?? false,
        can_send_emails: agent.can_send_emails ?? false,
        can_send_materials: agent.can_send_materials ?? false,
        can_trigger_flows: agent.can_trigger_flows ?? false,
        can_transfer: agent.can_transfer ?? false,
        can_notify: agent.can_notify ?? false,
        can_add_notes: agent.can_add_notes ?? false,
        can_start_cadence: agent.can_start_cadence ?? false,
        can_qualify: agent.can_qualify ?? false,
        tool_configs: (agent.tool_configs ?? {}) as Record<string, unknown>,
        active_in_funnels: agent.active_in_funnels ?? true,
        active_in_chat: agent.active_in_chat ?? true,
        active_in_widget: agent.active_in_widget ?? true,
        active_in_inbox: agent.active_in_inbox ?? true,
        active_in_copilot: agent.active_in_copilot ?? false,
        active_in_whatsapp: agent.active_in_whatsapp ?? true,
        active_in_instagram: agent.active_in_instagram ?? true,
        active_in_facebook: agent.active_in_facebook ?? true,
        is_active: agent.is_active ?? true,
        is_default: agent.is_default ?? false,
        activation_keywords: agent.activation_keywords ?? [],
        activation_phrases: agent.activation_phrases ?? [],
        activation_priority: agent.activation_priority ?? 0,
        activation_scope: agent.activation_scope ?? 'all',
        takeover_on_match: agent.takeover_on_match ?? true,
        evolution_instance_id: agent.evolution_instance_id ?? null,
        humanization: ((agent as Record<string, unknown>).humanization ?? {}) as Record<string, unknown>,
      };

      // Primeiro agente do produto vira padrão automaticamente.
      if (insertData.product_id) {
        const { count } = await supabase
          .from('platform_crm_product_agents')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', insertData.product_id);
        if (count === 0) insertData.is_default = true;
      }

      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .insert(insertData as never)
        .select()
        .single();
      if (error) throw error;
      // Sincroniza as conexões dedicadas (campo transiente `dedicated_connections`)
      // no twin product-scoped `platform_crm_agent_connections`.
      await syncPlatformCrmAgentConnections(
        (data as { id: string }).id,
        (agentRaw as ProductAgent).dedicated_connections,
      );
      return data as unknown as ProductAgent;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-agents', data.product_id] });
      qc.invalidateQueries({ queryKey: [KEY, 'agent-connections', data.id] });
      qc.invalidateQueries({ queryKey: [KEY, 'agent-connections-summary', data.id] });
      toast.success('Agente criado com sucesso!');
    },
    onError: (error: unknown) => {
      const e = error as { message?: string };
      console.error('Error creating platform product agent:', e);
      toast.error(`Erro ao criar agente: ${e?.message || 'desconhecido'}`);
    },
  });
}

// ─── Atualizar ────────────────────────────────────────────────────────────────
export function useUpdatePlatformCrmProductAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updatesRaw }: Partial<ProductAgent> & { id: string }) => {
      const updates = pickAgentFields(updatesRaw as Record<string, unknown>);
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .update(updates as never)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      // Sincroniza as conexões dedicadas (campo transiente `dedicated_connections`).
      await syncPlatformCrmAgentConnections(
        id,
        (updatesRaw as ProductAgent).dedicated_connections,
      );
      return data as unknown as ProductAgent;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-agents', data.product_id] });
      qc.invalidateQueries({ queryKey: [KEY, 'product-agent', data.id] });
      qc.invalidateQueries({ queryKey: [KEY, 'agent-connections', data.id] });
      qc.invalidateQueries({ queryKey: [KEY, 'agent-connections-summary', data.id] });
      toast.success('Agente atualizado com sucesso!');
    },
    onError: (error: unknown) => {
      const e = error as { message?: string };
      console.error('Error updating platform product agent:', e);
      toast.error(`Erro ao atualizar agente: ${e?.message || 'desconhecido'}`);
    },
  });
}

// ─── Excluir ─────────────────────────────────────────────────────────────────
export function useDeletePlatformCrmProductAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string | null }) => {
      const { error } = await supabase
        .from('platform_crm_product_agents')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { id, productId };
    },
    onSuccess: ({ productId }) => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-agents', productId] });
      toast.success('Agente excluído com sucesso!');
    },
    onError: (error: unknown) => {
      console.error('Error deleting platform product agent:', error);
      toast.error('Erro ao excluir agente');
    },
  });
}

// ─── Definir padrão ──────────────────────────────────────────────────────────
export function useSetDefaultPlatformCrmProductAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error: clearError } = await supabase
        .from('platform_crm_product_agents')
        .update({ is_default: false })
        .eq('product_id', productId);
      if (clearError) throw clearError;
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .update({ is_default: true })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProductAgent;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-agents', data.product_id] });
      toast.success('Agente definido como padrão!');
    },
    onError: (error: unknown) => {
      console.error('Error setting default platform product agent:', error);
      toast.error('Erro ao definir agente padrão');
    },
  });
}

// ─── Toggle ativo ────────────────────────────────────────────────────────────
export function useTogglePlatformCrmProductAgentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProductAgent;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === KEY && q.queryKey[1] === 'product-agents',
      });
      toast.success(data.is_active ? 'Agente ativado!' : 'Agente desativado!');
    },
    onError: (error: unknown) => {
      console.error('Error toggling platform product agent status:', error);
      toast.error('Erro ao alterar status do agente');
    },
  });
}

// ─── Duplicar (client-only insert, sem ids/datas) ────────────────────────────
export function useDuplicatePlatformCrmProductAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agent: ProductAgent) => {
      const clean = pickAgentFields({ ...(agent as unknown as Record<string, unknown>) });
      delete (clean as Record<string, unknown>).id;
      delete (clean as Record<string, unknown>).created_at;
      delete (clean as Record<string, unknown>).updated_at;
      delete (clean as Record<string, unknown>).created_by;
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .insert({ ...(clean as object), name: `${agent.name} (cópia)`, is_default: false } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProductAgent;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY, 'product-agents', data.product_id] });
      toast.success('Agente duplicado!');
    },
    onError: (error: unknown) => {
      const e = error as { message?: string };
      toast.error(`Erro ao duplicar agente: ${e?.message || 'desconhecido'}`);
    },
  });
}
