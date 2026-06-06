import { useAuth } from '@/lib/AuthContext';
import { Navigate } from 'react-router-dom';

export default function SuperAdminRoute({ children }) {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings, isSuperAdmin, navigateToLogin } = useAuth();

  if (isLoadingAuth || isLoadingPublicSettings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#F8F7F3]">
        <div className="w-8 h-8 border-4 border-[#1B3A4B]/20 border-t-[#1B3A4B] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return children;
}