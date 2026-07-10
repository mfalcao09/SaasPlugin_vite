import { useState } from 'react';
import { Check, ChevronsUpDown, Package } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';

/**
 * Seletor GLOBAL de produto do painel da plataforma (A1.3). Espelha o visual do
 * PlatformModuleSwitcher (Popover + tokens do shell, tema rosa/claro atual):
 * mesmo PopoverContent (w-72, rounded-xl, border, shadow-xl, header) e mesmo
 * tratamento de item (hover:bg-muted / ativo bg-primary/5 ring-primary/20).
 * "Todos os produtos" = default (null). Filtra Vendas + ERP via contexto.
 */
export function PlatformProductSwitcher() {
  const [open, setOpen] = useState(false);
  const { activeProductId, setActiveProductId, products, activeProduct } =
    useActivePlatformProduct();

  const handleSelect = (id: string | null) => {
    setActiveProductId(id);
    setOpen(false);
  };

  const triggerLabel = activeProduct?.name ?? 'Todos os produtos';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors',
            'hover:bg-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open && 'bg-muted',
          )}
          aria-label="Trocar produto"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Package className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Produto
            </span>
            <span className="block truncate text-xs font-medium text-foreground">
              {triggerLabel}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 overflow-hidden rounded-xl border border-border p-0 shadow-xl"
        align="start"
        sideOffset={8}
      >
        {/* Header — espelha o ModuleSwitcher */}
        <div className="border-b border-border px-4 py-3">
          <h4 className="text-sm font-semibold text-foreground">Produtos</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Filtre Vendas e ERP por produto
          </p>
        </div>

        {/* Lista */}
        <div className="max-h-72 overflow-y-auto p-2">
          {/* "Todos os produtos" (default = null) */}
          <ProductRow
            label="Todos os produtos"
            active={activeProductId === null}
            onSelect={() => handleSelect(null)}
          />
          {products.map((product) => (
            <ProductRow
              key={product.id}
              label={product.name}
              thumbnail={product.logo_url ?? product.product_image_url}
              active={activeProductId === product.id}
              onSelect={() => handleSelect(product.id)}
            />
          ))}
          {products.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhum produto cadastrado ainda.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ProductRowProps {
  label: string;
  thumbnail?: string | null;
  active: boolean;
  onSelect: () => void;
}

function ProductRow({ label, thumbnail, active, onSelect }: ProductRowProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-200',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-primary/5 ring-1 ring-primary/20',
      )}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="h-7 w-7 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
        </span>
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          active ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

export default PlatformProductSwitcher;
