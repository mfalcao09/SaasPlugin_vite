import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, CreditCard, CheckSquare, Calendar,
  DollarSign, BarChart3, Settings, Zap, Shield,
  ChevronLeft, ChevronRight, Dumbbell, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard",       path: "/app/dashboard"     },
  { icon: Users,           label: "Alunos",          path: "/app/alunos"        },
  { icon: CreditCard,      label: "Planos",          path: "/app/planos"        },
  { icon: CheckSquare,     label: "Check-ins",       path: "/app/checkins"      },
  { icon: Calendar,        label: "Agenda",          path: "/app/agenda"        },
  { icon: DollarSign,      label: "Financeiro",      path: "/app/financeiro"    },
  { icon: BarChart3,       label: "Relatórios",      path: "/app/relatorios"    },
  { icon: UserCheck,       label: "Equipe",          path: "/app/equipe"        },
  { icon: Zap,             label: "AI Growth Engine",path: "/app/ai-growth",  badge: "IA" },
  { icon: Settings,        label: "Configurações",   path: "/app/configuracoes" },
];

export default function Sidebar({ collapsed, onToggle, academyName, demo, viewingAsAdmin }) {
  const location = useLocation();
  // Compara desconsiderando query params
  const currentPath = location.pathname;

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full bg-[#1A1410] border-r border-[#2A2420] flex flex-col transition-all duration-300 z-40",
      collapsed ? "w-16" : "w-60"
    )}>
      {/* Logo / Academia */}
      <div className={cn(
        "flex items-center h-16 px-4 border-b border-[#2A2420]",
        collapsed ? "justify-center" : "gap-3"
      )}>
        <div className="w-8 h-8 bg-gym-orange rounded-lg flex items-center justify-center flex-shrink-0">
          <Dumbbell className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-bold text-white leading-tight truncate">
              {academyName || "GymBoss AI"}
            </div>
            <div className="text-[10px] text-[#9B8F7E] uppercase tracking-widest font-medium">
              Academy OS
            </div>
          </div>
        )}
      </div>

      {/* Banner demo */}
      {demo && !collapsed && (
        <div className="mx-2 mt-2 px-2 py-1 rounded-lg bg-gym-yellow/10 border border-gym-yellow/20">
          <p className="text-[9px] text-gym-yellow font-semibold uppercase tracking-wide text-center">Demo Mode</p>
        </div>
      )}

      {/* Banner super admin viewing */}
      {viewingAsAdmin && !collapsed && (
        <div className="mx-2 mt-2 px-2 py-1 rounded-lg bg-gym-purple/10 border border-gym-purple/20">
          <p className="text-[9px] text-gym-purple font-semibold uppercase tracking-wide text-center">Super Admin View</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = currentPath === item.path || currentPath.startsWith(item.path + "?");
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                  active
                    ? "bg-gym-orange text-white font-semibold"
                    : "text-[#9B8F7E] hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="truncate flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] bg-white text-gym-orange px-1.5 py-0.5 rounded-full font-bold">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Voltar ao Master (visível apenas quando super admin navega via ?slug=) */}
      {viewingAsAdmin && (
        <div className="px-2 pb-2 border-t border-[#2A2420] pt-2">
          <Link
            to="/master"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-gym-orange border border-gym-orange/20 bg-gym-orange/8 hover:bg-gym-orange/15 transition-all"
          >
            <Shield className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span className="font-medium">← Voltar ao Master</span>}
          </Link>
        </div>
      )}

      {/* Colapsar */}
      <div className="px-2 pb-4 border-t border-[#2A2420]/50 pt-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 rounded-lg text-[#9B8F7E] hover:text-white hover:bg-white/5 transition-all"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}