import { useEffect, useId, useMemo } from 'react';
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

/**
 * Extrai status HTTP + body JSON de um FunctionsHttpError do supabase-js
 * (o `error.context` é a Response crua do edge). Retorna nulls quando não
 * há contexto legível (erro de rede, edge inexistente etc.).
 */
export async function parsePlatformCrmFnError(
  error: any,
): Promise<{ status: number | null; body: any | null }> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const status = typeof ctx.status === 'number' ? ctx.status : null;
      let body: any = null;
      try {
        body = await ctx.json();
      } catch {
        body = null;
      }
      return { status, body };
    }
  } catch {
    /* ignore */
  }
  return { status: null, body: null };
}

/**
 * Erro tipado do aceite com setor — contrato A1.2: o edge devolve
 * 403 `{ error, sector_name }` quando o usuário não é membro do setor.
 */
export class PlatformCrmSectorForbiddenError extends Error {
  sectorName: string | null;
  constructor(message: string, sectorName: string | null) {
    super(message);
    this.name = 'PlatformCrmSectorForbiddenError';
    this.sectorName = sectorName;
  }
}

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
export function usePlatformCrmConversations(productId?: string | null) {
  const queryClient = useQueryClient();
  // Canal Realtime ÚNICO por instância do hook — evita o crash "cannot add
  // postgres_changes callbacks after subscribe()" quando >1 consumidor monta o
  // hook (ex.: a lista do inbox + o ForwardMessageDialog do composer A1).
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '');

  const query = useQuery({
    // productId no key: trocar o produto ativo GLOBAL (D3 F2) re-consulta a lista.
    queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations', productId ?? null],
    queryFn: async (): Promise<PlatformCrmConversationRow[]> => {
      // Produto ativo GLOBAL (D3 F2): filtra as conversas pelo produto ativo, mas
      // SEMPRE inclui as ainda sem produto (product_id null = não classificadas),
      // para que nenhuma conversa suma da caixa ao trocar de produto.
      let convQuery = supabase
        .from('platform_crm_conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (productId) {
        convQuery = convQuery.or(`product_id.eq.${productId},product_id.is.null`);
      }
      const { data, error } = await convQuery;

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
      .channel(`platform-crm-inbox-conversations-${instanceId}`)
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
  }, [queryClient, instanceId]);

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
 * Payload de mídia do CONTRATO A1.2 (front ⇄ edge `platform-webchat-inbox`).
 * O front sobe o arquivo pro bucket `platform-crm-media`
 * (path `conv/<conversationId>/<epoch>-<slug>`) e repassa a referência no body
 * da action `send`; o edge persiste em `platform_crm_messages.metadata.media`
 * e entrega ao canal.
 */
export interface PlatformCrmSendMediaPayload {
  bucket: 'platform-crm-media';
  path: string;
  mimeType: string;
  kind: 'image' | 'audio' | 'video' | 'document';
  filename?: string;
  caption?: string;
  /** Extras opcionais para render local imediato (o edge pode recalcular). */
  url?: string;
  size_bytes?: number | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Produto do catálogo Meta para envio como CARD NATIVO (ONDA cards-nativos).
 * `retailer_id` = `plan-<slug>` sincronizado via platform-commerce-sync.
 * O edge tenta o interactive product message (WhatsApp) / generic template (IG)
 * e cai no texto+link (o `content` da mensagem) se o card for recusado.
 */
export interface PlatformCrmSendProductPayload {
  retailer_id: string;
  title?: string | null;
  price_label?: string | null;
  image_url?: string | null;
  checkout_url?: string | null;
}

/**
 * Grava uma resposta do agente (outbound) em `platform_crm_messages`.
 * direction='outbound', sender_type='agent'. Aceita `media` (contrato A1.2).
 *
 * Caminho canônico: Edge Function `platform-webchat-inbox` (action `send`)
 * — persiste, entrega ao canal e emite o broadcast `new_message`. FALLBACK: se o
 * invoke falhar (edge ainda não deployado/offline), cai no insert client-side
 * (persiste sem entrega por canal, sem quebrar a UX; a mídia vai em
 * `metadata.media` no formato que o MessageBubble/extractMedia renderiza).
 * Nos dois caminhos o cache local é atualizado via injeção + invalidação da lista.
 */
export function useSendPlatformCrmMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      replyToMessageId,
      media,
      product,
    }: {
      conversationId: string;
      content: string;
      replyToMessageId?: string | null;
      media?: PlatformCrmSendMediaPayload;
      product?: PlatformCrmSendProductPayload;
    }) => {
      // 1) Caminho canônico — edge de envio (entrega por canal + broadcast).
      try {
        const { data, error } = await supabase.functions.invoke('platform-webchat-inbox', {
          body: {
            action: 'send',
            conversation_id: conversationId,
            content,
            reply_to_message_id: replyToMessageId ?? null,
            media: media ?? null,
            product: product ?? null,
          },
        });
        if (error) throw error;
        const message = ((data as any)?.message ?? data) as PlatformCrmMessage | null;
        if (message?.id) return message;
        throw new Error('platform-webchat-inbox: resposta sem mensagem');
      } catch (edgeError) {
        console.warn(
          'platform-webchat-inbox indisponível — fallback insert client-side:',
          edgeError,
        );
      }

      // 2) FALLBACK client-side — persiste a mensagem sem entrega por canal.
      // Optimistic/persistência de mídia: `metadata.media` no shape consumido
      // por extractMedia/MediaAttachment (kind/url/mime/filename/...), como o
      // v5 renderiza.
      const payload: PlatformCrmMessageInsert = {
        conversation_id: conversationId,
        content,
        direction: 'outbound',
        sender_type: 'agent',
        reply_to_message_id: replyToMessageId ?? null,
        ...(media
          ? {
              content_type: media.kind,
              metadata: {
                media: {
                  kind: media.kind,
                  url:
                    media.url ??
                    supabase.storage.from(media.bucket).getPublicUrl(media.path).data.publicUrl,
                  mime: media.mimeType,
                  filename: media.filename ?? null,
                  caption: media.caption ?? null,
                  size_bytes: media.size_bytes ?? null,
                  duration_ms: media.duration_ms ?? null,
                  width: media.width ?? null,
                  height: media.height ?? null,
                  bucket: media.bucket,
                  path: media.path,
                },
              } as any,
            }
          : {}),
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

/**
 * Marca a conversa como aceita pelo agente atual (status → human_active).
 *
 * A1.2-FRONT (contrato 7): tenta a action `accept` do edge `platform-webchat-inbox`
 * com `sector_id?` no payload; o edge responde 403 `{ error, sector_name }` quando o
 * usuário não é membro do setor (→ `PlatformCrmSectorForbiddenError`). Se o edge
 * estiver indisponível (404/rede), FALLBACK para o UPDATE client-side anterior.
 * O `sector_id` também é persistido best-effort (idempotente pós-deploy do edge).
 */
export function useAcceptPlatformCrmConversation() {
  const queryClient = useQueryClient();

  const persistSectorBestEffort = async (conversationId: string, sectorId?: string | null) => {
    if (!sectorId) return;
    const { error: sectorErr } = await supabase
      .from('platform_crm_conversations')
      .update({ sector_id: sectorId } as any)
      .eq('id', conversationId);
    if (sectorErr) {
      console.warn('[useAcceptPlatformCrmConversation] Falha ao gravar sector_id:', sectorErr);
    }
  };

  return useMutation({
    mutationFn: async ({
      conversationId,
      sectorId,
      force,
    }: {
      conversationId: string;
      sectorId?: string | null;
      /** Takeover: admin assumindo conversa de outro atendente (paridade v5). */
      force?: boolean;
    }) => {
      // 1) Caminho canônico: action `accept` (contrato 7 — payload ganha sector_id?
      //    e force? para o takeover explícito).
      const { error: fnError } = await supabase.functions.invoke('platform-webchat-inbox', {
        body: {
          action: 'accept',
          conversation_id: conversationId,
          ...(sectorId ? { sector_id: sectorId } : {}),
          ...(force ? { force: true } : {}),
        },
      });

      if (!fnError) {
        await persistSectorBestEffort(conversationId, sectorId);
        return;
      }

      const { status, body } = await parsePlatformCrmFnError(fnError);
      if (status === 403) {
        const sectorName = body?.sector_name ?? null;
        throw new PlatformCrmSectorForbiddenError(
          sectorName
            ? `Você não faz parte do setor "${sectorName}" — escolha outro setor ou peça acesso.`
            : body?.error || 'Você não tem acesso ao setor escolhido.',
          sectorName,
        );
      }

      // 2) Fallback: UPDATE client-side (comportamento anterior ao contrato).
      console.warn('[useAcceptPlatformCrmConversation] action accept indisponível — fallback update:', fnError);
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
      await persistSectorBestEffort(conversationId, sectorId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
    },
    onError: (error: any) =>
      toast.error(
        error instanceof PlatformCrmSectorForbiddenError
          ? error.message
          : 'Erro ao aceitar atendimento',
      ),
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
        .update({
          content: newContent,
          // Coluna criada em 20260702_platform_crm_inbox_motor.sql — habilita
          // o "(editada)" na bolha (paridade total com o original).
          edited_at: new Date().toISOString(), // TODO(types): regen
        } as any)
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

/**
 * REVIVAL onda 6 — ações que HOJE têm infra (Cloud API sender, produtos D3,
 * sales-brain). Todas via Edge `platform-webchat-inbox` (persiste, entrega,
 * broadcast). O realtime de `usePlatformCrmMessages` deduplica por id, então
 * invalidamos apenas para garantir consistência quando o edge não fizer broadcast.
 */

/**
 * Reenvia uma mensagem outbound que falhou (`metadata.delivery_status='failed'`).
 * Idempotente no servidor: o edge recusa (409) se a mensagem não estiver failed.
 */
export function useResendPlatformCrmMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      conversationId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('platform-webchat-inbox', {
        body: { action: 'resend', message_id: messageId },
      });
      if (error) throw error;
      void conversationId;
      return data as { message?: PlatformCrmMessage; delivery_warning?: string } | null;
    },
    onSuccess: (data, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'inbox', 'messages', conversationId],
      });
      if (data?.delivery_warning) {
        toast.warning('Reenvio ainda não entregue', { description: data.delivery_warning });
      } else {
        toast.success('Mensagem reenviada');
      }
    },
    onError: (error: any) => {
      console.error('Error resending platform CRM message:', error);
      toast.error('Erro ao reenviar mensagem');
    },
  });
}

