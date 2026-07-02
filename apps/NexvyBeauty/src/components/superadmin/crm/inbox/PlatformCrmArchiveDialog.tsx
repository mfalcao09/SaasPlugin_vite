import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Trophy, X, MinusCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Encerrar conversa" da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 da UX de `seller/inbox/ArchiveConversationDialog.tsx` (CRM Vendus) —
 * mesmo fluxo (resultado + motivo + valor). DESACOPLADO: removido o seletor de
 * estágio de pipeline / produto (que dependia de organization_id/product_id e da
 * tabela pipeline_stages do tenant). O desfecho é registrado no encerramento
 * (`platform_crm_conversations.status`='closed').
 */

export type PlatformCrmClosingOutcome = 'won' | 'lost' | 'no_deal' | 'other';

export interface PlatformCrmArchivePayload {
  closing_outcome: PlatformCrmClosingOutcome;
  closing_reason: string;
  closing_value: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: PlatformCrmArchivePayload) => Promise<void> | void;
  loading?: boolean;
  conversationName?: string;
}

const OUTCOMES: Array<{
  value: PlatformCrmClosingOutcome;
  label: string;
  icon: any;
  color: string;
  reasonPlaceholder: string;
}> = [
  { value: 'won', label: 'Ganho ✅', icon: Trophy, color: 'text-emerald-600', reasonPlaceholder: 'Conte o que fechou a venda (ex.: produto X, valor Y, condições...)' },
  { value: 'lost', label: 'Perdido ❌', icon: X, color: 'text-destructive', reasonPlaceholder: 'Por que o lead foi perdido? (ex.: preço, concorrente, sem fit...)' },
  { value: 'no_deal', label: 'Sem negócio', icon: MinusCircle, color: 'text-muted-foreground', reasonPlaceholder: 'Por que não há negócio? (ex.: lead desqualificado, não respondeu...)' },
  { value: 'other', label: 'Outro', icon: HelpCircle, color: 'text-muted-foreground', reasonPlaceholder: 'Descreva o motivo do encerramento' },
];

export function PlatformCrmArchiveDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
  conversationName,
}: Props) {
  const [outcome, setOutcome] = useState<PlatformCrmClosingOutcome | ''>('');
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setOutcome('');
      setReason('');
      setValue('');
    }
  }, [open]);

  const selected = OUTCOMES.find((o) => o.value === outcome);
  const requireValue = outcome === 'won';
  const valueNumber = value ? Number(value.replace(/\./g, '').replace(',', '.')) : NaN;
  const valueValid = !requireValue || (!isNaN(valueNumber) && valueNumber > 0);
  const reasonValid = reason.trim().length >= 10;
  const isValid = !!outcome && reasonValid && valueValid;

  const handleSubmit = async () => {
    if (!isValid || !outcome) return;
    await onConfirm({
      closing_outcome: outcome,
      closing_reason: reason.trim(),
      closing_value: !isNaN(valueNumber) && valueNumber > 0 ? valueNumber : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Encerrar conversa</DialogTitle>
          <DialogDescription>
            {conversationName ? `Antes de encerrar com ${conversationName}, ` : 'Antes de encerrar, '}
            registre o desfecho do atendimento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outcome */}
          <div className="space-y-2">
            <Label>Resultado *</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as PlatformCrmClosingOutcome)}
              className="grid grid-cols-2 gap-2"
            >
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                const active = outcome === o.value;
                return (
                  <label
                    key={o.value}
                    htmlFor={`pcrm-outcome-${o.value}`}
                    className={cn(
                      'flex items-center gap-2 rounded-md border p-3 cursor-pointer text-sm transition-colors',
                      active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                    )}
                  >
                    <RadioGroupItem id={`pcrm-outcome-${o.value}`} value={o.value} />
                    <Icon className={cn('h-4 w-4', o.color)} />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </RadioGroup>
          </div>

          {/* Value */}
          {(outcome === 'won' || outcome === 'lost') && (
            <div className="space-y-2">
              <Label htmlFor="pcrm-archive-value">
                Valor (R$) {requireValue && '*'}
              </Label>
              <Input
                id="pcrm-archive-value"
                inputMode="decimal"
                placeholder="0,00"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
              />
              {requireValue && !valueValid && value.length > 0 && (
                <p className="text-xs text-destructive">Informe um valor maior que zero.</p>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="pcrm-archive-reason">Motivo do encerramento *</Label>
            <Textarea
              id="pcrm-archive-reason"
              rows={4}
              placeholder={selected?.reasonPlaceholder || 'Descreva o motivo (mín. 10 caracteres)'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className={reason.length > 0 && !reasonValid ? 'text-destructive' : ''}>
                Mínimo 10 caracteres
              </span>
              <span>{reason.length}/1000</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar encerramento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
