import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * INBOX do CRM de PLATAFORMA (super_admin) — conversas + mensagens do canal de
 * webchat/atendimento da própria plataforma. Desacoplado do tenant: toca APENAS
 * `platform_crm_conversations` e `platform_crm_messages`. Sem organization_id /
 * product_id / sector_id / evolution_instance_id — a RLS super_admin-only já isola
 * os dados. (Porte 1:1 da UX do CRM Vendus `seller/SellerInbox.tsx`.)
 *
 * ⚠️ ENTREGA POR CANAL (webchat/whatsapp) e IA: NÃO acontecem aqui. As mutations
 * client-side apenas GRAVAM/atualizam linhas em `platform_crm_*`. A entrega real ao
 * visitante, o broadcast `new_message` e a geração de resposta por IA virão das Edge
 * Functions na fase do webchat/widget/LLM. Por ora, persistimos e o realtime da
 * lista/conversa fica montado para receber esse broadcast quando o edge existir.
 */

export type PlatformCrmConversation = Tables<'platform_crm_conversations'>;
export type PlatformCrmMessage = Tables<'platform_crm_messages'>;
export type PlatformCrmMessageInsert = TablesInsert<'platform_crm_messages'>;
export type PlatformCrmConversationInsert = TablesInsert<'platform_crm_conversations'>;

/** Aba ativa da lista — espelha o SellerInbox (Atendendo / Agentes / Em Fila / Resolvidos). */
export type PlatformCrmStatusTab = 'attending' | 'agents' | 'waiting' | 'resolved';

/** Contadores totais por aba, calculados sobre a lista completa da inbox. */
export interface PlatformCrmTabCounts {
  attending: number;
  agents: number;
  waiting: number;
  resolved: number;
}

/**
 * Conversa enriquecida para a lista: além da linha crua de
 * `platform_crm_conversations`, carrega o preview da última mensagem
 * (`last_message` + `last_message_metadata`) — derivado por query, já que a
 * tabela de conversas do platform CRM NÃO tem essas colunas materializadas
 * (ao contrário do webchat_conversations do tenant).
 */
export interface PlatformCrmConversationRow extends PlatformCrmConversation {
  last_message: string | null;
  last_message_metadata: any | null;
  last_message_sender_type: string | null;
}

const PLATFORM_CRM_KEY = 'platform-crm';

/** Mapeia a aba da UI para o(s) status do enum `platform_crm_conversation_status`. */
function statusesForTab(tab: PlatformCrmStatusTab): PlatformCrmConversation['status'][] {
  switch (tab) {
    case 'attending':
      return ['human_active'];
    case 'agents':
      return ['bot_active'];
    case 'waiting':
      return ['waiting_human'];
    case 'resolved':
      return ['closed'];
    default:
      return ['human_active'];
  }
}

/**
 * Lista de conversas da inbox de plataforma, enriquecidas com o preview da última
 * mensagem e ordenadas pela última atividade (mais recentes primeiro). Assina
 * `postgres_changes` em `platform_crm_conversations` para manter a lista viva.
 *
 * A filtragem por aba/status é feita client-side (o backend do platform CRM não
 * tem RPC de contagem/paginação como o webchat), mantendo os contadores por aba
 * sempre consistentes com a lista completa.
 */
