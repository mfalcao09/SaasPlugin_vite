import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentAffiliate } from '@/hooks/useAffiliatePortal';
import { Loader2 } from 'lucide-react';

interface AffiliateRouteProps {
  children: React.ReactNode;
}

// Gate do portal do afiliado. Espelha SuperAdminRoute, mas o "papel" é a
// EXISTÊNCIA de uma linha em affiliates com user_id = auth.uid()
// (resolvida via RLS self em useCurrentAffiliate) — não um valor de enum.
export function AffiliateRoute({ children }: AffiliateRouteProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { data: affiliate, isLoading: affiliateLoading } = useCurrentAffiliate();

  if (authLoading || affiliateLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!affiliate) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
