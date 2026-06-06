import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTenantAuth } from '@/context/TenantAuthContext';
import {
  LayoutDashboard, ShoppingBag, BookOpen, Users, Truck,
  DollarSign, BarChart3, Zap, Settings, LogOut, ChefHat,
  Menu, Users2
} from 'lucide-react';

const appNav = [
  { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Pedidos', path: '/app/pedidos', icon: ShoppingBag },
  { label: 'Cardápio', path: '/app/cardapio', icon: BookOpen },
  { label: 'Clientes', path: '/app/clientes', icon: Users },
  { label: 'Entregas', path: '/app/entregas', icon: Truck },
  { label: 'Financeiro', path: '/app/financeiro', icon: DollarSign },
  { label: 'Relatórios', path: '/app/relatorios', icon: BarChart3 },
  { label: 'IA Growth', path: '/app/ai-growth', icon: Zap },
  { label: 'Equipe', path: '/app/equipe', icon: Users2 },
  { label: 'Configurações', path: '/app/configuracoes', icon: Settings },
];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { company, companyUser, loading, isAuthenticated, logout } = useTenantAuth();

  useDocumentTitle(company ? `${company.name} | FoodControl AI` : 'FoodControl AI');

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-border">
        <Link to="/app/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm leading-none">FoodControl AI</p>
            {company && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-none truncate max-w-32">{company.name}</p>
            )}
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {appNav.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? 'bg-accent text-white'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-1">
        {companyUser && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-foreground truncate">{companyUser.nome || companyUser.email}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{companyUser.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium">Sair</span>
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#F8F7F3]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen bg-[#F8F7F3] font-inter overflow-hidden">
      {/* Sidebar Desktop */}
      <div className="hidden md:flex w-56 bg-white border-r border-border flex-col flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-white">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-border flex-shrink-0">
          <button onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
              <ChefHat className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-foreground text-sm">FoodControl AI</span>
          </div>
          <div className="w-5" />
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}