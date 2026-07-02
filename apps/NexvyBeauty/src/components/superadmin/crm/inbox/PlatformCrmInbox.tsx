import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  usePlatformCrmConversations,
  usePlatformCrmConversationCounts,
  filterConversationsByTab,
  usePlatformCrmMessages,
  useSendPlatformCrmMessage,
  useAcceptPlatformCrmConversation,
  useClosePlatformCrmConversation,
  useReopenPlatformCrmConversation,
  useReturnPlatformCrmConversationToQueue,
  useDeletePlatformCrmMessage,
  useStarPlatformCrmMessage,
  useEditPlatformCrmMessage,
  type PlatformCrmConversationRow,
  type PlatformCrmStatusTab,
} from '../data/usePlatformCrmConversations';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { PlatformCrmConversationList } from './PlatformCrmConversationList';
import { PlatformCrmChatArea } from './PlatformCrmChatArea';
import { PlatformCrmTransferModal } from './PlatformCrmTransferModal';
import { PlatformCrmArchiveDialog, type PlatformCrmArchivePayload } from './PlatformCrmArchiveDialog';
import { PlatformCrmStartConversationDialog } from './PlatformCrmStartConversationDialog';
import { PlatformCrmAnalysisPanel } from './PlatformCrmAnalysisPanel';

/**
 * INBOX do CRM de PLATAFORMA (super_admin) — container de 2 painéis.
 * PORTE 1:1 da UX de `seller/SellerInbox.tsx` (CRM Vendus): abas (Atendendo/Agentes/
 * Em Fila) + header da lista (filtro/busca/som/nova) + área de chat (bolhas +
 * composer + "Sugerir Resposta IA") + empty-state (3 cards) + dialogs
 * (Transferir/Encerrar/Nova conversa/Analisar).
 *
 * DESACOPLADO do tenant: toca APENAS `platform_crm_*`. Zero organization_id /
 * product_id / sector_id / evolution_instance_id. A RLS super_admin-only isola os
 * dados. Ações que dependem de edge/LLM inexistente permanecem com o BOTÃO presente
 * (stub-com-TODO + toast "em breve").
 */
