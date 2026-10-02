import { useState } from 'react';
import { ChevronDown, Layers3 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  usePlatformModule,
  type PlatformModuleDefinition,
} from './usePlatformModule';

// ─── Ícone hub-and-spoke (mesmo do Intentus, monocromático) ──
function AppsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <line x1="12" y1="9.5" x2="12" y2="3.5" />
      <line x1="12" y1="14.5" x2="12" y2="20.5" />
      <line x1="9.5" y1="12" x2="3.5" y2="12" />
      <line x1="14.5" y1="12" x2="20.5" y2="12" />
      <line x1="10.23" y1="10.23" x2="5.98" y2="5.98" />
      <line x1="13.77" y1="13.77" x2="18.02" y2="18.02" />
      <line x1="13.77" y1="10.23" x2="18.02" y2="5.98" />
      <line x1="10.23" y1="13.77" x2="5.98" y2="18.02" />
      <circle cx="12" cy="2.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="21.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="21.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="5.25" cy="5.25" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.75" cy="18.75" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.75" cy="5.25" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="5.25" cy="18.75" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Popover em grid com os módulos da plataforma (padrão Intentus).
 * Troca o módulo ativo via Context; tema atual (rosa/claro).
 */
export function PlatformModuleSwitcher({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { activeModule, activeModuleDefinition, setActiveModule, allModules } = usePlatformModule();

  const handleClick = (mod: PlatformModuleDefinition) => {
    setActiveModule(mod.id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex h-12 min-w-[200px] items-center gap-2.5 rounded-xl border border-border/80 bg-card px-3 text-sm text-foreground shadow-sm transition-colors',
            compact && 'h-14 w-full min-w-0 justify-start px-3 text-left',
            'hover:border-primary/25 hover:bg-muted/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open && 'border-primary/30 bg-primary/[0.04]',
          )}
          aria-label="Trocar módulo"
        >
          <AppsIcon className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Módulo</span>
            <span className="block truncate text-sm font-semibold">{activeModuleDefinition.label}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-border/80 bg-card p-0 shadow-2xl shadow-primary/10"
        align="start"
        sideOffset={8}
        // Mesma correção do PlatformProductSwitcher: sem margem de colisão o
        // popover pode assentar com parte fora da viewport no celular, e os itens
        // de baixo ficam sem alcance de toque.
        collisionPadding={12}
        // Mesma razão do PlatformProductSwitcher: dentro do Sheet, o scroll-lock
        // do Radix Dialog engole o toque de um popover portalado para o body.
        portal={false}
      >
        {/* Header */}
        <div className="border-b border-border/70 px-4 py-3.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground"><Layers3 className="h-3.5 w-3.5 text-primary" />Workspace</div>
          <h4 className="mt-1 text-sm font-semibold text-foreground">Trocar módulo</h4>
        </div>

        {/* Grid */}
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2">
            {allModules.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeModule === mod.id;
              return (
                <button
                  key={mod.id}
                  onClick={() => handleClick(mod)}
                  className={cn(
                    'flex flex-col items-center gap-2.5 rounded-xl border border-transparent px-2 py-3.5 text-center transition-colors duration-150',
                    'hover:border-border/80 hover:bg-muted/50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive && 'border-primary/20 bg-primary/[0.055] shadow-sm',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-xl text-white transition-transform duration-150',
                      mod.color,
                      isActive ? 'shadow-md' : 'shadow-sm',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-medium leading-tight',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {mod.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default PlatformModuleSwitcher;
