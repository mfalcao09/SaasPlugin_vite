// ─── Tela 1 do wizard demo — `empresa` COMPLETA (Esteira E1.6) ──────────────
// [v2] Identifica a empresa corretamente (não enxugada). O que fica FORA da demo
// é só agentes/setores/equipes — nunca a identificação. Campo NOVO obrigatório:
// ticket médio (insumo da fórmula do dinheiro: sumidos × ticket). Autosave anônimo
// já existe (save_onboarding_draft_public via useImplantacao).

import type { FC } from 'react';
import { Store, MessageCircle, Instagram, Tag, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { ImplantacaoPayload } from '@/hooks/useImplantacao';

type Empresa = ImplantacaoPayload['empresa'];

// Sub-verticais de beleza + ticket médio default (R$) se a dona pular o campo.
export const SEGMENTOS: Array<{ value: string; label: string; ticket: number }> = [
  { value: 'salao', label: 'Salão de beleza / Cabelo', ticket: 120 },
  { value: 'barbearia', label: 'Barbearia', ticket: 50 },
  { value: 'nail', label: 'Nail / Manicure', ticket: 60 },
  { value: 'estetica', label: 'Estética / Skincare', ticket: 150 },
  { value: 'sobrancelha', label: 'Sobrancelha / Cílios', ticket: 80 },
  { value: 'maquiagem', label: 'Maquiagem', ticket: 150 },
  { value: 'depilacao', label: 'Depilação', ticket: 90 },
  { value: 'spa', label: 'Massagem / Spa', ticket: 130 },
  { value: 'outro', label: 'Outro', ticket: 100 },
];

export const DemoEmpresaStep: FC<{
  empresa: Empresa;
  onChange: (patch: Partial<Empresa>) => void;
}> = ({ empresa, onChange }) => {
  const segTicket = SEGMENTOS.find((s) => s.value === empresa?.segmento)?.ticket;

  const handleSegmento = (value: string) => {
    const patch: Partial<Empresa> = { segmento: value };
    // Sugere o ticket default da sub-vertical só se a dona ainda não digitou o dela.
    if (empresa?.ticket_medio == null) {
      patch.ticket_medio = SEGMENTOS.find((s) => s.value === value)?.ticket;
    }
    onChange(patch);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Confirme os dados do seu espaço. Em segundos a gente conecta seu WhatsApp e
        mostra <span className="font-medium text-foreground">quanto tem de dinheiro parado</span> na
        sua base de clientes.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Nome do seu espaço" icon={Store}>
          <Input
            value={empresa?.nome_fantasia ?? ''}
            onChange={(e) => onChange({ nome_fantasia: e.target.value })}
            placeholder="Ex: Espaço Bella Vita"
            maxLength={120}
          />
        </Field>
        <Field label="WhatsApp do seu espaço" icon={MessageCircle}>
          <Input
            value={empresa?.telefone ?? ''}
            onChange={(e) => onChange({ telefone: e.target.value })}
            placeholder="(00) 00000-0000"
          />
        </Field>
        <Field label="Instagram (opcional)" icon={Instagram}>
          <Input
            value={empresa?.instagram ?? ''}
            onChange={(e) => onChange({ instagram: e.target.value })}
            placeholder="@seuespaco"
          />
        </Field>
        <Field label="Segmento" icon={Tag}>
          <Select value={empresa?.segmento ?? ''} onValueChange={handleSegmento}>
            <SelectTrigger><SelectValue placeholder="Escolha seu segmento" /></SelectTrigger>
            <SelectContent>
              {SEGMENTOS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Ticket médio — obrigatório: é o insumo da fórmula do dinheiro. */}
      <div className="pt-4 border-t">
        <Field label="Quanto custa, em média, um atendimento seu?" icon={DollarSign}>
          <div className="flex items-center gap-2 max-w-xs">
            <span className="text-sm text-muted-foreground">R$</span>
            <Input
              type="number"
              min={0}
              step="1"
              value={empresa?.ticket_medio ?? ''}
              onChange={(e) =>
                onChange({ ticket_medio: e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value) || 0) })
              }
              placeholder={segTicket ? String(segTicket) : '120'}
            />
          </div>
        </Field>
        <p className="text-xs text-muted-foreground mt-2">
          É com esse valor que a gente calcula, em reais, quanto cada cliente sumida
          representa pra você.
        </p>
      </div>
    </div>
  );
};

function Field({ label, icon: Icon, children }: { label: string; icon: typeof Store; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </Label>
      {children}
    </div>
  );
}

export default DemoEmpresaStep;