export function PlatformCrmInbox() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlatformCrmStatusTab>('attending');

  // Dialogs
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [showStartConversation, setShowStartConversation] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

  // Som de notificação (enable/disable + testar) — hook real do app.
  const { isEnabled: soundEnabled, toggleSound, playNotification } = useNotificationSound();

  // Dados
  const { data: allConversations = [], isLoading: loadingConversations } =
    usePlatformCrmConversations();
  const tabCounts = usePlatformCrmConversationCounts(allConversations);

  // Lista filtrada pela aba ativa (client-side).
  const visibleConversations = useMemo(
    () => filterConversationsByTab(allConversations, activeTab),
    [allConversations, activeTab],
  );

  // Conversa selecionada — sempre com a versão mais fresca da lista completa.
  const selected: PlatformCrmConversationRow | null = useMemo(
    () => (selectedId ? allConversations.find((c) => c.id === selectedId) ?? null : null),
    [allConversations, selectedId],
  );

  const { data: messages = [], isLoading: loadingMessages } = usePlatformCrmMessages(
    selected?.id ?? null,
  );

  // Mutations
  const sendMessage = useSendPlatformCrmMessage();
  const acceptConversation = useAcceptPlatformCrmConversation();
  const closeConversation = useClosePlatformCrmConversation();
  const reopenConversation = useReopenPlatformCrmConversation();
  const returnToQueue = useReturnPlatformCrmConversationToQueue();
  const deleteMessage = useDeletePlatformCrmMessage();
  const starMessage = useStarPlatformCrmMessage();
  const editMessage = useEditPlatformCrmMessage();

  // Atalho Ctrl+K → foca a busca da lista (paridade com o SellerInbox).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[data-inbox-search]');
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Usuário logado — necessário para habilitar "Editar" nas próprias mensagens do agente (isOwnMessage).
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  const handleSend = (content: string, replyToMessageId?: string) => {
    if (!selected) return;
    sendMessage.mutate({ conversationId: selected.id, content, replyToMessageId });
  };

  /**
   * "Sugerir Resposta IA" — STUB-COM-TODO.
   * O botão está SEMPRE presente na ChatArea. A geração real depende do edge de LLM
   * da plataforma (ex.: `platform-sales-copilot`), que ainda NÃO existe.
   * TODO(edge): invocar o edge de sugestão passando o histórico de
   *   `platform_crm_messages` da conversa selecionada.
   */
  const handleAiSuggest = async (): Promise<string> => {
    toast.info('Sugestão por IA disponível em breve', {
      description: 'O copiloto de respostas da plataforma ainda será conectado.',
    });
    return '';
  };

  const handleConfirmArchive = async (payload: PlatformCrmArchivePayload) => {
    if (!selected) return;
    await closeConversation.mutateAsync({
      conversationId: selected.id,
      closingOutcome: payload.closing_outcome,
      closingReason: payload.closing_reason,
    });
    setArchiveDialogOpen(false);
    setSelectedId(null);
    toast.success(
      payload.closing_outcome === 'won'
        ? 'Negócio marcado como Ganho 🎉'
        : payload.closing_outcome === 'lost'
        ? 'Negócio marcado como Perdido'
        : 'Conversa encerrada',
    );
  };

  const handleReopen = async () => {
    if (!selected) return;
    await reopenConversation.mutateAsync(selected.id);
    toast.success('Conversa reaberta');
  };

  const handleResume = async () => {
    if (!selected) return;
    // "Retomar" o atendimento humano = aceitar/assumir a conversa.
    await acceptConversation.mutateAsync(selected.id);
    toast.success('Atendimento retomado');
  };

  const handleReturnToQueue = async () => {
    if (!selected) return;
    await returnToQueue.mutateAsync(selected.id);
    setSelectedId(null);
    toast.success('Devolvida à fila');
  };

  // Ações por mensagem (paridade 1:1 com o SellerInbox) — UPDATE client-side em platform_crm_messages.
  const handleDeleteMessage = (messageId: string) => {
    if (!selected) return;
    deleteMessage.mutate({ messageId, conversationId: selected.id });
  };

  const handleStarMessage = (messageId: string) => {
    if (!selected) return;
    const msg = messages.find((m) => m.id === messageId);
    starMessage.mutate({ messageId, conversationId: selected.id, isStarred: !!msg?.is_starred });
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    if (!selected) return;
    editMessage.mutate({ messageId, conversationId: selected.id, newContent });
  };

  return (
    <div className="h-[calc(100dvh-10rem)] flex flex-col rounded-lg border border-border overflow-hidden bg-background">
      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Painel esquerdo — lista com abas + toolbar */}
        <div className="w-[340px] flex-shrink-0 h-full">
          <PlatformCrmConversationList
            conversations={visibleConversations}
            selectedId={selected?.id ?? null}
            onSelect={(c) => setSelectedId(c.id)}
            isLoading={loadingConversations}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabCounts={tabCounts}
            isLoadingCounts={loadingConversations}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            onTestSound={playNotification}
            onNewConversation={() => setShowStartConversation(true)}
            onOpenFilters={() =>
              toast.info('Filtros avançados em breve', {
                description: 'Refino por canal/etiqueta será habilitado em breve.',
              })
            }
          />
        </div>

        {/* Painel direito — chat */}
        <div className="flex-1 min-w-0 h-full">
          <PlatformCrmChatArea
            conversation={selected}
            messages={messages}
            isLoading={!!selected && loadingMessages}
            isSending={sendMessage.isPending}
            currentUserId={currentUserId}
            onSendMessage={handleSend}
            onAiSuggest={handleAiSuggest}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onStarMessage={handleStarMessage}
            onClose={() => selected && setArchiveDialogOpen(true)}
            onReopen={handleReopen}
            onResume={handleResume}
            onReturnToQueue={handleReturnToQueue}
            onTransfer={() => setShowTransferModal(true)}
            onTogglePanel={() =>
              toast.info('Dados do contato em breve', {
                description: 'O painel de contexto do visitante será habilitado em breve.',
              })
            }
            onAnalyze={() => setShowAnalysis(true)}
            isReopening={reopenConversation.isPending}
            isResuming={acceptConversation.isPending}
            isReturning={returnToQueue.isPending}
          />
        </div>
      </div>

      {/* Dialogs */}
      {selected && (
        <PlatformCrmTransferModal
          open={showTransferModal}
          onOpenChange={setShowTransferModal}
          conversationId={selected.id}
          onTransfer={() => setShowTransferModal(false)}
        />
      )}

      <PlatformCrmArchiveDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onConfirm={handleConfirmArchive}
        loading={closeConversation.isPending}
        conversationName={selected?.visitor_name || undefined}
      />

      <PlatformCrmStartConversationDialog
        open={showStartConversation}
        onOpenChange={setShowStartConversation}
        onConversationCreated={(convId) => {
          setSelectedId(convId);
          setActiveTab('attending');
        }}
      />

      {selected && (
        <PlatformCrmAnalysisPanel
          open={showAnalysis}
          onOpenChange={setShowAnalysis}
          conversationId={selected.id}
        />
      )}
    </div>
  );
}

export default PlatformCrmInbox;
