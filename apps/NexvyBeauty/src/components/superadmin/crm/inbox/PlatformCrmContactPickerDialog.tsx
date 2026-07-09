import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * Diálogo de "compartilhar contato" da inbox do CRM de PLATAFORMA.
 * PORTE de `seller/inbox/ContactPickerDialog.tsx` (CRM Vendus) — trocas: UI pura
 * (coleta nome + telefone e devolve via `onConfirm`), sem canal externo; tema já
 * neutro (tokens do design system); desacoplamento: não depende de WhatsApp — o
 * host decide o que fazer com o contato (ex.: abrir/criar conversa na plataforma).
 */

interface PlatformCrmContactPickerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (data: { name: string; phone: string }) => void;
}

export function PlatformCrmContactPickerDialog({
  open,
  onOpenChange,
  onConfirm,
}: PlatformCrmContactPickerDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) return;
    onConfirm({ name: name.trim(), phone: phone.trim() });
    setName('');
    setPhone('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar contato</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="platform-contact-name">Nome</Label>
            <Input
              id="platform-contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: João Silva"
            />
          </div>
          <div>
            <Label htmlFor="platform-contact-phone">Telefone (com DDD)</Label>
            <Input
              id="platform-contact-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex.: 11999999999"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !phone.trim()}>
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
