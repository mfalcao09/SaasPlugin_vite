import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, Filter, Globe, MessageCircle, Phone, Plus, Bot, Loader2,
  Volume2, VolumeX,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { previewWithMedia } from '@/lib/messageFormat';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type {
  PlatformCrmConversationRow,
  PlatformCrmStatusTab,
  PlatformCrmTabCounts,
} from '../data/usePlatformCrmConversations';

/**
 * Lista de conversas (painel ESQUERDO) da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 de `seller/inbox/ConversationList.tsx` (CRM Vendus) — mesma toolbar
 * (filtro + busca + som + nova conversa), mesmas 3 abas (Atendendo/Agentes/Em Fila)
 * com contadores, mesmo layout de card. Trocas permitidas: fonte de dados
 * (`platform_crm_conversations`) e desacoplamento (sem setor/produto/org).
 */

type ConvProvider = 'webchat' | 'whatsapp' | 'unknown';

function resolveProvider(conv: PlatformCrmConversationRow): ConvProvider {
  const ch = (conv.channel || '').toLowerCase();
  if (ch.includes('whatsapp') || conv.visitor_whatsapp) return 'whatsapp';
  if (ch === 'webchat' || ch === 'site' || ch === 'widget') return 'webchat';
  return 'unknown';
}

const PROVIDER_LABEL: Record<ConvProvider, string> = {
  webchat: 'Site',
  whatsapp: 'WhatsApp',
  unknown: 'Canal',
};

const providerIcon: Record<ConvProvider, React.ReactNode> = {
  webchat: <Globe className="h-2.5 w-2.5" />,
  whatsapp: <Phone className="h-2.5 w-2.5" />,
  unknown: <Globe className="h-2.5 w-2.5" />,
};

const providerAvatarBadgeClass: Record<ConvProvider, string> = {
  webchat: 'bg-primary text-primary-foreground',
  whatsapp: 'bg-emerald-500 text-white',
  unknown: 'bg-muted text-muted-foreground',
};

interface PlatformCrmConversationListProps {
  conversations: PlatformCrmConversationRow[];
  selectedId: string | null;
  onSelect: (conversation: PlatformCrmConversationRow) => void;
  isLoading?: boolean;
  onNewConversation?: () => void;
  /** Aba ativa controlada (o pai filtra por status). */
  activeTab?: PlatformCrmStatusTab;
  onTabChange?: (tab: PlatformCrmStatusTab) => void;
  /** Contadores totais por aba. */
  tabCounts?: PlatformCrmTabCounts;
  isLoadingCounts?: boolean;
  /** Controles de som (enable/disable + testar). */
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onTestSound?: () => void;
  /** Abre o drawer de filtros (fase futura). */
  onOpenFilters?: () => void;
  activeFilterCount?: number;
}

function getInitials(name: string | null, phone: string | null) {
  if (name) return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  if (phone) return phone.slice(-2);
  return 'V';
}

// Data BR como na referência: hoje → "HH:mm", ontem → "Ontem",
// mesma semana → "EEE HH:mm", mais antigo → "dd/MM/yyyy".
function formatDate(date: string | null) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  const diff = Math.abs(differenceInDays(new Date(), d));
  if (diff < 7) return format(d, 'EEE HH:mm', { locale: ptBR });
  return format(d, 'dd/MM/yyyy');
}

// Encurta nomes muito longos preservando o início.
function shortenName(name: string, max = 32) {
  if (name.length <= max) return name;
  return name.slice(0, max - 1).trimEnd() + '…';
}

