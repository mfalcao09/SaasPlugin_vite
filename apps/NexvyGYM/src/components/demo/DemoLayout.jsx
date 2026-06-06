import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import {
  LayoutDashboard, Users, CreditCard, CheckSquare,
  DollarSign, BarChart3, Zap, Dumbbell, ChevronLeft,
  ChevronRight, ArrowLeft, Play
} from "lucide-react";
import { cn } from "@/lib/utils";

const demoNav = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/demo/dashboard" },
  { icon: Users, label: "Alunos", path: "/demo/alunos" },
  { icon: CreditCard, label: "Planos", path: "/demo/planos" },
  { icon: CheckSquare, label: "Check-ins", path: "/demo/checkins" },
  { icon: DollarSign, label: "Financeiro", path: "/demo/financeiro" },
  { icon: BarChart3, label: "Relatórios", path: "/demo/relatorios" },
  { icon: Zap, label: "AI Growth", path: "/demo/ai-growth" },
];

export default function DemoLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex font-inter">
      {/* Demo Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 h-full bg-[#0D0D0F] border-r border-gym-border flex flex-col transition-all duration-300 z-40",
        collapsed ? "w-16" : "w-60"
      )}>
        {/* Logo */}
        <div className={cn("flex items-center h-16 px-4 border-b border-gym-border", collapsed ? "justify-center" : "gap-3")}>
          <div className="w-8 h-8 bg-gym-orange rounded-lg flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div>
              <div className="text-sm font-bold text-white leading-tight">GymBoss <span className="text-gym-orange">AI</span></div>
              <div className="text-[10px] text-gym-subtle uppercase tracking-widest">Demonstração</div>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="space-y-0.5 px-2">
            {demoNav.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group",
                    active ? "bg-gym-orange/15 text-gym-orange font-semibold border-l-2 border-gym-orange" : "text-gym-muted hover:text-white hover:bg-white/5"
                  )}>
                  <item.icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-gym-orange" : "text-gym-subtle group-hover:text-white")} />
                  {!collapsed && <span>{item.label}</span>}
                  {item.label === "AI Growth" && !collapsed && (
                    <span className="ml-auto text-[9px] bg-gym-orange text-white px-1.5 py-0.5 rounded-full font-bold">IA</span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* CTA */}
        {!collapsed && (
          <div className="px-3 py-3 border-t border-gym-border">
            <Link to="/"
              className="flex items-center gap-2 text-xs text-gym-muted hover:text-white py-2 px-3 rounded-lg hover:bg-white/5 transition-all">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar à página inicial
            </Link>
          </div>
        )}

        <div className="px-2 pb-4">
          <button onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-2 rounded-lg text-gym-subtle hover:text-white hover:bg-white/5 transition-all">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={cn("flex-1 flex flex-col min-h-screen transition-all duration-300", collapsed ? "ml-16" : "ml-60")}>
        {/* Demo banner */}
        <div className="bg-[#1A1410] border-b border-gym-orange/30 px-6 py-2.5 flex items-center justify-between gap-4 flex-shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-gym-orange animate-pulse flex-shrink-0" />
            <span className="text-xs font-bold text-gym-orange uppercase tracking-wide flex-shrink-0">Modo Demonstração</span>
            <span className="text-xs text-[#9B8F7E] hidden sm:block truncate">— Todas as informações exibidas são fictícias e ilustrativas. Nenhum dado real é acessado.</span>
          </div>
          <a href="https://turbosaas.pro/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-gym-orange hover:bg-gym-orange-light px-3 py-1.5 rounded-lg transition-all flex-shrink-0 whitespace-nowrap">
            <Play className="w-3 h-3" /> Quero contratar
          </a>
        </div>

        <main className="flex-1 p-6 overflow-auto animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}