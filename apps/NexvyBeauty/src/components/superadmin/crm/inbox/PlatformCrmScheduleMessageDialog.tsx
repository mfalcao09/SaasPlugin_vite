import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Clock } from 'lucide-react';
import { format, addHours } from 'date-fns';

/**
 * Diálogo de "agendar mensagem" da inbox do CRM de PLATAFORMA (fila interna).
 * PORTE de `seller/inbox/ScheduleMessageDialog.tsx` (CRM Vendus) — trocas: dado
 * (a origem gravava direto em `scheduled_messages` org-scoped; a plataforma ainda
 * NÃO tem `platform_crm_scheduled_messages`) → a persistência sai do componente e
 * vira o callback `onConfirm({ content, scheduledAt })`, que o ChatArea liga ao
 * ponto de integração A1-schedule. Tema em tokens; desacoplamento: sem organization_id
 * nem canal. UI 1:1 (mensagem + data/hora local + confirmar).
 */

interface PlatformCrmScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  /** Recebe o conteúdo + o instante agendado (ISO local "yyyy-MM-dd'T'HH:mm"). */
  onConfirm: (payload: { content: string; scheduledAt: string }) => void | Promise<void>;
  /** Sinaliza persistência em andamento (spinner/disable no botão). */
  isSaving?: boolean;
}

export function PlatformCrmScheduleMessageDialog({
  open,
  onOpenChange,
  conversationId,
  onConfirm,
  isSaving = false,
}: PlatformCrmScheduleMessageDialogProps) {
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState(
    format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"),
  );

  const handleSubmit = async () => {
    if (!content.trim()) return;
    void conversationId; // o host resolve a conversa alvo pelo contexto selecionado
    await onConfirm({ content: content.trim(), scheduledAt });
    setContent('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Agendar Mensagem
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="platform-msg-content">Mensagem</Label>
            <Textarea
              id="platform-msg-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Digite a mensagem a ser enviada..."
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="platform-msg-schedule">Data e Hora</Label>
            <Input
              id="platform-msg-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!content.trim() || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