export function PlatformCrmConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
  onNewConversation,
  activeTab: activeTabProp,
  onTabChange,
  tabCounts,
  isLoadingCounts = false,
  soundEnabled = true,
  onToggleSound,
  onTestSound,
  onOpenFilters,
  activeFilterCount = 0,
}: PlatformCrmConversationListProps) {
  const [internalSearch, setInternalSearch] = useState('');
  const [internalTab, setInternalTab] = useState<PlatformCrmStatusTab>('attending');
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (t: PlatformCrmStatusTab) => {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  };

  // Placeholder p/ paridade estrutural com o sentinel de scroll infinito do original.
  useEffect(() => {
    void sentinelRef.current;
  }, []);

  const search = internalSearch;

  // Contadores: usar os do backend/derivados quando vierem; senão calcular local.
  const counts = useMemo<PlatformCrmTabCounts>(() => {
    if (tabCounts) return tabCounts;
    return {
      attending: conversations.filter((c) => c.status === 'human_active').length,
      agents: conversations.filter((c) => c.status === 'bot_active').length,
      waiting: conversations.filter((c) => c.status === 'waiting_human').length,
      resolved: conversations.filter((c) => c.status === 'closed').length,
    };
  }, [conversations, tabCounts]);

  // O pai já filtra por status conforme a aba. Aqui só aplicamos a busca local.
  const filteredConversations = useMemo(() => {
    let filtered = conversations;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.visitor_name?.toLowerCase().includes(s) ||
          c.visitor_phone?.includes(search) ||
          c.visitor_whatsapp?.includes(search) ||
          c.last_message?.toLowerCase().includes(s),
      );
    }

    return [...filtered].sort((a, b) => {
      const aUnread = a.unread_count_agents || 0;
      const bUnread = b.unread_count_agents || 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (aUnread === 0 && bUnread > 0) return 1;
      const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [conversations, search]);

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Top toolbar — filtro + busca + som + nova conversa */}
      <div className="px-3 py-2.5 border-b flex items-center gap-2 bg-card">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 relative"
              onClick={onOpenFilters}
              aria-label="Filtros"
            >
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filtros</TooltipContent>
        </Tooltip>

        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
            className="pl-8 h-9 bg-muted/40 border-0"
            data-inbox-search
          />
        </div>

        {/* Áudio / sons de notificação */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Sons de notificação"
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-primary" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Sons de notificação</div>
                <div className="text-xs text-muted-foreground">Alertas de novas mensagens</div>
              </div>
              <Switch checked={soundEnabled} onCheckedChange={() => onToggleSound?.()} />
            </div>
            <div className="h-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => onTestSound?.()}
              disabled={!soundEnabled}
            >
              <Volume2 className="h-3.5 w-3.5" />
              Testar som
            </Button>
          </PopoverContent>
        </Popover>

        {onNewConversation && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" className="h-9 w-9" onClick={onNewConversation}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nova conversa</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Tabs pílula — Atendendo / Agentes / Em Fila (com contadores) */}
      <div className="px-2 py-2 border-b bg-background">
        <div className="grid gap-1 p-1 bg-muted/40 rounded-lg grid-cols-3">
          <TabButton
            label="Atendendo"
            count={counts.attending}
            isLoadingCount={isLoadingCounts && !tabCounts}
            active={activeTab === 'attending'}
            onClick={() => setActiveTab('attending')}
            badgeVariant="success"
          />
          <TabButton
            label="Agentes"
            count={counts.agents}
            isLoadingCount={isLoadingCounts && !tabCounts}
            active={activeTab === 'agents'}
            onClick={() => setActiveTab('agents')}
            badgeVariant="muted"
          />
          <TabButton
            label="Em Fila"
            count={counts.waiting}
            isLoadingCount={isLoadingCounts && !tabCounts}
            active={activeTab === 'waiting'}
            onClick={() => setActiveTab('waiting')}
            badgeVariant="danger"
          />
        </div>
      </div>

      {/* Lista de conversas */}
      <ScrollArea className="flex-1 bg-muted/20">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse flex gap-3 p-3 bg-background rounded-lg">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma conversa</p>
            <p className="text-xs mt-1">
              {activeTab === 'waiting'
                ? 'Não há conversas aguardando atendimento'
                : activeTab === 'agents'
                ? 'Nenhuma conversa com agente IA'
                : activeTab === 'resolved'
                ? 'Nenhum atendimento resolvido'
                : 'Sem conversas nesta aba'}
            </p>
          </div>
        ) : (
          <div className="bg-background">
            {filteredConversations.map((conv) => {
              const provider = resolveProvider(conv);
              const channelLabel = PROVIDER_LABEL[provider] ?? conv.channel;
              const unread = conv.unread_count_agents || 0;
              const preview = previewWithMedia(conv.last_message, conv.last_message_metadata, 60);
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className={cn(
                    'w-full text-left px-3 py-3 transition-all border-b border-border/30 relative',
                    'hover:bg-accent/40 group',
                    selectedId === conv.id &&
                      'bg-accent/40 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-500 before:rounded-r',
                  )}
                >
                  <div className="@container flex gap-3 items-start">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-11 w-11">
                        <AvatarFallback
                          className={cn(
                            'text-sm font-semibold',
                            unread > 0 ? 'bg-primary/10 text-primary' : 'bg-muted',
                          )}
                        >
                          {getInitials(conv.visitor_name, conv.visitor_phone)}
                        </AvatarFallback>
                      </Avatar>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center border-2 border-background',
                              providerAvatarBadgeClass[provider],
                            )}
                          >
                            {providerIcon[provider]}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">{channelLabel}</TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Conteúdo (nome / preview / status IA) */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="min-w-0">
                        <span
                          className={cn(
                            'block font-semibold text-[14px] leading-tight truncate',
                            unread > 0 ? 'text-foreground' : 'text-foreground/90',
                          )}
                          title={conv.visitor_name || conv.visitor_phone || 'Visitante'}
                        >
                          {shortenName(conv.visitor_name || conv.visitor_phone || 'Visitante')}
                        </span>
                      </div>

                      <p
                        className={cn(
                          'text-[13px] truncate mt-1 min-w-0 w-full overflow-hidden',
                          unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground',
                        )}
                        title={typeof preview === 'string' ? preview : undefined}
                      >
                        {preview || (
                          <span className="italic opacity-70">
                            {conv.last_message_at ? 'Mensagem indisponível' : 'Sem mensagens ainda'}
                          </span>
                        )}
                      </p>

                      {/* Status IA (quando a conversa está em atendimento por agente) */}
                      {conv.status === 'bot_active' && (
                        <div className="flex items-center gap-1 flex-nowrap overflow-hidden mt-1.5 min-w-0">
                          <Badge
                            className="h-4 px-1.5 text-[10px] flex items-center gap-1 border bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 max-w-[130px] flex-shrink-0"
                            title="Atendimento por IA"
                          >
                            <Bot className="h-2.5 w-2.5 flex-shrink-0" />
                            <span className="truncate">IA</span>
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Coluna direita: data + badge de não-lidas */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-1 max-w-[72px]">
                      <span
                        className={cn(
                          'text-[11px] whitespace-nowrap font-medium leading-none',
                          unread > 0 ? 'text-emerald-600' : 'text-muted-foreground',
                        )}
                      >
                        {formatDate(conv.last_message_at)}
                      </span>
                      {unread > 0 && (
                        <Badge className="h-5 min-w-[22px] px-1.5 text-[11px] rounded-full bg-emerald-500 hover:bg-emerald-500 text-white">
                          {unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            <div ref={sentinelRef} aria-hidden className="h-1" />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function TabButton({
  label,
  count,
  isLoadingCount = false,
  active,
  onClick,
  badgeVariant,
}: {
  label: string;
  count: number;
  isLoadingCount?: boolean;
  active: boolean;
  onClick: () => void;
  badgeVariant: 'success' | 'danger' | 'muted';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-all',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
      )}
    >
      <span className="truncate">{label}</span>
      {(isLoadingCount || count > 0) && (
        <span
          className={cn(
            'inline-flex items-center justify-center h-4 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold',
            badgeVariant === 'success' && 'bg-emerald-500 text-white',
            badgeVariant === 'danger' && 'bg-red-500 text-white',
            badgeVariant === 'muted' && 'bg-muted text-muted-foreground',
          )}
        >
          {isLoadingCount ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : count}
        </span>
      )}
    </button>
  );
}
