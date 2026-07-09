import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Globe, Phone, Instagram } from 'lucide-react';
import { usePlatformCrmConversations } from '../data/usePlatformCrmConversations';
import { formatMessageTime, previewWithMedia } from '@/lib/messageFormat';

/**
 * Histórico de atendimentos anteriores do contato na inbox do CRM de PLATAFORMA.
 * PORTE de `seller/inbox/ConversationHistoryList.tsx` (CRM Vendus) — trocas: dado
 * (o hook tenant `useVisitorHistory` → deriva do `usePlatformCrmConversations`
 * filtrando pela mesma `lead_id` OU `visitor_phone`, excluindo a atual); libs
 * compartilhadas `formatMessageTime`/`previewWithMedia` reaproveitadas; tema em
 * tokens; desacoplamento: sem tenant/org e sem canal de e-mail (não existe na
 * plataforma). UI 1:1 (lista com ícone de canal, badge de status, tempo e preview).
 */

const channelIcon: Record<string, any> = {
  webchat: Globe,
  whatsapp: Phone,
  instagram: Instagram,
};

const statusLabel: Record<string, string> = {
  bot_active: 'Bot',
  waiting_human: 'Em fila',
  human_active: 'Atendendo',
  closed: 'Encerrado',
};

interface PlatformCrmConversationHistoryListProps {
  currentConversationId: string;
  leadId?: string | null;
  visitorPhone?: string | null;
  onSelectConversation?: (id: string) => void;
}

export function PlatformCrmConversationHistoryList({
  currentConversationId,
  leadId,
  visitorPhone,
  onSelectConversation,
}: PlatformCrmConversationHistoryListProps) {
  const { data: all = [], isLoading } = usePlatformCrmConversations();

  const digits = (visitorPhone ?? '').replace(/\D/g, '');
  const history = useMemo(
    () =>
      all
        .filter((c) => c.id !== currentConversationId)
        .filter((c) => {
          if (leadId && c.lead_id === leadId) return true;
          if (digits) {
            const cPhone = (c.visitor_phone || c.visitor_whatsapp || '').replace(/\D/g, '');
            return !!cPhone && cPhone.endsWith(digits.slice(-8));
          }
          return false;
        }),
    [all, currentConversationId, leadId, digits],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!history.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Nenhum atendimento anterior deste contato.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {history.map((c) => {
        const Icon = channelIcon[c.channel] || Globe;
        return (
          <li key={c.id}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectConversation?.(c.id)}
              className="w-full h-auto justify-start text-left p-2 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2 w-full">
                <div className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {formatMessageTime(c.last_message_at || c.created_at, 'full')}
                    </span>
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase">
                      {statusLabel[c.status] || c.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground/90 truncate mt-0.5">
                    {previewWithMedia(c.last_message, c.last_message_metadata, 70) || 'Sem mensagens'}
                  </p>
                </div>
              </div>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
