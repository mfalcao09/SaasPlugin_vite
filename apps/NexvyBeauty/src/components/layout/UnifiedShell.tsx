// ─── UnifiedShell — casca de navegação coesa (Onda 1 / port do CBA) ──────
// Generaliza o padrão premium do SalaoLayout para TODAS as áreas tenant-facing:
// sidebar AGRUPADA (Principal / Operacional / Atendimento / Gestão) com RAIL
// COLAPSÁVEL (primitiva shadcn `Sidebar collapsible="icon"`, padrão portado do
// AppSidebar do cloud-beauty-ai) + AppTopBar canônica (seletor de empresa +
// ações globais — moat do NX preservado).
//
// Reusa rotas REAIS já declaradas no App.tsx — não cria rota nova, não muda
// data flow, não toca lógica de negócio. É só a moldura.
//
// Itens resolvidos por papel (admin/super-admin) e hostname (gestão só no
// gestao.*), espelhando a visibilidade do ModuleHub.

import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutGrid, LayoutDashboard, CalendarDays, Scissors, Sparkles, Users,
  DollarSign, TrendingUp, MessageSquare, Settings, Crown, LogOut,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { AppTopBar } from '@/components/layout/AppTopBar'
import { isGestaoHostname } from '@/lib/publicUrl'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from '@/components/ui/sidebar'

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
  /** rótulo curto da seção */
  title: string
  items: ShellNavItem[]
}

// Mapa canônico de navegação do tenant. Agrupado em 4 seções (alvo de coesão).
// Todas as rotas já existem no App.tsx.
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
 * Casca de navegação coesa com sidebar colapsável. Preserva a AppTopBar
 * canônica (seletor de empresa + ações) e adiciona agrupamento + rail de ícones.
 */
export function UnifiedShell({ title, subtitle, children, nav = TENANT_NAV }: UnifiedShellProps) {
  const { isAdmin, isManager, isSuperAdmin, user, signOut } = useAuth()
  const { pathname } = useLocation()

  const canSee = (vis: ShellVisibility = 'all'): boolean => {
    if (vis === 'super_admin') return isSuperAdmin()
    if (vis === 'admin') return isAdmin() || isManager() || isSuperAdmin()
    return true
  }

  // Ativo por caminho (NavLink asChild não expõe isActive ao SidebarMenuButton).
  const isItemActive = (to: string, end?: boolean): boolean => {
    const base = to.split('?')[0]
    if (end || base === '/') return pathname === base
    return pathname === base || pathname.startsWith(base + '/')
  }

  // Filtra por papel/hostname e descarta seções vazias.
  const groups = nav
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.to === '/super-admin' && !isGestaoHostname()) return false
        return canSee(it.visibility)
      }),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-1 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold truncate group-data-[collapsible=icon]:hidden">NexvyBeauty</span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map(({ to, label, icon: Icon, end }) => (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild isActive={isItemActive(to, end)} tooltip={label}>
                        <NavLink to={to} end={end}>
                          <Icon className="h-4 w-4 shrink-0" />
                          <span>{label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          {user?.email && (
            <div className="px-2 pb-1 text-xs text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
              {user.email}
            </div>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => signOut()} tooltip="Sair">
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-0">
        <AppTopBar title={title} subtitle={subtitle} leading={<SidebarTrigger className="-ml-1" />} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
