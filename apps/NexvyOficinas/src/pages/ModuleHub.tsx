// ─── ModuleHub — home permanente (padrão Intentus) ─────────────────
// Hub de módulos: o ponto de entrada pós-login. Cards config-driven
// (src/config/modules.ts) filtrados por papel. Visual 100% em tokens do
// tema (funciona em light e dark).

import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Crown, Sparkles, LayoutGrid, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSuperAdminFirstAccess } from '@/hooks/useSuperAdminFirstAccess';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DualRoleDialog } from '@/components/auth/DualRoleDialog';
import { MODULE_DEFINITIONS, type ModuleDefinition } from '@/config/modules';

function ModuleCard({ mod, onClick }: { mod: ModuleDefinition; onClick: () => void }) {
  const Icon = mod.icon;
  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer p-5 hover:shadow-lg transition-all hover:border-primary/40 flex flex-col gap-3 min-h-[160px]"
    >
      <div className="flex items-start justify-between">
        <div
          className={`w-11 h-11 rounded-lg flex items-center justify-center ${mod.color} text-white shadow-sm`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-base leading-tight text-foreground">{mod.label}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-snug">{mod.description}</p>
      </div>
    </Card>
  );
}

const ModuleHub = () => {
  const navigate = useNavigate();
  const { profile, roles, isAdmin, isManager, isSuperAdmin } = useAuth();
  const { shouldForceSetup, isLoading: setupLoading } = useSuperAdminFirstAccess();

  const organizationId = profile?.organization_id ?? null;
  const { data: orgName } = useQuery({
    queryKey: ['organization-name', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data?.name ?? null;
    },
  });

  const visibleModules = useMemo(
    () =>
      MODULE_DEFINITIONS.filter((mod) => {
        if (mod.visibility === 'super_admin') return isSuperAdmin();
        if (mod.visibility === 'admin') return isAdmin() || isManager();
        return true;
      }),
    // isAdmin/isManager/isSuperAdmin são closures derivadas de roles
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles]
  );

  // Hold: evita o hub "piscar" antes do redirect enquanto o status de setup carrega
  if (isSuperAdmin() && setupLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Guard (a): primeiro acesso do super admin → setup obrigatório
  if (isSuperAdmin() && shouldForceSetup) {
    return <Navigate to="/super-admin" replace />;
  }

  const firstName = profile?.full_name?.split(' ')[0] || '';
  const isPlainAdmin = roles.includes('admin') && !isSuperAdmin();

  return (
    <div className="min-h-screen bg-background">
      {/* Guard (b): dialog bloqueante de duplo perfil */}
      <DualRoleDialog orgName={orgName} />

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* ─── Header: saudação + org + badges de papel ─────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">
                {firstName ? `Olá, ${firstName}` : 'Olá'}
              </h1>
              {orgName && (
                <p className="text-sm text-muted-foreground">{orgName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin() && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                <Crown className="w-3 h-3 mr-1" /> Super Admin
              </Badge>
            )}
            {isPlainAdmin && <Badge variant="outline">Admin</Badge>}
          </div>
        </div>

        {/* ─── Grid de módulos ──────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Módulos disponíveis
            </h2>
            <span className="text-xs text-muted-foreground">
              {visibleModules.length} módulos
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleModules.map((mod) => (
              <ModuleCard key={mod.id} mod={mod} onClick={() => navigate(mod.route)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleHub;
