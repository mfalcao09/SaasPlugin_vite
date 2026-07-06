import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bot, ArrowRightLeft, StickyNote, BarChart3, UserCircle, MoreVertical, X,
  RotateCcw, Play, Undo2, Sparkles, Send, Loader2, Smile, Hand, Zap, Package, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlatformCrmMessageBubble, type PlatformCrmBubbleReply } from './PlatformCrmMessageBubble';
import { PlatformCrmEmptyInboxState } from './PlatformCrmEmptyInboxState';
import { resolveVisitorIdentity, visitorInitials } from './platformCrmIdentity';
import type {
  PlatformCrmConversation,
  PlatformCrmMessage,
} from '../data/usePlatformCrmConversations';

/**
 * Área de chat (painel DIREITO) da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 de `seller/inbox/ChatArea.tsx` (CRM Vendus) — mesmo header (avatar +
 * status + código + ações: reabrir/retomar, transferir, devolver à fila, dados do
 * contato, menu de mais), histórico agrupado por dia, composer com "Sugerir
 * Resposta IA", empty-state (3 cards) e faixa de encerrada.
 *
 * Trocas permitidas: dados (`platform_crm_messages`), tema (tokens), desacoplamento
 * (sem WhatsApp/Meta/Evolution/janela-24h/mídia). O composer de mídia (áudio/anexo)
 * do original depende de canais externos → fase futura; aqui o composer é texto +
 * emoji + "Sugerir Resposta IA" (o botão SEMPRE presente).
 */

const EMOJIS = ['👍', '❤️', '😊', '🎉', '✅', '👋', '🙏', '💪', '😀', '😂', '🔥', '⭐'];

/** Opção mínima de produto para o seletor do header (id + nome). */
export interface PlatformCrmProductOption {
  id: string;
  name: string;
}

interface PlatformCrmChatAreaProps {
  conversation: PlatformCrmConversation | null;
  messages: PlatformCrmMessage[];
  isLoading?: boolean;
  isSending?: boolean;
  currentUserId?: string;
  onSendMessage: (content: string, replyToMessageId?: string) => void;
  /** Gera uma sugestão de resposta via IA (stub por ora — botão SEMPRE presente). */
  onAiSuggest?: () => Promise<string>;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onStarMessage?: (messageId: string) => void;
  onClose?: () => void;
  onReopen?: () => void;
  onResume?: () => void;
  onReturnToQueue?: () => void;
  onTransfer?: () => void;
  onTogglePanel?: () => void;
  /** U1c — estado do painel de contexto (estiliza o botão de toggle). */
  isPanelOpen?: boolean;
  onAnalyze?: () => void;
  isReopening?: boolean;
  isResuming?: boolean;
  isReturning?: boolean;
  /** REVIVAL onda 6 — reenviar mensagem outbound que falhou (por id). */
  onResendMessage?: (messageId: string) => void;
  /** Id da mensagem sendo reenviada agora (spinner/disable na bolha). */
  resendingMessageId?: string | null;
  /** REVIVAL onda 6 — devolver a conversa à IA (Duda): status→bot_active. */
  onActivateBot?: () => void;
  isActivatingBot?: boolean;
  /** REVIVAL onda 6 — acionar a IA para reengajar SEM trocar de dono. */
  onAiReactivate?: () => void;
  isAiReactivating?: boolean;
  /** REVIVAL onda 6 — seletor de produto (D3): lista + selecionado + callback. */
  products?: PlatformCrmProductOption[];
  selectedProductId?: string | null;
  onSetProduct?: (productId: string | null) => void;
  isSettingProduct?: boolean;
}

