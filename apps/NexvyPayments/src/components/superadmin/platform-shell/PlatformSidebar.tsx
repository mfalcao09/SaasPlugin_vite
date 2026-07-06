import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  LogOut,
  Moon,
  Sun,
  Menu,
  ChevronDown,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/Logo';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PlatformModuleSwitcher } from './PlatformModuleSwitcher';
import { usePlatformModule } from './usePlatformModule';

// ─── Conteúdo da sidebar (compartilhado desktop/mobile) ──────
function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { activeModuleDefinition, activeSection, setActiveSection } =
    usePlatformModule();

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      onNavigate?.();
      navigate('/login', { replace: true });
    }
  };

  const handleSelect = (id: string) => {
    setActiveSection(id);
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header — switcher + identidade do módulo */}
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <PlatformModuleSwitcher />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-foreground">
              {activeModuleDefinition.label}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {activeModuleDefinition.description}
            </p>
          </div>
        </div>
      </div>

      {/* Navegação dirigida pelo módulo ativo */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
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

      {/* Footer */}
      <div className="space-y-2 border-t border-border p-3">
        <Link
          to="/"
          onClick={() => {
            try {
              sessionStorage.setItem('skip_super_admin_redirect', '1');
            } catch {
              // sessionStorage indisponível
            }
            onNavigate?.();
          }}
        >
          <Button variant="ghost" className="w-full justify-start gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao App
          </Button>
        </Link>

        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-muted-foreground">v1.0</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
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
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
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
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="pt-2">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
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
  const { activeModuleDefinition, activeNavItem } = usePlatformModule();

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b border-border bg-card px-3 pt-[env(safe-area-inset-top)] lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
            <SidebarInner onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 items-center gap-2">
          <Logo size="sm" />
          <span className="truncate text-sm font-semibold text-foreground">
            {activeNavItem?.label ?? activeModuleDefinition.label}
          </span>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-border bg-card lg:flex">
        <SidebarInner />
      </aside>
    </>
  );
}

export default PlatformSidebar;
