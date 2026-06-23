import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  MessageSquareWarning,
  FolderOpen,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  Package,
  Users,
  CheckSquare,
  DollarSign,
  Shield,
  MessageSquare,
  Scissors,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/Logo';
import { Tables } from '@/integrations/supabase/types';
import { prefetchIndexTab } from '@/pages/Index';

type DBProduct = Tables<'products'>;

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedProduct?: DBProduct | null;
  hasMultipleProducts?: boolean;
  onBackToProducts?: () => void;
  assignedProducts?: DBProduct[];
  onSelectProduct?: (product: DBProduct) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

// Tabs do CRM AGRUPADOS em seções (coesão com o UnifiedShell). Mantêm o
// mecanismo de tabs (onTabChange) — re-skin preservando comportamento.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Pipeline',
    items: [
      { id: 'product-dashboard', label: 'Visão Geral', icon: LayoutDashboard },
      { id: 'leads', label: 'Pipeline', icon: Users },
      { id: 'inbox', label: 'Conversas', icon: MessageSquare },
      { id: 'tasks', label: 'Tarefas', icon: CheckSquare },
    ],
  },
  {
    title: 'Operação',
    items: [
      { id: 'financial', label: 'Financeiro', icon: DollarSign },
      { id: 'cadence', label: 'Cadência', icon: Calendar },
    ],
  },
  {
    title: 'Conteúdo',
    items: [
      { id: 'playbook', label: 'Playbook', icon: BookOpen },
      { id: 'objections', label: 'Objeções', icon: MessageSquareWarning },
      { id: 'materials', label: 'Materiais', icon: FolderOpen },
    ],
  },
  {
    title: 'IA',
    items: [{ id: 'ai', label: 'IA Copiloto', icon: Bot }],
  },
];

// Estilo de item idêntico ao UnifiedShell (ativo = primary sólido).
const itemClass = (active: boolean) =>
  cn(
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    active
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
  );

export function Sidebar({
  activeTab,
  onTabChange,
  selectedProduct,
  assignedProducts = [],
  onSelectProduct,
  onCollapsedChange,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { isAdmin, isManager, isSuperAdmin } = useAuth();
  const showAdminLink = isAdmin() || isManager();
  const showSuperAdminLink = isSuperAdmin();

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      onCollapsedChange?.(next);
      return next;
    });
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out',
        'bg-sidebar border-r border-sidebar-border flex flex-col',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Marca + toggle */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && <Logo size="md" />}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {/* Hub de Módulos (home) */}
        <Link to="/" className={itemClass(false)}>
          <LayoutGrid className="h-4 w-4 shrink-0 text-primary" />
          {!collapsed && <span className="truncate">Hub de Módulos</span>}
        </Link>

        {selectedProduct &&
          NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              {!collapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.title}
                </p>
              )}
              {group.items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  onMouseEnter={() => prefetchIndexTab(id)}
                  onTouchStart={() => prefetchIndexTab(id)}
                  onFocus={() => prefetchIndexTab(id)}
                  title={collapsed ? label : undefined}
                  className={itemClass(activeTab === id)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </button>
              ))}
            </div>
          ))}

        {/* Lista de produtos atribuídos quando nenhum está selecionado */}
        {!selectedProduct && !collapsed && (
          <div className="px-1 py-2">
            {assignedProducts.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <Package className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum produto atribuído</p>
              </div>
            ) : (
              <>
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Meus Produtos
                </p>
                <div className="space-y-1">
                  {assignedProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => onSelectProduct?.(product)}
                      className={itemClass(false)}
                    >
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{product.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </nav>

      {/* Ações inferiores */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        <Link to="/salao" className={itemClass(false)} title={collapsed ? 'ERP Salão' : undefined}>
          <Scissors className="h-4 w-4 shrink-0 text-pink-400" />
          {!collapsed && <span className="truncate">ERP Salão</span>}
        </Link>
        {showSuperAdminLink && (
          <Link to="/super-admin" className={itemClass(false)} title={collapsed ? 'Super Admin' : undefined}>
            <Shield className="h-4 w-4 shrink-0 text-violet-400" />
            {!collapsed && <span className="truncate">Super Admin</span>}
          </Link>
        )}
        {showAdminLink && (
          <Link to="/admin" className={itemClass(false)} title={collapsed ? 'Painel Admin' : undefined}>
            <Shield className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">Painel Admin</span>}
          </Link>
        )}
        <Link to="/configuracoes" className={itemClass(false)} title={collapsed ? 'Configurações' : undefined}>
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">Configurações</span>}
        </Link>
      </div>
    </aside>
  );
}
