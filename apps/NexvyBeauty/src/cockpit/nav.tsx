// ─── Cockpit — navegação da cabeleireira (linguagem de salão) ──────────────
// Reorg 2026-06-27 (plano docs/plano-organizacao-menus): 4 itens de uso DIÁRIO
// soltos no topo + grupos COLAPSÁVEIS por domínio (accordion do UnifiedShell,
// estado salvo em localStorage). Jargão de CRM traduzido pra linguagem de salão
// (Pipeline→Funil, Leads→Contatos, Setores→Departamentos…). As FUSÕES aprovadas
// (Oportunidades = AI Growth+Ações; Radar→Conversas; Ofertas→Minha IA; Saúde→
// Clientes) entram na Fase 2 — por ora cada rota segue acessível e renomeada.
// Grupo com collapsible:false (topo) = sempre visível. Rotas já existem no App.tsx.

import {
  Home, MessageSquare, Users, Megaphone, CalendarDays, DollarSign,
  BarChart3, Sparkles, Bot, LayoutDashboard, Radar, LineChart, ListTodo,
  Target, Boxes, Network, Scissors, ShoppingBag, Activity, Zap,
  Plug, Webhook, FileText, Tag, Bell, Clock, Building2, CreditCard, LifeBuoy,
  Filter, UserPlus,
} from 'lucide-react'
import type { ShellNavGroup } from '@/components/layout/UnifiedShell'

export const COCKPIT_NAV: ShellNavGroup[] = [
  // ── Uso diário: solto no topo, sempre à mão ──
  {
    title: '',
    items: [
      { to: '/', label: 'Início', icon: Home, end: true },
      { to: '/agenda', label: 'Minha Agenda', icon: CalendarDays },
      { to: '/clientes', label: 'Meus Clientes', icon: Users },
      { to: '/conversas', label: 'Conversas', icon: MessageSquare },
    ],
  },
  // ── 💰 Crescer: a IA te ajuda a vender (Fase 2 funde Oportunidades) ──
  {
    title: 'Crescer',
    collapsible: true,
    items: [
      { to: '/ai-growth', label: 'Oportunidades', icon: Sparkles }, // funde AI Growth + Ações (abas)
      { to: '/radar', label: 'Oportunidades nas conversas', icon: Radar },
      { to: '/automacoes', label: 'Mensagens automáticas', icon: Zap },
      { to: '/meta', label: 'Meta do Mês', icon: Target },
      { to: '/minha-ia', label: 'Minha IA', icon: Bot }, // inclui aba "Ofertas da IA"
      { to: '/saude', label: 'Qualidade do cadastro', icon: Activity },
    ],
  },
  // ── 🗂️ Meu Catálogo: o que eu vendo ──
  {
    title: 'Meu Catálogo',
    collapsible: true,
    items: [
      { to: '/servicos', label: 'Serviços', icon: Scissors },
      { to: '/pacotes', label: 'Pacotes', icon: Boxes },
      { to: '/loja', label: 'Produtos de revenda', icon: ShoppingBag },
    ],
  },
  // ── 📊 Meus Números ──
  {
    title: 'Meus Números',
    collapsible: true,
    items: [
      { to: '/relatorios', label: 'Relatórios do salão', icon: BarChart3 },
      { to: '/relatorios-comerciais', label: 'Relatórios de atendimento', icon: LineChart },
      { to: '/faturamento', label: 'Financeiro', icon: DollarSign },
    ],
  },
  // ── 💼 Vendas (linguagem de salão: Funil/Contatos) ──
  {
    title: 'Vendas',
    collapsible: true,
    items: [
      { to: '/painel', label: 'Painel de vendas', icon: LayoutDashboard },
      { to: '/atrair', label: 'Atrair Clientes', icon: Megaphone },
      { to: '/pipeline', label: 'Funil', icon: Filter },
      { to: '/leads', label: 'Contatos', icon: UserPlus },
      { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
    ],
  },
  // ── ⚙️ Configurações (admin) ──
  {
    title: 'Configurações',
    collapsible: true,
    items: [
      { to: '/empresa', label: 'Empresa', icon: Building2, visibility: 'admin' },
      { to: '/plano', label: 'Plano', icon: CreditCard, visibility: 'admin' },
      { to: '/horarios', label: 'Horários', icon: Clock, visibility: 'admin' },
      { to: '/conexoes', label: 'Conexões (WhatsApp)', icon: Plug, visibility: 'admin' },
      { to: '/equipes', label: 'Minha equipe', icon: Users, visibility: 'admin' },
      { to: '/setores', label: 'Departamentos', icon: Network, visibility: 'admin' },
      { to: '/suporte', label: 'Suporte', icon: LifeBuoy, visibility: 'admin' },
    ],
  },
  // ── ⚙️ Configurações avançadas (admin, raras) ──
  {
    title: 'Config. avançada',
    collapsible: true,
    items: [
      { to: '/webhooks', label: 'Webhooks', icon: Webhook, visibility: 'admin' },
      { to: '/campos-personalizados', label: 'Campos personalizados', icon: FileText, visibility: 'admin' },
      { to: '/etiquetas', label: 'Etiquetas', icon: Tag, visibility: 'admin' },
      { to: '/respostas-rapidas', label: 'Respostas rápidas', icon: MessageSquare, visibility: 'admin' },
      { to: '/notificacoes', label: 'Notificações', icon: Bell, visibility: 'admin' },
    ],
  },
]