/**
 * Vincula (ou limpa, com productId=null) o produto da conversa. O sales-brain usa
 * `platform_crm_conversations.product_id` para escolher a persona/playbook da IA.
 */
export function useSetPlatformCrmConversationProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      productId,
    }: {
      conversationId: string;
      productId: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('platform-webchat-inbox', {
        body: { action: 'set-product', conversation_id: conversationId, product_id: productId },
      });
      if (error) throw error;
      return data as { product_id: string | null } | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
      toast.success('Produto da conversa atualizado');
    },
    onError: (error: any) => {
      console.error('Error setting platform CRM conversation product:', error);
      toast.error('Erro ao vincular produto');
    },
  });
}

/**
 * Devolve a conversa à IA (Duda): status→bot_active, limpa o atendente e acorda o
 * sales-brain. É o lado "devolver pra IA" do toggle assumir/devolver.
 */
export function useActivatePlatformCrmBot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('platform-webchat-inbox', {
        body: { action: 'activate-bot', conversation_id: conversationId },
      });
      if (error) throw error;
      return data as { status?: string } | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'inbox', 'conversations'] });
      toast.success('Atendimento devolvido à IA');
    },
    onError: (error: any) => {
      console.error('Error activating platform CRM bot:', error);
      toast.error('Erro ao devolver para a IA');
    },
  });
}

