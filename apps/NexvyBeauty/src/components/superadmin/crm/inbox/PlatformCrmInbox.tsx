import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  useResendPlatformCrmMessage,
  useSetPlatformCrmConversationProduct,
  useActivatePlatformCrmBot,
  useAiReactivatePlatformCrmConversation,
  type PlatformCrmConversationRow,
  type PlatformCrmStatusTab,
  type PlatformCrmSendMediaPayload,
} from '../data/usePlatformCrmConversations';
import { usePlatformCrmNotificationSound } from '../data/usePlatformCrmNotificationSound';
import { usePlatformCrmProducts } from '../data/usePlatformCrmProducts';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { usePlatformCrmAgentConfigs } from '../data/usePlatformCrmAgentConfigs';
import { usePlatformCrmSectors } from '../data/usePlatformCrmSectors';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';
import { resolveVisitorIdentity } from './platformCrmIdentity';
import { PlatformCrmConversationList, type Conversation } from './PlatformCrmConversationList';
import { PlatformCrmInboxMetricsHeader } from './PlatformCrmInboxMetricsHeader';
import { PlatformCrmChatArea, type Message } from './PlatformCrmChatArea';
import { PlatformCrmLeadContextPanel } from './PlatformCrmLeadContextPanel';
import { PlatformCrmTransferModal } from './PlatformCrmTransferModal';
import { PlatformCrmEditVisitorDialog } from './PlatformCrmEditVisitorDialog';
import { PlatformCrmLeadEditModal } from './PlatformCrmLeadEditModal';
import { PlatformCrmStartConversationDialog } from './PlatformCrmStartConversationDialog';
import { PlatformCrmSendFlowDialog } from './PlatformCrmSendFlowDialog';
import { PlatformCrmSendCadenceDialog } from './PlatformCrmSendCadenceDialog';
import { PlatformCrmScheduleMessageDialog } from './PlatformCrmScheduleMessageDialog';
import { PlatformCrmScheduleFollowupDialog } from './PlatformCrmScheduleFollowupDialog';
import { PlatformCrmAnalysisPanel } from './PlatformCrmAnalysisPanel';
import { PlatformCrmCatalogPickerDialog } from './PlatformCrmCatalogPickerDialog';
import { PlatformCrmPaymentLinkDialog } from './PlatformCrmPaymentLinkDialog';
import { PlatformCrmEventModal } from '../agenda/PlatformCrmEventModal';
import { PlatformCrmDealModal } from './PlatformCrmDealModal';
import { PlatformCrmAcceptTicketDialog } from './PlatformCrmAcceptTicketDialog';
import { PlatformCrmArchiveDialog, type PlatformCrmArchivePayload } from './PlatformCrmArchiveDialog';
import {
  PlatformCrmInboxFiltersDrawer,
  defaultPlatformCrmInboxFilters,
  applyPlatformCrmInboxFilters,
  countActivePlatformCrmInboxFilters,
  type PlatformCrmInboxFiltersState,
} from './PlatformCrmInboxFiltersDrawer';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Loader2, Filter } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * INBOX do CRM de PLATAFORMA (super_admin) — porte fiel A1.2 de
 * `seller/SellerInbox.tsx` (Vendus v5 ORIGINAL, base canônica): 3 painéis
 * redimensionáveis (lista | chat | contexto do lead), abas, sons por canal,
 * presença/typing, aceite/takeover, e TODOS os dialogs do v5 (Transferir,
 * Encerrar c/ desfecho, Nova conversa, Editar contato, Fluxo, Cadência,
 * Agendar mensagem, Tarefa, Análise, Evento, Oportunidade, Catálogo, Cobrar).
 *
 * Adaptações de dados (regra b/d): tudo em `platform_crm_*` (sem
 * organization_id/RLS de tenant — super_admin only); filtros/paginação do
 * backend do tenant viram filtro client-side (mesma UI). A1.4/FILTROS: o
 * drawer de filtros avançados do v5 foi portado (PlatformCrmInboxFiltersDrawer
 * — produto/etiqueta/setor/usuário/agente/canal/conexão/status) e é aplicado
 * client-side sobre a lista já carregada.
 */
interface PlatformCrmInboxProps {
  productId?: string;
  pendingConversationId?: string | null;
  onConversationSelected?: () => void;
  /** "admin" exibe TODAS as conversas (default na plataforma — super_admin). */
  mode?: 'seller' | 'admin';
  onConversationOpenChange?: (open: boolean) => void;
}

