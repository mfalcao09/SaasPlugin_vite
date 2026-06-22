import { useQuery } from '@tanstack/react-query'
import { Calendar, Users, DollarSign, Scissors, Clock, TrendingUp, Repeat } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SalaoLayout, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'

// Estrutura visual portada do beauty-flow (KPI grid + gráficos recharts),
// com a NOSSA camada de dados (agendamentos/profissionais/clientes por
// organization_id). Componente data-injectable: sem `demo` busca Supabase
// real; com `demo` renderiza seed (usado pelas rotas /demo, sem auth).

export interface DashboardData {
  agendamentosHoje: number
  agendamentosSemana: number
  faturamentoMes: number
  ticketMedio: number
  clientes: number
  profissionaisAtivos: number
  chart: { dia: string; valor: number }[]
  topServicos: { name: string; value: number }[]
  topProfissionais: { nome: string; valor: number }[]
  proximos: {
    id: string; data: string | null; hora: string | null; status: string | null
    cliente_nome: string | null; servico_nome: string | null; profissional_nome: string | null
  }[]
}

// Paleta de gráficos em HSL (nossos tokens são tripletas → hsl(...) explícito).
const CHART_COLORS = ['hsl(330 81% 60%)', 'hsl(280 65% 62%)', 'hsl(250 70% 62%)', 'hsl(45 90% 55%)', 'hsl(160 60% 45%)']

const STATUS_BADGE: Record<string, string> = {
  agendado: 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30',
  confirmado: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30',
  concluido: 'bg-green-500/15 text-green-600 dark:text-green-300 border-green-500/30',
  cancelado: 'bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30',
}

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface AgendamentoRow {
  id: string; data: string | null; hora: string | null; status: string | null; valor: number | null
  cliente_nome: string | null; profissional_nome: string | null; servico_nome: string | null
}

export default function Dashboard({ demo }: { demo?: DashboardData } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo

  const { data: agendamentos } = useQuery({
    queryKey: ['agendamentos', organizationId],
    enabled: !isDemo && !!organizationId,
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
  })

  const { data: profissionais } = useQuery({
    queryKey: ['profissionais', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profissionais').select('id, ativo').eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as { id: string; ativo: boolean | null }[]
    },
  })

  const { data: clientes } = useQuery({
    queryKey: ['clientes', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id').eq('organization_id', organizationId!)
      if (error) throw error
      return data ?? []
    },
  })

  // ---- agrega os dados reais no mesmo shape do seed ----
  const computed: DashboardData = (() => {
    const hoje = todayISO()
    const semana = daysAgoISO(7)
    const mes = hoje.slice(0, 7)
    const lista = agendamentos ?? []
    const concluidosMes = lista.filter((a) => a.status === 'concluido' && (a.data ?? '').slice(0, 7) === mes)
    const faturamentoMes = concluidosMes.reduce((s, a) => s + Number(a.valor ?? 0), 0)

    const byDay: Record<string, number> = {}
    concluidosMes.forEach((a) => { const dd = (a.data ?? '').slice(0, 10); if (dd) byDay[dd] = (byDay[dd] ?? 0) + Number(a.valor ?? 0) })
    const chart = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([dd, v]) => ({ dia: dd.slice(8), valor: v }))

    const bySrv: Record<string, number> = {}
    concluidosMes.forEach((a) => { const k = a.servico_nome ?? '—'; bySrv[k] = (bySrv[k] ?? 0) + 1 })
    const topServicos = Object.entries(bySrv).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, value]) => ({ name, value }))

    const byProf: Record<string, number> = {}
    concluidosMes.forEach((a) => { const k = a.profissional_nome ?? '—'; byProf[k] = (byProf[k] ?? 0) + Number(a.valor ?? 0) })
    const topProfissionais = Object.entries(byProf).sort(([, a], [, b]) => b - a).slice(0, 5).map(([nome, valor]) => ({ nome: nome.split(' ')[0], valor }))

    return {
      agendamentosHoje: lista.filter((a) => (a.data ?? '').slice(0, 10) === hoje).length,
      agendamentosSemana: lista.filter((a) => { const dd = (a.data ?? '').slice(0, 10); return dd >= semana && dd <= hoje }).length,
      faturamentoMes,
      ticketMedio: concluidosMes.length ? faturamentoMes / concluidosMes.length : 0,
      clientes: clientes?.length ?? 0,
      profissionaisAtivos: (profissionais ?? []).filter((p) => p.ativo === true).length,
      chart,
      topServicos,
      topProfissionais,
      proximos: lista
        .filter((a) => (a.data ?? '').slice(0, 10) >= hoje && a.status !== 'concluido' && a.status !== 'cancelado')
        .slice(0, 6),
    }
  })()

  const d = demo ?? computed

  if (!isDemo && !organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  const kpis = [
    { label: 'Agendamentos hoje', value: String(d.agendamentosHoje), icon: Calendar },
    { label: 'Agendamentos 7 dias', value: String(d.agendamentosSemana), icon: TrendingUp },
    { label: 'Faturamento do mês', value: formatCurrency(d.faturamentoMes), icon: DollarSign },
    { label: 'Ticket médio', value: formatCurrency(d.ticketMedio), icon: Repeat },
    { label: 'Clientes', value: String(d.clientes), icon: Users },
    { label: 'Profissionais ativos', value: String(d.profissionaisAtivos), icon: Scissors },
  ]

  return (
    <SalaoLayout>
      <div className="p-6 space-y-6">
        {isDemo && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            Modo demonstração — dados fictícios, nada é salvo.
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu salão</p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle>
                <k.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{k.value}</div></CardContent>
            </Card>
          ))}
        </div>

        {/* Faturamento + Top serviços */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Faturamento no mês (por dia)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <BarChart data={d.chart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))' }}
                      formatter={(v: number) => formatCurrency(v)}
                    />
                    <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top serviços</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.topServicos} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={2}>
                      {d.topServicos.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top profissionais + Próximos */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Top profissionais (faturamento)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={d.topProfissionais} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="nome" stroke="hsl(var(--muted-foreground))" width={80} fontSize={12} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      formatter={(v: number) => formatCurrency(v)}
                    />
                    <Bar dataKey="valor" fill="hsl(280 65% 62%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Próximos atendimentos</CardTitle></CardHeader>
            <CardContent>
              {d.proximos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agendamento próximo.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.proximos.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{a.cliente_nome ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{a.servico_nome ?? '—'} · {a.profissional_nome ?? '—'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatDate(a.data)}</p>
                          <p className="text-xs text-muted-foreground flex items-center justify-end gap-1"><Clock className="h-3 w-3" />{a.hora ?? '—'}</p>
                        </div>
                        <Badge variant="outline" className={STATUS_BADGE[a.status ?? ''] ?? ''}>{a.status ?? '—'}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SalaoLayout>
  )
}
