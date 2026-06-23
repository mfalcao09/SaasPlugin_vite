// ─── Cockpit V1 — navegação única da cabeleireira (7 itens, linguagem de salão) ──
// Substitui o ModuleHub como home logada. Admin colapsa em 1 item ("Gestão &
// Ajustes" → /admin, intacto). Super-admin fica fora (isolado em gestao.*).
// Reusa o shape de nav do UnifiedShell (ShellNavGroup) — só a moldura muda.

import {
  Home, MessageSquare, Users, Megaphone, Bot, CalendarDays, DollarSign, Settings,
} from 'lucide-react'
import type { ShellNavGroup } from '@/components/layout/UnifiedShell'

export const COCKPIT_NAV: ShellNavGroup[] = [
  {
    title: 'Meu salão',
    items: [
      { to: '/', label: 'Início', icon: Home, end: true },
      { to: '/conversas', label: 'Conversas', icon: MessageSquare },
      { to: '/clientes', label: 'Meus Clientes', icon: Users },
      { to: '/atrair', label: 'Atrair Clientes', icon: Megaphone },
      { to: '/minha-ia', label: 'Minha IA', icon: Bot },
      { to: '/agenda', label: 'Minha Agenda', icon: CalendarDays },
      { to: '/faturamento', label: 'Meu Faturamento', icon: DollarSign },
    ],
  },
  {
    title: 'Gestão',
    items: [
      // Todo o Admin (~33 seções) colapsa neste único item — fica fora da
      // navegação diária da cabeleireira, acessível só pra quem gerencia.
      { to: '/admin', label: 'Gestão & Ajustes', icon: Settings, visibility: 'admin' },
    ],
  },
]
