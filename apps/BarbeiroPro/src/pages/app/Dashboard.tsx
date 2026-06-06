import AppLayout from '@/components/layout/AppLayout'
import { db } from '@/lib/db'
import { useCompany } from '@/hooks/useCompany'
import { useEffect, useState } from 'react'
import { Calendar, Users, DollarSign, CheckCircle } from 'lucide-react'
import { format, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Appointment {
  id: string
  cliente_nome: string
  profissional_nome: string
  servico_nome: string
  data: string
  hora: string
  status: string
  preco?: number
}
interface Customer { id: string; nome: string; created_at: string }
interface FinancialEntry { id: string; tipo: string; valor: number; data: string }

const statusConfig: Record<string, { label: string; color: string }> = {
  agendado:  { label: 'Agendado',  color: 'bg-blue-100 text-blue-700' },
  confirmado:{ label: 'Confirmado',color: 'bg-green-100 text-green-700' },
  chegou:    { label: 'Chegou',    color: 'bg-yellow-100 text-yellow-700' },
  concluido: { label: 'Concluído', color: 'bg-gray-100 text-gray-600' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
}

export default function Dashboard() {
  const { companyId } = useCompany()
  const barbeariaId = companyId

  const [todayAppts, setTodayAppts] = useState<Appointment[]>([])
  const [customers, setCustomers]   = useState<Customer[]>([])
  const [entries, setEntries]       = useState<FinancialEntry[]>([])
  const [loading, setLoading]       = useState(true)

  const today    = format(new Date(), 'yyyy-MM-dd')
  const now      = new Date()
  const thisMes  = now.getMonth() + 1
  const thisAno  = now.getFullYear()

  useEffect(() => {
    if (!barbeariaId) return
    setLoading(true)
    Promise.all([
      db.appointments.listByDate(barbeariaId, today),
      db.customers.list(barbeariaId),
      db.financialEntries.listByMonth(barbeariaId, thisAno, thisMes),
    ]).then(([apptRes, custRes, finRes]) => {
      setTodayAppts((apptRes.data as Appointment[]) ?? [])
      setCustomers((custRes.data as Customer[]) ?? [])
      setEntries((finRes.data as FinancialEntry[]) ?? [])
    }).finally(() => setLoading(false))
  }, [barbeariaId, today, thisMes, thisAno])

  const totalHoje      = todayAppts.length
  const concluidosHoje = todayAppts.filter(a => a.status === 'concluido').length
  const receitaMes     = entries.filter(f => f.tipo === 'receita').reduce((s, f) => s + (f.valor || 0), 0)
  const novosClientes  = customers.filter(c => new Date(c.created_at) >= startOfMonth(now)).length

  const proximos = todayAppts
    .filter(a => !['cancelado', 'concluido'].includes(a.status))
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .slice(0, 6)

  const cards = [
    { label: 'Agendamentos hoje',  value: totalHoje,      icon: Calendar,     color: 'text-blue-600',    bg: 'bg-blue-50'   },
    { label: 'Concluídos hoje',    value: concluidosHoje, icon: CheckCircle,  color: 'text-green-600',   bg: 'bg-green-50'  },
    { label: 'Receita do mês',     value: `R$ ${receitaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Novos clientes',     value: novosClientes,  icon: Users,        color: 'text-purple-600',  bg: 'bg-purple-50' },
  ]

  if (loading) {
    return (
      <AppLayout>
        <div className="p-8 flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#1B3A4B] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#1B1C1E]">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className="bg-white rounded-2xl border border-black/8 p-5">
                <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div className="text-2xl font-black text-[#1B1C1E]">{card.value}</div>
                <div className="text-xs text-gray-500 mt-1">{card.label}</div>
              </div>
            )
          })}
        </div>

        {/* Agenda de hoje */}
        <div className="bg-white rounded-2xl border border-black/8 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#1B1C1E]">Agenda de hoje</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              {totalHoje} agendamento{totalHoje !== 1 ? 's' : ''}
            </span>
          </div>

          {proximos.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum agendamento ativo para hoje</p>
            </div>
          ) : (
            <div className="space-y-3">
              {proximos.map(appt => (
                <div key={appt.id} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="text-sm font-bold text-[#1B3A4B] w-12 shrink-0">{appt.hora}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[#1B1C1E] truncate">{appt.cliente_nome}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {appt.servico_nome} · {appt.profissional_nome}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${statusConfig[appt.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                    {statusConfig[appt.status]?.label ?? appt.status}
                  </span>
                  {appt.preco != null && (
                    <div className="text-sm font-semibold text-emerald-600 shrink-0">
                      R$ {appt.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
