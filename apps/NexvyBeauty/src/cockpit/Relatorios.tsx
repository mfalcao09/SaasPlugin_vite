// ─── Relatórios & Gestão — visão analítica do salão (Cockpit) ────────────
// Estrutura portada do blueprint do Dashboard do salão (KPI grid + gráficos
// recharts, paleta pink), com a NOSSA camada de dados agregada client-side a
// partir de agendamentos / clientes / lancamentos / pacote_clientes — TODAS
// filtradas por organization_id. Componente data-injectable: sem `demo` busca
// Supabase real (cada card cai num empty state discreto quando vazio); com
// `demo` renderiza um seed realista que popula TODOS os gráficos sem tocar o
// banco (enabled: !isDemo em todas as queries — mesmo contrato do Dashboard).
//
// Renderiza BARE (sem SalaoLayout): vive dentro do CockpitShell/UnifiedShell
// via <Outlet/>, então só fornece o root `p-6 space-y-6` (igual HomeDeValor).

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Users, DollarSign, Repeat } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useOrganizationId, formatCurrency, NoOrg } from '@/pages/salao/_shared'
import { PageHeader } from '@/components/layout/PageHeader'

// Paleta de gráficos em HSL (nossos tokens são tripletas → hsl(...) explícito).
const CHART_COLORS = ['hsl(330 81% 60%)', 'hsl(280 65% 62%)', 'hsl(250 70% 62%)', 'hsl(45 90% 55%)', 'hsl(160 60% 45%)']

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  color: 'hsl(var(--popover-foreground))',
} as const

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_PT_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const DOW_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ─── Filtro de período ───────────────────────────────────────────────────
// O preset vira um range {from, to} (datas ISO YYYY-MM-DD). TODAS as agregações
// passam a filtrar por esse range. `mes` é só para o preset "mês a mês" (chave
// YYYY-MM do mês escolhido). new Date()/Date.now() são permitidos aqui (código
// de app, não script de workflow) — usados só para ancorar "hoje".
type PeriodPreset = '30d' | '60d' | '90d' | '6m' | 'mes'

interface PeriodRange { from: string; to: string }

// Formata um Date local como YYYY-MM-DD (sem passar por toISOString, que aplica
// UTC e poderia trocar o dia — alinha com feedback_iso_date_format_br).
function fmtDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Últimos N meses como chaves YYYY-MM (mais recente primeiro), p/ o dropdown de
// "mês a mês". 24 meses dão ~2 anos de histórico selecionável.
function lastMonthOptions(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  const base = new Date()
  for (let i = 0; i < n; i++) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
    out.push({ key, label: `${MESES_PT_FULL[m.getMonth()]}/${m.getFullYear()}` })
  }
  return out
}

// Resolve o range {from, to} a partir do preset (+ mês YYYY-MM quando "mês a mês").
function computeRange(preset: PeriodPreset, mes: string): PeriodRange {
  const today = new Date()
  if (preset === 'mes') {
    const [y, m] = mes.split('-').map(Number)
    const from = new Date(y, m - 1, 1)        // 1º dia do mês escolhido
    const to = new Date(y, m, 0)              // último dia do mês escolhido
    return { from: fmtDateLocal(from), to: fmtDateLocal(to) }
  }
  if (preset === '6m') {
    const from = new Date(today.getFullYear(), today.getMonth() - 5, 1) // início do mês, 6 meses
    return { from: fmtDateLocal(from), to: fmtDateLocal(today) }
  }
  const days = preset === '30d' ? 30 : preset === '60d' ? 60 : 90
  const from = new Date(today)
  from.setDate(from.getDate() - (days - 1))
  return { from: fmtDateLocal(from), to: fmtDateLocal(today) }
}

// Subtítulo legível do período ativo.
function periodLabel(preset: PeriodPreset, mes: string): string {
  switch (preset) {
    case '30d': return 'Visão dos últimos 30 dias'
    case '60d': return 'Visão dos últimos 60 dias'
    case '90d': return 'Visão dos últimos 90 dias'
    case '6m': return 'Visão dos últimos 6 meses'
    case 'mes': {
      const [y, m] = mes.split('-').map(Number)
      return `${MESES_PT_FULL[m - 1] ?? '?'}/${y}`
    }
  }
}

