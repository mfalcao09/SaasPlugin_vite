import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
import { Loader2, ListTodo } from 'lucide-react';
import { format, addDays } from 'date-fns';

/**
 * Nova tarefa/follow-up a partir da conversa — porte fiel A1.2 de
 * `seller/inbox/ScheduleFollowupDialog.tsx` (Vendus v5 original).
 * Adaptação de dados: `tasks` (tenant) → `platform_crm_tasks` (shape idêntico:
 * title/description/due_date/user_id/created_by/lead_id/type/priority/status).
 */
interface PlatformCrmScheduleFollowupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  visitorName?: string;
  conversationId: string;
}

export function PlatformCrmScheduleFollowupDialog({
  open,
  onOpenChange,
  leadId,
  visitorName,
  conversationId,
}: PlatformCrmScheduleFollowupDialogProps) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState(
    format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('Sessão inválida');

      const { error } = await supabase.from('platform_crm_tasks').insert({
        title: `Tarefa: ${visitorName || 'Conversa'}`,
        description: note.trim() || `Tarefa da conversa ${conversationId}`,
        due_date: new Date(dueDate).toISOString(),
        user_id: uid,
        created_by: uid,
        lead_id: leadId || null,
        type: 'task',
        priority: 'medium',
        status: 'pending',
      });

      if (error) throw error;

      toast({ title: 'Tarefa criada!', description: `Vencimento ${format(new Date(dueDate), "dd/MM 'às' HH:mm")}` });
      setNote('');
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao criar tarefa', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Nova Tarefa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="followup-date">Vencimento</Label>
            <Input
              id="followup-date"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            />
          </div>
          <div>
            <Label htmlFor="followup-note">Descrição (opcional)</Label>
            <Textarea
              id="followup-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Enviar proposta comercial..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
