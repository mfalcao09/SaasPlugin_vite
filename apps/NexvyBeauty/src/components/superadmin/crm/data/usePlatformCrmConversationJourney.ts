import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * CRM de PLATAFORMA (super_admin) — timeline de HANDOFFS de uma conversa
 * (assumiu / devolveu / transferiu entre atendentes/setores).
 *
 * PORTE de `hooks/useConversationJourney.ts` (CRM Vendus) — trocas de dado /
 * desacoplamento: a fonte tenant `conversation_transfers` + `webchat_assignment_events`
 * (org-scoped) é substituída pela tabela ÚNICA `platform_crm_conversation_transfers`
 * (super_admin-only, RLS por role), onde o edge `platform-webchat-inbox` já grava
 * o evento tanto no ACEITE quanto na TRANSFERÊNCIA (de/para usuário e setor). Os
 * perfis de/para são resolvidos em `profiles` num segundo fetch (evita depender do
 * embedding PostgREST + RLS). A ação é derivada das colunas (assigned/unassigned/
 * transferred), espelhando a semântica do canônico.
 */

export interface PlatformCrmJourneyEvent {
  id: string;
  type: 'transfer' | 'assignment';
  /** 'assigned' | 'unassigned' | 'transferred' */
  action: string;
  created_at: string;
  from_user?: { id: string; full_name: string; avatar_url: string | null } | null;
  to_user?: { id: string; full_name: string; avatar_url: string | null } | null;
  internal_note?: string | null;
}

interface RawTransferRow {
  id: string;
  conversation_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  from_sector_id: string | null;
  to_sector_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

function deriveAction(row: RawTransferRow): { type: PlatformCrmJourneyEvent['type']; action: string } {
  if (row.to_user_id && !row.from_user_id) return { type: 'assignment', action: 'assigned' };
  if (!row.to_user_id && (row.to_sector_id || row.from_sector_id)) {
    return { type: 'assignment', action: 'unassigned' };
  }
  return { type: 'transfer', action: 'transferred' };
}

export function usePlatformCrmConversationJourney(conversationId: string | null) {
  return useQuery({
    queryKey: ['platform-crm', 'conversation-journey', conversationId],
    enabled: !!conversationId,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformCrmJourneyEvent[]> => {
      if (!conversationId) return [];

      const { data: rows, error } = await (supabase as any)
        .from('platform_crm_conversation_transfers')
        .select('id, conversation_id, from_user_id, to_user_id, from_sector_id, to_sector_id, note, created_by, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const transfers = (rows ?? []) as RawTransferRow[];
      if (!transfers.length) return [];

      // Resolve os perfis de/para num único fetch (id → {full_name, avatar_url}).
      const userIds = Array.from(
        new Set(
          transfers
            .flatMap((t) => [t.from_user_id, t.to_user_id])
            .filter((id): id is string => !!id),
        ),
      );

      const profileById = new Map<string, { id: string; full_name: string; avatar_url: string | null }>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);
        (profs ?? []).forEach((p: any) => {
          profileById.set(p.id, {
            id: p.id,
            full_name: p.full_name || 'Usuário',
            avatar_url: p.avatar_url ?? null,
          });
        });
      }

      return transfers.map((t) => {
        const { type, action } = deriveAction(t);
        return {
          id: `tr-${t.id}`,
          type,
          action,
          created_at: t.created_at,
          from_user: t.from_user_id ? profileById.get(t.from_user_id) ?? null : null,
          to_user: t.to_user_id ? profileById.get(t.to_user_id) ?? null : null,
          internal_note: t.note,
        };
      });
    },
  });
}
