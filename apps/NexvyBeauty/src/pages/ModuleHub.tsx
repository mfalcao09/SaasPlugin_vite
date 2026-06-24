// ─── ModuleHub — home permanente (padrão Intentus) ─────────────────
// Hub de módulos: o ponto de entrada pós-login. Cards config-driven
// (src/config/modules.ts) filtrados por papel. Visual 100% em tokens do
// tema (funciona em light e dark).

import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { WheelLoader } from '@/components/brand/WheelLoader';
import { useAuth } from '@/hooks/useAuth';
import { useSuperAdminFirstAccess } from '@/hooks/useSuperAdminFirstAccess';
import { useGuidedOnboarding } from '@/hooks/useGuidedOnboarding';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { UnifiedShell } from '@/components/layout/UnifiedShell';
import { SalaoActivationChecklist } from '@/pages/salao/ActivationChecklist';
import { GuidedOnboarding } from '@/components/onboarding/GuidedOnboarding';
import { OnboardingBanner } from '@/components/onboarding/OnboardingBanner';
import { MODULE_DEFINITIONS, type ModuleDefinition, type ModuleId } from '@/config/modules';
import { usePlanModules } from '@/hooks/usePlanModules';
import { isGestaoHostname } from '@/lib/publicUrl';

// Agrupamento premium dos cards do hub (não mais um muro de cards soltos).
// Cada módulo é mapeado a uma seção; a ordem das seções é a ordem de exibição.
const MODULE_SECTIONS: { title: string; description: string; modules: ModuleId[] }[] = [
  { title: 'Operação', description: 'O dia a dia do seu salão', modules: ['erp_salao'] },
  { title: 'Vendas & Atendimento', description: 'Captação, pipeline e conversas', modules: ['crm_vendas', 'atendimento'] },
  { title: 'Gestão', description: 'Configuração e controle', modules: ['administracao', 'gestao_plataforma'] },
];

function ModuleCard({ mod, onClick }: { mod: ModuleDefinition; onClick: () => void }) {
  const Icon = mod.icon;
  return (
    <Card
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden p-5 flex flex-col gap-3 min-h-[170px] border-border/60 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40"
    >
      {/* halo decorativo no hover (mesmo vocabulário das telas premium) */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="flex items-start justify-between">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${mod.color} text-white shadow-lg shadow-black/20 ring-1 ring-white/10 transition-transform group-hover:scale-105`}
        >
          <Icon className="w-6 h-6" />
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-base leading-tight text-foreground">{mod.label}</h3>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{mod.description}</p>
      </div>
      <span className="text-xs font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        Abrir →
      </span>
    </Card>
  );
}

const ModuleHub = () => {
  const navigate = useNavigate();
  const { profile, roles, isAdmin, isManager, isSuperAdmin } = useAuth();
  const { shouldForceSetup, isLoading: setupLoading } = useSuperAdminFirstAccess();
  // Onboarding guiado módulo-aware: dispara no 1º acesso de um admin de
  // organização (sem módulos ativados ainda). Super admin é coberto pelo
  // fluxo de setup acima e nunca cai aqui (isFirstAccess exige !superAdmin).
  const { isFirstAccess: showOnboarding, markCompleted, markSkipped } = useGuidedOnboarding();

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

  // Módulos efetivamente disponíveis para a org (plano ∩ enabled_modules).
  const { availableModules } = usePlanModules();

  // Módulos-PRODUTO (do tenant) são ocultados quando a org NÃO os ativou —
  // exceto p/ super admin (vê tudo p/ suporte/config) e quando ainda não há
  // info de plano (availableModules vazio → não trava). 'administracao' e
  // 'gestao_plataforma' seguem só pelo papel (são painéis de controle).
  const PRODUCT_MODULES: ModuleId[] = ['erp_salao', 'crm_vendas', 'atendimento'];
  const gated = !isSuperAdmin() && availableModules.length > 0;

  const visibleModules = useMemo(
    () =>
      MODULE_DEFINITIONS.filter((mod) => {
        // Split: a gestão da plataforma vive no gestao.*; no app.*/apex o card
        // não aparece (o super-admin acessa via gestao.nexvybeauty.com.br).
        if (mod.id === 'gestao_plataforma' && !isGestaoHostname()) return false;
        if (mod.visibility === 'super_admin') return isSuperAdmin();
        if (mod.visibility === 'admin' && !(isAdmin() || isManager())) return false;
        if (gated && PRODUCT_MODULES.includes(mod.id) && !availableModules.includes(mod.id)) return false;
        return true;
      }),
    // isAdmin/isManager/isSuperAdmin são closures derivadas de roles
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles, availableModules, gated]
  );

  // Hold: evita o hub "piscar" antes do redirect enquanto o status de setup carrega
  if (isSuperAdmin() && setupLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <WheelLoader size={64} />
      </div>
    );
  }

  // Guard (a): primeiro acesso do super admin → setup obrigatório
  if (isSuperAdmin() && shouldForceSetup) {
    return <Navigate to="/super-admin" replace />;
  }

  const firstName = profile?.full_name?.split(' ')[0] || '';

  // Agrupa os módulos visíveis nas seções premium. Módulos que (por papel/plano)
  // não estão visíveis somem; seções vazias são descartadas. Módulos sem seção
  // mapeada caem num grupo "Outros" no fim (defensivo — hoje todos têm seção).
  const sectioned = MODULE_SECTIONS
    .map((sec) => ({
      ...sec,
      mods: sec.modules
        .map((id) => visibleModules.find((m) => m.id === id))
        .filter((m): m is ModuleDefinition => !!m),
    }))
    .filter((sec) => sec.mods.length > 0);
  const placed = new Set(MODULE_SECTIONS.flatMap((s) => s.modules));
  const orphans = visibleModules.filter((m) => !placed.has(m.id));

  return (
    <UnifiedShell
      title={firstName ? `Olá, ${firstName}` : 'Olá'}
      subtitle={orgName || undefined}
    >
      {/* A dialog de escolha (Gestão Multi-Empresas / Empresa Master) é
          global, montada no App.tsx via SuperAdminViewProvider. */}

      {/* Onboarding guiado (admin de organização, 1º acesso) — exige NÃO
          super admin, então nunca se sobrepõe à escolha de view. */}
      {showOnboarding && (
        <GuidedOnboarding
          onComplete={markCompleted}
          onSkipAll={markSkipped}
        />
      )}

      {/* Onboarding como entrada na HOME (module-agnostic) — substitui a tarja
          que antes vivia DENTRO do módulo Admin. Some sozinha ao concluir/pular. */}
      <OnboardingBanner />

      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Checklist de ativação — mora na home (hub). Some sozinha quando
            o salão está operacional. */}
        {organizationId && !isSuperAdmin() && (
          <SalaoActivationChecklist organizationId={organizationId} />
        )}

        {/* ─── Módulos agrupados por seção (dashboard premium, não muro) ── */}
        {sectioned.map((sec) => (
          <section key={sec.title}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">{sec.title}</h2>
              <p className="text-sm text-muted-foreground">{sec.description}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sec.mods.map((mod) => (
                <ModuleCard key={mod.id} mod={mod} onClick={() => navigate(mod.route)} />
              ))}
            </div>
          </section>
        ))}

        {orphans.length > 0 && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Outros</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {orphans.map((mod) => (
                <ModuleCard key={mod.id} mod={mod} onClick={() => navigate(mod.route)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </UnifiedShell>
  );
};

export default ModuleHub;