export function PlatformCrmChatArea({
  conversation,
  messages,
  isLoading,
  isSending,
  currentUserId,
  onSendMessage,
  onAiSuggest,
  onEditMessage,
  onDeleteMessage,
  onStarMessage,
  onClose,
  onReopen,
  onResume,
  onReturnToQueue,
  onTransfer,
  onTogglePanel,
  isPanelOpen,
  onAnalyze,
  isReopening,
  isResuming,
  isReturning,
  onResendMessage,
  resendingMessageId,
  onActivateBot,
  isActivatingBot,
  onAiReactivate,
  isAiReactivating,
  products,
  selectedProductId,
  onSetProduct,
  isSettingProduct,
}: PlatformCrmChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const [isSuggestingReply, setIsSuggestingReply] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<{ id: string; content: string; senderType: string } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const status = conversation?.status ?? 'human_active';

  // Índice das mensagens para resolver o reply_to_message_id → preview da bolha.
  const messageById = useMemo(() => {
    const m = new Map<string, PlatformCrmMessage>();
    messages.forEach((msg) => m.set(msg.id, msg));
    return m;
  }, [messages]);

  // Agrupa mensagens por dia (yyyy-MM-dd) para separadores visuais.
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: PlatformCrmMessage[] }[] = [];
    let currentDate = '';
    messages.forEach((msg) => {
      const msgDate = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    return groups;
  }, [messages]);

  // Auto-scroll suave ao final.
  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

  // Reparse manual do "yyyy-MM-dd" (evita shift de fuso no separador de dia).
  const formatDayLabel = (dateStr: string) => {
    const [y, m, day] = dateStr.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, day || 1);
    if (isToday(d)) return 'Hoje';
    if (isYesterday(d)) return 'Ontem';
    const diff = differenceInDays(new Date(), d);
    if (diff < 7) return format(d, 'EEEE', { locale: ptBR });
    return format(d, "d 'de' MMMM", { locale: ptBR });
  };

  const getStatusText = () => {
    switch (status) {
      case 'human_active': return 'Conversa ativa';
      case 'waiting_human': return 'Aguardando atendimento';
      case 'bot_active': return 'Atendimento por IA';
      case 'closed': return 'Conversa encerrada';
      default: return status;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'human_active': return 'bg-green-500';
      case 'waiting_human': return 'bg-yellow-500';
      case 'bot_active': return 'bg-blue-500';
      case 'closed': return 'bg-muted';
      default: return 'bg-muted';
    }
  };

  const handleAiSuggest = async () => {
    if (!onAiSuggest) return;
    setIsSuggestingReply(true);
    try {
      const suggestion = await onAiSuggest();
      if (suggestion) setDraft((prev) => (prev ? `${prev} ${suggestion}` : suggestion));
      textareaRef.current?.focus();
    } catch {
      // handled silently (o hook de IA fará o toast)
    } finally {
      setIsSuggestingReply(false);
    }
  };

  const handleSend = () => {
    const content = draft.trim();
    if (!content || isSending) return;
    onSendMessage(content, replyToMessage?.id);
    setDraft('');
    setReplyToMessage(null);
    textareaRef.current?.focus();
  };

  const handleReply = (messageId: string, content: string) => {
    const msg = messages.find((m) => m.id === messageId);
    setReplyToMessage({ id: messageId, content, senderType: msg?.sender_type || 'visitor' });
  };

  const insertEmoji = (emoji: string) => {
    setDraft((prev) => prev + emoji);
    setEmojiOpen(false);
    textareaRef.current?.focus();
  };

  // Empty state — nenhuma conversa selecionada (os 3 cards do original).
  if (!conversation) {
    return <PlatformCrmEmptyInboxState />;
  }

  // U3 — fallback de identidade: nome inútil → telefone formatado como
  // primário; o nome cru (ex.: "~") vira secundário na sublinha do header.
  const identity = resolveVisitorIdentity(
    conversation.visitor_name,
    conversation.visitor_phone || conversation.visitor_whatsapp,
  );
  const visitorName = identity.primary;
  const isClosed = status === 'closed';
  const headerAccent = 'hsl(var(--primary))';
  const ticketCode = conversation.id.slice(0, 6);

  // REVIVAL onda 6 — IA no comando quando a conversa está com o bot (Duda).
  const isBotActive = status === 'bot_active';
  const selectedProduct = selectedProductId
    ? products?.find((p) => p.id === selectedProductId) ?? null
    : null;
  const hasProductSelector = !!products && products.length > 0 && !!onSetProduct;

  return (
    <div className="w-full h-full min-w-0 flex flex-col bg-background overflow-hidden">
      {/* ─────────── Header ─────────── */}
      <div className="h-16 min-w-0 flex-shrink-0 px-3 sm:px-4 border-b border-border flex items-center justify-between bg-background relative gap-2 overflow-hidden">
        {/* barra colorida lateral */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: headerAccent }}
        />
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Avatar className="h-11 w-11 ring-2 ring-background shadow-sm">
            <AvatarFallback
              className="font-semibold text-sm"
              style={{ backgroundColor: `${headerAccent}1a`, color: headerAccent }}
            >
              {visitorInitials(
                conversation.visitor_name,
                conversation.visitor_phone || conversation.visitor_whatsapp,
              )}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm truncate">{visitorName}</span>
              {status === 'bot_active' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                  <Bot className="h-3 w-3" /> IA
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0 truncate">
              <span className="font-mono text-foreground/70">#{ticketCode}</span>
              <span>·</span>
              <div className={cn('h-1.5 w-1.5 rounded-full', getStatusColor())} />
              <span>{getStatusText()}</span>
              {/* Nome útil no título → telefone na sublinha; telefone no
                  título (fallback U3) → nome cru como secundário aqui. */}
              {identity.usefulName && conversation.visitor_phone && (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[120px]">{conversation.visitor_phone}</span>
                </>
              )}
              {identity.secondary && (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[120px]" title={identity.secondary}>
                    {identity.secondary}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* REVIVAL onda 6 — seletor de produto (D3). Vincula a conversa a um
              produto de platform_crm_products; o sales-brain usa isso p/ escolher
              a persona/playbook da IA. Oculto quando encerrada. */}
          {!isClosed && hasProductSelector && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 max-w-[160px]"
                      disabled={isSettingProduct}
                    >
                      {isSettingProduct ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                      ) : (
                        <Package className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      <span className="truncate">
                        {selectedProduct?.name ?? 'Produto'}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Vincular a um produto</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
                <DropdownMenuItem
                  onClick={() => onSetProduct?.(null)}
                  className={cn(!selectedProductId && 'font-medium')}
                >
                  {!selectedProductId && <Check className="h-4 w-4 mr-2" />}
                  <span className={cn(selectedProductId && 'ml-6', 'text-muted-foreground')}>
                    Sem produto
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {products!.map((p) => {
                  const isSel = p.id === selectedProductId;
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => onSetProduct?.(p.id)}
                      className={cn(isSel && 'font-medium')}
                    >
                      {isSel && <Check className="h-4 w-4 mr-2" />}
                      <span className={cn(!isSel && 'ml-6', 'truncate')}>{p.name}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* REVIVAL onda 6 — toggle IA (assumir/devolver). O lado "assumir
              manualmente" (→ human_active) já é o botão Retomar (onResume). Aqui
              fica o lado "devolver pra IA": quando um humano está no comando,
              oferece devolver a conversa à Duda (status→bot_active). Quando a IA
              já atende, oferece um reengajamento manual (ai-reactivate). */}
          {!isClosed && !isBotActive && onActivateBot && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={onActivateBot}
                  disabled={isActivatingBot}
                >
                  {isActivatingBot ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                  Devolver à IA
                </Button>
              </TooltipTrigger>
              <TooltipContent>Devolver o atendimento para a Duda (IA)</TooltipContent>
            </Tooltip>
          )}

          {!isClosed && isBotActive && (
            <>
              {onResume && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={onResume}
                      disabled={isResuming}
                    >
                      <Hand className="h-3.5 w-3.5" />
                      Assumir
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Assumir manualmente (tira a IA)</TooltipContent>
                </Tooltip>
              )}
              {onAiReactivate && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={onAiReactivate}
                      disabled={isAiReactivating}
                    >
                      {isAiReactivating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Acionar a IA para reengajar</TooltipContent>
                </Tooltip>
              )}
            </>
          )}

          {isClosed && onReopen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onReopen} disabled={isReopening}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reabrir
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reabrir conversa</TooltipContent>
            </Tooltip>
          )}

          {/* "Retomar" para a fila humana (waiting_human). O caso bot_active é
              coberto pelo botão "Assumir" acima (REVIVAL onda 6), evitando dois
              botões que disparam o mesmo onResume. */}
          {status === 'waiting_human' && onResume && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onResume} disabled={isResuming}>
                  <Play className="h-3.5 w-3.5" />
                  Retomar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retomar atendimento humano</TooltipContent>
            </Tooltip>
          )}

          {!isClosed && (
            <>
              {onTransfer && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTransfer}>
                      <ArrowRightLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Transferir</TooltipContent>
                </Tooltip>
              )}

              {onReturnToQueue && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onReturnToQueue} disabled={isReturning}>
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Devolver à fila</TooltipContent>
                </Tooltip>
              )}
            </>
          )}

          {onTogglePanel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-8 w-8', isPanelOpen && 'text-primary bg-primary/10')}
                  onClick={onTogglePanel}
                >
                  <UserCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPanelOpen ? 'Ocultar dados do lead' : 'Dados do lead'}
              </TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled>
                <StickyNote className="h-4 w-4 mr-2" />
                Notas internas
              </DropdownMenuItem>
              {onAnalyze && (
                <DropdownMenuItem onClick={onAnalyze}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analisar conversa
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!isClosed && onClose && (
                <DropdownMenuItem onClick={onClose} className="text-destructive">
                  <X className="h-4 w-4 mr-2" />
                  Encerrar conversa
                </DropdownMenuItem>
              )}
              {isClosed && onReopen && (
                <DropdownMenuItem onClick={onReopen}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reabrir conversa
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages — fundo texturizado */}
      <ScrollArea
        className="flex-1 min-h-0 w-full max-w-full min-w-0 bg-muted/20 [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:!w-full"
        ref={scrollRef}
        style={{
          backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.06) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <div className="w-full max-w-full min-w-0 overflow-x-hidden p-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-16 bg-muted rounded-2xl w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhuma mensagem ainda</p>
              <p className="text-xs mt-1">Envie uma mensagem para iniciar</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedMessages.map((group) => (
                <div key={group.date}>
                  <div className="flex justify-center mb-4 sticky top-0 z-10 pointer-events-none">
                    <span className="text-[10px] font-medium text-muted-foreground bg-background/90 backdrop-blur border border-border/60 px-3 py-1 rounded-full shadow-sm capitalize">
                      {formatDayLabel(group.date)}
                    </span>
                  </div>

                  <div className="space-y-1 min-w-0">
                    {group.messages.map((msg, idx) => {
                      const prevMsg = group.messages[idx - 1];
                      const nextMsg = group.messages[idx + 1];
                      const isFirstInGroup = !prevMsg || prevMsg.sender_type !== msg.sender_type;
                      const isLastInGroup = !nextMsg || nextMsg.sender_type !== msg.sender_type;
                      const replySrc = msg.reply_to_message_id ? messageById.get(msg.reply_to_message_id) : null;
                      const replyTo: PlatformCrmBubbleReply | null = replySrc
                        ? { id: replySrc.id, content: replySrc.content, sender_type: replySrc.sender_type }
                        : null;

                      return (
                        <PlatformCrmMessageBubble
                          key={msg.id}
                          id={msg.id}
                          content={msg.content}
                          senderType={(msg.sender_type as 'visitor' | 'agent' | 'bot') || 'visitor'}
                          createdAt={msg.created_at}
                          isFirstInGroup={isFirstInGroup}
                          isLastInGroup={isLastInGroup}
                          isDeleted={msg.is_deleted}
                          isStarred={msg.is_starred}
                          editedAt={(msg as any).edited_at} // TODO(types): regen
                          replyTo={replyTo}
                          metadata={msg.metadata}
                          senderId={msg.sender_id}
                          currentUserId={currentUserId}
                          onReply={handleReply}
                          onEdit={onEditMessage}
                          onDelete={onDeleteMessage}
                          onStar={onStarMessage}
                          onResend={onResendMessage}
                          isResending={resendingMessageId === msg.id}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer — composer OU faixa de encerrada */}
      {isClosed ? (
        <div className="p-3 border-t border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">Conversa encerrada</span>
            {onReopen && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onReopen} disabled={isReopening}>
                <RotateCcw className="h-3 w-3" />
                Reabrir
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Reply preview bar */}
          {replyToMessage && (
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-2">
              <div className="w-1 h-8 bg-primary rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium">
                  {replyToMessage.senderType === 'visitor' ? '👤 Visitante' : replyToMessage.senderType === 'bot' ? '🤖 Bot' : '💬 Agente'}
                </p>
                <p className="text-xs text-foreground truncate">{replyToMessage.content}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setReplyToMessage(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Barra "Sugerir Resposta IA" — SEMPRE presente */}
          <div className="px-3 pt-2 border-t border-border bg-background flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleAiSuggest}
              disabled={isSuggestingReply || !onAiSuggest}
            >
              {isSuggestingReply ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
              Sugerir Resposta IA
            </Button>
          </div>

          {/* Composer */}
          <div className="p-3 pt-2 flex-shrink-0 bg-background">
            <div className="flex items-end gap-2">
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start" side="top">
                  <div className="grid grid-cols-6 gap-1">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => insertEmoji(e)}
                        className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Mensagem para ${visitorName}...`}
                rows={1}
                className="min-h-[40px] max-h-32 resize-none bg-muted/40 border-0 rounded-2xl"
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 rounded-full flex-shrink-0 shadow-sm"
                onClick={handleSend}
                disabled={!draft.trim() || isSending}
                aria-label="Enviar mensagem"
              >
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
