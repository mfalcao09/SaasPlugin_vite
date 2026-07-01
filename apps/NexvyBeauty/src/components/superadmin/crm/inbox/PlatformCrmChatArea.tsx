import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlatformCrmMessageBubble } from './PlatformCrmMessageBubble';
import type {
  PlatformCrmConversation,
  PlatformCrmMessage,
} from '../data/usePlatformCrmConversations';

/**
 * Área de chat (painel DIREITO) da inbox do CRM de PLATAFORMA.
 * UX portada de `seller/inbox/ChatArea.tsx` (Vendus) — enxuta ao schema
 * `platform_crm_messages`: header do visitante, histórico em bolhas agrupado por
 * dia, e composer que chama `onSendMessage` (→ useSendPlatformCrmMessage).
 * Empty state quando não há conversa selecionada. Sem tenant/org.
 */

interface PlatformCrmChatAreaProps {
  conversation: PlatformCrmConversation | null;
  messages: PlatformCrmMessage[];
  isLoading?: boolean;
  isSending?: boolean;
  onSendMessage: (content: string) => void;
}

function formatDayLabel(dateStr: string) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, day || 1);
  if (isToday(d)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  const diff = differenceInDays(new Date(), d);
  if (diff < 7) return format(d, 'EEEE', { locale: ptBR });
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

export function PlatformCrmChatArea({
  conversation,
  messages,
  isLoading,
  isSending,
  onSendMessage,
}: PlatformCrmChatAreaProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll ao final quando muda o nº de mensagens.
  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleSend = () => {
    const content = draft.trim();
    if (!content || isSending) return;
    onSendMessage(content);
    setDraft('');
  };

  // Empty state — nenhuma conversa selecionada.
  if (!conversation) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-muted/10 text-center px-6">
        <MessageSquare className="h-14 w-14 text-muted-foreground/30 mb-4" />
        <p className="text-sm font-medium text-foreground">Selecione uma conversa</p>
        <p className="text-xs text-muted-foreground mt-1">
          Escolha um atendimento na lista à esquerda para ver o histórico.
        </p>
      </div>
    );
  }

  const visitorName = conversation.visitor_name || conversation.visitor_phone || 'Visitante';
  const isClosed = conversation.status === 'closed';

  return (
    <div className="w-full h-full min-w-0 flex flex-col bg-background overflow-hidden">
      {/* Header do visitante */}
      <div className="h-16 flex-shrink-0 px-4 border-b border-border flex items-center gap-3 bg-background">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
            {visitorName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'V'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-sm truncate block">{visitorName}</span>
          {conversation.visitor_phone && (
            <span className="text-[11px] text-muted-foreground truncate block">
              {conversation.visitor_phone}
            </span>
          )}
        </div>
      </div>

      {/* Histórico */}
      <ScrollArea
        className="flex-1 min-h-0 w-full bg-muted/20"
        ref={scrollRef}
        style={{
          backgroundImage:
            'radial-gradient(hsl(var(--muted-foreground) / 0.06) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <div className="w-full p-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="h-16 bg-muted rounded-2xl w-3/4" />
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
                  <div className="flex justify-center mb-4">
                    <span className="text-[10px] font-medium text-muted-foreground bg-background/90 backdrop-blur border border-border/60 px-3 py-1 rounded-full shadow-sm capitalize">
                      {formatDayLabel(group.date)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.messages.map((msg) => (
                      <PlatformCrmMessageBubble key={msg.id} message={msg} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer OU faixa de encerrada */}
      {isClosed ? (
        <div className="p-3 border-t border-border bg-muted/30 flex-shrink-0 text-center">
          <span className="text-xs text-muted-foreground">Conversa encerrada</span>
        </div>
      ) : (
        <div className="border-t border-border p-3 flex-shrink-0 bg-background">
          <div className="flex items-end gap-2">
            <Textarea
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
              className="min-h-[40px] max-h-32 resize-none bg-muted/40 border-0"
            />
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 flex-shrink-0"
              onClick={handleSend}
              disabled={!draft.trim() || isSending}
              aria-label="Enviar mensagem"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