// ─── Shapes das linhas reais (subset do que cada tabela expõe) ───────────
interface AgendamentoRow {
  id: string
  data: string | null
  status: string | null
  valor: number | null
  cliente_nome: string | null
  profissional_nome: string | null
  servico_nome: string | null
  origem: string | null
}
interface ClienteRow {
  id: string
  created_at: string | null
}
interface LancamentoRow {
  id: string
  tipo: string | null
  valor: number | null
  data: string | null
  categoria: string | null
  status: string | null
}
interface PacoteClienteRow {
  id: string
  pacote_nome: string | null
  valor_pago: number | null
}

// ─── Dados agregados que os gráficos consomem (shape estável) ────────────
export interface RelatoriosData {
  kpis: { faturamento: number; atendimentos: number; ticketMedio: number; clientesAtivos: number }
  faturamentoPorMes: { mes: string; valor: number }[]
  servicosMaisAgendados: { name: string; value: number }[]
  receitaPorProfissional: { nome: string; valor: number }[]
  faturamentoPorServico: { name: string; valor: number }[]
  agendamentosPorStatus: { name: string; value: number }[]
  origemAgendamentos: { name: string; value: number }[]
  ocupacaoPorDia: { dia: string; value: number }[]
  clientesNovosPorMes: { mes: string; value: number }[]
  topClientes: { nome: string; valor: number }[]
  receitasVsDespesas: { mes: string; receitas: number; despesas: number }[]
  despesaPorCategoria: { name: string; value: number }[]
  pacotesVendidos: { nome: string; quantidade: number; valor: number }[]
}