/** Campos opcionais do reengajamento por IA — contrato 6 (`ai-reactivate` estendido). */
export interface PlatformCrmAiReactivateOptions {
  agentId?: string;
  objective?: string;
  mode?: 'direct' | 'conversational';
  extraContext?: string;
}

/**
 * Reengajamento contextual pela IA SEM trocar de dono — acorda o sales-brain para
 * gerar/entregar uma mensagem de reativação. Útil quando a IA já atende e o agente
 * quer forçar um novo toque.
 *
 * A1.2-FRONT (contrato 6): a action `ai-reactivate` aceita os campos opcionais
 * `{ agent_id?, objective?, mode?, extra_context? }` — preenchidos pelo
 * PlatformCrmCallWithAIDialog (agente/objetivo/modo/contexto).
 */
export function useAiReactivatePlatformCrmConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      agentId,
      objective,
      mode,
      extraContext,
    }: { conversationId: string } & PlatformCrmAiReactivateOptions) => {
      const { data, error } = await supabase.functions.invoke('platform-webchat-inbox', {
        body: {
          action: 'ai-reactivate',
          conversation_id: conversationId,
          ...(agentId ? { agent_id: agentId } : {}),
          ...(objective ? { objective } : {}),
          ...(mode ? { mode } : {}),
          ...(extraContext ? { extra_context: extraContext } : {}),
        },
      });
      if (error) throw error;
      return data as { triggered?: boolean } | null;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [PLATFORM_CRM_KEY, 'inbox', 'messages', variables.conversationId],
      });
      toast.success('IA acionada para reengajar');
    },
    onError: (error: any) => {
      console.error('Error reactivating platform CRM AI:', error);
      toast.error('Erro ao acionar a IA');
    },
  });
}
