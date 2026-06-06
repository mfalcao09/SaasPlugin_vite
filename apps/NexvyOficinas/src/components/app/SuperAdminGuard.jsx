/**
 * Guard que verifica se o usuário é super admin
 * Usa o helper isSuperAdmin que verifica se o email está em AppConfig.super_admin_emails
 */
import { useAuth } from "@/lib/AuthContext";
import { useEmpresa } from "@/hooks/useEmpresa";
import { isSuperAdmin } from "@/lib/isSuperAdmin";
import { Loader2 } from "lucide-react";

export default function SuperAdminGuard({ children }) {
  const { user, isLoadingAuth } = useAuth();
  const { appConfig, loading: loadingEmpresa } = useEmpresa();

  if (isLoadingAuth || loadingEmpresa) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} /></div>;
  }

  if (!isSuperAdmin(user, appConfig)) {
    return (
      <div className="p-6 rounded border" style={{ backgroundColor: "var(--status-red-bg)", borderColor: "var(--status-red-fg)" }}>
        <p className="text-sm font-bold" style={{ color: "var(--status-red-fg)" }}>Acesso Restrito</p>
        <p className="text-xs mt-1" style={{ color: "var(--status-red-fg)" }}>Apenas super admins podem acessar o Painel Master.</p>
      </div>
    );
  }

  return children;
}