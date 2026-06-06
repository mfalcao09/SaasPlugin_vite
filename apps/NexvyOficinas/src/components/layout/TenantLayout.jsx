/**
 * Layout para rotas autenticadas dos tenants (usa sessão local, NÃO User Base44).
 */
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Car, FileText, ClipboardList,
  DollarSign, BarChart3, Brain, Settings, Shield, Menu, Zap, LogOut
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTenantAuth } from "@/lib/TenantAuthContext";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",         path: "/dashboard" },
  { icon: Users,           label: "Clientes",          path: "/clientes" },
  { icon: Car,             label: "Veículos",           path: "/veiculos" },
  { icon: FileText,        label: "Orçamentos",         path: "/orcamentos" },
  { icon: ClipboardList,   label: "Ordens de Serviço",  path: "/ordens" },
  { icon: DollarSign,      label: "Financeiro",         path: "/financeiro" },
  { icon: BarChart3,       label: "Relatórios",         path: "/relatorios" },
  { icon: Brain,           label: "AI Growth",          path: "/ai-growth", badge: "IA" },
];

const secondaryItems = [
  { icon: Users,    label: "Equipe",        path: "/equipe" },
  { icon: Settings, label: "Configurações", path: "/configuracoes" },
];

const SB = "var(--sidebar-bg)";
const SBR = "var(--sidebar-border)";

export default function TenantLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenantSession, tenantEmpresa, tenantLoading, tenantLogout } = useTenantAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!tenantLoading && !tenantSession) {
      navigate("/login");
    }
  }, [tenantLoading, tenantSession, navigate]);

  useEffect(() => {
    if (!tenantLoading && tenantSession?.forcar_troca_senha && location.pathname !== "/trocar-senha") {
      navigate("/trocar-senha");
    }
  }, [tenantLoading, tenantSession, location.pathname, navigate]);

  if (tenantLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "var(--surface)" }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--line)", borderTopColor: "var(--brand)" }} />
      </div>
    );
  }

  if (!tenantSession) return null;

  const isActive = (path) => location.pathname === path;

  const navLink = (item) => {
    const active = isActive(item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setSidebarOpen(false)}
        className="flex items-center gap-3 px-3 py-2 rounded-sm text-[13px] font-medium transition-all duration-150"
        style={{
          backgroundColor: active ? "var(--sidebar-item-active-bg)" : "transparent",
          color: active ? "#FFFFFF" : "var(--sidebar-text)",
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)"; e.currentTarget.style.color = "var(--sidebar-text-hover)"; } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--sidebar-text)"; } }}
      >
        <item.icon className="w-[15px] h-[15px] flex-shrink-0" />
        <span className="flex-1 leading-none">{item.label}</span>
        {item.badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wider"
            style={{ backgroundColor: active ? "rgba(255,255,255,0.15)" : "rgba(28,63,94,0.5)", color: active ? "#fff" : "#6A9CC0" }}>
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const handleLogout = () => {
    tenantLogout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--surface)" }}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col w-56 shrink-0 transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ backgroundColor: SB, borderRight: `1px solid ${SBR}` }}>

        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: `1px solid ${SBR}` }}>
          <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--brand)" }}>
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-white text-[13px] font-bold tracking-tight leading-none truncate">
              {tenantEmpresa?.nome || "AutoFlow AI"}
            </div>
            <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--sidebar-text)" }}>
              {tenantEmpresa?.slogan || "Painel Operacional"}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {navItems.map(navLink)}
          <div className="pt-4 pb-2 px-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#3E4252" }}>Sistema</div>
          </div>
          {secondaryItems.map(navLink)}
        </nav>

        {/* Role badge + Logout */}
        <div className="px-2 py-3" style={{ borderTop: `1px solid ${SBR}` }}>
          {tenantSession?.role && (
            <div className="px-3 pb-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--sidebar-text)" }}>
                {tenantSession.role}
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-sm w-full text-[13px] transition-all duration-150"
            style={{ color: "var(--sidebar-text)" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#F87171"; e.currentTarget.style.backgroundColor = "rgba(248,113,113,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--sidebar-text)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <LogOut className="w-[15px] h-[15px]" />
            <span>Sair da conta</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="flex items-center gap-3 px-5 py-0 h-12 shrink-0"
          style={{ backgroundColor: "var(--surface-raised)", borderBottom: "1px solid var(--line-soft)" }}>
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden" style={{ color: "var(--ink-muted)" }}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#22C55E" }} />
            <span className="text-[11px] font-medium tracking-wide" style={{ color: "var(--ink-muted)" }}>Sistema Ativo</span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}