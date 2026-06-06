import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertCircle, ChefHat, LayoutDashboard, ShoppingBag, BookOpen, Users, Truck, DollarSign, BarChart3, Zap, X } from 'lucide-react';

const demoNav = [
  { label: 'Dashboard', path: '/demo/dashboard', icon: LayoutDashboard },
  { label: 'Pedidos', path: '/demo/pedidos', icon: ShoppingBag },
  { label: 'Cardápio', path: '/demo/cardapio', icon: BookOpen },
  { label: 'Clientes', path: '/demo/clientes', icon: Users },
  { label: 'Entregas', path: '/demo/entregas', icon: Truck },
  { label: 'Financeiro', path: '/demo/financeiro', icon: DollarSign },
  { label: 'Relatórios', path: '/demo/relatorios', icon: BarChart3 },
  { label: 'IA Growth', path: '/demo/ai-growth', icon: Zap },
];

export default function DemoMode({ children }) {
  const location = useLocation();
  const [bannerVisible, setBannerVisible] = useState(true);

  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter">
      {/* Demo Banner */}
      {bannerVisible && (
        <div className="bg-foreground text-background sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="text-sm font-medium">Modo Demonstração — Dados fictícios para fins de apresentação</span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://turbosaas.pro/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Contratar Sistema
              </a>
              <button onClick={() => setBannerVisible(false)} className="text-white/50 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App Shell */}
      <div className="flex h-screen overflow-hidden" style={{ height: bannerVisible ? 'calc(100vh - 41px)' : '100vh' }}>
        {/* Sidebar */}
        <div className="w-56 bg-white border-r border-border flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-5 border-b border-border">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                <ChefHat className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-foreground text-sm">FoodControl AI</span>
            </Link>
            <div className="mt-3 px-2 py-1.5 bg-accent/10 border border-accent/20 rounded-lg">
              <p className="text-xs font-medium text-accent">Hamburgueria do Zé</p>
              <p className="text-xs text-muted-foreground">Demo · SP</p>
            </div>
          </div>

          <nav className="p-3 space-y-1 flex-1">
            {demoNav.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
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

          <div className="p-4 border-t border-border">
            <Link to="/">
              <button className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-left">
                ← Voltar à LP
              </button>
            </Link>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}