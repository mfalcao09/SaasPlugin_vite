// ─── Registry de passos de onboarding por módulo ──────────────────────
// Mapa config-driven consumido pelo fluxo de onboarding guiado (D3).
// Cada módulo expõe seus próprios passos; aqui registramos apenas os que
// implementamos nesta frente (erp_oficina, atendimento). Os passos de CRM
// (crm_vendas) seguem no GuidedOnboarding e NÃO entram aqui.

import type { FC } from 'react'
import type { ModuleId } from '@/config/modules'
import { OficinaServicesStep } from './steps/OficinaServicesStep'
import { AtendimentoWhatsAppStep } from './steps/AtendimentoWhatsAppStep'

/** Props padrão recebidas por todo passo de onboarding. */
export interface OnboardingStepProps {
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

/** Definição de um passo individual dentro de um módulo. */
export interface OnboardingStepDef {
  id: string
  label: string
  Component: FC<OnboardingStepProps>
}

/**
 * Passos de onboarding indexados por módulo.
 * Chave = ModuleId (string). Só contém módulos com passos próprios já
 * implementados; módulos ausentes simplesmente não têm fluxo dedicado aqui.
 */
export const MODULE_ONBOARDING_STEPS: Record<string, OnboardingStepDef[]> = {
  erp_oficina: [
    {
      id: 'oficina_servicos',
      label: 'Serviços da oficina',
      Component: OficinaServicesStep,
    },
  ],
  atendimento: [
    {
      id: 'atendimento_whatsapp',
      label: 'WhatsApp',
      Component: AtendimentoWhatsAppStep,
    },
  ],
}

/** Helper: passos de um módulo (vazio se não houver fluxo dedicado). */
export function getOnboardingSteps(moduleId: ModuleId | string): OnboardingStepDef[] {
  return MODULE_ONBOARDING_STEPS[moduleId] ?? []
}
