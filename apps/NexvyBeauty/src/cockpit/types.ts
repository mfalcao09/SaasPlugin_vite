// ─── Cockpit V1 — contrato compartilhado ────────────────────────────────
// Tipos e utils que os 3 workstreams (shell / HomeDeValor / reativação)
// consomem. Fonte única pra evitar Frankenstein de interfaces.
//
// Reusa o motor existente do Radar (useOpportunityScan) e o shape de nav do
// UnifiedShell — nada de backend novo.

import type { ScanItem } from '@/hooks/useOpportunityScan'

// Nav do Cockpit = mesmo shape do UnifiedShell (grupos + itens com visibility).
export type { ShellNavItem, ShellNavGroup, ShellVisibility } from '@/components/layout/UnifiedShell'

// ─── Oportunidade (derivada de um ScanItem do Radar) ────────────────────
export type OpportunityClass = 'hot' | 'warm' | 'cold' | 'lost'

export interface OpportunityCardData {
  id: string
  leadId: string | null
  name: string
  /** telefone cru do snapshot (dígitos, pode faltar) — normalize antes de enviar */
  phone: string | null
  classification: OpportunityClass
  dealValue: number
  /** mensagem de WhatsApp pronta, escrita pela IA no scan */
  followupMessage: string | null
  reason: string | null
}

/** Mapeia um ScanItem (backend) → dados que o card precisa. Defensivo: lead_snapshot é jsonb. */
export function toOpportunityCard(item: ScanItem): OpportunityCardData {
  const snap = (item.lead_snapshot ?? {}) as Record<string, unknown>
  return {
    id: item.id,
    leadId: item.lead_id,
    name: (snap.name as string) || 'Cliente',
    phone: (snap.phone as string) ?? null,
    classification: item.classification,
    dealValue: Number(snap.deal_value) || 0,
    followupMessage: item.followup_message,
    reason: item.reason,
  }
}

/** "Recuperável" = pipeline acionável (hot + warm). Cold/lost não contam no headline. */
export const RECUPERAVEL_CLASSES: OpportunityClass[] = ['hot', 'warm']

// ─── Telefone BR (Evolution exige dígitos com DDI; evolution-send NÃO prefixa 55) ──
export function normalizeBrPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  // 10 (fixo) ou 11 (celular) dígitos sem DDI → assume Brasil
  if (!d.startsWith('55') && (d.length === 10 || d.length === 11)) d = '55' + d
  return d
}

// ─── Contrato de reativação (WS3 implementa, WS2/HomeDeValor consome) ────
export type ReactivationOutcome = 'sent' | 'no_phone' | 'no_instance' | 'error'

export interface ReactivationButtonProps {
  item: OpportunityCardData
  /** chamado após envio bem-sucedido (a Home some o card / soma o total) */
  onSent?: (item: OpportunityCardData) => void
  className?: string
}

export interface BulkReactivationDialogProps {
  items: OpportunityCardData[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** chamado ao fim do disparo em massa */
  onDone?: (result: { sent: number; failed: number }) => void
}
