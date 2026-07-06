// ─── _shared (Cobrança) — helpers próprios do módulo, ADITIVO e ISOLADO ────
// Espelha os helpers do salão (src/pages/salao/_shared.tsx:12-27) mas VIVE
// aqui (não importa do salão — a vertical de salão é candidata a remoção na
// limpeza A1; o módulo de cobrança não pode depender dela). Regra do fork
// (ui-cobranca-map §C): formatCurrency/formatDate/useOrganizationId próprios.

import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'

// ── BRL: molde salao/_shared.tsx:12 ──
export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

// ── Data TZ-safe: molde salao/_shared.tsx:16 (T00:00:00 p/ datas curtas —
//    evita o shift de fuso de `new Date(iso)` cru, feedback_iso_date_format_br). ──
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('pt-BR')
}

// ── organization_id do usuário logado (tenant key do core) ──
export function useOrganizationId(): string | null {
  const { profile } = useAuth()
  return profile?.organization_id ?? null
}

// ── Cliente Supabase destipado para as tabelas de cobrança ─────────────────
// As tabelas do módulo (payers, invoices, contracts, billing_groups, …) vivem
// numa esteira de migrations ISOLADA (migrations_cobranca/) e NÃO estão nos
// tipos gerados (integrations/supabase/types.ts). O client tipado por `Database`
// retornaria `never` em `.from('payers')` e quebraria o build TS. `db` é o mesmo
// client, só sem os tipos de tabela — RLS/auth idênticos. Escopo sempre por
// organization_id nas queries (a RLS org-scoped já confina de qualquer forma).
export const db = supabase as unknown as {
  from: (table: string) => any
  functions: typeof supabase.functions
}

// ── competência corrente (YYYY-MM), âncora local ──
export function currentCompetencia(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── só dígitos (CPF/CNPJ/telefone) ──
export function onlyDigits(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

// ── máscara leve de documento (exibição) — CPF 000.000.000-00 / CNPJ 00.000.000/0000-00 ──
export function formatDocumento(doc: string | null | undefined): string {
  const d = onlyDigits(doc)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc ?? '-'
}
