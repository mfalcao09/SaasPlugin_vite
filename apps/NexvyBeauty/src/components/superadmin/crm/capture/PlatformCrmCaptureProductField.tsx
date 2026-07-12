// ─────────────────────────────────────────────────────────────────────────────
// PlatformCrmCaptureProductField — campo de PRODUTO para os dialogs de criação/
// edição de superfícies de captação (Formulário, Widget, ChatBot, Quiz, Funil).
// D3 P1/F1c — porte 1:1 do padrão da fonte: o `<Select>` de produto é OBRIGATÓRIO
// no create (WidgetManager/ChatBotManager/QuizManager l.232-252) e no edit
// (WidgetSettingsTab/ChatBotSettingsTab/QuizSettingsTab l.76-91). Com **1 produto**
// cadastrado o campo vira LABEL ESTÁTICA (auto-travado), espelhando o comportamento
// de `PlatformCrmProductSelector` (fonte InboxProductSelector l.32-39) — mantém a
// UI atual do Beauty como produto único até o 2º produto entrar.
// 🔒 tema claro/rosa · zero organization_id/tenant.
// ─────────────────────────────────────────────────────────────────────────────
import { Package } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlatformCrmProduct } from '@/components/superadmin/crm/data/usePlatformCrmProducts';

interface PlatformCrmCaptureProductFieldProps {
  products: PlatformCrmProduct[];
  value: string;
  onChange: (productId: string) => void;
  disabled?: boolean;
}

export function PlatformCrmCaptureProductField({
  products,
  value,
  onChange,
  disabled,
}: PlatformCrmCaptureProductFieldProps) {
  // Sem produtos cadastrados: não há o que carimbar (a fonte não renderiza o
  // seletor). Mantém o dialog utilizável; o produto default (Beauty) fica a
  // cargo do backend (coluna com DEFAULT). Evita travar a criação.
  if (products.length === 0) return null;

  // 1 produto → campo estático (auto-travado), fiel ao PlatformCrmProductSelector.
  // Espelha as métricas do <Input>/<SelectTrigger> (h-10, borda, px-3, rounded-md)
  // para alinhar com os demais campos do dialog — evita o "pill" curto/sem borda
  // que destoava do campo "Nome" logo abaixo. `min-w-0` garante truncamento.
  if (products.length === 1) {
    return (
      <div className="space-y-2">
        <Label>Produto</Label>
        <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-foreground">
          <Package className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium truncate min-w-0">{products[0].name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Produto *</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          {/* NÃO usar <span> aqui: o SelectTrigger tem `[&>span]:line-clamp-1`,
              que sobrescreve `display:flex` por `-webkit-box` e quebra o alinhamento
              do ícone + valor. Um <div> não é atingido pelo seletor `[&>span]`. */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Package className="h-4 w-4 text-primary shrink-0" />
            <SelectValue placeholder="Selecione o produto" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {products.map((product) => (
            <SelectItem key={product.id} value={product.id}>
              {product.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
