// ─── Rota /configurar — reentrada no onboarding (wizard de implantação) ─────
// Para usuários que PULARAM o 1º acesso e querem retomar a configuração.
// Renderiza o wizard de implantação in-shell (AdminImplantacao embedded, que
// absorveu o antigo GuidedOnboarding) usando o writer canônico
// (useGuidedOnboarding.markCompleted/markSkipped) e, ao terminar, navega pra
// Home (que entrega o AHA).

import { useNavigate } from 'react-router-dom'
import AdminImplantacao from '@/pages/AdminImplantacao'
import { useGuidedOnboarding } from '@/hooks/useGuidedOnboarding'

export default function ConfigurarOnboarding() {
  const navigate = useNavigate()
  const { markCompleted, markSkipped } = useGuidedOnboarding()

  const finish = async (mark: () => void | Promise<void>) => {
    await mark()
    navigate('/')
  }

  return (
    <AdminImplantacao
      embedded
      onComplete={() => finish(markCompleted)}
      onSkip={() => finish(markSkipped)}
    />
  )
}
