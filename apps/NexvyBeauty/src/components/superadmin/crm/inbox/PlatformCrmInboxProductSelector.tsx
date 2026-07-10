import { Package } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlatformCrmProduct } from '../data/usePlatformCrmProducts';

/**
 * Seletor de produto do header da inbox — porte fiel A1.2 de
 * `seller/inbox/InboxProductSelector.tsx` (Vendus v5 original).
 * Adaptação de dados: `Tables<'products'>` (tenant) → `PlatformCrmProduct`
 * (`platform_crm_products`, catálogo do GRUPO — planos SaaS).
 */
interface PlatformCrmInboxProductSelectorProps {
  products: PlatformCrmProduct[];
  selectedProductId: string | null;
  onChange: (productId: string | null) => void;
}

export function PlatformCrmInboxProductSelector({
  products,
  selectedProductId,
  onChange,
}: PlatformCrmInboxProductSelectorProps) {
  if (products.length === 0) return null;

  // If only 1 product, show static label (auto-locked)
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
        <SelectItem value="all">Todos os meus produtos</SelectItem>
        {products.map((product) => (
          <SelectItem key={product.id} value={product.id}>
            {product.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
