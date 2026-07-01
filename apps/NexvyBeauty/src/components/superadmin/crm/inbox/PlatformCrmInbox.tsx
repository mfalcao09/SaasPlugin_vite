import { useState } from 'react';
import {
  usePlatformCrmConversations,
  usePlatformCrmMessages,
  useSendPlatformCrmMessage,
  type PlatformCrmConversation,
} from '../data/usePlatformCrmConversations';
import { PlatformCrmConversationList } from './PlatformCrmConversationList';
import { PlatformCrmChatArea } from './PlatformCrmChatArea';

/**
 * INBOX do CRM de PLATAFORMA (super_admin) — raiz de 2 painéis.
 * Esquerda: lista de conversas (`platform_crm_conversations`).
 * Direita: histórico + composer (`platform_crm_messages`).
 *
 * Portado da UX do CRM Vendus (`seller/SellerInbox.tsx`) e DESACOPLADO do tenant:
 * zero organization_id / product_id, zero import de cockpit/useWebChat/SellerInbox.
 * A RLS super_admin-only isola os dados. Toca APENAS `platform_crm_*`.
 */
export function PlatformCrmInbox() {
  const [selected, setSelected] = useState<PlatformCrmConversation | null>(null);

  const { data: conversations = [], isLoading: loadingConversations } =
    usePlatformCrmConversations();
  const { data: messages = [], isLoading: loadingMessages } = usePlatformCrmMessages(
    selected?.id ?? null,
  );
  const sendMessage = useSendPlatformCrmMessage();

  // Mantém a conversa selecionada sincronizada com a versão mais fresca da lista
  // (status/unread/last_message_at mudam via realtime), sem perder a seleção.
  const selectedFresh = selected
    ? conversations.find((c) => c.id === selected.id) ?? selected
    : null;

  const handleSend = (content: string) => {
    if (!selectedFresh) return;
    sendMessage.mutate({ conversationId: selectedFresh.id, content });
  };

  return (
    <div className="h-[calc(100dvh-10rem)] flex rounded-lg border border-border overflow-hidden bg-background">
      {/* Painel esquerdo — lista */}
      <div className="w-[340px] flex-shrink-0 h-full">
        <PlatformCrmConversationList
          conversations={conversations}
          selectedId={selectedFresh?.id ?? null}
          onSelect={setSelected}
          isLoading={loadingConversations}
        />
      </div>

      {/* Painel direito — chat */}
      <div className="flex-1 min-w-0 h-full">
        <PlatformCrmChatArea
          conversation={selectedFresh}
          messages={messages}
          isLoading={!!selectedFresh && loadingMessages}
          isSending={sendMessage.isPending}
          onSendMessage={handleSend}
        />
      </div>
    </div>
  );
}

export default PlatformCrmInbox;
