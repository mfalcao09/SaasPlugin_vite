import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Users, DollarSign, Scissors, Clock } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { SalaoLayout, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'

interface AgendamentoRow {
  id: string
  data: string | null
  hora: string | null
  status: string | null
  valor: number | null
  cliente_nome: string | null
  profissional_nome: string | null
  servico_nome: string | null
}

interface ProfissionalRow {
  id: string
  ativo: boolean | null
}

function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function Dashboard() {
  const organizationId = useOrganizationId()

  const { data: agendamentos } = useQuery({
    queryKey: ['agendamentos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, data, hora, status, valor, cliente_nome, profissional_nome, servico_nome')
        .eq('organization_id', organizationId!)
        .order('data', { ascending: true })
        .order('hora', { ascending: true })
      if (error) throw error
      return (data ?? []) as AgendamentoRow[]
    },
    enabled: !!organizationId,
  })

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profissionais')
        .select('id, ativo')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as ProfissionalRow[]
    },
    enabled: !!organizationId,
  })

  const { data: clientes } = useQuery({
    queryKey: ['clientes', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const hoje = todayISO()
  const mesAtual = hoje.slice(0, 7) // YYYY-MM

  const lista = agendamentos ?? []

  const agendamentosHoje = lista.filter((a) => (a.data ?? '').slice(0, 10) === hoje)

  const faturamentoMes = lista
    .filter((a) => a.status === 'concluido' && (a.data ?? '').slice(0, 7) === mesAtual)
    .reduce((acc, a) => acc + Number(a.valor ?? 0), 0)

  const profissionaisAtivos = (profissionais ?? []).filter((p) => p.ativo === true)

  const proximos = lista.filter(
    (a) => (a.data ?? '').slice(0, 10) >= hoje && a.status !== 'concluido' && a.status !== 'cancelado',
  )

  const stats = [
    { label: 'Agendamentos de Hoje', value: String(agendamentosHoje.length), icon: CalendarDays, color: 'text-primary' },
    { label: 'Faturamento do Mês', value: formatCurrency(faturamentoMes), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Profissionais Ativos', value: String(profissionaisAtivos.length), icon: Scissors, color: 'text-purple-600 dark:text-purple-400' },
    { label: 'Clientes', value: String(clientes?.length ?? 0), icon: Users, color: 'text-blue-600 dark:text-blue-400' },
  ]

  if (!organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  return (
    <SalaoLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão geral do seu salão</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border rounded-xl">
          <div className="px-5 py-4 border-b flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">Próximos Agendamentos</h2>
          </div>
          <div className="divide-y divide-border">
            {proximos.length === 0 ? (
              <p className="px-5 py-8 text-center text-muted-foreground text-sm">Nenhum agendamento próximo.</p>
            ) : (
              proximos.slice(0, 5).map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.cliente_nome ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.servico_nome ?? '—'} · {a.profissional_nome ?? '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{formatDate(a.data)}</p>
                    <p className="text-xs text-muted-foreground">{a.hora ?? '—'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </SalaoLayout>
  )
}
