// ─── Helpers de formatação da Home de Valor ─────────────────────────────
// Centraliza BRL pt-BR e o vocabulário de "temperatura" (hot/warm/cold) que a
// dona do salão entende sem jargão. Cores semânticas seguem o padrão de
// STATUS_BADGE da Agenda (amber/emerald/sky), respeitando o tema dark.

import type { OpportunityClass } from '@/cockpit/types'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Formata um número em Real brasileiro (R$ 1.234,56). */
export function formatBRL(value: number): string {
  return BRL.format(value || 0)
}

// Vocabulário lay: nada de "hot/warm/cold" cru pra dona do salão.
export const CLASS_LABEL: Record<OpportunityClass, string> = {
  hot: 'Prontas para fechar',
  warm: 'Vale um lembrete',
  cold: 'Esfriaram',
  lost: 'Perdidas',
}

/** Frase curta de apoio sob cada balde. */
export const CLASS_HINT: Record<OpportunityClass, string> = {
  hot: 'Quase fechando — chama hoje',
  warm: 'Um carinho reacende',
  cold: 'Sumiram faz tempo',
  lost: 'Já foram embora',
}

// Acentos de temperatura no padrão da Agenda (border/bg/text + dark).
export const CLASS_ACCENT: Record<OpportunityClass, string> = {
  hot: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  warm: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  cold: 'border-muted-foreground/20 bg-muted/40 text-muted-foreground',
  lost: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300',
}
