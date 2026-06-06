import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export function useCompany() {
  const { user, isSuperAdmin } = useAuth();

  // If super admin has ?slug=<x> in URL, load that specific company
  const urlSlug = isSuperAdmin
    ? new URLSearchParams(window.location.search).get('slug')
    : null;

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['my-company', user?.email, urlSlug],
    queryFn: () => urlSlug
      ? base44.entities.Company.filter({ slug: urlSlug })
      : base44.entities.Company.list(),
    enabled: !!user,
  });

  const company = urlSlug
    ? (companies[0] || null)
    : (companies.find(c => c.owner_email === user?.email) || companies[0] || null);

  return { company, companyId: company?.id || null, isLoading };
}