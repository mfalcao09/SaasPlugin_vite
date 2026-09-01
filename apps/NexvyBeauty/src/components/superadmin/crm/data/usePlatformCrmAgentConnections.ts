// ─────────────────────────────────────────────────────────────────────────────
// usePlatformCrmAgentConnections — vínculo agente↔conexão de canal (B11/Wave3)
// Twin product-scoped de `useAgentConnections`/`syncAgentConnections` da fonte
// Bizon (.vendus-src-reference), porém:
//   • grava em `platform_crm_agent_connections` (twin da `product_agent_connections`)
//   • SEM `organization_id` — chave é `product_agent_id` (FK do agente de produto)
//   • connection_id referencia o id da conexão do respectivo tipo:
//       'evolution'     → platform_crm_evolution_instances(id)
//       'meta_whatsapp' → platform_crm_whatsapp_meta_connections(id)
//       'instagram'     → platform_crm_instagram_connections(id)
// Fontes: `.vendus-src-reference/src/hooks/useAgentConnections.ts`
//         `.vendus-src-reference/src/hooks/useProductAgents.ts` (syncAgentConnections)
//         `.vendus-src-reference/src/components/admin/agents/AgentCard.tsx` (summary)
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DedicatedConnectionType = 'evolution' | 'meta_whatsapp' | 'instagram';

/** Shape transiente consumido pela UI (`ProductAgent.dedicated_connections`). */
export type DedicatedConnection = { type: DedicatedConnectionType; id: string };

const KEY = 'platform-crm';

// ─── Leitura: conexões dedicadas de um agente ────────────────────────────────
/**
 * Lê `platform_crm_agent_connections` de um agente e retorna no shape
 * `{ type, id }[]` que hidrata `dedicated_connections` no AgentEditor.
 * Sem vínculos = array vazio (agente atende em qualquer conexão).
 */
export function usePlatformCrmAgentConnections(agentId?: string | null) {
  return useQuery({
    queryKey: [KEY, 'agent-connections', agentId],
    enabled: !!agentId,
    queryFn: async (): Promise<DedicatedConnection[]> => {
      if (!agentId) return [];
      // (supabase as any): tabela nova, pende regeneração dos tipos pós-migration.
      const { data, error } = await (supabase as any)
        .from('platform_crm_agent_connections')
        .select('connection_type, connection_id')
        .eq('product_agent_id', agentId);
      if (error) throw error;
      return ((data ?? []) as Array<{ connection_type: string; connection_id: string }>).map((r) => ({
        type: r.connection_type as DedicatedConnectionType,
        id: r.connection_id,
      }));
    },
  });
}

// ─── Escrita: sincroniza (delete-all + insert) ───────────────────────────────
/**
 * Sincroniza `platform_crm_agent_connections` com a lista vinda do form.
 * delete-all + insert (lista pequena). `undefined` = não mexer.
 * Twin de `syncAgentConnections` da fonte, sem organization_id.
 */
export async function syncPlatformCrmAgentConnections(
  agentId: string,
  connections?: DedicatedConnection[],
): Promise<void> {
  if (!connections) return; // undefined = não mexer
  // (supabase as any): tabela nova, pende regeneração dos tipos pós-migration.
  const { error: delError } = await (supabase as any)
    .from('platform_crm_agent_connections')
    .delete()
    .eq('product_agent_id', agentId);
  if (delError) {
    console.error('[syncPlatformCrmAgentConnections] delete error', delError);
    return;
  }
  if (connections.length === 0) return;
  const rows = connections.map((c) => ({
    product_agent_id: agentId,
    connection_type: c.type,
    connection_id: c.id,
  }));
  const { error } = await (supabase as any)
    .from('platform_crm_agent_connections')
    .insert(rows);
  if (error) console.error('[syncPlatformCrmAgentConnections] insert error', error);
}

// ─── Resumo para o card (label de 1 conexão, contagem se +de 1) ───────────────
/**
 * Resolve o rótulo das conexões dedicadas de um agente para o badge do AgentCard.
 * 1 conexão → nome + telefone/@handle; +de 1 → "N conexões dedicadas".
 * Fallback legado: `wa_qr_instance_id` direto na linha do agente.
 * null = sem conexão dedicada (não renderiza badge).
 */
export function usePlatformCrmAgentConnectionsSummary(
  agentId?: string | null,
  legacyEvolutionInstanceId?: string | null,
) {
  return useQuery({
    queryKey: [KEY, 'agent-connections-summary', agentId, legacyEvolutionInstanceId],
    enabled: !!agentId,
    queryFn: async (): Promise<string | null> => {
      if (!agentId) return null;
      // (supabase as any): tabela nova, pende regeneração dos tipos pós-migration.
      const { data: links } = await (supabase as any)
        .from('platform_crm_agent_connections')
        .select('connection_type, connection_id')
        .eq('product_agent_id', agentId);

      const rows = (links ?? []) as Array<{ connection_type: string; connection_id: string }>;

      if (rows.length === 0) {
        // Fallback legado: coluna única wa_qr_instance_id
        if (legacyEvolutionInstanceId) {
          const { data } = await supabase
            .from('platform_crm_wa_qr_instances' as never)
            .select('name, phone_number')
            .eq('id', legacyEvolutionInstanceId)
            .maybeSingle();
          if (data) {
            return `${data.name}${data.phone_number ? ` · ${data.phone_number}` : ''}`;
          }
        }
        return null;
      }

      if (rows.length === 1) {
        const r = rows[0];
        let label = '';
        if (r.connection_type === 'evolution') {
          const { data } = await supabase
            .from('platform_crm_wa_qr_instances' as never)
            .select('name, phone_number')
            .eq('id', r.connection_id)
            .maybeSingle();
          if (data) label = `${data.name}${data.phone_number ? ` · ${data.phone_number}` : ''}`;
        } else if (r.connection_type === 'meta_whatsapp') {
          const { data } = await supabase
            .from('platform_crm_whatsapp_meta_connections')
            .select('display_name, phone_number')
            .eq('id', r.connection_id)
            .maybeSingle();
          if (data) label = `${data.display_name}${data.phone_number ? ` · ${data.phone_number}` : ''}`;
        } else if (r.connection_type === 'instagram') {
          const { data } = await supabase
            .from('platform_crm_instagram_connections')
            .select('display_name, ig_username')
            .eq('id', r.connection_id)
            .maybeSingle();
          if (data) label = `${data.display_name}${data.ig_username ? ` · @${String(data.ig_username).replace(/^@/, '')}` : ''}`;
        }
        return label || '1 conexão dedicada';
      }

      return `${rows.length} conexões dedicadas`;
    },
  });
}
