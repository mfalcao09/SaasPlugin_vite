import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Menu, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/Logo';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { usePlatformModule } from './usePlatformModule';
import { PlatformGlobalBar } from './PlatformGlobalBar';

// ─── Conteúdo da sidebar (compartilhado desktop/mobile) ──────
function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const { activeModuleDefinition, activeSection, setActiveSection } =
    usePlatformModule();

  const handleSelect = (id: string) => {
    setActiveSection(id);
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-5 py-5">
        <Logo size="lg" />
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Plataforma Nexvy
        </p>
      </div>

      {/* Navegação dirigida pelo módulo ativo */}
      <nav aria-label={`Navegação ${activeModuleDefinition.label}`} className="flex-1 space-y-2 overflow-y-auto px-3 py-5">
        {activeModuleDefinition.nav.map((group) => {
          // Grupo de topo (label null) — itens diretos, sem colapsável.
          if (group.label === null) {
            return (
              <div key={group.id} className="space-y-1">
                {group.items.map((item) => (
                  <NavButton
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    Icon={item.icon}
                    active={activeSection === item.id}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            );
          }

          // Grupo colapsável.
          const hasActive = group.items.some((it) => it.id === activeSection);
          return (
            <CollapsibleGroup
              key={group.id}
              label={group.label}
              defaultOpen={hasActive}
            >
              {group.items.map((item) => (
                <NavButton
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  Icon={item.icon}
                  active={activeSection === item.id}
                  onSelect={handleSelect}
                />
              ))}
            </CollapsibleGroup>
          );
        })}
      </nav>

    </div>
  );
}

// ─── Botão de item de nav (item ativo rosa = bg-primary) ─────
interface NavButtonProps {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: (id: string) => void;
}

function NavButton({ id, label, Icon, active, onSelect }: NavButtonProps) {
  return (
    <button
      onClick={() => onSelect(id)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200',
        active
          ? 'bg-primary/[0.09] text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      )}
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
      <span className="truncate">{label}</span>
    </button>
  );
}

// ─── Grupo colapsável ───────────────────────────────────────
interface CollapsibleGroupProps {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleGroup({
  label,
  defaultOpen = false,
  children,
}: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="pt-2">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground">
          <span>{label}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Sidebar responsiva ─────────────────────────────────────
export function PlatformSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <PlatformGlobalBar
          mobileLeading={
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          }
        />
        {/* Safe areas keep the drawer clear of iOS status and gesture bars. */}
        <SheetContent
          side="left"
          className="w-72 max-w-[85vw] p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        >
          <SidebarInner onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-border/70 bg-card/80 lg:flex">
        <SidebarInner />
      </aside>
    </>
  );
}

export default PlatformSidebar;
