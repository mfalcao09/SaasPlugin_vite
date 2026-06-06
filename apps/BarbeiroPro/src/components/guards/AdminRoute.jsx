import { Navigate } from 'react-router-dom';

export default function AdminRoute({ children }) {
  const session = (() => {
    try { return JSON.parse(localStorage.getItem('admin_session')); }
    catch { return null; }
  })();

  if (!session) return <Navigate to="/admin/login" replace />;

  // Se forçar troca de senha, redirecionar
  if (session.user?.forcar_troca_senha) return <Navigate to="/admin/trocar-senha" replace />;

  return children;
}