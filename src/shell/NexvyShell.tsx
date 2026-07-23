// ═══════════════════════════════════════════════════════════════════════════
// NEXVY UI TEMPLATE · shell/NexvyShell.tsx
// SHELL DESKTOP COLAPSÁVEL — genericização do platform-shell do NexvyBeauty
// (PlatformShell + PlatformSidebar + PlatformModuleSwitcher + PlatformProductSwitcher).
//
// O QUE FOI REMOVIDO na genericização (era acoplamento NexvyBeauty):
//   • useAuth / signOut / papéis  → prop `footerActions` + `onSignOut`
//   • react-router (Link/useNavigate) → callbacks (onSectionChange, footer links)
//   • Supabase / tabelas de produto → o registry e o productSwitcher vêm por prop
//   • next-themes                 → props `isDark` + `onToggleTheme`
//
// DEPS EXTERNAS: react, lucide-react, tailwind (+ tokens/themes.css e o preset).
//   shadcn/ui é RECOMENDADO (Sheet p/ mobile, Tooltip no rail colapsado), mas
//   esta shell é SELF-CONTAINED: usa só React state + <button> + lucide + tokens.
//   O `cn` vem de ./types (clsx + tailwind-merge).
//
// Todas as cores são token-only (bg-sidebar, text-primary, border-border…) →
// host-aware: o mesmo componente vira Beauty Rosé (app.*) ou Nexvy Lux (gestao.*)
// só pela CLASSE no <html>. NUNCA hardcode hue aqui.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Moon,
  Sun,
} from 'lucide-react';
import { cn, type NexvyModule, type NexvyNavGroup, type NexvyNavItem } from './types';

// ─── Props da shell ─────────────────────────────────────────────────────────
export interface NexvyShellProps {
  /** Registry de módulos (>1 ativa o switcher; 1 = switcher oculto). */
  modules: NexvyModule[];
  activeModuleId: string;
  onModuleChange: (id: string) => void;
  /** Seção ativa dentro do módulo corrente + callback de troca. */
  activeSection: string;
  onSectionChange: (id: string) => void;

  /** Marca no topo (logo/nome). */
  brand?: ReactNode;
  /** Slot no header da sidebar (ex.: <ProductSwitcher/>). */
  headerSlot?: ReactNode;
  /** Ações no rodapé da sidebar (ex.: "Voltar", "Sair"). */
  footerActions?: ReactNode;

  /** Tema escuro atual + toggle (opcional — mostra o botão sol/lua). */
  isDark?: boolean;
  onToggleTheme?: () => void;

  /** Título/subtítulo da top bar do conteúdo. Se ausentes, usa o item ativo. */
  title?: string;
  subtitle?: string;

  /** Conteúdo. Se omitido, a shell renderiza `activeNavItem.render()`. */
  children?: ReactNode;
}

