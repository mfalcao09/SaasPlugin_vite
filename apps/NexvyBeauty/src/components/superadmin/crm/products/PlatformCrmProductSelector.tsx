// ─────────────────────────────────────────────────────────────────────────────
// PlatformCrmProductSelector — seletor COMPARTILHADO de produto (D3 Fase 1a)
// Porte 1:1 de `.vendus-src-reference/src/components/seller/inbox/InboxProductSelector.tsx`
// Comportamento-chave da fonte (l.26-31): com **1 produto** cadastrado o seletor
// vira LABEL ESTÁTICA (auto-trava, sem dropdown) — preserva a UI atual do Beauty
// como produto único até o 2º produto entrar. Ondas paralelas importam daqui.
// ─────────────────────────────────────────────────────────────────────────────
import { Package } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlatformCrmProduct } from '@/components/superadmin/crm/data/usePlatformCrmProducts';

interface PlatformCrmProductSelectorProps {
  products: PlatformCrmProduct[];
  selectedProductId: string | null;
  onChange: (productId: string | null) => void;
}

export function PlatformCrmProductSelector({
  products,
  selectedProductId,
  onChange,
}: PlatformCrmProductSelectorProps) {
  if (products.length === 0) return null;

  // Se só existe 1 produto, mostra label estática (auto-travado)
  if (products.length === 1) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-xs text-primary">
        <Package className="h-3.5 w-3.5" />
        <span className="font-medium truncate max-w-[160px]">{products[0].name}</span>
      </div>
    );
  }

  return (
    <Select
      value={selectedProductId ?? 'all'}
      onValueChange={(value) => onChange(value === 'all' ? null : value)}
    >
      <SelectTrigger className="h-8 w-auto min-w-[180px] max-w-[260px] text-xs gap-1.5 bg-card">
        <Package className="h-3.5 w-3.5 text-primary shrink-0" />
        <SelectValue placeholder="Todos os produtos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os produtos</SelectItem>
        {products.map((product) => (
          <SelectItem key={product.id} value={product.id}>
            {product.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