export function usePlatformCrmConversations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'],
    queryFn: async (): Promise<PlatformCrmConversationRow[]> => {
      const { data, error } = await supabase
        .from('platform_crm_conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      const rows = (data ?? []) as PlatformCrmConversation[];
      if (rows.length === 0) return [];

      // Deriva o preview da última mensagem de cada conversa (a tabela de
      // conversas não materializa `last_message`). Uma única query traz a
      // última mensagem por conversa via ordenação + Map por conversation_id.
      const ids = rows.map((r) => r.id);
      const { data: msgs } = await supabase
        .from('platform_crm_messages')
        .select('conversation_id, content, metadata, sender_type, created_at, is_deleted')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false });

      const lastByConv = new Map<string, any>();
      for (const m of msgs ?? []) {
        if (!lastByConv.has(m.conversation_id)) {
          lastByConv.set(m.conversation_id, m);
        }
      }

      return rows.map((r) => {
        const last = lastByConv.get(r.id);
        return {
          ...r,
          last_message: last?.is_deleted ? 'Mensagem apagada' : (last?.content ?? null),
          last_message_metadata: last?.metadata ?? null,
          last_message_sender_type: last?.sender_type ?? null,
        } as PlatformCrmConversationRow;
      });
    },
  });

  // Realtime da LISTA: a própria tabela de conversas é atualizada a cada mensagem
  // (last_message_at, unread_count_agents, status). postgres_changes aqui é seguro
  // — atualiza apenas a lista de cards, não o histórico de mensagens.
  useEffect(() => {
    const channel = supabase
      .channel('platform-crm-inbox-conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'platform_crm_conversations',
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

/**
 * Contadores totais por aba (Atendendo / Agentes / Em Fila / Resolvidos),
 * derivados da lista completa carregada por `usePlatformCrmConversations`.
 * Espelha `useWebChatConversationCounts` do CRM Vendus.
 */
export function usePlatformCrmConversationCounts(
  conversations: PlatformCrmConversationRow[] | undefined,
): PlatformCrmTabCounts {
  return useMemo(() => {
    const list = conversations ?? [];
    return {
      attending: list.filter((c) => c.status === 'human_active').length,
      agents: list.filter((c) => c.status === 'bot_active').length,
      waiting: list.filter((c) => c.status === 'waiting_human').length,
      resolved: list.filter((c) => c.status === 'closed').length,
    };
  }, [conversations]);
}

/** Filtra a lista completa pela aba ativa (client-side). */
export function filterConversationsByTab(
  conversations: PlatformCrmConversationRow[] | undefined,
  tab: PlatformCrmStatusTab,
): PlatformCrmConversationRow[] {
  const list = conversations ?? [];
  const allowed = new Set(statusesForTab(tab));
  return list.filter((c) => allowed.has(c.status));
}

/**
 * Mensagens de UMA conversa, ordenadas por created_at (mais antigas primeiro).
 *
 * 🔒 REALTIME por BROADCAST, nunca postgres_changes em `platform_crm_messages`.
 * Assinar postgres_changes na tabela de mensagens DUPLICA visualmente cada bolha
 * (o insert client-side já popula o cache + o edge reenviaria o mesmo insert).
 * Em vez disso, escutamos o canal broadcast `platform-conversation:{id}` no
 * evento `new_message` — o edge de envio emitirá esse broadcast (uma vez por
 * mensagem) quando existir. Enquanto o edge não existe, o insert client-side de
 * `useSendPlatformCrmMessage` mantém o cache atualizado sozinho.
 */
export function usePlatformCrmMessages(conversationId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'inbox', 'messages', conversationId ?? null],
    enabled: !!conversationId,
    queryFn: async (): Promise<PlatformCrmMessage[]> => {
      const { data, error } = await supabase
        .from('platform_crm_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PlatformCrmMessage[];
    },
  });

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`platform-conversation:${conversationId}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const incoming = (payload as any)?.payload as PlatformCrmMessage | undefined;
        if (!incoming?.id) return;

        queryClient.setQueryData<PlatformCrmMessage[]>(
          [PLATFORM_CRM_KEY, 'inbox', 'messages', conversationId],
          (old) => {
            const msgs = old ?? [];
            // Já existe pelo ID real → ignora (evita duplicação com o insert client-side).
            if (msgs.some((m) => m.id === incoming.id)) return msgs;
            return [...msgs, incoming];
          },
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return query;
}

/**
 * Grava uma resposta do agente (outbound) em `platform_crm_messages`.
 * direction='outbound', sender_type='agent'.
 *
 * ⚠️ Client-side apenas: NÃO entrega por canal. A entrega real + broadcast virão
 * da Edge Function de envio (fase webchat/widget). Aqui só persistimos a mensagem
 * e atualizamos o cache local otimisticamente via injeção no cache + invalidação
 * da lista.
 */
export function useSendPlatformCrmMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      replyToMessageId,
    }: {
      conversationId: string;
      content: string;
      replyToMessageId?: string | null;
    }) => {
      const payload: PlatformCrmMessageInsert = {
        conversation_id: conversationId,
        content,
        direction: 'outbound',
        sender_type: 'agent',
        reply_to_message_id: replyToMessageId ?? null,
      };

      const { data, error } = await supabase
        .from('platform_crm_messages')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as PlatformCrmMessage;
    },
    onSuccess: (message) => {
      // Injeta a mensagem no cache local imediatamente (o broadcast do edge,
      // quando existir, será deduplicado por ID em usePlatformCrmMessages).
      queryClient.setQueryData<PlatformCrmMessage[]>(
        [PLATFORM_CRM_KEY, 'inbox', 'messages', message.conversation_id],
        (old) => {
          const msgs = old ?? [];
          if (msgs.some((m) => m.id === message.id)) return msgs;
          return [...msgs, message];
        },
      );
      // Atualiza a lista (last_message_at muda no servidor).
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'],
      });
    },
    onError: (error: any) => {
      console.error('Error sending platform CRM message:', error);
      toast.error('Erro ao enviar mensagem');
    },
  });
}

/**
 * Ações de ciclo de vida da conversa — todas client-side (UPDATE direto na linha
 * de `platform_crm_conversations`). Espelham as ações do CRM Vendus (accept, close,
 * reopen, returnToQueue), sem sector_id / edge de aceite.
 */

/** Marca a conversa como aceita pelo agente atual (status → human_active). */
export function useAcceptPlatformCrmConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const { error } = await supabase
        .from('platform_crm_conversations')
        .update({
          status: 'human_active',
          assigned_to: uid,
          accepted_by: uid,
          accepted_at: new Date().toISOString(),
          needs_human: false,
        } as Partial<PlatformCrmConversation>)
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
    },
    onError: () => toast.error('Erro ao aceitar atendimento'),
  });
}

/** Encerra a conversa (status → closed). O motivo/desfecho fica no client por ora. */
export function useClosePlatformCrmConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      closingOutcome,
      closingReason,
    }: {
      conversationId: string;
      closingOutcome?: string;
      closingReason?: string;
    }) => {
      const { error } = await supabase
        .from('platform_crm_conversations')
        .update({
          status: 'closed',
          // TODO(edge): registrar closing_outcome/closing_reason como nota interna
          // (mensagem system) quando o edge de encerramento existir.
        } as Partial<PlatformCrmConversation>)
        .eq('id', conversationId);
      if (error) throw error;
      void closingOutcome;
      void closingReason;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
    },
    onError: () => toast.error('Erro ao encerrar conversa'),
  });
}

/** Reabre uma conversa encerrada (status → human_active). */
export function useReopenPlatformCrmConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('platform_crm_conversations')
        .update({ status: 'human_active' } as Partial<PlatformCrmConversation>)
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
    },
    onError: () => toast.error('Erro ao reabrir conversa'),
  });
}

/** Devolve a conversa à fila humana (status → waiting_human, desatribui agente). */
export function useReturnPlatformCrmConversationToQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('platform_crm_conversations')
        .update({
          status: 'waiting_human',
          assigned_to: null,
          needs_human: true,
        } as Partial<PlatformCrmConversation>)
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
    },
    onError: () => toast.error('Erro ao devolver à fila'),
  });
}

/**
 * Cria uma nova conversa na inbox de plataforma (client-side). Usado pelo botão
 * "+" / "Nova conversa". Gera um visitor_id sintético quando não há canal externo.
 *
 * ⚠️ A entrega da primeira mensagem por WhatsApp/canal NÃO acontece aqui (depende
 * do edge `start-conversation` da fase futura). Aqui só criamos a linha da conversa
 * (e, opcionalmente, a primeira mensagem outbound registrada localmente).
 */
export function useCreatePlatformCrmConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      visitorName,
      visitorPhone,
      firstMessage,
    }: {
      visitorName?: string | null;
      visitorPhone?: string | null;
      firstMessage?: string | null;
    }) => {
      const visitorId =
        (visitorPhone && visitorPhone.replace(/\D/g, '')) ||
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `visitor-${Date.now()}`);

      const payload: PlatformCrmConversationInsert = {
        visitor_id: visitorId,
        visitor_name: visitorName ?? null,
        visitor_phone: visitorPhone ?? null,
        channel: 'webchat',
        status: 'human_active',
      };

      const { data, error } = await supabase
        .from('platform_crm_conversations')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      const conv = data as PlatformCrmConversation;

      if (firstMessage && firstMessage.trim()) {
        await supabase.from('platform_crm_messages').insert({
          conversation_id: conv.id,
          content: firstMessage.trim(),
          direction: 'outbound',
          sender_type: 'agent',
        } as PlatformCrmMessageInsert);
      }

      return conv;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
    },
    onError: () => toast.error('Erro ao criar conversa'),
  });
}

/**
 * Ações POR MENSAGEM — paridade 1:1 com o SellerInbox (useDeleteMessage /
 * useStarMessage / useEditMessage do CRM Vendus). Todas UPDATE client-side puro em
 * `platform_crm_messages`, sem edge/tenant/canal. As colunas `is_deleted`/`is_starred`
 * já existem no schema; `content` é editável direto.
 */

/** Apaga (soft-delete) uma mensagem — is_deleted=true. */
export function useDeletePlatformCrmMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      conversationId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      const { error } = await supabase
        .from('platform_crm_messages')
        .update({ is_deleted: true } as Partial<PlatformCrmMessage>)
        .eq('id', messageId);
      if (error) throw error;
      void conversationId;
    },
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'inbox', 'messages', conversationId],
      });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
    },
    onError: () => toast.error('Erro ao apagar mensagem'),
  });
}

/** Favorita/desfavorita uma mensagem — toggle is_starred (valor atual vem do chamador). */
export function useStarPlatformCrmMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      conversationId,
      isStarred,
    }: {
      messageId: string;
      conversationId: string;
      isStarred: boolean;
    }) => {
      const { error } = await supabase
        .from('platform_crm_messages')
        .update({ is_starred: !isStarred } as Partial<PlatformCrmMessage>)
        .eq('id', messageId);
      if (error) throw error;
      void conversationId;
    },
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'inbox', 'messages', conversationId],
      });
    },
    onError: () => toast.error('Erro ao favoritar mensagem'),
  });
}

/** Edita o conteúdo de uma mensagem própria do agente. */
export function useEditPlatformCrmMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      conversationId,
      newContent,
    }: {
      messageId: string;
      conversationId: string;
      newContent: string;
    }) => {
      const { error } = await supabase
        .from('platform_crm_messages')
        // TODO(1:1): quando a coluna `edited_at` for adicionada em platform_crm_messages,
        // setar edited_at=now() aqui e exibir "(editada)" na bolha (paridade total com o original).
        .update({ content: newContent } as Partial<PlatformCrmMessage>)
        .eq('id', messageId);
      if (error) throw error;
      void conversationId;
    },
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'inbox', 'messages', conversationId],
      });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
    },
    onError: () => toast.error('Erro ao editar mensagem'),
  });
}
