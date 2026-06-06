/**
 * CompanyContext — agora baseado na sessão local (TenantAuthContext).
 * Compatibilidade: expõe { company, appConfig, user, isSuperAdmin, loading, authChecked }
 * para as páginas existentes não precisarem mudar.
 * "user" aqui é o CompanyUser (não o User Base44).
 */
import React, { createContext, useContext } from 'react';
import { useTenantAuth } from '@/context/TenantAuthContext';

const CompanyContext = createContext();

export const CompanyProvider = ({ children }) => {
  // AppConfig é carregado no TenantAuthContext não, então mantemos simples:
  // as páginas que precisam de appConfig (Master) lêem direto.
  const { company, companyUser, session, loading } = useTenantAuth();

  // Monta objeto "user" com shape compatível com o que as páginas esperam
  const user = companyUser && session ? {
    ...companyUser,
    company_id: session.company_id,
    full_name: companyUser.nome,
    email: companyUser.email,
  } : null;

  const contextValue = {
    company,
    appConfig: null,      // não mais necessário nas páginas de app
    user,
    isSuperAdmin: false,  // super admin é via /adminmaster (User Base44)
    loading,
    authChecked: !loading,
  };

  return (
    <CompanyContext.Provider value={contextValue}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompanyContext = () => {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompanyContext must be used within CompanyProvider');
  return context;
};