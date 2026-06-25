// ─── Cockpit — navegação da cabeleireira (linguagem de salão) ──────────────
// Início standalone no topo (sem cabeçalho de seção). Seções: Meu salão,
// Comercial, Gestão. Admin (~33 telas) colapsa em "Gestão & Ajustes" (/admin).
// Reusa o shape de nav do UnifiedShell (ShellNavGroup) — grupo com title:'' = topo solto.

import {
  Home, MessageSquare, Users, Megaphone, CalendarDays, DollarSign, Settings,
  BarChart3, Sparkles, Bot,
} from 'lucide-react'
import type { ShellNavGroup } from '@/components/layout/UnifiedShell'

export const COCKPIT_NAV: ShellNavGroup[] = [
  {
    // title vazio = item solto no topo (UnifiedShell suprime o SidebarGroupLabel)
    title: '',
    items: [
      { to: '/', label: 'Início', icon: Home, end: true },
    ],
  },
  {
    title: 'Meu salão',
    items: [
      { to: '/clientes', label: 'Meus Clientes', icon: Users },
      { to: '/agenda', label: 'Minha Agenda', icon: CalendarDays },
      { to: '/relatorios', label: 'Relatórios & Gestão', icon: BarChart3 },
      { to: '/faturamento', label: 'Financeiro', icon: DollarSign },
    ],
  },
  {
    title: 'Comercial',
    items: [
      { to: '/conversas', label: 'Conversas', icon: MessageSquare },
      { to: '/atrair', label: 'Atrair Clientes', icon: Megaphone },
      { to: '/ai-growth', label: 'AI Growth', icon: Sparkles },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/admin', label: 'Gestão & Ajustes', icon: Settings, visibility: 'admin' },
      { to: '/minha-ia', label: 'Minha IA', icon: Bot },
    ],
  },
]
