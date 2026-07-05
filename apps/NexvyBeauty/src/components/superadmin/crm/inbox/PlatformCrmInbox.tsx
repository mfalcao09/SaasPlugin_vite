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
import { usePlatformCrmInboxTabActivity } from '../data/usePlatformCrmInboxActivity';
import { usePlatformModule } from '@/components/superadmin/platform-shell/usePlatformModule';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PlatformCrmConversationList } from './PlatformCrmConversationList';
import { PlatformCrmChatArea } from './PlatformCrmChatArea';
import { PlatformCrmLeadContextPanel } from './PlatformCrmLeadContextPanel';
import { PlatformCrmTransferModal } from './PlatformCrmTransferModal';
import { PlatformCrmArchiveDialog, type PlatformCrmArchivePayload } from './PlatformCrmArchiveDialog';
import { PlatformCrmStartConversationDialog } from './PlatformCrmStartConversationDialog';
import { PlatformCrmAnalysisPanel } from './PlatformCrmAnalysisPanel';

/**
 * INBOX do CRM de PLATAFORMA (super_admin) — container de 3 painéis
 * (REF-VENDUS-INBOX): lista | chat | contexto do lead. Porte da UX de
 * `seller/SellerInbox.tsx` (CRM Vendus): abas (Atendendo/Agentes/Em Fila/
 * Resolvidas) + header da lista (filtro/busca/som/nova) + área de chat (bolhas +
 * composer + "Sugerir Resposta IA") + painel direito de contexto do lead
 * (w-80 colapsável ≥lg, Sheet no mobile) + dialogs (Transferir/Encerrar/Nova
 * conversa/Analisar).
 *
 * DESACOPLADO do tenant: toca APENAS `platform_crm_*`. Zero organization_id /
 * product_id / sector_id / evolution_instance_id. A RLS super_admin-only isola os
 * dados. Ações que dependem de edge/LLM inexistente permanecem com o BOTÃO presente
 * (stub-com-TODO + toast "em breve").
 */

/** Persistência do colapso do painel de contexto (U1b). '1' aberto / '0' fechado. */
const CONTEXT_PANEL_STORAGE_KEY = 'nexvybeauty_platform_crm_inbox_context_panel';

function loadPanelOpen(): boolean {
  try {
    return localStorage.getItem(CONTEXT_PANEL_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function savePanelOpen(open: boolean) {
  try {
    localStorage.setItem(CONTEXT_PANEL_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // localStorage indisponível — o estado só não persiste.
  }
}

export function PlatformCrmInbox() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlatformCrmStatusTab>('attending');

  // Painel de contexto do lead (U1): docked ≥lg (persistido) + Sheet no mobile.
  const [panelOpen, setPanelOpen] = useState<boolean>(loadPanelOpen);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Navegação p/ a tela de leads existente ("Abrir lead completo") — a inbox
  // vive dentro da PlatformShell (módulo vendas), seção 'v-leads' do registry.
  const { setActiveSection } = usePlatformModule();

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

  // U2 — novidade por aba (ponto pulsante) desde a última visualização.
  const tabActivity = usePlatformCrmInboxTabActivity(allConversations, activeTab);

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
   * Toggle do painel de contexto (U1c): em telas ≥lg alterna a coluna docked
   * (persistindo em localStorage); abaixo de lg abre o Sheet lateral.
   */
  const handleTogglePanel = () => {
    const isDesktop =
      typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      setPanelOpen((prev) => {
        const next = !prev;
        savePanelOpen(next);
        return next;
      });
    } else {
      setMobilePanelOpen(true);
    }
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    savePanelOpen(false);
  };

  /** "Abrir lead completo" → seção de Leads existente do módulo vendas. */
  const handleOpenLead = () => {
    setMobilePanelOpen(false);
    setActiveSection('v-leads');
  };

  /**
   * "Sugerir Resposta IA" — invoca o edge `platform-sales-copilot` com a conversa
   * selecionada e retorna `data.suggestion`. FALLBACK: se o invoke falhar (edge
   * ainda não deployado/offline), mantém o toast "em breve" e retorna '' (sem
   * quebrar a UX do composer).
   */
  const handleAiSuggest = async (): Promise<string> => {
    if (!selected) return '';
    try {
      const { data, error } = await supabase.functions.invoke('platform-sales-copilot', {
        body: { conversation_id: selected.id },
      });
      if (error) throw error;
      return (data as any)?.suggestion ?? '';
    } catch (edgeError) {
      console.warn('platform-sales-copilot indisponível:', edgeError);
      toast.info('Sugestão por IA disponível em breve', {
        description: 'O copiloto de respostas da plataforma ainda será conectado.',
      });
      return '';
    }
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
            tabActivity={tabActivity}
          />
        </div>

        {/* Painel central — chat */}
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
            onTogglePanel={handleTogglePanel}
            isPanelOpen={panelOpen}
            onAnalyze={() => setShowAnalysis(true)}
            isReopening={reopenConversation.isPending}
            isResuming={acceptConversation.isPending}
            isReturning={returnToQueue.isPending}
          />
        </div>

        {/* Painel direito — contexto do lead (U1b): docked ≥lg, colapsável. */}
        {panelOpen && (
          <div className="hidden lg:block w-80 flex-shrink-0 h-full border-l border-border">
            <PlatformCrmLeadContextPanel
              conversation={selected}
              mode="docked"
              onClose={handleClosePanel}
              onOpenLead={handleOpenLead}
            />
          </div>
        )}
      </div>

      {/* Contexto do lead no MOBILE (<lg) — Sheet lateral. */}
      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetContent side="right" className="w-[340px] sm:max-w-sm p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Contexto do lead</SheetTitle>
            <SheetDescription>Dados do lead vinculado à conversa selecionada</SheetDescription>
          </SheetHeader>
          <PlatformCrmLeadContextPanel
            conversation={selected}
            mode="sheet"
            onOpenLead={handleOpenLead}
          />
        </SheetContent>
      </Sheet>

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
