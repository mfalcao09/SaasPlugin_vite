import { useMemo } from 'react';
import { MessageSquare, Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PlatformCrmConversationRow } from '../data/usePlatformCrmConversations';

/**
 * Métricas rápidas do topo da lista (ativas / não lidas / aguardando / +5min)
 * — porte fiel A1.2 de `seller/inbox/InboxMetricsHeader.tsx` (Vendus v5
 * original). Adaptação de dados: `unread_count` → `unread_count_agents`
 * (coluna do platform CRM).
 */
interface PlatformCrmInboxMetricsHeaderProps {
  conversations: PlatformCrmConversationRow[];
}

export function PlatformCrmInboxMetricsHeader({ conversations }: PlatformCrmInboxMetricsHeaderProps) {
  const metrics = useMemo(() => {
    const active = conversations.filter(c => c.status === 'human_active' || c.status === 'bot_active').length;
    const waiting = conversations.filter(c => c.status === 'waiting_human').length;
    const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count_agents || 0), 0);

    // Count conversations waiting > 5 min
    const now = Date.now();
    const waitingLong = conversations.filter(c => {
      if (c.status !== 'waiting_human' || !c.last_message_at) return false;
      const diff = now - new Date(c.last_message_at).getTime();
      return diff > 5 * 60 * 1000;
    }).length;

    return { active, waiting, totalUnread, waitingLong };
  }, [conversations]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        <span>{metrics.active} ativas</span>
      </div>

      {metrics.totalUnread > 0 && (
        <Badge variant="default" className="h-5 text-[10px] px-1.5 animate-pulse">
          {metrics.totalUnread} não lidas
        </Badge>
      )}

      {metrics.waiting > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
          <Clock className="h-3.5 w-3.5" />
          <span>{metrics.waiting} aguardando</span>
        </div>
      )}

      {metrics.waitingLong > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-destructive animate-pulse">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{metrics.waitingLong} há +5min</span>
        </div>
      )}
    </div>
  );
}
