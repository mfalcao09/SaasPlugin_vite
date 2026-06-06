import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  ShoppingBag,
  UtensilsCrossed,
  Bike,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  UserCog,
  Target,
  UserPlus,
  Repeat,
  LogOut,
  ChefHat,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const navItems = [
  { to: '/',              icon: ShoppingBag,     label: 'Pedidos',       end: true },
  { to: '/cardapio',      icon: UtensilsCrossed, label: 'Cardápio' },
  { to: '/entregas',      icon: Bike,            label: 'Entregas' },
  { to: '/clientes',      icon: Users,           label: 'Clientes' },
  { to: '/financeiro',    icon: DollarSign,      label: 'Financeiro' },
  { to: '/relatorios',    icon: BarChart3,        label: 'Relatórios' },
  { to: '/equipe',        icon: UserCog,         label: 'Equipe' },
  { to: '/leads',         icon: UserPlus,        label: 'Leads' },
  { to: '/cadencia',      icon: Repeat,          label: 'Cadência' },
  { to: '/metas',         icon: Target,          label: 'Metas' },
  { to: '/configuracoes', icon: Settings,        label: 'Configurações' },
]

export default function AppLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-background">
      {/* ── Sidebar ── */}
      <aside className="flex w-56 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="h-5 w-5" />
          </div>
          <span className="font-semibold text-sm text-foreground">NexvyFoods</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Sign out */}
        <div className="border-t border-border px-2 py-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
