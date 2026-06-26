// ─── Cockpit — navegação da cabeleireira (linguagem de salão) ──────────────
// Início standalone no topo (sem cabeçalho de seção). Seções: Meu salão (negócio),
// Comercial (atendimento/vendas), Gestão. Admin (~33 telas) colapsa em "Gestão &
// Ajustes" (/admin). Grupo com title:'' = topo solto (UnifiedShell suprime o label).

import {
  Home, MessageSquare, Users, Megaphone, CalendarDays, DollarSign,
  BarChart3, Sparkles, Bot, LayoutDashboard, Radar, LineChart, ListTodo,
  LayoutGrid, Target, Package, Network, Scissors,
  Plug, Webhook, FileText, Tag, Bell, Clock, Building2, CreditCard, LifeBuoy,
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
      { to: '/servicos', label: 'Serviços', icon: Scissors },
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
      { to: '/produtos', label: 'Produtos', icon: Package, visibility: 'admin' }, // migrado do admin (admin-only)
      { to: '/setores', label: 'Setores', icon: Network, visibility: 'admin' }, // migrado do admin (admin-only)
      { to: '/equipes', label: 'Equipes', icon: Users, visibility: 'admin' }, // migrado do admin (admin-only)
      { to: '/minha-ia', label: 'Minha IA', icon: Bot },
      // Configurações migradas do Admin → páginas individuais (admin-only).
      // O shell /admin foi dissolvido; ?tab=<config> antigos redirecionam (Admin.tsx).
      { to: '/conexoes', label: 'Conexões', icon: Plug, visibility: 'admin' },
      { to: '/webhooks', label: 'Webhooks', icon: Webhook, visibility: 'admin' },
      { to: '/respostas-rapidas', label: 'Respostas Rápidas', icon: MessageSquare, visibility: 'admin' },
      { to: '/campos-personalizados', label: 'Campos Personalizados', icon: FileText, visibility: 'admin' },
      { to: '/etiquetas', label: 'Etiquetas', icon: Tag, visibility: 'admin' },
      { to: '/notificacoes', label: 'Notificações', icon: Bell, visibility: 'admin' },
      { to: '/horarios', label: 'Horários', icon: Clock, visibility: 'admin' },
      { to: '/empresa', label: 'Empresa', icon: Building2, visibility: 'admin' },
      { to: '/plano', label: 'Plano', icon: CreditCard, visibility: 'admin' },
      { to: '/suporte', label: 'Suporte', icon: LifeBuoy, visibility: 'admin' },
    ],
  },
]
