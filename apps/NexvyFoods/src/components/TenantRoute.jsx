/**
 * Wrapper que protege rotas /app/* exigindo sessão local (CompanyUser).
 * Redireciona para /login se não há sessão válida.
 */
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useTenantAuth } from '@/context/TenantAuthContext';

export default function TenantRoute({ children }) {
  const { isAuthenticated, loading } = useTenantAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#F8F7F3]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Se receber children (ex: <TenantRoute><AppLayout/></TenantRoute>) renderiza children
  // Se usado como wrapper de Route element, renderiza Outlet
  return children || <Outlet />;
}