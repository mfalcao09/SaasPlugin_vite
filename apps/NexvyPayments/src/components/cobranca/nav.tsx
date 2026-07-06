// ─── Cobrança — navegação do módulo (NexvyPayments) ───────────────────────
// Molde: src/cockpit/nav.tsx (COCKPIT_NAV) — mesmo tipo `ShellNavGroup[]` do
// UnifiedShell. Substitui o jargão de salão pelo jargão de COBRANÇA (faturas,
// pagadores, contratos, régua, inadimplência, config/onboarding). ADITIVO:
// vive em src/components/cobranca/ (novo), zero edição de core.
//
// As rotas são RELATIVAS ao mount /cobranca/* (a CobrancaShell é montada em
// <Route path="/cobranca/*"> no App.tsx). O item índice (Faturas) usa `end`
// para casar só o path exato /cobranca.

import {
  FileText, Users, FileSignature, Repeat, AlertTriangle, Settings,
} from 'lucide-react'
import type { ShellNavGroup } from '@/components/layout/UnifiedShell'

export const COBRANCA_NAV: ShellNavGroup[] = [
  // ── Uso diário: solto no topo, sempre à mão ──
  {
    title: '',
    items: [
      // Faturas = tela-âncora (índice do módulo → /cobranca).
      { to: '/cobranca', label: 'Faturas', icon: FileText, end: true },
      { to: '/cobranca/pagadores', label: 'Pagadores', icon: Users },
      { to: '/cobranca/contratos', label: 'Contratos', icon: FileSignature },
    ],
  },
  // ── ⚙️ Cobrança & recuperação ──
  {
    title: 'Cobrança',
    collapsible: true,
    defaultOpen: true,
    items: [
      { to: '/cobranca/regua', label: 'Régua de cobrança', icon: Repeat },
      { to: '/cobranca/inadimplencia', label: 'Inadimplência', icon: AlertTriangle },
    ],
  },
  // ── ⚙️ Configuração (admin) ──
  {
    title: 'Configuração',
    collapsible: true,
    items: [
      { to: '/cobranca/onboarding', label: 'Config / Onboarding', icon: Settings, visibility: 'admin' },
    ],
  },
]
