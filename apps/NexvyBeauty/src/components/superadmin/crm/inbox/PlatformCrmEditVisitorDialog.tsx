import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Edição dos dados do visitante/contato da conversa — porte fiel A1.2 de
 * `seller/inbox/EditVisitorDialog.tsx` (Vendus v5 original).
 * Adaptação de dados: `webchat_conversations` (tenant) →
 * `platform_crm_conversations` (plataforma).
 */
interface PlatformCrmEditVisitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  visitorName?: string | null;
  visitorEmail?: string | null;
  visitorPhone?: string | null;
}

const safe = (v: string | null | undefined) => (v ?? '').toString();

export function PlatformCrmEditVisitorDialog({
  open,
  onOpenChange,
  conversationId,
  visitorName,
  visitorEmail,
  visitorPhone,
}: PlatformCrmEditVisitorDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(safe(visitorName));
      setEmail(safe(visitorEmail));
      setPhone(safe(visitorPhone));
    }
  }, [open, visitorName, visitorEmail, visitorPhone]);

  const handleSave = async () => {
    const n = name.trim();
    if (!n) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_crm_conversations')
        .update({
          visitor_name: n,
          visitor_phone: phone.trim() || null,
          // TODO(A1.2-backend): persistir visitor_email quando a coluna existir em
          // platform_crm_conversations (pende migration) — o campo segue na UI
          // para paridade com o v5 e o valor digitado é preservado no formulário.
        })
        .eq('id', conversationId);
      if (error) throw error;
      toast.success('Contato atualizado');
      queryClient.invalidateQueries({ queryKey: ['platform-crm', 'inbox', 'conversations'] });
      onOpenChange(false);
    } catch (e: any) {
      console.error('[PlatformCrmEditVisitor] erro:', e);
      toast.error(e?.message || 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Contato</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="55 11 99999-9999" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
