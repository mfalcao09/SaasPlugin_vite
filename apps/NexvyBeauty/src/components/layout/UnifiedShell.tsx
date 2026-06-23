// ─── UnifiedShell — casca de navegação coesa (Track B / B2) ──────────
// Generaliza o padrão premium do SalaoLayout (_shared) para TODAS as áreas
// tenant-facing: uma sidebar agrupada (Principal / Operacional / Atendimento
// / Gestão) + AppTopBar (que já traz o seletor de empresa + ações globais).
//
// Objetivo: remover a sensação de "apps separados". Reusa rotas REAIS já
// declaradas no App.tsx — não cria rota nova, não muda data flow, não toca
// nenhuma lógica de negócio. É só a moldura.
//
// Itens de menu são resolvidos por papel (admin/super-admin) e por hostname
// (gestão da plataforma só no gestao.*), espelhando a visibilidade que o
// ModuleHub já aplica.

import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutGrid, LayoutDashboard, CalendarDays, Scissors, Sparkles, Users,
  DollarSign, TrendingUp, MessageSquare, Settings, Crown,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { AppTopBar } from '@/components/layout/AppTopBar'
import { isGestaoHostname } from '@/lib/publicUrl'

export type ShellVisibility = 'all' | 'admin' | 'super_admin'

export interface ShellNavItem {
  to: string
  label: string
  icon: LucideIcon
  /** match exato (NavLink `end`) — usado em itens de índice tipo /salao */
  end?: boolean
  visibility?: ShellVisibility
}

export interface ShellNavGroup {
  /** rótulo curto da seção (caps no estilo do beauty-flow) */
  title: string
  items: ShellNavItem[]
}

// Mapa canônico de navegação do tenant. Agrupado em 4 seções como o alvo de
// coesão (Principal / Operacional / Atendimento / Gestão). Todas as rotas já
// existem no App.tsx.
export const TENANT_NAV: ShellNavGroup[] = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'Início', icon: LayoutGrid, end: true },
      { to: '/crm', label: 'CRM de Vendas', icon: TrendingUp },
    ],
  },
  {
    title: 'Operacional',
    items: [
      { to: '/salao', label: 'Painel do Salão', icon: LayoutDashboard, end: true },
      { to: '/salao/agenda', label: 'Agenda', icon: CalendarDays },
      { to: '/salao/profissionais', label: 'Profissionais', icon: Scissors },
      { to: '/salao/servicos', label: 'Serviços', icon: Sparkles },
      { to: '/salao/clientes', label: 'Clientes', icon: Users },
      { to: '/salao/financeiro', label: 'Financeiro', icon: DollarSign },
    ],
  },
  {
    title: 'Atendimento',
    items: [
      { to: '/admin?tab=inbox', label: 'Inbox', icon: MessageSquare, visibility: 'admin' },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/admin', label: 'Administração', icon: Settings, visibility: 'admin' },
      { to: '/super-admin', label: 'Plataforma', icon: Crown, visibility: 'super_admin' },
    ],
  },
]

interface UnifiedShellProps {
  /** título exibido na AppTopBar */
  title: string
  subtitle?: string
  children: ReactNode
  /** sobrescreve os grupos de navegação (default: TENANT_NAV) */
  nav?: ShellNavGroup[]
}

/**
 * Casca de navegação coesa. Mantém a mesma largura (w-60), mesma AppTopBar e
 * o mesmo vocabulário visual do SalaoLayout — só adiciona o agrupamento em
 * seções e a resolução por papel.
 */
export function UnifiedShell({ title, subtitle, children, nav = TENANT_NAV }: UnifiedShellProps) {
  const { isAdmin, isManager, isSuperAdmin } = useAuth()
  const { pathname } = useLocation()

  const canSee = (vis: ShellVisibility = 'all'): boolean => {
    if (vis === 'super_admin') return isSuperAdmin()
    if (vis === 'admin') return isAdmin() || isManager() || isSuperAdmin()
    return true
  }

  // Filtra itens por papel/hostname e descarta seções que ficaram vazias.
  const groups = nav
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        // Gestão da plataforma só aparece no host de gestão (espelha ModuleHub).
        if (it.to === '/super-admin' && !isGestaoHostname()) return false
        return canSee(it.visibility)
      }),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppTopBar title={title} subtitle={subtitle} />
      <div className="flex flex-1 min-h-0">
        <aside className="w-60 shrink-0 bg-card border-r flex flex-col">
          <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.title} className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.title}
                </p>
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    // `?tab=` em /admin não casa com o matcher do NavLink — força
                    // o estado ativo comparando o caminho base.
                    className={({ isActive }) => cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      (isActive || (to.includes('?') && pathname === to.split('?')[0]))
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
