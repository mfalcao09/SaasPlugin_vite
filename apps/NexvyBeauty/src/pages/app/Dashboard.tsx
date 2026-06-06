import { useQuery } from '@tanstack/react-query'
import { Calendar, DollarSign, Users, TrendingUp, ArrowUpRight, Clock } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'

const STATUS_COLORS: Record<string, string> = {
  agendado: 'bg-slate-100 text-slate-600',
  confirmado: 'bg-blue-100 text-blue-700',
  chegou: 'bg-amber-100 text-amber-700',
  concluido: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-red-100 text-red-700',
}

export default function Dashboard() {
  const { salaoId } = useAuth()

  const hoje = new Date().toISOString().split('T')[0]
  const now = new Date()
  const ano = now.getFullYear()
  const mes = now.getMonth() + 1

  const { data: agendamentosHoje = [], isLoading: loadingAgenda } = useQuery({
    queryKey: ['agendamentos-hoje', salaoId, hoje],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.agendamentos.listByDate(salaoId!, hoje)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: transacoesMes = [], isLoading: loadingTransacoes } = useQuery({
    queryKey: ['transacoes-mes', salaoId, ano, mes],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.transacoes.listByMonth(salaoId!, ano, mes)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['clientes', salaoId],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.clientes.list(salaoId!)
      if (error) throw error
      return data ?? []
    },
  })

  const loading = loadingAgenda || loadingTransacoes || loadingClientes

  const agendamentosAtivos = agendamentosHoje.filter((a) => a.status !== 'cancelado')
  const cancelados = agendamentosHoje.filter((a) => a.status === 'cancelado').length
  const faturamentoMes = transacoesMes
    .filter((t) => t.tipo === 'receita')
    .reduce((sum, t) => sum + (t.valor ?? 0), 0)
  const totalClientes = clientes.length
  const taxaCancelamento =
    agendamentosHoje.length > 0
      ? Math.round((cancelados / agendamentosHoje.length) * 100)
      : 0

  const dateLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
      </div>
    )
  }

  const kpis = [
    {
      label: 'Agendamentos Hoje',
      value: agendamentosAtivos.length,
      icon: Calendar,
      color: 'text-rose-500',
      bg: 'bg-rose-50',
    },
    {
      label: 'Faturamento do Mês',
      value: faturamentoMes.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
      }),
      icon: DollarSign,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Total de Clientes',
      value: totalClientes,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'Cancelamentos Hoje',
      value: `${taxaCancelamento}%`,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm capitalize">{dateLabel}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 ${kpi.bg} rounded-xl flex items-center justify-center`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-300" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Agenda de Hoje */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Agenda de Hoje</h2>
          <span className="ml-auto text-xs text-slate-400">
            {agendamentosAtivos.length} agendamento{agendamentosAtivos.length !== 1 ? 's' : ''}
          </span>
        </div>

        {agendamentosAtivos.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium text-sm">Nenhum agendamento para hoje</p>
          </div>
        ) : (
          <div className="divide-y">
            {[...agendamentosAtivos]
              .sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''))
              .map((ag) => (
                <div
                  key={ag.id}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm font-mono font-bold text-slate-700 w-12 flex-shrink-0">
                    {ag.hora}
                  </span>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                    style={{ backgroundColor: '#f43f5e' }}
                  >
                    {ag.cliente_nome?.[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{ag.cliente_nome}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {ag.servico_nome}
                      {ag.profissional_nome ? ` • ${ag.profissional_nome}` : ''}
                    </p>
                  </div>
                  {ag.valor != null && ag.valor > 0 && (
                    <span className="text-xs font-semibold text-emerald-600 flex-shrink-0">
                      {ag.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                      STATUS_COLORS[ag.status] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {ag.status}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
