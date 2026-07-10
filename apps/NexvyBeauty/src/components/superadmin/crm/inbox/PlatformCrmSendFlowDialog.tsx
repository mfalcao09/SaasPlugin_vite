import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePlatformCrmChatFlows } from '../data/usePlatformCrmChatFlows';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Envio de fluxo de chat na conversa — porte fiel A1.2 de
 * `seller/inbox/SendFlowDialog.tsx` (Vendus v5 original).
 * Adaptações de dados: `chat_flows` (tenant, org-scoped) →
 * `usePlatformCrmChatFlows` (`platform_crm_chat_flows`); edge
 * `webchat-inbox` → `platform-webchat-inbox` (action `trigger-flow`).
 */
interface PlatformCrmSendFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  widgetProductId?: string;
}

export function PlatformCrmSendFlowDialog({
  open,
  onOpenChange,
  conversationId,
  widgetProductId,
}: PlatformCrmSendFlowDialogProps) {
  const { toast } = useToast();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Fluxos da plataforma (filtro por produto quando a conversa tem produto).
  const { data: allFlows = [], isLoading } = usePlatformCrmChatFlows(widgetProductId);
  const flows = allFlows.filter((f) => f.is_active);

  const handleSend = async () => {
    if (!selectedFlowId) return;
    setIsSending(true);
    try {
      // TODO(A1.2-backend): action `trigger-flow` no edge `platform-webchat-inbox`
      // (paridade com o `webchat-inbox` do tenant). Enquanto o edge não tratar a
      // action, o invoke retorna erro e o toast de falha é exibido.
      const { error } = await supabase.functions.invoke('platform-webchat-inbox', {
        body: {
          action: 'trigger-flow',
          conversation_id: conversationId,
          flow_id: selectedFlowId,
        },
      });
      if (error) throw error;
      toast({ title: 'Fluxo enviado com sucesso!' });
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao enviar fluxo', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            Enviar Fluxo
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-72">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : flows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum fluxo ativo encontrado.
            </p>
          ) : (
            <div className="space-y-2">
              {flows.map((flow) => (
                <button
                  key={flow.id}
                  onClick={() => setSelectedFlowId(flow.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    selectedFlowId === flow.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <p className="text-sm font-medium">{flow.name}</p>
                  {flow.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{flow.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!selectedFlowId || isSending}>
            {isSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar Fluxo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
