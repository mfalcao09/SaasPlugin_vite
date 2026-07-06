// ─── CobrancaShell — casca do módulo Cobrança (NexvyPayments) ──────────────
// Molde: src/cockpit/CockpitShell.tsx — UnifiedShell com a nav de cobrança
// (COBRANCA_NAV) + <Outlet/> pras telas-filhas montadas em /cobranca/*.
// ADITIVO: vive em src/components/cobranca/ (novo), NÃO edita CockpitShell.
//
// Herança do visual "do gestao" (ui-cobranca-map §A.1, decisão travada): as
// TELAS aplicam as classes utilitárias Nexvy Lux (surface-card/text-value/
// brand-gradient) diretamente — elas pintam navy+dourado em qualquer host, sem
// ativar o tema global no app.* (100% aditivo, zero edição de core além da rota).

import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { UnifiedShell } from '@/components/layout/UnifiedShell'
import { WheelLoader } from '@/components/brand/WheelLoader'
import { COBRANCA_NAV } from './nav'

export default function CobrancaShell() {
  return (
    <UnifiedShell nav={COBRANCA_NAV} title="Cobrança">
      <Suspense fallback={<div className="py-16 flex justify-center"><WheelLoader size={48} /></div>}>
        <Outlet />
      </Suspense>
    </UnifiedShell>
  )
}
