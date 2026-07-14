// ─── Cockpit V1 — casca única da cabeleireira (substitui o ModuleHub) ────
// UnifiedShell com a nav de 7 itens (COCKPIT_NAV) + <Outlet/> pras telas
// embutidas. CARREGA os 2 gates que antes viviam no ModuleHub (senão o 1º
// acesso para de funcionar silenciosamente):
//   (a) super-admin sem setup → /super-admin
//   (b) onboarding do admin (1º acesso) → wizard de implantação in-shell
// Admin (/admin) e Super-admin (/super-admin) seguem intactos como rotas.

import { Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSuperAdminFirstAccess } from '@/hooks/useSuperAdminFirstAccess'
import { useGuidedOnboarding } from '@/hooks/useGuidedOnboarding'
import { UnifiedShell } from '@/components/layout/UnifiedShell'
import AdminImplantacao from '@/pages/AdminImplantacao'
import { WheelLoader } from '@/components/brand/WheelLoader'
import { COCKPIT_NAV } from './nav'

export default function CockpitShell() {
  const { profile, isSuperAdmin } = useAuth()
  const location = useLocation()
  const { shouldForceSetup, isLoading: setupLoading } = useSuperAdminFirstAccess()
  const { isFirstAccess: showOnboarding, markCompleted, markSkipped } = useGuidedOnboarding()

  // Hold: evita piscar a casca antes do redirect enquanto o setup do super-admin carrega.
  if (isSuperAdmin() && setupLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <WheelLoader size={64} />
      </div>
    )
  }

  // Gate (a): 1º acesso do super-admin → setup obrigatório (mesma regra do antigo ModuleHub).
  if (isSuperAdmin() && shouldForceSetup) {
    return <Navigate to="/super-admin" replace />
  }

  const firstName = profile?.full_name?.split(' ')[0] || ''

  return (
    <UnifiedShell nav={COCKPIT_NAV} title={firstName ? `Olá, ${firstName}` : 'NexvyBeauty'}>
      {/* Gate (b): onboarding do admin (1º acesso). O wizard de implantação
          (ImplantacaoWizard, 9 steps) absorveu o antigo GuidedOnboarding e É o
          conteúdo principal (não modal) — a sidebar segue visível.
          Concluir/pular revela a Home (HomeDeValor) atrás, que entrega o AHA.
          Exceção: a rota /configurar É o próprio wizard (acesso direto / retomar
          após pular) — nesse path renderiza o <Outlet/> pra não duplicar o wizard. */}
      {showOnboarding && location.pathname !== '/configurar' ? (
        <AdminImplantacao embedded onComplete={markCompleted} onSkip={markSkipped} />
      ) : (
        <Suspense fallback={<div className="py-16 flex justify-center"><WheelLoader size={48} /></div>}>
          <Outlet />
        </Suspense>
      )}
    </UnifiedShell>
  )
}
