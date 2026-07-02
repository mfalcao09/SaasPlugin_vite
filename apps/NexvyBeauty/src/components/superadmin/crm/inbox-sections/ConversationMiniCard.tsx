import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Globe, Phone, Instagram, Mail, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PlatformPanelConversation } from '../data/usePlatformCrmAttendancePanel';

/**
 * Mini-card de conversa do Painel de Atendimentos.
 * PORTE 1:1 de `admin/webchat/panel/ConversationMiniCard.tsx` do CRM Vendus.
 * Única troca: o `ChannelBadge` do seller (import proibido) virou um badge
 * local equivalente (ícone + cor por canal), zero import tenant/seller.
 */

interface Props {
  conversation: PlatformPanelConversation;
  onClick: (id: string) => void;
}

function timeAgoColor(iso: string | null): string {
  if (!iso) return 'bg-muted text-muted-foreground';
  const diffMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diffMin < 5) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  if (diffMin < 30) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  return 'bg-destructive/15 text-destructive';
}

/** Badge local de canal — substitui o ChannelBadge do seller (import proibido). */
function LocalChannelBadge({ channel }: { channel: string }) {
  const ch = (channel || 'webchat').toLowerCase();
  const meta = ch.includes('whatsapp')
    ? { icon: Phone, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
    : ch === 'instagram'
      ? { icon: Instagram, cls: 'bg-pink-500/15 text-pink-700 dark:text-pink-400' }
      : ch === 'email'
        ? { icon: Mail, cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' }
        : ch === 'sms'
          ? { icon: MessageSquare, cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' }
          : { icon: Globe, cls: 'bg-primary/10 text-primary' };
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded-full shrink-0',
        meta.cls,
      )}
      title={channel}
    >
      <Icon className="h-2.5 w-2.5" />
    </span>
  );
}

export function ConversationMiniCard({ conversation: c, onClick }: Props) {
  const name = c.lead_name || c.visitor_name || c.visitor_phone || 'Sem nome';
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const timeLabel = c.last_message_at
    ? formatDistanceToNowStrict(new Date(c.last_message_at), { locale: ptBR, addSuffix: false })
    : '—';
  const unread = c.unread_count_agents || 0;

  return (
    <button
      type="button"
      onClick={() => onClick(c.id)}
      className={cn(
        'w-full text-left p-2.5 rounded-lg border border-border bg-card',
        'hover:bg-accent/50 hover:border-primary/30 transition-colors',
        'flex items-center gap-2.5 group',
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={c.visitor_avatar_url || undefined} />
        <AvatarFallback className="text-xs">{initials || '?'}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <LocalChannelBadge channel={c.channel || 'webchat'} />
          <span className="text-sm font-medium truncate flex-1">{name}</span>
          {unread > 0 && (
            <Badge variant="default" className="h-4 px-1.5 text-[10px] shrink-0">
              {unread}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
              timeAgoColor(c.last_message_at),
            )}
          >
            {timeLabel}
          </span>
          {c.sector_name && (
            <span className="text-[10px] text-muted-foreground truncate">{c.sector_name}</span>
          )}
        </div>
      </div>
    </button>
  );
}
