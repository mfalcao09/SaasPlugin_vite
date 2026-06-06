/**
 * useCompany — compatibilidade com páginas que usam este hook.
 * Agora delegado ao TenantAuthContext (sessão local).
 */
import { useTenantAuth } from '@/context/TenantAuthContext';

export function useCompany() {
  const { company, companyUser, session, loading, refreshCompany } = useTenantAuth();

  const user = companyUser && session ? {
    ...companyUser,
    company_id: session.company_id,
    full_name: companyUser.nome,
    email: companyUser.email,
  } : null;

  return {
    company,
    user,
    loading,
    error: null,
    refetch: refreshCompany,
  };
}