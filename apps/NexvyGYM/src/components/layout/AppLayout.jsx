import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { isDemoMode, setDemoMode } from "@/lib/demoMode";
import { demoAcademy } from "@/lib/demoData";
import { cn } from "@/lib/utils";
import { AcademyProvider, useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";

const PAGE_TITLES = {
  "dashboard": "Dashboard",
  "alunos": "Alunos",
  "planos": "Planos & Modalidades",
  "checkins": "Check-ins & Frequência",
  "agenda": "Agenda & Avaliações",
  "financeiro": "Financeiro",
  "relatorios": "Relatórios",
  "equipe": "Equipe & Acessos",
  "ai-growth": "AI Growth Engine",
  "configuracoes": "Configurações",
};

function AppLayoutInner() {
  const [collapsed, setCollapsed] = useState(false);
  const [demo, setDemo] = useState(isDemoMode());
  const location = useLocation();
  const navigate = useNavigate();
  const { academy, loading, notFound, isSuperAdmin, viewingAsAdmin } = useAcademy();

  // Extrai o último segmento do path para lookup no mapa de títulos
  const segment = location.pathname.split("/").filter(Boolean).pop() || "dashboard";
  const title = PAGE_TITLES[segment] || "GymBoss AI";
  const academyName = demo ? demoAcademy.name : (academy?.name || "Minha Academia");

  function handleDemoToggle() {
    setDemoMode(!demo);
    setDemo(!demo);
    window.location.href = "/app/dashboard";
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-gym-orange rounded-xl flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-xl">G</span>
          </div>
          <div className="w-6 h-6 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
          <p className="text-gym-muted text-sm">Carregando academia...</p>
        </div>
      </div>
    );
  }

  // ─── Academia não encontrada ──────────────────────────────────────────────
  if (notFound && !academy) {
    if (isSuperAdmin) {
      // Super admin sem academia própria → redireciona para Master Panel
      navigate("/master", { replace: true });
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
          <div className="w-6 h-6 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin" />
        </div>
      );
    }
    // Usuário comum sem academia vinculada
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="text-center p-6 max-w-sm">
          <div className="w-14 h-14 bg-gym-yellow/12 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🏫</span>
          </div>
          <h2 className="text-xl font-bold text-gym-text mb-2">Conta não vinculada</h2>
          <p className="text-gym-muted text-sm mb-6">
            Sua conta não está vinculada a nenhuma academia. Entre em contato com o administrador.
          </p>
          <button
            onClick={() => base44.auth.logout("/")}
            className="bg-gym-orange text-white font-semibold px-6 py-3 rounded-xl hover:bg-gym-orange-light transition-all w-full"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  // ─── Layout principal ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gym-surface flex font-inter">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        academyName={academyName}
        demo={demo}
        viewingAsAdmin={viewingAsAdmin}
      />
      <div className={cn(
        "flex-1 flex flex-col min-h-screen transition-all duration-300",
        collapsed ? "ml-16" : "ml-60"
      )}>
        <Header title={title} demo={demo} onDemoToggle={handleDemoToggle} />
        <main className="flex-1 p-6 overflow-auto animate-fade-in bg-gym-surface">
          <Outlet context={{ demo, academy }} />
        </main>
      </div>
    </div>
  );
}

export default function AppLayout() {
  return (
    <AcademyProvider>
      <AppLayoutInner />
    </AcademyProvider>
  );
}