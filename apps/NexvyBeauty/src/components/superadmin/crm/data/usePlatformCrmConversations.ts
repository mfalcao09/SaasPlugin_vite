import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';

/**
 * INBOX do CRM de PLATAFORMA (super_admin) — conversas + mensagens do canal de
 * webchat/atendimento da própria plataforma. Desacoplado do tenant: toca APENAS
 * `platform_crm_conversations` e `platform_crm_messages`. Sem organization_id /
 * product_id — a RLS super_admin-only já isola os dados.
 *
 * ⚠️ ENTREGA POR CANAL (webchat/whatsapp): NÃO acontece aqui. `useSendPlatformCrmMessage`
 * apenas GRAVA a mensagem outbound no banco (client-side). A entrega real ao
 * visitante e o broadcast `new_message` no canal `platform-conversation:{id}`
 * virão da Edge Function de envio na fase do webchat/widget. Por ora, a resposta
 * do agente é persistida e o realtime da lista/conversa é montado para receber
 * esse broadcast quando o edge existir.
 */

export type PlatformCrmConversation = Tables<'platform_crm_conversations'>;
export type PlatformCrmMessage = Tables<'platform_crm_messages'>;
export type PlatformCrmMessageInsert = TablesInsert<'platform_crm_messages'>;

const PLATFORM_CRM_KEY = 'platform-crm';

/**
 * Lista de conversas da inbox de plataforma, ordenadas pela última mensagem
 * (mais recentes primeiro). Assina `postgres_changes` em
 * `platform_crm_conversations` para manter a lista viva.
 */
export function usePlatformCrmConversations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'],
    queryFn: async (): Promise<PlatformCrmConversation[]> => {
      const { data, error } = await supabase
        .from('platform_crm_conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as PlatformCrmConversation[];
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
    }: {
      conversationId: string;
      content: string;
    }) => {
      const payload: PlatformCrmMessageInsert = {
        conversation_id: conversationId,
        content,
        direction: 'outbound',
        sender_type: 'agent',
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
