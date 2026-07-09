import { useState } from 'react';
import { Forward, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { usePlatformCrmConversations } from '../data/usePlatformCrmConversations';
import { resolveVisitorIdentity, visitorInitials } from './platformCrmIdentity';

/**
 * Diálogo de "encaminhar mensagem" da inbox do CRM de PLATAFORMA.
 * PORTE de `seller/inbox/ForwardMessageDialog.tsx` (CRM Vendus) — trocas: dado
 * (o hook tenant `useWebChatConversations` → `usePlatformCrmConversations` sobre
 * `platform_crm_conversations`); identidade do visitante via `platformCrmIdentity`
 * (fallback U3 nome↔telefone); desacoplamento: sem tenant/org — apenas devolve o
 * `targetConversationId` via `onConfirm` (o ChatArea faz o encaminhamento real
 * reenviando o conteúdo para a conversa alvo). UI 1:1 (busca + lista de destinos).
 */

const STATUS_LABEL: Record<string, string> = {
  human_active: 'Atendendo',
  waiting_human: 'Em fila',
  bot_active: 'IA',
  closed: 'Encerrada',
};

interface PlatformCrmForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targetConversationId: string) => void;
  conversationId: string | null;
}

export function PlatformCrmForwardMessageDialog({
  open,
  onOpenChange,
  onConfirm,
  conversationId,
}: PlatformCrmForwardMessageDialogProps) {
  const [search, setSearch] = useState('');
  const { data: conversations } = usePlatformCrmConversations();

  const filteredConversations = (conversations || [])
    .filter((c) => c.id !== conversationId)
    .filter((c) => {
      if (!search) return true;
      const identity = resolveVisitorIdentity(
        c.visitor_name,
        c.visitor_phone || c.visitor_whatsapp,
      );
      return identity.primary.toLowerCase().includes(search.toLowerCase());
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" />
            Encaminhar mensagem
          </DialogTitle>
          <DialogDescription>
            Selecione a conversa para encaminhar
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-1">
            {filteredConversations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma conversa encontrada
              </p>
            ) : (
              filteredConversations.map((conv) => {
                const identity = resolveVisitorIdentity(
                  conv.visitor_name,
                  conv.visitor_phone || conv.visitor_whatsapp,
                );
                return (
                  <button
                    key={conv.id}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                    onClick={() => {
                      onConfirm(conv.id);
                      onOpenChange(false);
                    }}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {visitorInitials(conv.visitor_name, conv.visitor_phone || conv.visitor_whatsapp)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{identity.primary}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.channel} • {STATUS_LABEL[conv.status] || conv.status}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
