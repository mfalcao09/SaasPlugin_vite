import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Car,
  Wrench,
  FileText,
  DollarSign,
  BarChart2,
  Sparkles,
  Users2,
  Target,
  Zap,
  Trophy,
  MessageSquare,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import NotificationBell from '@/components/inbox/NotificationBell'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  orange?: boolean
}

const mainNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/veiculos', label: 'Veículos', icon: Car },
  { to: '/ordens', label: 'Ordens de Serviço', icon: Wrench },
  { to: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { to: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart2 },
  { to: '/ai', label: 'AI Assistant', icon: Sparkles },
  { to: '/equipe', label: 'Equipe', icon: Users2 },
]

const salesNav: NavItem[] = [
  { to: '/leads', label: 'Leads', icon: Target, orange: true },
  { to: '/cadencia', label: 'Cadência', icon: Zap, orange: true },
  { to: '/metas', label: 'Metas', icon: Trophy, orange: true },
  { to: '/inbox', label: 'Inbox WhatsApp', icon: MessageSquare, orange: true },
  { to: '/inbox/metrics', label: 'Métricas Inbox', icon: BarChart2, orange: true },
]

const bottomNav: NavItem[] = [
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

const Separator = () => <div className="my-2 border-t border-slate-700" />

function NavGroup({ items }: { items: NavItem[] }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ to, label, icon: Icon, orange }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={[
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-white' : orange ? 'text-orange-400' : 'text-slate-400',
                  ].join(' ')}
                />
                <span className={!isActive && orange ? 'text-orange-400' : undefined}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { signOut, empresaId } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-orange-600 flex items-center justify-center shrink-0">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">NexvyOficinas</span>
        </div>
        {onClose !== undefined ? (
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white transition-colors"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {/* Empresa ID badge */}
      {empresaId !== null ? (
        <div className="px-4 py-2 text-xs text-slate-500 font-mono truncate">
          {empresaId.slice(0, 8)}…
        </div>
      ) : null}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0">
        <NavGroup items={mainNav} />
        <Separator />
        <NavGroup items={salesNav} />
        <Separator />
        <NavGroup items={bottomNav} />
      </nav>

      {/* Sign out */}
      <div className="p-2 border-t border-slate-700">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sair
        </button>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-slate-900 border-r border-slate-700">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-60 flex flex-col bg-slate-900 border-r border-slate-700">
            <SidebarContent onClose={() => setSidebarOpen(false)} />
          </aside>
        </div>
      ) : null}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 md:px-6 h-14 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <button
            className="md:hidden p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <NotificationBell />

          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            NexvyOficinas
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
