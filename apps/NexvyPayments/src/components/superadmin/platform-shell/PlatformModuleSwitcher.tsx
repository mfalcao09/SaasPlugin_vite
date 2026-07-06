import { useState } from 'react';
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
export function PlatformModuleSwitcher() {
  const [open, setOpen] = useState(false);
  const { activeModule, setActiveModule, allModules } = usePlatformModule();

  const handleClick = (mod: PlatformModuleDefinition) => {
    setActiveModule(mod.id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open && 'bg-muted text-foreground',
          )}
          aria-label="Trocar módulo"
        >
          <AppsIcon className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 overflow-hidden rounded-xl border border-border p-0 shadow-xl"
        align="start"
        sideOffset={8}
      >
        {/* Header */}
        <div className="border-b border-border px-4 py-3">
          <h4 className="text-sm font-semibold text-foreground">Módulos</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Alterne entre as áreas da plataforma
          </p>
        </div>

        {/* Grid */}
        <div className="p-3">
          <div className="grid grid-cols-2 gap-1">
            {allModules.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeModule === mod.id;
              return (
                <button
                  key={mod.id}
                  onClick={() => handleClick(mod)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg px-2 py-3 text-center transition-all duration-200',
                    'hover:bg-muted',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive && 'bg-primary/5 ring-1 ring-primary/20',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl text-white transition-all duration-200',
                      mod.color,
                      isActive ? 'scale-105 shadow-md' : 'shadow-sm',
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