// chaves YYYY-MM cobrindo o range {from, to} (mais antigo → mais recente), p/
// eixos densos. Substitui o antigo `lastMonthsKeys(6)` fixo: agora os gráficos
// de série mensal refletem exatamente o período escolhido (1 mês p/ "mês a mês",
// ~3 p/ 90 dias, 6 p/ "6 meses", etc.). Cap de 36 meses por segurança de eixo.
function monthKeysInRange(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: string[] = []
  let y = fy
  let m = fm
  for (let guard = 0; guard < 36; guard++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (y === ty && m === tm) break
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MESES_PT[Number(m) - 1] ?? '?'}/${y.slice(2)}`
}

// Predicado: a data ISO (YYYY-MM-DD ou timestamp) cai dentro do range [from, to]?
// Compara só a parte de data (slice 0..10), inclusivo nas pontas — comparação
// lexicográfica de strings YYYY-MM-DD é segura e evita new Date(iso) cru.
function inRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false
  const day = iso.slice(0, 10)
  return day >= from && day <= to
}

// ─── Agregação dos dados reais no shape RelatoriosData ───────────────────
// Recebe o range {from, to} (datas ISO) e filtra TODAS as agregações por ele:
// agendamentos/lancamentos por `data`, clientes por `created_at`. Os gráficos de
// série mensal cobrem exatamente os meses do range (via monthKeysInRange).
function aggregate(
  agendamentos: AgendamentoRow[],
  clientes: ClienteRow[],
  lancamentos: LancamentoRow[],
  pacotes: PacoteClienteRow[],
  range: PeriodRange,
): RelatoriosData {
  const { from, to } = range
  const meses = monthKeysInRange(from, to)

  // Recortes do range aplicados a cada fonte (1 vez, reusados abaixo).
  const agsRange = agendamentos.filter((a) => inRange(a.data, from, to))
  const lancsRange = lancamentos.filter((l) => inRange(l.data, from, to))
  const concluidos = agsRange.filter((a) => a.status === 'concluido')

  // KPIs (período = range).
  const faturamento = concluidos.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const atendimentos = concluidos.length
  const ticketMedio = atendimentos ? faturamento / atendimentos : 0
  const clientesAtivos = new Set(agsRange.map((a) => a.cliente_nome ?? '—')).size

  // 1. Faturamento por mês (concluídos no range).
  const fatMes: Record<string, number> = Object.fromEntries(meses.map((k) => [k, 0]))
  concluidos.forEach((a) => {
    const k = (a.data ?? '').slice(0, 7)
    if (k in fatMes) fatMes[k] += Number(a.valor ?? 0)
  })
  const faturamentoPorMes = meses.map((k) => ({ mes: monthLabel(k), valor: fatMes[k] }))

  // 2. Serviços mais agendados (count, top 8 — todos os status, no range).
  const srvCount: Record<string, number> = {}
  agsRange.forEach((a) => { const k = a.servico_nome ?? '—'; srvCount[k] = (srvCount[k] ?? 0) + 1 })
  const servicosMaisAgendados = Object.entries(srvCount)
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, value]) => ({ name, value }))

  // 3. Receita por profissional (SUM valor, concluídos no range).
  const profVal: Record<string, number> = {}
  concluidos.forEach((a) => { const k = a.profissional_nome ?? '—'; profVal[k] = (profVal[k] ?? 0) + Number(a.valor ?? 0) })
  const receitaPorProfissional = Object.entries(profVal)
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([nome, valor]) => ({ nome: nome.split(' ')[0], valor }))

  // 4. Faturamento por serviço (SUM valor, concluídos no range, top 8).
  const srvVal: Record<string, number> = {}
  concluidos.forEach((a) => { const k = a.servico_nome ?? '—'; srvVal[k] = (srvVal[k] ?? 0) + Number(a.valor ?? 0) })
  const faturamentoPorServico = Object.entries(srvVal)
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, valor]) => ({ name, valor }))

  // 5. Agendamentos por status (count, no range).
  const statusCount: Record<string, number> = {}
  agsRange.forEach((a) => { const k = a.status ?? '—'; statusCount[k] = (statusCount[k] ?? 0) + 1 })
  const agendamentosPorStatus = Object.entries(statusCount).map(([name, value]) => ({ name, value }))

  // 6. Origem dos agendamentos (count, no range).
  const origemCount: Record<string, number> = {}
  agsRange.forEach((a) => { const k = a.origem ?? 'interno'; origemCount[k] = (origemCount[k] ?? 0) + 1 })
  const origemAgendamentos = Object.entries(origemCount).map(([name, value]) => ({ name, value }))

  // 7. Ocupação por dia da semana (count, no range, data → dow). `T00:00:00`
  //    ancora local (evita shift de TZ de new Date(iso) — feedback_iso_date_format_br).
  const dowCount: number[] = [0, 0, 0, 0, 0, 0, 0]
  agsRange.forEach((a) => {
    const raw = a.data
    if (!raw) return
    const d = new Date(`${raw.slice(0, 10)}T00:00:00`)
    if (!Number.isNaN(d.getTime())) dowCount[d.getDay()] += 1
  })
  const ocupacaoPorDia = DOW_PT.map((dia, i) => ({ dia, value: dowCount[i] }))

  // 8. Clientes novos por mês (created_at no range).
  const novosMes: Record<string, number> = Object.fromEntries(meses.map((k) => [k, 0]))
  clientes.forEach((c) => {
    if (!inRange(c.created_at, from, to)) return
    const k = (c.created_at ?? '').slice(0, 7)
    if (k in novosMes) novosMes[k] += 1
  })
  const clientesNovosPorMes = meses.map((k) => ({ mes: monthLabel(k), value: novosMes[k] }))

  // 9. Top clientes por gasto (SUM valor, concluídos no range, top 10).
  const cliVal: Record<string, number> = {}
  concluidos.forEach((a) => { const k = a.cliente_nome ?? '—'; cliVal[k] = (cliVal[k] ?? 0) + Number(a.valor ?? 0) })
  const topClientes = Object.entries(cliVal)
    .sort(([, a], [, b]) => b - a).slice(0, 10).map(([nome, valor]) => ({ nome, valor }))

  // 10. Receitas vs Despesas por mês (lancamentos confirmados no range).
  const recMes: Record<string, number> = Object.fromEntries(meses.map((k) => [k, 0]))
  const despMes: Record<string, number> = Object.fromEntries(meses.map((k) => [k, 0]))
  const despCat: Record<string, number> = {}
  lancsRange.forEach((l) => {
    if (l.status && l.status !== 'confirmado') return
    const k = (l.data ?? '').slice(0, 7)
    const v = Number(l.valor ?? 0)
    if (l.tipo === 'entrada') { if (k in recMes) recMes[k] += v }
    else if (l.tipo === 'saida') {
      if (k in despMes) despMes[k] += v
      const cat = l.categoria ?? 'Outros'
      despCat[cat] = (despCat[cat] ?? 0) + v
    }
  })
  const receitasVsDespesas = meses.map((k) => ({ mes: monthLabel(k), receitas: recMes[k], despesas: despMes[k] }))
  const despesaPorCategoria = Object.entries(despCat)
    .sort(([, a], [, b]) => b - a).slice(0, 6).map(([name, value]) => ({ name, value }))

  // 11. Pacotes vendidos (count + SUM valor_pago por pacote_nome). pacote_clientes
  //     não expõe campo de data confiável → não filtra por range (visão total).
  const pacAgg: Record<string, { quantidade: number; valor: number }> = {}
  pacotes.forEach((p) => {
    const k = p.pacote_nome ?? '—'
    if (!pacAgg[k]) pacAgg[k] = { quantidade: 0, valor: 0 }
    pacAgg[k].quantidade += 1
    pacAgg[k].valor += Number(p.valor_pago ?? 0)
  })
  const pacotesVendidos = Object.entries(pacAgg)
    .sort(([, a], [, b]) => b.valor - a.valor)
    .map(([nome, v]) => ({ nome, quantidade: v.quantidade, valor: v.valor }))

  return {
    kpis: { faturamento, atendimentos, ticketMedio, clientesAtivos },
    faturamentoPorMes,
    servicosMaisAgendados,
    receitaPorProfissional,
    faturamentoPorServico,
    agendamentosPorStatus,
    origemAgendamentos,
    ocupacaoPorDia,
    clientesNovosPorMes,
    topClientes,
    receitasVsDespesas,
    despesaPorCategoria,
    pacotesVendidos,
  }
}

// Empty state discreto reusado por todos os cards (nunca quebra / NaN).
function EmptyState({ label = 'Sem dados ainda' }: { label?: string }) {
  return (
    <div className="flex h-72 w-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

// Card-shell padrão: título + corpo (gráfico ou empty state).
function ChartCard({
  title, isEmpty, className, children, emptyLabel,
}: {
  title: string
  isEmpty: boolean
  className?: string
  children: React.ReactNode
  emptyLabel?: string
}) {
  return (
    <Card className={className}>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {isEmpty ? <EmptyState label={emptyLabel} /> : <div className="h-72 w-full">{children}</div>}
      </CardContent>
    </Card>
  )
}

export default function Relatorios({ demo }: { demo?: RelatoriosData } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo

  // Filtro de período. Default "últimos 6 meses" (mesma janela do comportamento
  // anterior). `mesSel` só importa quando o preset é "mês a mês".
  const monthOptions = lastMonthOptions(24)
  const [preset, setPreset] = useState<PeriodPreset>('6m')
  const [mesSel, setMesSel] = useState<string>(monthOptions[0]?.key ?? '')
  const range = computeRange(preset, mesSel)

  const { data: agendamentos = [] } = useQuery({
    queryKey: ['relatorios-agendamentos', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, data, status, valor, cliente_nome, profissional_nome, servico_nome, origem')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as AgendamentoRow[]
    },
  })

  const { data: clientes = [] } = useQuery({
    queryKey: ['relatorios-clientes', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, created_at')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as ClienteRow[]
    },
  })

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['relatorios-lancamentos', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('id, tipo, valor, data, categoria, status')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as LancamentoRow[]
    },
  })

  const { data: pacotes = [] } = useQuery({
    queryKey: ['relatorios-pacotes', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacote_clientes')
        .select('id, pacote_nome, valor_pago')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as PacoteClienteRow[]
    },
  })

  if (!isDemo && !organizationId) {
    return <div className="p-6"><NoOrg /></div>
  }

  const d = demo ?? aggregate(agendamentos, clientes, lancamentos, pacotes, range)

  const kpis = [
    { label: 'Faturamento do período', value: formatCurrency(d.kpis.faturamento), icon: DollarSign },
    { label: 'Atendimentos concluídos', value: String(d.kpis.atendimentos), icon: Calendar },
    { label: 'Ticket médio', value: formatCurrency(d.kpis.ticketMedio), icon: Repeat },
    { label: 'Clientes ativos', value: String(d.kpis.clientesAtivos), icon: Users },
  ]

  // "Vazio" = sem nenhum valor relevante (evita renderizar eixo morto / NaN).
  const sumFat = d.faturamentoPorMes.reduce((s, x) => s + x.valor, 0)
  const sumNovos = d.clientesNovosPorMes.reduce((s, x) => s + x.value, 0)
  const sumRecDesp = d.receitasVsDespesas.reduce((s, x) => s + x.receitas + x.despesas, 0)

  return (
    <div className="p-6 space-y-6">
      {isDemo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          Modo demonstração — dados fictícios, nada é salvo.
        </div>
      )}

      <PageHeader
        title="Relatórios & Gestão"
        description={periodLabel(preset, mesSel)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="60d">Últimos 60 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
                <SelectItem value="mes">Mês a mês</SelectItem>
              </SelectContent>
            </Select>

            {preset === 'mes' && (
              <Select value={mesSel} onValueChange={setMesSel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        }
      />

      {/* KPI grid (4 cards) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

      {/* 1. Faturamento por mês (line, largo) + 5. Status (pie) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Faturamento por mês" isEmpty={sumFat === 0} className="lg:col-span-2">
          <ResponsiveContainer>
            <LineChart data={d.faturamentoPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="valor" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Agendamentos por status" isEmpty={d.agendamentosPorStatus.length === 0}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={d.agendamentosPorStatus} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={2}>
                {d.agendamentosPorStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 2. Serviços mais agendados (bar) + 4. Faturamento por serviço (bar) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Serviços mais agendados" isEmpty={d.servicosMaisAgendados.length === 0}>
          <ResponsiveContainer>
            <BarChart data={d.servicosMaisAgendados}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Agendamentos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Faturamento por serviço (R$)" isEmpty={d.faturamentoPorServico.length === 0}>
          <ResponsiveContainer>
            <BarChart data={d.faturamentoPorServico}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="valor" name="Faturamento" fill="hsl(280 65% 62%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 3. Receita por profissional (bar horizontal) + 6. Origem (pie) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Receita por profissional" isEmpty={d.receitaPorProfissional.length === 0}>
          <ResponsiveContainer>
            <BarChart data={d.receitaPorProfissional} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis type="category" dataKey="nome" stroke="hsl(var(--muted-foreground))" width={80} fontSize={12} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="valor" name="Receita" fill="hsl(250 70% 62%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Origem dos agendamentos" isEmpty={d.origemAgendamentos.length === 0}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={d.origemAgendamentos} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={2}>
                {d.origemAgendamentos.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 7. Ocupação por dia da semana (bar) + 8. Clientes novos por mês (line) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Ocupação por dia da semana" isEmpty={d.ocupacaoPorDia.every((x) => x.value === 0)}>
          <ResponsiveContainer>
            <BarChart data={d.ocupacaoPorDia}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="Agendamentos" fill="hsl(45 90% 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Clientes novos por mês" isEmpty={sumNovos === 0}>
          <ResponsiveContainer>
            <LineChart data={d.clientesNovosPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="value" name="Novos clientes" stroke="hsl(160 60% 45%)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 9. Top clientes por gasto (bar horizontal) + 11. Pacotes vendidos (tabela) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top clientes por gasto" isEmpty={d.topClientes.length === 0}>
          <ResponsiveContainer>
            <BarChart data={d.topClientes} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis type="category" dataKey="nome" stroke="hsl(var(--muted-foreground))" width={110} fontSize={11} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="valor" name="Total gasto" fill="hsl(330 81% 60%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader><CardTitle className="text-base">Pacotes vendidos</CardTitle></CardHeader>
          <CardContent className="p-0">
            {d.pacotesVendidos.length === 0 ? (
              <div className="flex h-72 w-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Sem dados ainda</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-6 py-2 text-xs font-medium text-muted-foreground">
                  <span>Pacote</span><span className="text-right">Qtd</span><span className="text-right">Total</span>
                </div>
                {d.pacotesVendidos.map((p) => (
                  <div key={p.nome} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-6 py-3">
                    <span className="truncate text-sm font-medium">{p.nome}</span>
                    <span className="text-right text-sm tabular-nums">{p.quantidade}</span>
                    <span className="text-right text-sm font-semibold tabular-nums">{formatCurrency(p.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 10. Receitas vs Despesas (bar agrupado) + Despesa por categoria (pie) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Receitas vs Despesas (por mês)" isEmpty={sumRecDesp === 0} className="lg:col-span-2">
          <ResponsiveContainer>
            <BarChart data={d.receitasVsDespesas}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="receitas" name="Receitas" fill="hsl(160 60% 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" name="Despesas" fill="hsl(0 72% 58%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Despesa por categoria" isEmpty={d.despesaPorCategoria.length === 0}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={d.despesaPorCategoria} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={2}>
                {d.despesaPorCategoria.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}

// ─── Seed do modo demonstração ──────────────────────────────────────────
// Dados FICTÍCIOS que populam TODOS os gráficos. Espelham o shape RelatoriosData
// (nada aqui toca o Supabase). Exportado pra rotas /demo do Cockpit reusarem.
export const DEMO_RELATORIOS: RelatoriosData = {
  kpis: { faturamento: 96420, atendimentos: 678, ticketMedio: 142.21, clientesAtivos: 214 },
  faturamentoPorMes: [
    { mes: 'Jan/26', valor: 12400 }, { mes: 'Fev/26', valor: 13980 }, { mes: 'Mar/26', valor: 15120 },
    { mes: 'Abr/26', valor: 16740 }, { mes: 'Mai/26', valor: 18180 }, { mes: 'Jun/26', valor: 20000 },
  ],
  servicosMaisAgendados: [
    { name: 'Corte', value: 142 }, { name: 'Esmaltação em gel', value: 118 }, { name: 'Manicure', value: 96 },
    { name: 'Alongamento de cílios', value: 74 }, { name: 'Coloração', value: 61 }, { name: 'Spa dos pés', value: 48 },
    { name: 'Design de sobrancelha', value: 39 }, { name: 'Limpeza de pele', value: 27 },
  ],
  receitaPorProfissional: [
    { nome: 'Ana', valor: 28400 }, { nome: 'Bruna', valor: 22150 }, { nome: 'Carla', valor: 18900 },
    { nome: 'Diego', valor: 14600 }, { nome: 'Elaine', valor: 12370 },
  ],
  faturamentoPorServico: [
    { name: 'Alongamento de cílios', valor: 26800 }, { name: 'Coloração', valor: 19420 }, { name: 'Esmaltação em gel', valor: 16200 },
    { name: 'Corte', valor: 11800 }, { name: 'Manicure', valor: 9600 }, { name: 'Limpeza de pele', valor: 7300 },
    { name: 'Design de sobrancelha', valor: 3120 }, { name: 'Spa dos pés', valor: 2180 },
  ],
  agendamentosPorStatus: [
    { name: 'concluido', value: 678 }, { name: 'confirmado', value: 84 }, { name: 'agendado', value: 52 }, { name: 'cancelado', value: 41 },
  ],
  origemAgendamentos: [
    { name: 'interno', value: 512 }, { name: 'publico', value: 248 }, { name: 'whatsapp', value: 95 },
  ],
  ocupacaoPorDia: [
    { dia: 'Dom', value: 12 }, { dia: 'Seg', value: 88 }, { dia: 'Ter', value: 132 }, { dia: 'Qua', value: 121 },
    { dia: 'Qui', value: 156 }, { dia: 'Sex', value: 198 }, { dia: 'Sáb', value: 148 },
  ],
  clientesNovosPorMes: [
    { mes: 'Jan/26', value: 24 }, { mes: 'Fev/26', value: 31 }, { mes: 'Mar/26', value: 28 },
    { mes: 'Abr/26', value: 37 }, { mes: 'Mai/26', value: 42 }, { mes: 'Jun/26', value: 52 },
  ],
  topClientes: [
    { nome: 'Marina Lopes', valor: 4280 }, { nome: 'Júlia Ferreira', valor: 3940 }, { nome: 'Patrícia Gomes', valor: 3610 },
    { nome: 'Renata Dias', valor: 3120 }, { nome: 'Camila Rocha', valor: 2880 }, { nome: 'Fernanda Alves', valor: 2540 },
    { nome: 'Beatriz Nunes', valor: 2310 }, { nome: 'Larissa Melo', valor: 2090 }, { nome: 'Tatiane Cruz', valor: 1870 },
    { nome: 'Vanessa Pires', valor: 1650 },
  ],
  receitasVsDespesas: [
    { mes: 'Jan/26', receitas: 12400, despesas: 7200 }, { mes: 'Fev/26', receitas: 13980, despesas: 7600 },
    { mes: 'Mar/26', receitas: 15120, despesas: 8100 }, { mes: 'Abr/26', receitas: 16740, despesas: 8400 },
    { mes: 'Mai/26', receitas: 18180, despesas: 8950 }, { mes: 'Jun/26', receitas: 20000, despesas: 9300 },
  ],
  despesaPorCategoria: [
    { name: 'Produtos', value: 18600 }, { name: 'Aluguel', value: 12000 }, { name: 'Comissões', value: 9400 },
    { name: 'Marketing', value: 4200 }, { name: 'Energia', value: 2800 }, { name: 'Outros', value: 2550 },
  ],
  pacotesVendidos: [
    { nome: 'Pacote Cílios 4x', quantidade: 18, valor: 9720 },
    { nome: 'Pacote Coloração 5x', quantidade: 14, valor: 5600 },
    { nome: 'Pacote Unha + pé 8x', quantidade: 11, valor: 3520 },
    { nome: 'Pacote Limpeza de pele 10x', quantidade: 7, valor: 2450 },
  ],
}
