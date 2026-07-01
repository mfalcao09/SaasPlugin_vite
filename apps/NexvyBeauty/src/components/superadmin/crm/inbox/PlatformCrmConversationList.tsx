import { useMemo, useState } from 'react';
import { Search, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PlatformCrmConversation } from '../data/usePlatformCrmConversations';

/**
 * Lista de conversas (painel ESQUERDO) da inbox do CRM de PLATAFORMA.
 * UX portada de `seller/inbox/ConversationList.tsx` (Vendus) — enxuta ao schema
 * `platform_crm_conversations`. Sem tenant/org, sem produto, sem setor.
 */

type ConvStatus = PlatformCrmConversation['status'];

const STATUS_META: Record<ConvStatus, { label: string; className: string }> = {
  human_active: {
    label: 'Atendendo',
    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  },
  bot_active: {
    label: 'IA',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  },
  waiting_human: {
    label: 'Em fila',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  },
  closed: {
    label: 'Encerrada',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

interface PlatformCrmConversationListProps {
  conversations: PlatformCrmConversation[];
  selectedId: string | null;
  onSelect: (conversation: PlatformCrmConversation) => void;
  isLoading?: boolean;
}

function getInitials(name: string | null, phone: string | null) {
  if (name) return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  if (phone) return phone.slice(-2);
  return 'V';
}

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

export function PlatformCrmConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
}: PlatformCrmConversationListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = conversations;
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (c) =>
          c.visitor_name?.toLowerCase().includes(s) ||
          c.visitor_phone?.includes(search) ||
          c.visitor_whatsapp?.includes(search),
      );
    }
    return [...list].sort((a, b) => {
      const aUnread = a.unread_count_agents || 0;
      const bUnread = b.unread_count_agents || 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (aUnread === 0 && bUnread > 0) return 1;
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    });
  }, [conversations, search]);

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Toolbar de busca */}
      <div className="px-3 py-2.5 border-b bg-card">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 bg-muted/40 border-0"
          />
        </div>
      </div>

      {/* Lista */}
      <ScrollArea className="flex-1 bg-muted/20">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse flex gap-3 p-3 bg-background rounded-lg">
                <div className="h-11 w-11 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma conversa</p>
            <p className="text-xs mt-1">Sem conversas nesta inbox</p>
          </div>
        ) : (
          <div className="bg-background">
            {filtered.map((conv) => {
              const statusMeta = STATUS_META[conv.status] ?? STATUS_META.waiting_human;
              const unread = conv.unread_count_agents || 0;
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv)}
                  className={cn(
                    'w-full text-left px-3 py-3 transition-all border-b border-border/30 relative hover:bg-accent/40 group',
                    selectedId === conv.id &&
                      'bg-accent/40 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-500 before:rounded-r',
                  )}
                >
                  <div className="flex gap-3 items-start">
                    <Avatar className="h-11 w-11 flex-shrink-0">
                      <AvatarFallback
                        className={cn(
                          'text-sm font-semibold',
                          unread > 0 ? 'bg-primary/10 text-primary' : 'bg-muted',
                        )}
                      >
                        {getInitials(conv.visitor_name, conv.visitor_phone)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="min-w-0">
                        <span
                          className={cn(
                            'block font-semibold text-[14px] leading-tight truncate',
                            unread > 0 ? 'text-foreground' : 'text-foreground/90',
                          )}
                          title={conv.visitor_name || conv.visitor_phone || 'Visitante'}
                        >
                          {conv.visitor_name || conv.visitor_phone || 'Visitante'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
                        <Badge
                          className={cn(
                            'h-4 px-1.5 text-[10px] border font-medium flex-shrink-0',
                            statusMeta.className,
                          )}
                        >
                          {statusMeta.label}
                        </Badge>
                      </div>
                    </div>

                    {/* Coluna direita: data + badge não-lidas */}
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
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
