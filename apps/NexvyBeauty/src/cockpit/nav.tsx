// ─── Cockpit — navegação da cabeleireira (linguagem de salão) ──────────────
// Início standalone no topo (sem cabeçalho de seção). Seções: Meu salão (negócio),
// Comercial (atendimento/vendas), Gestão. Admin (~33 telas) colapsa em "Gestão &
// Ajustes" (/admin). Grupo com title:'' = topo solto (UnifiedShell suprime o label).

import {
  Home, MessageSquare, Users, Megaphone, CalendarDays, DollarSign, Settings,
  BarChart3, Sparkles, Bot, LayoutDashboard, Radar, LineChart, ListTodo,
  LayoutGrid, Target, Package, Network,
} from 'lucide-react'
import type { ShellNavGroup } from '@/components/layout/UnifiedShell'

export const COCKPIT_NAV: ShellNavGroup[] = [
  {
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
      { to: '/ai-growth', label: 'AI Growth', icon: Sparkles }, // lente macro (negócio)
      { to: '/relatorios', label: 'Relatórios & Gestão', icon: BarChart3 },
      { to: '/faturamento', label: 'Financeiro', icon: DollarSign },
    ],
  },
  {
    title: 'Comercial',
    items: [
      { to: '/painel', label: 'Painel', icon: LayoutDashboard }, // dashboard comercial (1º)
      { to: '/conversas', label: 'Conversas', icon: MessageSquare },
      { to: '/pipeline', label: 'Pipeline', icon: LayoutGrid }, // kanban de CRM (migrado do admin)
      { to: '/leads', label: 'Leads', icon: Target }, // central de leads (migrado do admin)
      { to: '/radar', label: 'Radar IA', icon: Radar }, // lente micro (conversas)
      { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
      { to: '/relatorios-comerciais', label: 'Relatórios', icon: LineChart },
      { to: '/atrair', label: 'Atrair Clientes', icon: Megaphone },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/produtos', label: 'Produtos', icon: Package }, // produtos/serviços (migrado do admin)
      { to: '/setores', label: 'Setores', icon: Network }, // setores de atendimento (migrado do admin)
      { to: '/equipes', label: 'Equipes', icon: Users }, // usuários/permissões (migrado do admin)
      { to: '/minha-ia', label: 'Minha IA', icon: Bot },
      { to: '/admin', label: 'Gestão & Ajustes', icon: Settings, visibility: 'admin' },
    ],
  },
]
