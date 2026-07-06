// ─── Rota /configurar — reentrada no onboarding guiado (V3) ───────────────
// Para usuários que PULARAM o 1º acesso e querem retomar a configuração.
// Renderiza o mesmo wizard in-shell (GuidedOnboarding) usando o writer
// canônico (useGuidedOnboarding.markCompleted/markSkipped) e, ao terminar,
// navega pra Home (que entrega o AHA). Substitui a abertura em modal antiga.

import { useNavigate } from 'react-router-dom'
import { GuidedOnboarding } from '@/components/onboarding/GuidedOnboarding'
import { useGuidedOnboarding } from '@/hooks/useGuidedOnboarding'

export default function ConfigurarOnboarding() {
  const navigate = useNavigate()
  const { markCompleted, markSkipped } = useGuidedOnboarding()

  const finish = async (mark: () => void | Promise<void>) => {
    await mark()
    navigate('/')
  }

  return (
    <GuidedOnboarding
      onComplete={() => finish(markCompleted)}
      onSkipAll={() => finish(markSkipped)}
    />
  )
}
