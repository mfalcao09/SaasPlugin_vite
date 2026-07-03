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

  // 1 produto → label estática (auto-travado), fiel ao PlatformCrmProductSelector.
  if (products.length === 1) {
    return (
      <div className="space-y-2">
        <Label>Produto</Label>
        <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-md bg-primary/10 text-sm text-primary">
          <Package className="h-4 w-4 shrink-0" />
          <span className="font-medium truncate">{products[0].name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Produto *</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <span className="flex items-center gap-1.5">
            <Package className="h-4 w-4 text-primary shrink-0" />
            <SelectValue placeholder="Selecione o produto" />
          </span>
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