export function PlatformCrmInbox({
  productId,
  pendingConversationId,
  onConversationSelected,
  mode = 'admin',
  onConversationOpenChange,
}: PlatformCrmInboxProps) {
  const isAdminMode = mode === 'admin';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const soundControls = usePlatformCrmNotificationSound();
  const { playMessage, playQueue } = soundControls;
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  // Painel "Dados do Contato": no mobile sempre começa fechado; desktop aberto.
  const [showPanel, setShowPanel] = useState(false);
  useEffect(() => {
    setShowPanel(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    onConversationOpenChange?.(!!selectedConversation);
  }, [selectedConversation, onConversationOpenChange]);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [acceptDialog, setAcceptDialog] = useState<{ open: boolean; isTakeover: boolean; previousAssigneeName?: string | null }>({
    open: false,
    isTakeover: false,
    previousAssigneeName: null,
  });
  const [isTyping, setIsTyping] = useState(false);

  const [showEditContact, setShowEditContact] = useState(false);
  const [showSendFlow, setShowSendFlow] = useState(false);
  const [showSendCadence, setShowSendCadence] = useState(false);
  const [showScheduleMessage, setShowScheduleMessage] = useState(false);
  const [showScheduleFollowup, setShowScheduleFollowup] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showStartConversation, setShowStartConversation] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [activeTab, setActiveTab] = useState<PlatformCrmStatusTab>('attending');

  // A1.4/FILTROS: estado do drawer de filtros avançados (paridade SellerInbox v5).
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [filters, setFilters] = useState<PlatformCrmInboxFiltersState>(defaultPlatformCrmInboxFilters);

  // Produto ativo GLOBAL (D3 F2) — filtra a caixa pelo produto do switcher da
  // sidebar do painel (A1.3). Conversas sem produto seguem sempre visíveis (ver
  // hook). NÃO se confunde com o seletor POR-CONVERSA abaixo (esse vincula o
  // produto de UMA conversa à IA).
  const { activeProductId } = useActivePlatformProduct();

  // Dados — lista completa (realtime no hook, com o fix useId() preservado).
  const {
    data: allRows = [],
    isLoading: loadingConversations,
    isFetching: fetchingConversations,
    refetch: refetchConversations,
  } = usePlatformCrmConversations(activeProductId);

  // Produtos do GRUPO — nome do produto por id (paridade com productNameById do v5).
  const { data: allProducts = [] } = usePlatformCrmProducts();
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    (allProducts || []).forEach((p: any) => m.set(p.id, p.name));
    return m;
  }, [allProducts]);

  // Agentes IA da plataforma — nome real por id (platform_crm_agent_configs.name;
  // fallback 'Duda' preserva o comportamento quando o config foi removido).
  const { data: agentConfigs = [] } = usePlatformCrmAgentConfigs();
  const agentNameById = useMemo(() => {
    const m = new Map<string, string>();
    (agentConfigs || []).forEach((a: any) => {
      if (a?.id && a?.name) m.set(a.id, a.name);
    });
    return m;
  }, [agentConfigs]);

  // Setores — badge de setor na lista (paridade v5; sector_id materializado
  // em platform_crm_conversations na migration 20260709 A1.2).
  const { data: allSectors = [] } = usePlatformCrmSectors();
  const sectorById = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    (allSectors || []).forEach((s: any) => {
      if (s?.id) m.set(s.id, { name: s.name, color: s.color ?? null });
    });
    return m;
  }, [allSectors]);

  // Transform conversations for the list (paridade com o map do SellerInbox).
  // Identity fix do destino PRESERVADO: visitor_name inútil → telefone formatado.
  const conversations: Conversation[] = useMemo(
    () =>
      (allRows || []).map((row: PlatformCrmConversationRow) => {
        const identity = resolveVisitorIdentity(row.visitor_name, row.visitor_phone);
        return {
          id: row.id,
          visitor_name: identity.primary,
          visitor_email: null,
          visitor_phone: row.visitor_phone,
          visitor_avatar_url: null,
          channel: row.channel || 'webchat',
          status: row.status,
          unread_count: row.unread_count_agents || 0,
          last_message_at: row.last_message_at || null,
          last_message: row.last_message || undefined,
          last_message_metadata: row.last_message_metadata || null,
          last_message_sender_type: row.last_message_sender_type || null,
          lead_id: row.lead_id,
          product_id: row.product_id,
          product_name: row.product_id ? productNameById.get(row.product_id) || null : null,
          assigned_user_id: row.assigned_to || null,
          assigned_user_name: undefined,
          assigned_user_avatar: null,
          sector_id: (row as any).sector_id ?? null,
          sector_name: (row as any).sector_id
            ? sectorById.get((row as any).sector_id)?.name
            : undefined,
          sector_color: (row as any).sector_id
            ? sectorById.get((row as any).sector_id)?.color ?? undefined
            : undefined,
          current_agent_id: row.current_agent_id || null,
          current_agent_name: row.current_agent_id
            ? agentNameById.get(row.current_agent_id) || 'Duda'
            : null,
          current_agent_avatar: null,
          // A1.3/FRENTE 3: ids de conexão materializados pelo backend na
          // conversa (canal por conversa). Leitura defensiva — o tipo TS do
          // row ainda não reflete as colunas novas (padrão A1.2).
          evolution_instance_id: (row as any).evolution_instance_id ?? null,
          meta_connection_id: (row as any).meta_connection_id ?? null,
          instagram_connection_id: (row as any).instagram_connection_id ?? null,
        } as Conversation;
      }),
    [allRows, productNameById, agentNameById, sectorById],
  );

  // A1.4/FILTROS: etiquetas vivem em `platform_crm_lead_tag_assignments`
  // (lead_id ↔ tag_id) — leitura leve, habilitada só com filtro de etiqueta ativo.
  const { data: tagAssignments = [] } = useQuery({
    queryKey: ['platform-crm', 'tag-assignments-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_lead_tag_assignments')
        .select('lead_id, tag_id');
      if (error) throw error;
      return (data ?? []) as { lead_id: string; tag_id: string }[];
    },
    enabled: filters.selectedTagIds.length > 0,
  });
  const tagLeadIds = useMemo(() => {
    if (!filters.selectedTagIds.length) return null;
    const selected = new Set(filters.selectedTagIds);
    const leads = new Set<string>();
    tagAssignments.forEach((a) => {
      if (a.lead_id && selected.has(a.tag_id)) leads.add(a.lead_id);
    });
    return leads;
  }, [filters.selectedTagIds, tagAssignments]);

  // A1.4/FILTROS: contadores das abas RESPEITAM os filtros do drawer (paridade
  // v5: `countsFilters` = todos os filtros SEM `tab` — cada aba conta seu
  // universo DENTRO do filtro). Reaproveita `applyPlatformCrmInboxFilters`
  // (que por design ignora aba/busca/showResolved) e volta ao nível de row via
  // ids, mantendo a assinatura de `usePlatformCrmConversationCounts` intocada.
  const countRows = useMemo(() => {
    const filteredIds = new Set(
      applyPlatformCrmInboxFilters(conversations, filters, tagLeadIds).map((c) => c.id),
    );
    return (allRows || []).filter((r: PlatformCrmConversationRow) => filteredIds.has(r.id));
  }, [allRows, conversations, filters, tagLeadIds]);
  const tabCounts = usePlatformCrmConversationCounts(countRows);

  // Filtro por aba (client-side — o backend da plataforma não tem RPC de
  // paginação/filtros; mesma UI do v5). A BUSCA é interna da lista (paridade
  // v5: input `data-inbox-search` filtra client-side dentro do componente; a
  // busca do drawer entra via `externalSearch`). "Ver Resolvidos" força a aba
  // 'resolved' (paridade com o effectiveTab do SellerInbox) e os demais
  // filtros do drawer (A1.4) são aplicados sobre a lista já carregada.
  const visibleConversations = useMemo(() => {
    const effectiveTab: PlatformCrmStatusTab = filters.showResolved ? 'resolved' : activeTab;
    const byTabIds = new Set(filterConversationsByTab(allRows, effectiveTab).map((r) => r.id));
    const byTab = conversations.filter((c) => byTabIds.has(c.id));
    return applyPlatformCrmInboxFilters(byTab, filters, tagLeadIds);
  }, [conversations, allRows, activeTab, filters, tagLeadIds]);

  // Auto-select pending conversation (navegação externa / ContactCardBubble).
  const pendingHandledRef = useRef<string | null>(null);
  useEffect(() => {
    let pending = pendingConversationId ?? null;
    if (!pending) {
      try {
        pending = sessionStorage.getItem('platformCrmInbox:pendingConversationId');
        if (pending) sessionStorage.removeItem('platformCrmInbox:pendingConversationId');
      } catch {}
    }
    if (!pending) return;
    if (pendingHandledRef.current === pending) return;
    const found = conversations.find((c) => c.id === pending);
    if (found) {
      pendingHandledRef.current = pending;
      setSelectedConversation(found);
      onConversationSelected?.();
    }
  }, [pendingConversationId, conversations, onConversationSelected]);

  // Conversa selecionada — versão fresca da lista (linha realtime).
  const selectedRow = useMemo(
    () => (selectedConversation ? allRows.find((r) => r.id === selectedConversation.id) ?? null : null),
    [allRows, selectedConversation],
  );
  const freshSelected = useMemo(() => {
    if (!selectedConversation) return null;
    return conversations.find((c) => c.id === selectedConversation.id) ?? selectedConversation;
  }, [conversations, selectedConversation]);

  const { data: rawMessages = [], isLoading: loadingDetail } = usePlatformCrmMessages(
    selectedConversation?.id ?? null,
  );

  // Transform messages (paridade com o map do SellerInbox; reply_to resolvido
  // client-side a partir da própria lista — platform_crm_messages tem
  // reply_to_message_id, sem join materializado).
  const messages: Message[] = useMemo(() => {
    const byId = new Map(rawMessages.map((m) => [m.id, m]));
    return rawMessages.map((msg: any) => {
      const replySrc = msg.reply_to_message_id ? byId.get(msg.reply_to_message_id) : null;
      return {
        id: msg.id,
        content: msg.content,
        sender_type: msg.sender_type,
        sender_name: null,
        sender_id: msg.sender_id,
        created_at: msg.created_at,
        is_deleted: msg.is_deleted || false,
        edited_at: (msg as any).edited_at || null,
        is_starred: msg.is_starred || false,
        forwarded_from_message_id: (msg as any).forwarded_from_message_id || null,
        reply_to: replySrc
          ? { id: replySrc.id, content: replySrc.content, sender_type: replySrc.sender_type }
          : null,
        metadata: msg.metadata ?? null,
        content_type: msg.content_type ?? null,
        direction: (msg as any).direction ?? null,
      } as Message;
    });
  }, [rawMessages]);

  // Mutations (todas platform)
  const sendMessage = useSendPlatformCrmMessage();
  const acceptConversation = useAcceptPlatformCrmConversation();
  const closeConversation = useClosePlatformCrmConversation();
  const reopenConversation = useReopenPlatformCrmConversation();
  const returnToQueueMutation = useReturnPlatformCrmConversationToQueue();
  const activateBotMutation = useActivatePlatformCrmBot();
  const editMessageMutation = useEditPlatformCrmMessage();
  const deleteMessageMutation = useDeletePlatformCrmMessage();
  const starMessageMutation = useStarPlatformCrmMessage();
  const resendMessageMutation = useResendPlatformCrmMessage();
  const setProductMutation = useSetPlatformCrmConversationProduct();
  const aiReactivate = useAiReactivatePlatformCrmConversation();

  // Lead vinculado (com estágio) — platform_crm_leads.
  const { data: linkedLead } = useQuery({
    queryKey: ['platform-crm', 'linked-lead', selectedConversation?.lead_id],
    queryFn: async () => {
      if (!selectedConversation?.lead_id) return null;
      const { data } = await supabase
        .from('platform_crm_leads')
        .select('*, pipeline_stage:platform_crm_pipeline_stages!platform_crm_leads_current_stage_id_fkey(id, name, color)')
        .eq('id', selectedConversation.lead_id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!selectedConversation?.lead_id,
  });

  // Estágios do funil do produto do lead.
  const { data: pipelineStagesData = [] } = usePlatformCrmStages(linkedLead?.product_id ?? null);
  // Shape completo (com order_index) para o LeadContextPanel.
  const pipelineStagesFull = useMemo(
    () =>
      (pipelineStagesData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        order_index: s.order_index ?? 0,
      })),
    [pipelineStagesData],
  );
  // Shape leve (id/name/color) para a QuickActionBar do ChatArea (paridade v5).
  const pipelineStages = useMemo(
    () => pipelineStagesFull.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [pipelineStagesFull],
  );

  const leadForPanel = linkedLead
    ? {
        id: linkedLead.id,
        name: linkedLead.name,
        email: linkedLead.email,
        phone: linkedLead.phone,
        company: linkedLead.company,
        position: linkedLead.position,
        current_stage_id: linkedLead.current_stage_id,
        deal_value: linkedLead.deal_value,
        temperature: linkedLead.temperature,
        landing_page: linkedLead.landing_page,
        utm_source: linkedLead.utm_source,
        utm_medium: linkedLead.utm_medium,
        utm_campaign: linkedLead.utm_campaign,
        created_at: linkedLead.created_at,
        last_contact_at: linkedLead.last_contact_at,
        pipeline_stage: linkedLead.pipeline_stage as any,
      }
    : null;

  const handleMoveStage = useCallback(async (stageId: string) => {
    if (!linkedLead?.id) return;
    await supabase.from('platform_crm_leads').update({ current_stage_id: stageId }).eq('id', linkedLead.id);
    queryClient.invalidateQueries({ queryKey: ['platform-crm', 'linked-lead', selectedConversation?.lead_id] });
    toast({ title: 'Estágio atualizado' });
  }, [linkedLead?.id, selectedConversation?.lead_id, queryClient, toast]);

  // Keyboard shortcuts (Ctrl+K busca · Esc fecha no mobile) — paridade v5.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[data-inbox-search]');
        searchInput?.focus();
      }
      if (e.key === 'Escape' && isMobile && selectedConversation) {
        setSelectedConversation(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile, selectedConversation]);

  // AI suggestion — edge platform-sales-copilot. O gateway de IA dá 502
  // intermitente (visto em prod 2026-07-10): 1 retry automático antes de
  // desistir, e o toast diz a VERDADE (falha transitória, não "em breve").
  const handleAiSuggest = useCallback(async (): Promise<string> => {
    if (!selectedConversation?.id) return '';
    const invokeOnce = async () => {
      const { data, error } = await supabase.functions.invoke('platform-sales-copilot', {
        body: { conversation_id: selectedConversation.id },
      });
      if (error) throw error;
      return (data as any)?.suggestion ?? (data as any)?.answer ?? '';
    };
    try {
      return await invokeOnce();
    } catch (firstError) {
      console.warn('platform-sales-copilot falhou (1ª tentativa), retry…', firstError);
      try {
        return await invokeOnce();
      } catch (retryError) {
        console.warn('platform-sales-copilot falhou também no retry:', retryError);
        sonnerToast.error('A sugestão por IA falhou agora', {
          description: 'Instabilidade momentânea do gateway de IA — clique novamente em alguns segundos.',
        });
        return '';
      }
    }
  }, [selectedConversation]);

  // Send (com reply + mídia do CONTRATO A1.2)
  const handleSendMessage = async (
    content: string,
    replyToMessageId?: string,
    media?: PlatformCrmSendMediaPayload,
  ) => {
    if (!selectedConversation) return;
    try {
      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        content,
        replyToMessageId,
        media,
      });
    } catch {
      toast({
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
    }
  };

  // Message actions
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!selectedConversation) return;
    try {
      await editMessageMutation.mutateAsync({ messageId, conversationId: selectedConversation.id, newContent });
      toast({ title: 'Mensagem editada' });
    } catch {
      toast({ title: 'Erro ao editar', variant: 'destructive' });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedConversation) return;
    try {
      await deleteMessageMutation.mutateAsync({ messageId, conversationId: selectedConversation.id });
      toast({ title: 'Mensagem apagada' });
    } catch {
      toast({ title: 'Erro ao apagar', variant: 'destructive' });
    }
  };

  const handleStarMessage = async (messageId: string) => {
    if (!selectedConversation) return;
    const msg = rawMessages.find((m) => m.id === messageId);
    try {
      await starMessageMutation.mutateAsync({
        messageId,
        conversationId: selectedConversation.id,
        isStarred: !!msg?.is_starred,
      });
    } catch {
      toast({ title: 'Erro ao favoritar', variant: 'destructive' });
    }
  };

  // Encaminhar: grava o conteúdo na conversa ALVO pelo MESMO caminho de envio.
  // TODO(A1.2-backend): flag forwarded_from_message_id na mensagem destino
  // (edge de forward) — hoje o conteúdo é reenviado sem o vínculo.
  const handleForwardMessage = async (messageId: string, targetConversationId: string) => {
    const msg = rawMessages.find((m) => m.id === messageId);
    if (!msg) return;
    try {
      await sendMessage.mutateAsync({ conversationId: targetConversationId, content: msg.content });
      toast({ title: 'Mensagem encaminhada' });
    } catch {
      toast({ title: 'Erro ao encaminhar', variant: 'destructive' });
    }
  };

  const handleResendMessage = async (messageId: string) => {
    if (!selectedConversation?.id) return;
    try {
      toast({ title: 'Reenviando mensagem…' });
      await resendMessageMutation.mutateAsync({ messageId, conversationId: selectedConversation.id });
    } catch (e: any) {
      toast({ title: 'Falha ao reenviar', description: e?.message, variant: 'destructive' });
    }
  };

  // Encerrar — popup obrigatório de desfecho (paridade v5).
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const handleCloseConversation = () => {
    if (!selectedConversation) return;
    setArchiveDialogOpen(true);
  };

  const handleConfirmArchive = async (payload: PlatformCrmArchivePayload) => {
    if (!selectedConversation) return;
    try {
      // Produto escolhido no modal → grava na conversa (e no lead sem produto).
      if (payload.product_id) {
        try {
          await supabase
            .from('platform_crm_conversations')
            .update({ product_id: payload.product_id })
            .eq('id', selectedConversation.id);
          if (selectedConversation.lead_id) {
            await supabase
              .from('platform_crm_leads')
              .update({ product_id: payload.product_id })
              .eq('id', selectedConversation.lead_id)
              .is('product_id', null);
          }
        } catch (e) {
          console.warn('[archive] failed to set product on conversation', e);
        }
      }
      // Estágio ganho/perdido escolhido → move o lead.
      if (payload.stage_id && selectedConversation.lead_id) {
        try {
          await supabase
            .from('platform_crm_leads')
            .update({ current_stage_id: payload.stage_id })
            .eq('id', selectedConversation.lead_id);
        } catch (e) {
          console.warn('[archive] failed to move lead stage', e);
        }
      }

      await closeConversation.mutateAsync({
        conversationId: selectedConversation.id,
        closingOutcome: payload.closing_outcome,
        closingReason: payload.closing_reason,
      });
      setArchiveDialogOpen(false);
      setSelectedConversation(null);
      toast({
        title: 'Conversa encerrada',
        description: payload.closing_outcome === 'won'
          ? 'Negócio marcado como Ganho 🎉'
          : payload.closing_outcome === 'lost'
            ? 'Negócio marcado como Perdido'
            : 'A conversa foi encerrada com sucesso.',
      });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível encerrar a conversa.', variant: 'destructive' });
    }
  };

  const handleReopenConversation = async () => {
    if (!selectedConversation) return;
    try {
      await reopenConversation.mutateAsync(selectedConversation.id);
      toast({ title: 'Conversa reaberta' });
    } catch { toast({ title: 'Erro', description: 'Não foi possível reabrir.', variant: 'destructive' }); }
  };

  const handleReturnToQueue = async () => {
    if (!selectedConversation) return;
    try {
      await returnToQueueMutation.mutateAsync(selectedConversation.id);
      setSelectedConversation(null);
      toast({ title: 'Devolvida à fila' });
    } catch { toast({ title: 'Erro', description: 'Não foi possível devolver.', variant: 'destructive' }); }
  };

  const handleResumeConversation = async () => {
    if (!selectedConversation) return;
    try {
      await acceptConversation.mutateAsync({ conversationId: selectedConversation.id });
      toast({ title: 'Atendimento retomado' });
    } catch { toast({ title: 'Erro', description: 'Não foi possível retomar.', variant: 'destructive' }); }
  };

  const handleActivateBot = async () => {
    if (!selectedConversation) return;
    try {
      await activateBotMutation.mutateAsync(selectedConversation.id);
      toast({ title: 'Bot ativado', description: 'A IA vai enviar uma mensagem estratégica.' });
    } catch { toast({ title: 'Erro', description: 'Não foi possível ativar o bot.', variant: 'destructive' }); }
  };

  const handleTransfer = () => {
    refetchConversations();
    setSelectedConversation(null);
  };

  // 🔔 Sons — transições na tabela de conversas (paridade v5, tabela platform).
  // O refetch da lista já é responsabilidade do realtime do hook (fix useId()).
  const convStateRef = useRef<Map<string, { status: string | null; agent: string | null; lastAt: string | null; assigned: string | null }>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedConversation?.id ?? null; }, [selectedConversation?.id]);

  useEffect(() => {
    if (!currentUserId) return;
    const globalChannel = supabase
      .channel('platform-crm-inbox-sounds')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_crm_conversations' },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (!row?.id) return;
          const prev = convStateRef.current.get(row.id);
          const next = {
            status: row.status ?? null,
            agent: row.current_agent_id ?? null,
            lastAt: row.last_message_at ?? null,
            assigned: row.assigned_to ?? null,
          };

          // 🔔 Nova mensagem em conversa atribuída a mim (fora da selecionada)
          if (
            payload.eventType === 'UPDATE' &&
            next.assigned === currentUserId &&
            next.lastAt &&
            prev?.lastAt !== next.lastAt &&
            selectedIdRef.current !== row.id
          ) {
            playMessage();
          }

          // 🔔 Novo lead na fila: transição para waiting_human sem agente IA
          const isQueueNow = next.status === 'waiting_human' && !next.agent;
          const wasQueueBefore = prev?.status === 'waiting_human' && !prev?.agent;
          if (isQueueNow && !wasQueueBefore) {
            playQueue();
          }

          convStateRef.current.set(row.id, next);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalChannel);
    };
  }, [currentUserId, playMessage, playQueue]);

  // Typing/presença da conversa selecionada — broadcast no canal
  // `platform-conversation-typing:{id}`.
  // TODO(A1.2-backend): presença online do visitante (peerOnline) depende do
  // widget/edge emitir presence — hoje fica false.
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!selectedConversation?.id) return;
    const conversationId = selectedConversation.id;
    const channel = supabase
      .channel(`platform-conversation-typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if ((payload as any).payload?.sender_type === 'visitor') {
          setIsTyping(true);
          setTimeout(() => setIsTyping(false), 3000);
        }
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [selectedConversation?.id]);

  const sendTyping = useCallback(() => {
    typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender_type: 'agent' },
    });
  }, []);

  // Mobile: lista OU chat
  const showList = isMobile ? !selectedConversation : true;
  const showChat = isMobile ? !!selectedConversation : true;

  // Desktop: largura redimensionável da lista (% do container) — paridade v5.
  const [listPanelWidth, setListPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 30;
    const stored = Number(localStorage.getItem('platformCrmInbox.listPanelWidth'));
    return stored >= 18 && stored <= 45 ? stored : 30;
  });
  const layoutRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(18, Math.min(45, pct));
      setListPanelWidth(clamped);
    };
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try { localStorage.setItem('platformCrmInbox.listPanelWidth', String(listPanelWidth)); } catch {}
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [listPanelWidth]);
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Aceite/takeover — A1.2-FRONT (contrato 7): action `accept` do edge
  // `platform-webchat-inbox` com `sector_id` no payload (403 {error, sector_name}
  // se o usuário não é membro do setor) + fallback ao UPDATE client-side dentro
  // do hook enquanto a action não estiver deployada.
  const handleAcceptTicket = useCallback(async (sectorId?: string) => {
    if (!selectedConversation) return;
    if (!sectorId) {
      setAcceptDialog({ open: true, isTakeover: false, previousAssigneeName: null });
      return;
    }
    try {
      await acceptConversation.mutateAsync({ conversationId: selectedConversation.id, sectorId });
      toast({ title: 'Atendimento aceito' });
      refetchConversations();
    } catch (e: any) {
      toast({
        title: e?.name === 'PlatformCrmSectorForbiddenError' ? 'Setor sem acesso' : 'Erro ao aceitar',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }, [selectedConversation, acceptConversation, toast, refetchConversations]);

  const handleTakeoverTicket = useCallback(() => {
    if (!selectedConversation) return;
    setAcceptDialog({
      open: true,
      isTakeover: true,
      previousAssigneeName: (freshSelected as any)?.assigned_user_name || null,
    });
  }, [selectedConversation, freshSelected]);

  // Encerrar em massa (checkbox da lista — paridade v5 admin).
  const handleBulkClose = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const ok = window.confirm(`Encerrar ${ids.length} atendimento${ids.length === 1 ? '' : 's'} selecionado${ids.length === 1 ? '' : 's'}? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    const results = await Promise.allSettled(ids.map((id) => closeConversation.mutateAsync({ conversationId: id })));
    const success = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - success;
    if (selectedConversation && ids.includes(selectedConversation.id)) {
      setSelectedConversation(null);
    }
    refetchConversations();
    toast({
      title: `${success} atendimento${success === 1 ? '' : 's'} encerrado${success === 1 ? '' : 's'}`,
      description: failed > 0 ? `${failed} falha${failed === 1 ? '' : 's'} ao encerrar.` : undefined,
      variant: failed > 0 ? 'destructive' : undefined,
    });
  }, [closeConversation, refetchConversations, selectedConversation, toast]);

  // Encerrar TODOS os atendimentos abertos (ação admin do drawer — paridade
  // com o handleCloseAllTickets do SellerInbox v5, sobre a lista filtrada).
  const handleCloseAllTickets = useCallback(async () => {
    const open = visibleConversations.filter((c) => c.status !== 'closed');
    await Promise.allSettled(open.map((c) => closeConversation.mutateAsync({ conversationId: c.id })));
    toast({ title: `${open.length} atendimentos encerrados` });
    refetchConversations();
  }, [visibleConversations, closeConversation, toast, refetchConversations]);

  // Badge do funil — conta GRUPOS de filtro ativos (paridade SellerInbox v5).
  // canFilterByAgent = true: a inbox da plataforma sempre exibe a aba Agentes.
  const activeFilterCount = countActivePlatformCrmInboxFilters(filters, {
    isAdmin: isAdminMode,
    canFilterByAgent: true,
  });

  const freshStatus = selectedRow?.status ?? freshSelected?.status ?? 'human_active';
  const freshAssigned = selectedRow?.assigned_to ?? freshSelected?.assigned_user_id ?? null;

  const rootHeightClass = isMobile && selectedConversation
    ? 'h-[100dvh]'
    : 'h-[calc(100dvh-10rem)]';

  return (
    <div className={cn(rootHeightClass, 'flex flex-col rounded-lg border border-border overflow-hidden bg-background')}>


      <div ref={layoutRef} className="flex-1 flex min-w-0 overflow-hidden">
        {/* Conversation List */}
        {showList && (
          <div
            className={cn('overflow-hidden', isMobile ? 'w-full flex-shrink-0' : 'h-full')}
            style={!isMobile ? { width: `${listPanelWidth}%` } : undefined}
          >
            <PlatformCrmConversationList
              conversations={visibleConversations}
              selectedId={selectedConversation?.id || null}
              onSelect={setSelectedConversation}
              isLoading={loadingConversations}
              isFetching={fetchingConversations}
              externalSearch={filters.search}
              externalShowResolved={filters.showResolved}
              activeFilterCount={activeFilterCount}
              onNewConversation={() => setShowStartConversation(true)}
              metricsSlot={<PlatformCrmInboxMetricsHeader conversations={countRows} />}
              soundControls={soundControls}
              showAssignedUser={isAdminMode}
              headerLabel={isAdminMode ? 'Atendimentos · Admin' : 'Atendimentos'}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tabCounts={tabCounts}
              isLoadingCounts={loadingConversations}
              showAgentsTab
              onBulkClose={handleBulkClose}
              filtersSlot={
                <PlatformCrmInboxFiltersDrawer
                  open={showFiltersDrawer}
                  onOpenChange={setShowFiltersDrawer}
                  filters={filters}
                  onFiltersChange={setFilters}
                  isAdmin={isAdminMode}
                  canFilterByAgent
                  onCloseAllTickets={isAdminMode ? handleCloseAllTickets : undefined}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 relative"
                      aria-label="Filtros"
                    >
                      <Filter className="h-4 w-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  }
                />
              }
            />
          </div>
        )}

        {/* Resizable divider — desktop only */}
        {!isMobile && showList && showChat && (
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startDrag}
            className="group relative w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-primary/50 active:bg-primary transition-colors"
            title="Arraste para redimensionar"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}

        {/* Chat Area */}
        {showChat && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <PlatformCrmChatArea
              conversationId={selectedConversation?.id || null}
              visitorName={freshSelected?.visitor_name || 'Visitante'}
              visitorPhone={freshSelected?.visitor_phone}
              visitorAvatarUrl={null}
              channel={freshSelected?.channel || 'webchat'}
              metaConnectionId={freshSelected?.meta_connection_id ?? null}
              instagramConnectionId={freshSelected?.instagram_connection_id ?? null}
              evolutionInstanceId={freshSelected?.evolution_instance_id ?? null}
              status={freshStatus}
              messages={messages}
              isLoading={!!selectedConversation && loadingDetail}
              isSending={sendMessage.isPending}
              isTyping={isTyping}
              peerOnline={false}
              onTyping={(typing) => { if (typing) sendTyping(); }}
              productName={freshSelected?.product_name || undefined}
              currentUserId={currentUserId}
              ticketCode={selectedConversation?.id?.slice(0, 6)}
              sectorName={freshSelected?.sector_name || undefined}
              sectorColor={freshSelected?.sector_color || undefined}
              leadId={freshSelected?.lead_id || null}
              productId={freshSelected?.product_id || null}
              currentAgentName={freshSelected?.current_agent_name || null}
              needsAccept={
                !!selectedConversation &&
                (freshStatus === 'waiting_human' || freshStatus === 'bot_active') &&
                !freshAssigned
              }
              onAcceptTicket={handleAcceptTicket}
              isAccepting={acceptConversation.isPending}
              viewerMode={
                !!freshAssigned && freshAssigned !== currentUserId && freshStatus !== 'closed' && isAdminMode
              }
              attendantName={freshSelected?.assigned_user_name || null}
              onTakeover={handleTakeoverTicket}
              onSendMessage={handleSendMessage}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onStarMessage={handleStarMessage}
              onForwardMessage={handleForwardMessage}
              onResendMessage={handleResendMessage}
              onClose={handleCloseConversation}
              onTransfer={() => setShowTransferModal(true)}
              onTogglePanel={() => setShowPanel(!showPanel)}
              onBack={() => setSelectedConversation(null)}
              onReopen={handleReopenConversation}
              onResume={handleResumeConversation}
              onReturnToQueue={handleReturnToQueue}
              onActivateBot={handleActivateBot}
              isReopening={reopenConversation.isPending}
              isResuming={acceptConversation.isPending}
              isReturning={returnToQueueMutation.isPending}
              isActivatingBot={activateBotMutation.isPending}
              showBackButton={isMobile}
              onAiSuggest={handleAiSuggest}
              onScheduleFollowup={() => setShowScheduleFollowup(true)}
              onMarkHot={async () => {
                if (!linkedLead?.id) { toast({ title: 'Sem lead vinculado' }); return; }
                await supabase.from('platform_crm_leads').update({ temperature: 'hot' }).eq('id', linkedLead.id);
                queryClient.invalidateQueries({ queryKey: ['platform-crm', 'linked-lead'] });
                toast({ title: '🔥 Lead marcado como quente' });
              }}
              onSendFlow={() => setShowSendFlow(true)}
              onSendCadence={() => setShowSendCadence(true)}
              onAnalyze={() => setShowAnalysis(true)}
              onScheduleMessage={() => setShowScheduleMessage(true)}
              onCreateEvent={() => setShowCreateEvent(true)}
              onCreateDeal={linkedLead?.id ? () => setShowCreateDeal(true) : undefined}
              onViewLead={() => setShowPanel(true)}
              onMoveStageQuick={linkedLead?.id ? handleMoveStage : undefined}
              pipelineStages={pipelineStages}
              currentStageId={linkedLead?.current_stage_id || null}
              onPickCatalog={() => setShowCatalog(true)}
              onSendPaymentLink={() => setShowPaymentLink(true)}
              onAiReactivate={(opts) =>
                selectedConversation &&
                aiReactivate.mutate({ conversationId: selectedConversation.id, ...(opts || {}) })
              }
              isAiReactivating={aiReactivate.isPending}
            />
          </div>
        )}

        {/* Lead Context Panel — desktop inline */}
        {showPanel && selectedConversation && !isMobile && (
          <aside className="w-80 flex-shrink-0 overflow-hidden border-l border-border bg-background">
            <PlatformCrmLeadContextPanel
              lead={leadForPanel}
              conversationId={selectedConversation.id}
              visitorName={freshSelected?.visitor_name || null}
              visitorEmail={(freshSelected as any)?.visitor_email ?? null}
              visitorPhone={freshSelected?.visitor_phone || null}
              visitorAvatarUrl={null}
              channel={freshSelected?.channel || 'webchat'}
              conversationStartedAt={selectedRow?.created_at || null}
              messageCount={messages.length}
              stages={pipelineStagesFull}
              currentAgent={
                freshSelected?.current_agent_id
                  ? {
                      id: freshSelected.current_agent_id,
                      name: freshSelected.current_agent_name,
                      avatar_url: null,
                    }
                  : null
              }
              currentSectorId={null}
              connectionLabel={null}
              metaConnectionId={null}
              leadId={freshSelected?.lead_id || null}
              onMoveStage={handleMoveStage}
              onEdit={() => setShowEditContact(true)}
              onCreateTask={() => setShowScheduleFollowup(true)}
              onCreateEvent={() => setShowCreateEvent(true)}
              onClose={() => setShowPanel(false)}
            />
          </aside>
        )}
      </div>

      {/* Lead Context Panel — mobile drawer */}
      {selectedConversation && isMobile && (
        <Sheet open={showPanel} onOpenChange={setShowPanel}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0">
            <PlatformCrmLeadContextPanel
              lead={leadForPanel}
              conversationId={selectedConversation.id}
              visitorName={freshSelected?.visitor_name || null}
              visitorEmail={(freshSelected as any)?.visitor_email ?? null}
              visitorPhone={freshSelected?.visitor_phone || null}
              visitorAvatarUrl={null}
              channel={freshSelected?.channel || 'webchat'}
              conversationStartedAt={selectedRow?.created_at || null}
              messageCount={messages.length}
              stages={pipelineStagesFull}
              currentAgent={
                freshSelected?.current_agent_id
                  ? {
                      id: freshSelected.current_agent_id,
                      name: freshSelected.current_agent_name,
                      avatar_url: null,
                    }
                  : null
              }
              currentSectorId={null}
              connectionLabel={null}
              metaConnectionId={null}
              leadId={freshSelected?.lead_id || null}
              onMoveStage={handleMoveStage}
              onEdit={() => setShowEditContact(true)}
              onCreateTask={() => setShowScheduleFollowup(true)}
              onCreateEvent={() => setShowCreateEvent(true)}
              onClose={() => setShowPanel(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Transfer Modal */}
      {selectedConversation && (
        <PlatformCrmTransferModal
          open={showTransferModal}
          onOpenChange={setShowTransferModal}
          conversationId={selectedConversation.id}
          currentAssignedUserId={currentUserId}
          currentChannel={freshSelected?.channel}
          currentEvolutionInstanceId={freshSelected?.evolution_instance_id ?? null}
          onTransfer={handleTransfer}
        />
      )}

      {/* Accept / Takeover Dialog */}
      {selectedConversation && (
        <PlatformCrmAcceptTicketDialog
          open={acceptDialog.open}
          onOpenChange={(open) => setAcceptDialog((prev) => ({ ...prev, open }))}
          conversationId={selectedConversation.id}
          defaultSectorId={(freshSelected as any)?.sector_id ?? null}
          isTakeover={acceptDialog.isTakeover}
          previousAssigneeName={acceptDialog.previousAssigneeName}
          onAccepted={() => {
            refetchConversations();
          }}
        />
      )}

      {/* Dialogs */}
      {selectedConversation && (
        <>
          {linkedLead ? (
            <PlatformCrmLeadEditModal
              isOpen={showEditContact}
              onClose={() => setShowEditContact(false)}
              lead={linkedLead as any}
              onSave={async (updates) => {
                const { error } = await supabase
                  .from('platform_crm_leads')
                  .update(updates)
                  .eq('id', linkedLead.id);
                if (error) throw error;
                queryClient.invalidateQueries({ queryKey: ['platform-crm', 'linked-lead'] });
                refetchConversations();
              }}
            />
          ) : (
            <PlatformCrmEditVisitorDialog
              open={showEditContact}
              onOpenChange={setShowEditContact}
              conversationId={selectedConversation.id}
              visitorName={selectedRow?.visitor_name ?? freshSelected?.visitor_name}
              visitorEmail={(selectedRow as any)?.visitor_email ?? null}
              visitorPhone={freshSelected?.visitor_phone}
            />
          )}
          <PlatformCrmSendFlowDialog
            open={showSendFlow}
            onOpenChange={setShowSendFlow}
            conversationId={selectedConversation.id}
            widgetProductId={freshSelected?.product_id || undefined}
          />
          <PlatformCrmSendCadenceDialog
            open={showSendCadence}
            onOpenChange={setShowSendCadence}
            conversationId={selectedConversation.id}
            leadId={linkedLead?.id}
            productId={linkedLead?.product_id || undefined}
          />
          <PlatformCrmScheduleMessageDialog
            open={showScheduleMessage}
            onOpenChange={setShowScheduleMessage}
            conversationId={selectedConversation.id}
            visitorName={freshSelected?.visitor_name || undefined}
          />

          <PlatformCrmScheduleFollowupDialog
            open={showScheduleFollowup}
            onOpenChange={setShowScheduleFollowup}
            conversationId={selectedConversation.id}
            leadId={linkedLead?.id}
            visitorName={freshSelected?.visitor_name || undefined}
          />
          <PlatformCrmAnalysisPanel
            open={showAnalysis}
            onOpenChange={setShowAnalysis}
            conversationId={selectedConversation.id}
          />

          {/* Criar evento de calendário direto da conversa */}
          <PlatformCrmEventModal
            open={showCreateEvent}
            onOpenChange={setShowCreateEvent}
            defaultLeadId={linkedLead?.id}
          />

          {/* Criar oportunidade direto da conversa (somente com lead vinculado) */}
          {linkedLead?.id && (
            <PlatformCrmDealModal
              isOpen={showCreateDeal}
              onClose={() => setShowCreateDeal(false)}
              leadId={linkedLead.id}
              leadName={linkedLead.name || freshSelected?.visitor_name || 'Lead'}
              productId={linkedLead.product_id}
            />
          )}

          <PlatformCrmCatalogPickerDialog
            open={showCatalog}
            onOpenChange={setShowCatalog}
            productId={linkedLead?.product_id || freshSelected?.product_id || null}
            onSend={(text, media) =>
              handleSendMessage(
                text,
                undefined,
                media?.url
                  ? {
                      bucket: 'platform-crm-media',
                      path: '',
                      mimeType: media.mime || 'image/*',
                      kind: 'image',
                      filename: media.filename || undefined,
                      url: media.url,
                    }
                  : undefined,
              )
            }
          />

          <PlatformCrmPaymentLinkDialog
            open={showPaymentLink}
            onOpenChange={setShowPaymentLink}
            conversationId={selectedConversation.id}
            leadId={linkedLead?.id || null}
            onSend={(text) => handleSendMessage(text)}
          />
        </>
      )}

      {/* Start Conversation Dialog */}
      <PlatformCrmStartConversationDialog
        open={showStartConversation}
        onOpenChange={setShowStartConversation}
        onConversationCreated={(convId) => {
          refetchConversations();
          setTimeout(() => {
            refetchConversations().then(() => {
              const conv = conversations.find((c) => c.id === convId);
              if (conv) setSelectedConversation(conv);
            });
          }, 500);
          setActiveTab('attending');
        }}
      />

      <PlatformCrmArchiveDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onConfirm={handleConfirmArchive}
        loading={closeConversation.isPending}
        conversationName={freshSelected?.visitor_name || undefined}
        leadId={freshSelected?.lead_id || undefined}
        productId={freshSelected?.product_id || undefined}
      />

    </div>
  );
}

export default PlatformCrmInbox;
