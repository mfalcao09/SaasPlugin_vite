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
export function PlatformProductSwitcher({ compact = false }: { compact?: boolean }) {
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
            'flex h-12 min-w-0 items-center gap-2.5 rounded-xl border border-border/80 bg-card px-3 text-left text-sm shadow-sm transition-colors',
            'w-full',
            compact && 'h-14',
            'hover:border-primary/25 hover:bg-muted/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open && 'border-primary/30 bg-primary/[0.04]',
          )}
          aria-label={`Produto selecionado: ${triggerLabel}. Trocar produto`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Package className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Produto</span>
            <span className="block truncate text-sm font-semibold text-foreground">
              {triggerLabel}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      {/* collisionPadding: sem ele o popover podia se posicionar com a metade de
          baixo FORA da viewport no celular — a lista aparecia, mas tocar nos itens
          de baixo não acertava nada ("só consigo selecionar o primeiro",
          reproduzido em iPhone 2026-08-01). `avoidCollisions` já é default no
          Radix; faltava a margem para ele ter onde reposicionar. */}
      <PopoverContent
        className="w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-border/80 bg-card p-0 shadow-2xl shadow-primary/10"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        // portal={false} É A CORREÇÃO DO SCROLL NO CELULAR. Este switcher vive
        // dentro do <Sheet> (Radix Dialog) no mobile, e o scroll-lock do Dialog
        // (react-remove-scroll) bloqueia touchmove em tudo FORA da sua subárvore.
        // Portalado para o body, o popover caía nesse "fora": aparecia, cabia na
        // tela, tinha overflow-y-auto — e não rolava. Renderizando no lugar ele
        // fica DENTRO do Sheet e o arrasto é liberado.
        portal={false}
      >
        {/* Header — espelha o ModuleSwitcher */}
        <div className="border-b border-border/70 px-4 py-3.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground"><Package className="h-3.5 w-3.5 text-primary" />Escopo da operação</div>
          <h4 className="mt-1 text-sm font-semibold text-foreground">Selecionar produto</h4>
        </div>

        {/* Lista */}
        {/* Altura RELATIVA à viewport, não fixa: com `max-h-72` (288px) num
            iPhone pequeno a lista + header estouravam a tela e o fim ficava
            inalcançável. A var --radix-popover-content-available-height é o
            espaço que o Radix mediu até a borda; o min() com 18rem preserva o
            visual no desktop. overscroll-contain impede o scroll vazar pro
            drawer atrás, que era o que travava o arrasto no celular. */}
        <div className="max-h-[min(18rem,var(--radix-popover-content-available-height,18rem))] overflow-y-auto overscroll-contain p-2">
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
        'flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors duration-150',
        'hover:border-border/80 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'border-primary/20 bg-primary/[0.055] shadow-sm',
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
