import { Bot, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

/**
 * Bolha de mensagem da inbox do CRM de PLATAFORMA.
 * UX portada de `chat/ChatMessageBubble.tsx` (Vendus) + `seller/inbox` — adaptada
 * ao schema `platform_crm_messages`: outbound (agent/bot) alinha à direita,
 * inbound (visitor) à esquerda. Sem dependência de tenant/org.
 */

export interface PlatformCrmBubbleMessage {
  id: string;
  content: string;
  sender_type: string; // 'agent' | 'visitor' | 'bot' | ...
  direction: string; // 'inbound' | 'outbound'
  created_at: string;
  is_deleted?: boolean;
}

interface PlatformCrmMessageBubbleProps {
  message: PlatformCrmBubbleMessage;
}

export function PlatformCrmMessageBubble({ message }: PlatformCrmMessageBubbleProps) {
  const isOutbound =
    message.direction === 'outbound' ||
    message.sender_type === 'agent' ||
    message.sender_type === 'bot';
  const isBot = message.sender_type === 'bot';

  const timeLabel = (() => {
    const d = new Date(message.created_at);
    if (Number.isNaN(d.getTime())) return '';
    return format(d, 'HH:mm');
  })();

  return (
    <div className={cn('flex gap-2', isOutbound ? 'justify-end' : 'justify-start')}>
      {/* Avatar do visitante (inbound) à esquerda */}
      {!isOutbound && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-muted text-muted-foreground">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn('max-w-[75%] space-y-1', isOutbound && 'items-end')}>
        <div
          className={cn(
            'px-3 py-2 rounded-2xl shadow-sm text-sm break-words',
            isOutbound
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm',
          )}
        >
          {message.is_deleted ? (
            <span className="italic opacity-70">Mensagem apagada</span>
          ) : (
            message.content
          )}
        </div>
        {timeLabel && (
          <div
            className={cn(
              'text-[10px] text-muted-foreground px-1',
              isOutbound ? 'text-right' : 'text-left',
            )}
          >
            {timeLabel}
          </div>
        )}
      </div>

      {/* Avatar do agente/bot (outbound) à direita */}
      {isOutbound && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary">
            {isBot ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
