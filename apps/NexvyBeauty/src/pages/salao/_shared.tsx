import { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard, Users, Scissors, Sparkles, CalendarDays, DollarSign, LayoutGrid,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppTopBar } from '@/components/layout/AppTopBar'

// ---- helpers (mesmo contrato do ERP, reusados pelas telas de salão) ----
export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('pt-BR')
}

// organization_id do usuário logado (tenant key do core)
export function useOrganizationId(): string | null {
  const { profile } = useAuth()
  return profile?.organization_id ?? null
}

const NAV = [
  { to: '/salao', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/salao/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/salao/profissionais', label: 'Profissionais', icon: Scissors },
  { to: '/salao/servicos', label: 'Serviços', icon: Sparkles },
  { to: '/salao/clientes', label: 'Clientes', icon: Users },
  { to: '/salao/financeiro', label: 'Financeiro', icon: DollarSign },
]

export function SalaoLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Topbar canônica do sistema (mesma de todos os módulos pós-login). */}
      <AppTopBar title="Gestão do Salão" />
      <div className="flex flex-1 min-h-0">
        <aside className="w-60 shrink-0 bg-card border-r flex flex-col">
          <nav className="flex-1 p-3 space-y-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="p-3 border-t">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <LayoutGrid className="h-4 w-4" />
              Hub de Módulos
            </button>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

export function NoOrg() {
  return (
    <div className="p-12 text-center text-muted-foreground text-sm">
      Sua conta ainda não está vinculada a uma organização. Conclua o onboarding para usar a gestão do salão.
    </div>
  )
}
