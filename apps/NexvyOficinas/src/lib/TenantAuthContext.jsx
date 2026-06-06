/**
 * Context de autenticação local dos tenants (EmpresaUser + sessão localStorage).
 * Provê: tenantUser, tenantEmpresa, tenantLoading, tenantLogin, tenantLogout
 */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { getSession, clearSession, saveSession } from "@/lib/tenantAuth";

const TenantAuthContext = createContext(null);

export function TenantAuthProvider({ children }) {
  const [tenantSession, setTenantSession] = useState(null);
  const [tenantEmpresa, setTenantEmpresa] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(true);

  const loadSession = useCallback(async () => {
    setTenantLoading(true);
    const session = getSession();
    if (!session) {
      setTenantSession(null);
      setTenantEmpresa(null);
      setTenantLoading(false);
      return;
    }
    setTenantSession(session);
    try {
      const empresas = await base44.entities.Empresa.list();
      const emp = empresas.find(e => e.id === session.empresa_id);
      setTenantEmpresa(emp || null);
    } catch {
      setTenantEmpresa(null);
    }
    setTenantLoading(false);
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  const tenantLogin = useCallback((sessionData, empresa) => {
    saveSession(sessionData);
    setTenantSession(sessionData);
    setTenantEmpresa(empresa);
  }, []);

  const tenantLogout = useCallback(() => {
    clearSession();
    setTenantSession(null);
    setTenantEmpresa(null);
  }, []);

  return (
    <TenantAuthContext.Provider value={{
      tenantSession,
      tenantEmpresa,
      tenantLoading,
      tenantLogin,
      tenantLogout,
      reloadSession: loadSession,
    }}>
      {children}
    </TenantAuthContext.Provider>
  );
}

export function useTenantAuth() {
  const ctx = useContext(TenantAuthContext);
  if (!ctx) throw new Error("useTenantAuth must be used inside TenantAuthProvider");
  return ctx;
}