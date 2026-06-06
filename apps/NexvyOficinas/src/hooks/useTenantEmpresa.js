/**
 * Hook bridge para páginas de tenant.
 * Retorna empresaId e empresa a partir da sessão local (TenantAuthContext).
 * Substitui useEmpresa nas rotas de tenant.
 */
import { useTenantAuth } from "@/lib/TenantAuthContext";

export function useTenantEmpresa() {
  const { tenantSession, tenantEmpresa, tenantLoading } = useTenantAuth();
  return {
    empresa: tenantEmpresa,
    empresaId: tenantSession?.empresa_id || null,
    loading: tenantLoading,
    role: tenantSession?.role || null,
  };
}