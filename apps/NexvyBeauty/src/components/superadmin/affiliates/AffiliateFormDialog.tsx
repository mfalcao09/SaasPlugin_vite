import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateAffiliate,
  useUpdateAffiliate,
  type Affiliate,
  type AffiliateStatus,
} from '@/hooks/useAffiliateAdmin';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affiliate?: Affiliate | null;
}

export function AffiliateFormDialog({ open, onOpenChange, affiliate }: Props) {
  const isEdit = !!affiliate;
  const create = useCreateAffiliate();
  const update = useUpdateAffiliate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [commissionPct, setCommissionPct] = useState('30'); // percentual humano
  const [status, setStatus] = useState<AffiliateStatus>('active');
  const [notes, setNotes] = useState('');
  const [sendWelcome, setSendWelcome] = useState(true);

  useEffect(() => {
    if (open) {
      setName(affiliate?.name ?? '');
      setEmail(affiliate?.email ?? '');
      setPhone(affiliate?.phone ?? '');
      setPixKey(affiliate?.pix_key ?? '');
      // commission_pct é percentual inteiro (30 = 30%)
      setCommissionPct(affiliate ? String(affiliate.commission_pct ?? 30) : '30');
      setStatus(affiliate?.status ?? 'active');
      setNotes(affiliate?.notes ?? '');
      setSendWelcome(true);
    }
  }, [open, affiliate]);

  const isPending = create.isPending || update.isPending;

  const handleSubmit = async () => {
    const pct = Number(commissionPct);
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!isEdit && !email.trim()) {
      toast.error('E-mail é obrigatório');
      return;
    }
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error('Comissão deve ser entre 0 e 100');
      return;
    }

    try {
      if (isEdit && affiliate) {
        await update.mutateAsync({
          id: affiliate.id,
          patch: {
            name: name.trim(),
            phone: phone.trim() || null,
            pix_key: pixKey.trim() || null,
            status,
            commission_pct: pct,
            notes: notes.trim() || null,
          },
        });
        toast.success('Afiliado atualizado');
      } else {
        await create.mutateAsync({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          pix_key: pixKey.trim() || null,
          commission_pct: pct,
          status,
          notes: notes.trim() || null,
          send_welcome: sendWelcome,
        });
        toast.success('Afiliado criado');
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao salvar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar afiliado' : 'Novo afiliado'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados do afiliado. O e-mail não pode ser alterado.'
              : 'Crie um afiliado e (opcionalmente) envie o acesso por e-mail.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Silva" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@email.com"
                disabled={isEdit}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <Label>Chave PIX</Label>
              <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF, e-mail, telefone…" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Comissão (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="1"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                placeholder="30"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AffiliateStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="blocked">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas internas (opcional)" />
          </div>

          {!isEdit && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={sendWelcome}
                onChange={(e) => setSendWelcome(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Enviar e-mail de boas-vindas com acesso ao portal
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? 'Salvar' : 'Criar afiliado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
