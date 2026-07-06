import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle, User, Phone } from 'lucide-react';
import { useCreatePlatformCrmConversation } from '../data/usePlatformCrmConversations';

/**
 * "Nova Conversa" da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 da UX de `seller/inbox/StartConversationDialog.tsx` (CRM Vendus) —
 * mesmo layout (nome/telefone/primeira mensagem). Desacoplado: sem seletor de
 * conexão Evolution/Meta e sem busca de leads por organização.
 *
 * WIRE CLIENT-SIDE: cria a linha em `platform_crm_conversations` via
 * `useCreatePlatformCrmConversation` (+ primeira mensagem opcional). A entrega por
 * WhatsApp/canal externo depende do edge `start-conversation` (fase futura).
 */

interface PlatformCrmStartConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
}

export function PlatformCrmStartConversationDialog({
  open,
  onOpenChange,
  onConversationCreated,
}: PlatformCrmStartConversationDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const createConversation = useCreatePlatformCrmConversation();

  const handleClose = () => {
    setName('');
    setPhone('');
    setMessage('');
    onOpenChange(false);
  };

  const handleCreate = async () => {
    const conv = await createConversation.mutateAsync({
      visitorName: name.trim() || null,
      visitorPhone: phone.trim() || null,
      firstMessage: message.trim() || null,
    });
    onConversationCreated(conv.id);
    handleClose();
  };

  const canCreate = name.trim().length > 0 || phone.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !createConversation.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Nova Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nome */}
          <div>
            <Label>Nome do contato</Label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex.: Maria Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Telefone */}
          <div>
            <Label>Telefone (opcional)</Label>
            <div className="relative mt-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Primeira mensagem */}
          <div>
            <Label>Primeira mensagem (opcional)</Label>
            <Textarea
              placeholder="Olá! Tudo bem?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={createConversation.isPending || !canCreate}>
            {createConversation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Criando...
              </>
            ) : (
              'Iniciar Conversa'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
