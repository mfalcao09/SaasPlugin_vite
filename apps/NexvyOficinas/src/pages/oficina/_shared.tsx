import { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard, Users, Car, Wrench, FileText, DollarSign, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---- helpers (não existem em @/lib/utils, ficam aqui) ----
export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('pt-BR')
}

// organization_id do usuário logado (reconciliação empresa_id -> organization_id)
export function useOrganizationId(): string | null {
  const { profile } = useAuth()
  return profile?.organization_id ?? null
}

const NAV = [
  { to: '/oficina', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/oficina/clientes', label: 'Clientes', icon: Users },
  { to: '/oficina/veiculos', label: 'Veículos', icon: Car },
  { to: '/oficina/ordens', label: 'Ordens de Serviço', icon: Wrench },
  { to: '/oficina/orcamentos', label: 'Orçamentos', icon: FileText },
  { to: '/oficina/financeiro', label: 'Financeiro', icon: DollarSign },
]

export function OficinaLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-950 flex">
      <aside className="w-60 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-slate-800">
          <span className="text-lg font-bold text-white">ERP Oficina</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-orange-600/15 text-orange-400' : 'text-slate-300 hover:bg-slate-800',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao CRM
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

export function NoOrg() {
  return (
    <div className="p-12 text-center text-slate-400 text-sm">
      Sua conta ainda não está vinculada a uma organização. Conclua o onboarding para usar o ERP.
    </div>
  )
}
