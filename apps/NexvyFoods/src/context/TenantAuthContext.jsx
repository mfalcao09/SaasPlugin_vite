/**
 * Contexto de autenticação interna dos tenants (CompanyUser + localStorage).
 * Usado por todas as rotas /app/* e /login, /trocar-senha, etc.
 * NÃO usa User Base44 — apenas /adminmaster usa o OAuth Base44.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getSession, clearSession } from '@/lib/auth-local';

const TenantAuthContext = createContext();

export const TenantAuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [company, setCompany] = useState(null);
  const [companyUser, setCompanyUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadFromSession = async (sess) => {
    if (!sess) {
      setSession(null);
      setCompany(null);
      setCompanyUser(null);
      setLoading(false);
      return;
    }
    try {
      const [companies, users] = await Promise.all([
        base44.entities.Company.filter({ id: sess.company_id }),
        base44.entities.CompanyUser.filter({ id: sess.company_user_id }),
      ]);
      setCompany(companies[0] || null);
      setCompanyUser(users[0] || null);
      setSession(sess);
    } catch (e) {
      console.error('TenantAuthContext load error:', e);
      clearSession();
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFromSession(getSession());
  }, []);

  const refreshCompany = async () => {
    if (!session?.company_id) return;
    const companies = await base44.entities.Company.filter({ id: session.company_id });
    setCompany(companies[0] || null);
  };

  const logout = () => {
    clearSession();
    setSession(null);
    setCompany(null);
    setCompanyUser(null);
    window.location.href = '/login';
  };

  return (
    <TenantAuthContext.Provider value={{
      session,
      company,
      companyUser,
      loading,
      isAuthenticated: !!session,
      setSession: loadFromSession,
      refreshCompany,
      logout,
    }}>
      {children}
    </TenantAuthContext.Provider>
  );
};

export const useTenantAuth = () => {
  const ctx = useContext(TenantAuthContext);
  if (!ctx) throw new Error('useTenantAuth must be used within TenantAuthProvider');
  return ctx;
};