import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export function useSuperAdmin() {
  const { user, isAuthenticated } = useAuth();

  const { data: appConfigs = [], isLoading } = useQuery({
    queryKey: ['appConfig'],
    queryFn: () => base44.entities.AppConfig.list(),
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  const appConfig = appConfigs[0] || null;
  const superAdminEmails = appConfig?.super_admin_emails || [];
  const isSuperAdmin = isAuthenticated && !!user?.email && superAdminEmails.includes(user.email);

  return { isSuperAdmin, isLoading, appConfig };
}