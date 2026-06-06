import { Bell, Zap, Shield, LogOut } from "lucide-react";
import { useAcademy } from "@/lib/AcademyContext";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export default function Header({ title, actions, demo, onDemoToggle }) {
  const { user, viewingAsAdmin, academy } = useAcademy();
  const initials = user?.full_name
    ? user.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <>
      {/* Faixa demo */}
      {demo && (
        <div className="bg-gym-yellow/15 border-b border-gym-yellow/30 px-6 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-gym-yellow" />
            <span className="text-xs text-gym-yellow font-semibold tracking-wide">
              ⚡ MODO DEMONSTRAÇÃO ATIVO — dados fictícios para apresentação
            </span>
          </div>
          <button
            onClick={onDemoToggle}
            className="text-xs text-gym-yellow/70 hover:text-gym-yellow underline transition-colors"
          >
            Alternar para modo real
          </button>
        </div>
      )}

      {/* Faixa super admin viewing */}
      {viewingAsAdmin && (
        <div className="bg-gym-purple/10 border-b border-gym-purple/20 px-6 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-gym-purple" />
            <span className="text-xs text-gym-purple font-semibold tracking-wide">
              Super Admin — visualizando: <strong>{academy?.name}</strong>
            </span>
          </div>
        </div>
      )}

      <header className="h-16 bg-white border-b border-gym-border flex items-center justify-between px-6 shadow-sm">
        <h1 className="text-xl font-bold text-gym-text">{title}</h1>
        <div className="flex items-center gap-3">
          {actions}
          <button className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gym-surface text-gym-muted hover:text-gym-text transition-all">
            <Bell className="w-4 h-4" />
          </button>
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-gym-border">
              <div className="w-8 h-8 rounded-full bg-gym-orange flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {initials}
              </div>
              {user.full_name && (
                <span className="text-sm text-gym-text font-medium hidden md:block">{user.full_name.split(" ")[0]}</span>
              )}
              <button
                onClick={() => base44.auth.logout("/")}
                title="Sair"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gym-surface text-gym-muted hover:text-gym-text transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>
    </>
  );
}