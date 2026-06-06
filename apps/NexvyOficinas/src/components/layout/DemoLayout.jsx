import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Car, FileText, ClipboardList,
  DollarSign, BarChart3, Brain, Zap, Menu, ArrowLeft, ArrowRight
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",        path: "/demo/dashboard" },
  { icon: Users,           label: "Clientes",         path: "/demo/clientes" },
  { icon: Car,             label: "Veículos",         path: "/demo/veiculos" },
  { icon: FileText,        label: "Orçamentos",       path: "/demo/orcamentos" },
  { icon: ClipboardList,   label: "Ordens de Serviço",path: "/demo/ordens" },
  { icon: DollarSign,      label: "Financeiro",       path: "/demo/financeiro" },
  { icon: BarChart3,       label: "Relatórios",       path: "/demo/relatorios" },
  { icon: Brain,           label: "AI Growth",        path: "/demo/ai-growth", badge: "IA" },
];

const SB = "var(--sidebar-bg)";
const SBR = "var(--sidebar-border)";

export default function DemoLayout({ children }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--surface)" }}>

      {/* Demo top bar — refinado */}
      <div className="flex items-center justify-between px-4 sm:px-5 shrink-0 z-50 py-2"
        style={{ backgroundColor: "#0F1923", borderBottom: `1px solid #1E2A38` }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "#6A9CC0" }}>
              Demonstração
            </span>
            <span className="hidden sm:inline text-[11px]" style={{ color: "#3E4252" }}>·</span>
            <span className="hidden sm:inline text-[11px]" style={{ color: "#4A5568" }}>
              Dados fictícios para apresentação — não representam informações reais
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <a
            href="https://turbosaas.pro/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-all hover:opacity-90"
            style={{ backgroundColor: "var(--brand)", color: "white" }}
          >
            Quero este sistema
            <ArrowRight className="w-3 h-3" />
          </a>
          <a
            href="https://turbosaas.pro/"
            target="_blank"
            rel="noopener noreferrer"
            className="sm:hidden flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-sm"
            style={{ backgroundColor: "var(--brand)", color: "white" }}
          >
            Contratar
          </a>
          <Link to="/" className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-80 opacity-50 ml-1"
            style={{ color: "#8A8F9E" }}>
            <ArrowLeft className="w-3 h-3" />
            <span className="hidden sm:inline">LP</span>
          </Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar ── */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-40
          flex flex-col w-56 shrink-0
          transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `} style={{ backgroundColor: SB, borderRight: `1px solid ${SBR}` }}>

          {/* Brand */}
          <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: `1px solid ${SBR}` }}>
            <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "var(--brand)" }}>
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-white text-[13px] font-bold tracking-tight leading-none">AutoFlow AI</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--sidebar-text)" }}>Auto Center Supremo</div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
            {navItems.map(navLink)}
          </nav>

          {/* Demo status footer */}
          <div className="px-3 py-4" style={{ borderTop: `1px solid ${SBR}` }}>
            <div className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-amber-400" />
              <div>
                <div className="text-[11px] font-semibold text-white">DEMO ATIVO</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--sidebar-text)" }}>
                  Dados fictícios para apresentação
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Header */}
          <header className="flex items-center gap-3 px-5 h-12 shrink-0"
            style={{ backgroundColor: "var(--surface-raised)", borderBottom: "1px solid var(--line-soft)" }}>
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden" style={{ color: "var(--ink-muted)" }}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1" />
            <span className="hidden sm:inline text-[11px] font-medium" style={{ color: "var(--ink-muted)" }}>
              Auto Center Supremo
            </span>
            <Link to="/" className="text-[11px] font-semibold px-3 py-1.5 rounded-sm border transition-colors"
              style={{ borderColor: "var(--brand-line)", color: "var(--brand)", backgroundColor: "var(--brand-subtle)" }}>
              ← Ver LP
            </Link>
          </header>

          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}