// ─── Helpers de registry ────────────────────────────────────────────────────
function findModule(mods: NexvyModule[], id: string): NexvyModule {
  return mods.find((m) => m.id === id) ?? mods[0];
}
function findNavItem(mod: NexvyModule, sectionId: string): NexvyNavItem | undefined {
  for (const g of mod.nav) {
    const hit = g.items.find((it) => it.id === sectionId);
    if (hit) return hit;
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shell raiz
// ═══════════════════════════════════════════════════════════════════════════
export function NexvyShell(props: NexvyShellProps) {
  const {
    modules,
    activeModuleId,
    activeSection,
    title,
    subtitle,
    children,
  } = props;

  const [collapsed, setCollapsed] = useState(false);
  const activeModule = findModule(modules, activeModuleId);
  const activeItem = findNavItem(activeModule, activeSection);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <NexvySidebar {...props} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <NexvyTopBar
          title={title ?? activeItem?.label ?? activeModule.label}
          subtitle={subtitle ?? activeModule.label}
        />
        <div className="p-4 sm:p-6">
          {children ?? activeItem?.render?.() ?? null}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sidebar colapsável (rail w-16 ↔ w-64) — item ativo = bg-primary sólido
// ═══════════════════════════════════════════════════════════════════════════
interface SidebarProps extends NexvyShellProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function NexvySidebar(props: SidebarProps) {
  const {
    modules,
    activeModuleId,
    onModuleChange,
    activeSection,
    onSectionChange,
    brand,
    headerSlot,
    footerActions,
    isDark,
    onToggleTheme,
    collapsed,
    onToggleCollapsed,
  } = props;

  const activeModule = findModule(modules, activeModuleId);
  const multiModule = modules.length > 1;

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-in-out lg:flex',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Header: switcher (multi-módulo) + identidade + toggle de rail */}
      <div className="flex items-center gap-2 border-b border-sidebar-border p-4">
        {multiModule && (
          <NexvyModuleSwitcher
            modules={modules}
            activeModuleId={activeModuleId}
            onModuleChange={onModuleChange}
          />
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            {brand ?? (
              <>
                <h1 className="truncate text-sm font-bold text-sidebar-foreground">
                  {activeModule.label}
                </h1>
                {activeModule.description && (
                  <p className="truncate text-xs text-muted-foreground">
                    {activeModule.description}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Slot do header (ex.: seletor de produto) — oculto no rail colapsado */}
      {headerSlot && !collapsed && (
        <div className="border-b border-sidebar-border p-3">{headerSlot}</div>
      )}

      {/* Navegação dirigida pelo módulo ativo */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {activeModule.nav.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            activeSection={activeSection}
            onSelect={onSectionChange}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Rodapé: ações do consumidor + toggle de tema */}
      <div className="space-y-2 border-t border-sidebar-border p-3">
        {!collapsed && footerActions}
        {onToggleTheme && (
          <div className={cn('flex items-center px-1 py-1', collapsed ? 'justify-center' : 'justify-between')}>
            {!collapsed && <span className="text-xs text-muted-foreground">Tema</span>}
            <button
              onClick={onToggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Alternar tema"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Grupo de nav: flat (label null) ou colapsável (accordion) ───────────────
function NavGroup({
  group,
  activeSection,
  onSelect,
  collapsed,
}: {
  group: NexvyNavGroup;
  activeSection: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
}) {
  const hasActive = group.items.some((it) => it.id === activeSection);
  const [open, setOpen] = useState(hasActive);

  const items = (
    <div className="space-y-1">
      {group.items.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          active={activeSection === item.id}
          onSelect={onSelect}
          collapsed={collapsed}
        />
      ))}
    </div>
  );

  // Grupo de topo (sem cabeçalho) OU rail colapsado (esconde labels de grupo).
  if (group.label === null || collapsed) return items;

  return (
    <div className="pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-sidebar-foreground"
      >
        <span>{group.label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-1">{items}</div>}
    </div>
  );
}

// ─── Botão de item (ativo = bg-primary sólido) ───────────────────────────────
function NavButton({
  item,
  active,
  onSelect,
  collapsed,
}: {
  item: NexvyNavItem;
  active: boolean;
  onSelect: (id: string) => void;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onSelect(item.id)}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge != null && item.badge > 0 && (
        <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          {item.badge}
        </span>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Module switcher — popover em grid (padrão PlatformModuleSwitcher).
// Implementado sem shadcn Popover: <button> + painel absoluto + backdrop.
// ═══════════════════════════════════════════════════════════════════════════
export function NexvyModuleSwitcher({
  modules,
  activeModuleId,
  onModuleChange,
}: {
  modules: NexvyModule[];
  activeModuleId: string;
  onModuleChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Trocar módulo"
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
          'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && 'bg-sidebar-accent text-sidebar-foreground',
        )}
      >
        <LayoutGrid className="h-5 w-5" />
      </button>

      {open && (
        <>
          {/* backdrop p/ fechar ao clicar fora */}
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-12 z-50 w-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
            <div className="border-b border-border px-4 py-3">
              <h4 className="text-sm font-semibold text-foreground">Módulos</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Alterne entre as áreas da plataforma
              </p>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 gap-1">
                {modules.map((mod) => {
                  const Icon = mod.icon;
                  const isActive = activeModuleId === mod.id;
                  return (
                    <button
                      key={mod.id}
                      onClick={() => {
                        onModuleChange(mod.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg px-2 py-3 text-center transition-all duration-200',
                        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive && 'bg-primary/5 ring-1 ring-primary/20',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-xl text-white transition-all duration-200',
                          mod.color ?? 'bg-primary',
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
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Top bar do conteúdo (título + subtítulo) — h-14, densidade Lux/Rosé.
// ═══════════════════════════════════════════════════════════════════════════
export function NexvyTopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export default NexvyShell;
