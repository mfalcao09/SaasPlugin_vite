// ─── Início — Cockpit de Ação diário da cabeleireira ────────────────────────
// NÃO é uma página de análise (os gráficos vivem nas páginas-dona). Cada bloco
// mostra NÚMERO + 1 CTA → página-dona (regra anti-Frankenstein). Responde em
// <10s: "tô ganhando?", "como tá meu dia?", "onde tem dinheiro + o que faço?".
//
// Dados client-side por organization_id (padrão do AiGrowth/Relatorios/PrecisaDeVoce),
// react-query, agregação em useMemo. TZ-safe: chaves de mês via .slice(0,7) e datas
// YYYY-MM-DD comparadas como string; new Date() só p/ "agora" (feedback_iso_date_format_br).
//
// Blocos: A (KPIs+comparação+perda de agenda) · B (seu dia) · C (onde tem dinheiro,
// reusa levers.ts) · D (precisa de você + tarefas) · E (destaques) · F (insights de
// crescimento) · G (ocupação % — capacidade = profissionais × horários × dias).
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, DollarSign, Repeat, CalendarCheck, CalendarX,
  Sparkles, Gauge, Trophy, Award, PackageCheck, ListTodo, ArrowRight,
  Clock, Lightbulb, Users, type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useOrganizationId, formatCurrency } from '@/pages/salao/_shared'
import { useAuth } from '@/hooks/useAuth'
import { useTodaysTasks } from '@/hooks/useTasks'
import PrecisaDeVoce from './PrecisaDeVoce'
import {
  buildLevers, aggregateLevers,
  type AgendamentoRow as LeverAgendamento, type PacoteClienteRow as LeverPacote,
} from './levers'

// ─── Shapes das linhas reais ────────────────────────────────────────────────
interface AgRow {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  profissional_nome: string | null
  servico_nome: string | null
  status: string | null
  data: string | null
  hora: string | null
  valor: number | null
  duracao_minutos: number | null
}
interface PacRow {
  id: string
  pacote_nome: string | null
  cliente_nome: string | null
  total_sessoes: number | null
  sessoes_usadas: number | null
  valor_pago: number | null
  data_validade: string | null
  status: string | null
}
interface ProfRow {
  id: string
  ativo: boolean | null
  hora_inicio: string | null
  hora_fim: string | null
  dias_atendimento: number[] | null
}
interface LancRow { valor: number | null; data: string | null }

// ─── Helpers de data/tempo (TZ-safe) ────────────────────────────────────────
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function monthKey(offset = 0): string {
  const n = new Date()
  const d = new Date(n.getFullYear(), n.getMonth() + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function minutesOfDay(t: string | null | undefined): number {
  if (!t) return 0
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
function parseLocal(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(`${String(raw).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
// Semana corrente (segunda → domingo) como datas locais.
function weekDays(): Date[] {
  const now = new Date()
  const dow = now.getDay() // 0=dom..6=sáb
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
}

const BOOKED_STATUS = ['agendado', 'confirmado', 'chegou', 'concluido']
const LOST_STATUS = ['cancelado', 'no_show', 'faltou']

export default function Inicio() {
  const organizationId = useOrganizationId()
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: agendamentos } = useQuery({
    queryKey: ['inicio-agendamentos', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, cliente_id, cliente_nome, profissional_nome, servico_nome, status, data, hora, valor, duracao_minutos')
        .eq('organization_id', organizationId!)
        .limit(5000)
      if (error) throw error
      return (data ?? []) as AgRow[]
    },
  })

  const { data: lancamentos } = useQuery({
    queryKey: ['inicio-lancamentos', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lancamentos')
        .select('valor, data')
        .eq('organization_id', organizationId!)
        .eq('tipo', 'entrada')
        .eq('status', 'confirmado')
        .limit(5000)
      if (error) throw error
      return (data ?? []) as LancRow[]
    },
  })

  const { data: pacotes } = useQuery({
    queryKey: ['inicio-pacotes', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacote_clientes')
        .select('id, pacote_nome, cliente_nome, total_sessoes, sessoes_usadas, valor_pago, data_validade, status')
        .eq('organization_id', organizationId!)
        .limit(2000)
      if (error) throw error
      return (data ?? []) as PacRow[]
    },
  })

  const { data: profissionais } = useQuery({
    queryKey: ['inicio-profissionais', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profissionais')
        .select('id, ativo, hora_inicio, hora_fim, dias_atendimento')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as unknown as ProfRow[]
    },
  })

  const { data: tarefasHoje } = useTodaysTasks(user?.id ?? '')

  const m = useMemo(
    () => compute(agendamentos ?? [], lancamentos ?? [], pacotes ?? [], profissionais ?? []),
    [agendamentos, lancamentos, pacotes, profissionais],
  )

  const tarefasPendentes = (tarefasHoje ?? []).filter((t: any) => t.status !== 'completed').length

  if (!organizationId) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Sua conta ainda não está vinculada a um negócio. Conclua o onboarding para ver seu painel.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seu negócio hoje</h1>
        <p className="text-sm text-muted-foreground">Um raio-x rápido + o que pedir atenção agora.</p>
      </div>

      {/* ── Bloco A — Como vai o salão ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Faturamento do mês" icon={DollarSign}
          value={formatCurrency(m.faturamentoMes)} delta={m.faturamentoDelta}
          onClick={() => navigate('/faturamento')}
        />
        <KpiCard
          label="Ticket médio" icon={Repeat}
          value={formatCurrency(m.ticketMedio)} delta={m.ticketDelta}
          onClick={() => navigate('/relatorios')}
        />
        <KpiCard
          label="Atendimentos no mês" icon={CalendarCheck}
          value={String(m.atendimentosMes)} delta={m.atendimentosDelta}
          onClick={() => navigate('/relatorios')}
        />
        <KpiCard
          label="Perda de agenda" icon={CalendarX} danger
          value={formatCurrency(m.perdaValor)}
          hint={m.perdaCount > 0 ? `${m.perdaCount} desmarcação${m.perdaCount === 1 ? '' : 'ões'} · ${m.desmarcacaoPct.toFixed(0)}%` : 'Nenhuma no mês 🎉'}
          onClick={() => navigate('/faturamento')}
        />
      </div>

      {/* ── Blocos C (dinheiro) + G (ocupação) ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OndeTemDinheiro
          total={m.recuperavel} count={m.recuperavelCount}
          top={m.topLever} onCTA={() => navigate('/ai-growth')}
        />
        <OcupacaoCard
          semana={m.ocupacaoSemana} hoje={m.ocupacaoHoje}
          temCapacidade={m.temCapacidade} onCTA={() => navigate('/agenda')}
        />
      </div>

      {/* ── Blocos B (seu dia) + D (precisa de você) ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SeuDia proximos={m.proximosHoje} onCTA={() => navigate('/agenda')} />
        <div className="space-y-4">
          <PrecisaDeVoce />
          <TarefasHoje count={tarefasPendentes} onCTA={() => navigate('/tarefas')} />
        </div>
      </div>

      {/* ── Blocos E (destaques) + F (insights) ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Destaques
          topServico={m.topServico} topProfissional={m.topProfissional}
          pacotesCount={m.pacotesRenovarCount} pacotesValor={m.pacotesRenovarValor}
          onServicos={() => navigate('/relatorios')} onPacotes={() => navigate('/clientes')}
        />
        <Insights itens={m.insights} onCTA={() => navigate('/relatorios')} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Agregação pura — testável e fora do componente (sem hooks).
// ════════════════════════════════════════════════════════════════════════════
function compute(ags: AgRow[], lancs: LancRow[], pacs: PacRow[], profs: ProfRow[]) {
  const mesAtual = monthKey(0)
  const mesAnterior = monthKey(-1)
  const hojeStr = ymd(new Date())

  // ── Bloco A: faturamento (caixa) mês atual vs anterior ──
  const fatBy = (mk: string) => lancs.filter((l) => (l.data ?? '').slice(0, 7) === mk).reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const faturamentoMes = fatBy(mesAtual)
  const faturamentoPrev = fatBy(mesAnterior)

  // concluídos do mês (ticket/atendimentos) — base de agendamentos
  const concluidos = ags.filter((a) => a.status === 'concluido')
  const concluidosMes = concluidos.filter((a) => (a.data ?? '').slice(0, 7) === mesAtual)
  const concluidosPrev = concluidos.filter((a) => (a.data ?? '').slice(0, 7) === mesAnterior)
  const atendimentosMes = concluidosMes.length
  const somaMes = concluidosMes.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const ticketMedio = atendimentosMes ? somaMes / atendimentosMes : 0
  const somaPrev = concluidosPrev.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const ticketPrev = concluidosPrev.length ? somaPrev / concluidosPrev.length : 0

  // perda de agenda (desmarcação) no mês
  const noMes = ags.filter((a) => (a.data ?? '').slice(0, 7) === mesAtual)
  const perdidos = noMes.filter((a) => LOST_STATUS.includes(a.status ?? ''))
  const perdaValor = perdidos.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const perdaCount = perdidos.length
  const desmarcacaoPct = noMes.length ? (perdaCount / noMes.length) * 100 : 0

  // ── Bloco C: alavancas (reusa levers.ts) ──
  const levers = buildLevers(ags as unknown as LeverAgendamento[], pacs as unknown as LeverPacote[])
  const { total: recuperavel, count: recuperavelCount } = aggregateLevers(levers)
  const comValor = levers.filter((l) => l.estimated > 0)
  const topLever = comValor.length ? comValor.reduce((a, b) => (b.estimated > a.estimated ? b : a)) : null

  // ── Bloco G: ocupação (capacidade = profissionais × horários × dias) ──
  const ativos = profs.filter((p) => p.ativo !== false)
  const diasSemana = weekDays()
  let capSemana = 0
  for (const p of ativos) {
    const perDay = Math.max(0, minutesOfDay(p.hora_fim) - minutesOfDay(p.hora_inicio))
    const dias = Array.isArray(p.dias_atendimento) ? p.dias_atendimento : []
    for (const day of diasSemana) if (dias.includes(day.getDay())) capSemana += perDay
  }
  const startStr = ymd(diasSemana[0])
  const endStr = ymd(diasSemana[6])
  const bookedSemana = ags
    .filter((a) => { const d = (a.data ?? '').slice(0, 10); return d >= startStr && d <= endStr && BOOKED_STATUS.includes(a.status ?? '') })
    .reduce((s, a) => s + Number(a.duracao_minutos ?? 30), 0)
  const ocupacaoSemana = capSemana > 0 ? Math.min(100, (bookedSemana / capSemana) * 100) : null

  const dowHoje = new Date().getDay()
  let capHoje = 0
  for (const p of ativos) {
    const dias = Array.isArray(p.dias_atendimento) ? p.dias_atendimento : []
    if (dias.includes(dowHoje)) capHoje += Math.max(0, minutesOfDay(p.hora_fim) - minutesOfDay(p.hora_inicio))
  }
  const bookedHoje = ags
    .filter((a) => (a.data ?? '').slice(0, 10) === hojeStr && BOOKED_STATUS.includes(a.status ?? ''))
    .reduce((s, a) => s + Number(a.duracao_minutos ?? 30), 0)
  const ocupacaoHoje = capHoje > 0 ? Math.min(100, (bookedHoje / capHoje) * 100) : null

  // ── Bloco B: próximos de hoje ──
  const proximosHoje = ags
    .filter((a) => (a.data ?? '').slice(0, 10) === hojeStr && ['agendado', 'confirmado', 'chegou'].includes(a.status ?? ''))
    .sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''))
    .slice(0, 6)

  // ── Bloco E: destaques do mês ──
  const topServico = topBy(concluidosMes, (a) => a.servico_nome)
  const topProfissional = topBy(concluidosMes, (a) => a.profissional_nome)
  const pacotesRenovar = pacs.filter((p) => {
    if (p.status && p.status !== 'ativo') return false
    const venc = parseLocal(p.data_validade)
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const diasPra = venc ? Math.round((venc.getTime() - hoje.getTime()) / 86_400_000) : null
    const venceLogo = diasPra !== null && diasPra >= 0 && diasPra <= 30
    const restantes = Number(p.total_sessoes ?? 0) - Number(p.sessoes_usadas ?? 0)
    const quaseSemSessao = Number(p.total_sessoes ?? 0) > 0 && restantes <= 1
    return venceLogo || quaseSemSessao
  })
  const pacotesRenovarValor = pacotesRenovar.reduce((s, p) => s + Number(p.valor_pago ?? 0), 0)

  // ── Bloco F: insights de crescimento (gestão PME) ──
  const insights = buildInsights(concluidos, mesAtual, mesAnterior)

  return {
    faturamentoMes, faturamentoDelta: pctDelta(faturamentoMes, faturamentoPrev),
    ticketMedio, ticketDelta: pctDelta(ticketMedio, ticketPrev),
    atendimentosMes, atendimentosDelta: pctDelta(atendimentosMes, concluidosPrev.length),
    perdaValor, perdaCount, desmarcacaoPct,
    recuperavel, recuperavelCount, topLever,
    ocupacaoSemana, ocupacaoHoje, temCapacidade: capSemana > 0,
    proximosHoje,
    topServico, topProfissional,
    pacotesRenovarCount: pacotesRenovar.length, pacotesRenovarValor,
    insights,
  }
}

// variação % (higher-is-better). null se não há base anterior.
function pctDelta(cur: number, prev: number): number | null {
  if (!prev || prev <= 0) return null
  return ((cur - prev) / prev) * 100
}

function topBy(rows: AgRow[], key: (a: AgRow) => string | null): { nome: string; valor: number } | null {
  const map = new Map<string, number>()
  for (const a of rows) {
    const k = key(a)
    if (!k) continue
    map.set(k, (map.get(k) ?? 0) + Number(a.valor ?? 0))
  }
  if (map.size === 0) return null
  const [nome, valor] = [...map.entries()].sort(([, a], [, b]) => b - a)[0]
  return { nome, valor }
}

interface InsightItem { icon: LucideIcon; texto: string; tecnica: string }
// 3 insights de gestão computáveis client-side (churn, Pareto/ABC, frequência).
function buildInsights(concluidos: AgRow[], mesAtual: string, mesAnterior: string): InsightItem[] {
  const out: InsightItem[] = []
  const keyOf = (a: AgRow) => a.cliente_id ?? (a.cliente_nome ? `n:${a.cliente_nome}` : null)

  // Churn mensal: clientes que vieram mês passado e não voltaram este mês.
  const prevSet = new Set<string>()
  const curSet = new Set<string>()
  for (const a of concluidos) {
    const k = keyOf(a); if (!k) continue
    const mk = (a.data ?? '').slice(0, 7)
    if (mk === mesAnterior) prevSet.add(k)
    if (mk === mesAtual) curSet.add(k)
  }
  if (prevSet.size >= 3) {
    const sumiram = [...prevSet].filter((k) => !curSet.has(k)).length
    const pct = (sumiram / prevSet.size) * 100
    out.push({
      icon: TrendingDown,
      texto: `${pct.toFixed(0)}% dos clientes do mês passado ainda não voltaram (${sumiram} de ${prevSet.size}).`,
      tecnica: 'Taxa de churn',
    })
  }

  // Concentração de receita (Pareto/ABC): top 20% dos clientes = X% da receita.
  const gasto = new Map<string, number>()
  for (const a of concluidos) {
    const k = keyOf(a); if (!k) continue
    gasto.set(k, (gasto.get(k) ?? 0) + Number(a.valor ?? 0))
  }
  if (gasto.size >= 5) {
    const valores = [...gasto.values()].sort((a, b) => b - a)
    const totalRec = valores.reduce((s, v) => s + v, 0)
    const topN = Math.max(1, Math.ceil(valores.length * 0.2))
    const topRec = valores.slice(0, topN).reduce((s, v) => s + v, 0)
    const share = totalRec > 0 ? (topRec / totalRec) * 100 : 0
    out.push({
      icon: Users,
      texto: `Seus ${topN} melhores clientes (top 20%) trazem ${share.toFixed(0)}% da receita — cuide deles.`,
      tecnica: 'Curva ABC / Pareto',
    })
  }

  // Frequência média de retorno: dias médios entre visitas (clientes com 2+ visitas).
  const datasPorCliente = new Map<string, Date[]>()
  for (const a of concluidos) {
    const k = keyOf(a); if (!k) continue
    const d = parseLocal(a.data); if (!d) continue
    const arr = datasPorCliente.get(k) ?? []
    arr.push(d); datasPorCliente.set(k, arr)
  }
  const gaps: number[] = []
  for (const arr of datasPorCliente.values()) {
    if (arr.length < 2) continue
    arr.sort((a, b) => a.getTime() - b.getTime())
    let soma = 0
    for (let i = 1; i < arr.length; i++) soma += (arr[i].getTime() - arr[i - 1].getTime()) / 86_400_000
    gaps.push(soma / (arr.length - 1))
  }
  if (gaps.length >= 2) {
    const media = gaps.reduce((s, g) => s + g, 0) / gaps.length
    out.push({
      icon: Repeat,
      texto: `Em média seus clientes voltam a cada ${Math.round(media)} dias. Um lembrete na hora certa antecipa a próxima visita.`,
      tecnica: 'Frequência (RFM)',
    })
  }

  return out
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-componentes de apresentação
// ════════════════════════════════════════════════════════════════════════════
function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-muted-foreground">novo</span>
  const up = value >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  )
}

function KpiCard({
  label, icon: Icon, value, delta, hint, danger, onClick,
}: {
  label: string; icon: LucideIcon; value: string
  delta?: number | null; hint?: string; danger?: boolean; onClick?: () => void
}) {
  return (
    <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={onClick}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${danger ? 'text-red-500' : 'text-primary'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</div>
        <div className="mt-1">
          {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : delta !== undefined ? <Delta value={delta ?? null} /> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function OndeTemDinheiro({
  total, count, top, onCTA,
}: { total: number; count: number; top: { title: string; description: string; estimated: number } | null; onCTA: () => void }) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Onde tem dinheiro
        </CardTitle>
        <Button size="sm" onClick={onCTA}>Ver oportunidades <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <div className="text-3xl font-bold text-primary">{formatCurrency(total)}</div>
          <p className="text-xs text-muted-foreground">recuperáveis em {count} oportunidade{count === 1 ? '' : 's'} que a IA achou.</p>
        </div>
        {top && total > 0 && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-sm font-medium text-foreground">{top.title} · {formatCurrency(top.estimated)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{top.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OcupacaoCard({
  semana, hoje, temCapacidade, onCTA,
}: { semana: number | null; hoje: number | null; temCapacidade: boolean; onCTA: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" /> Ocupação da agenda
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onCTA}>Abrir agenda <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!temCapacidade ? (
          <p className="text-sm text-muted-foreground">
            Defina o horário e os dias de trabalho dos profissionais (no cadastro) para medir a ocupação.
          </p>
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">Esta semana</span>
                <span className="text-2xl font-bold">{semana === null ? '—' : `${semana.toFixed(0)}%`}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${semana ?? 0}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hoje</span>
              <span className="font-medium">{hoje === null ? '—' : `${hoje.toFixed(0)}%`}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quanto mais perto de 100%, mais cheia. Espaço livre = oportunidade de encher com promoções.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SeuDia({ proximos, onCTA }: { proximos: AgRow[]; onCTA: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4 text-primary" /> Seu dia
          <Badge variant="secondary" className="ml-1">{proximos.length}</Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onCTA}>Ver agenda <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
      </CardHeader>
      <CardContent>
        {proximos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum atendimento marcado pra hoje.</p>
        ) : (
          <ul className="divide-y divide-border">
            {proximos.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.cliente_nome ?? '—'}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.servico_nome ?? '—'} · {a.profissional_nome ?? '—'}</p>
                </div>
                <span className="ml-2 inline-flex shrink-0 items-center gap-1 text-sm font-medium">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />{(a.hora ?? '').slice(0, 5) || '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TarefasHoje({ count, onCTA }: { count: number; onCTA: () => void }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListTodo className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {count > 0 ? `${count} tarefa${count === 1 ? '' : 's'} pra hoje` : 'Nenhuma tarefa pra hoje'}
            </p>
            <p className="text-xs text-muted-foreground">Suas pendências do dia</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onCTA}>Abrir <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
      </CardContent>
    </Card>
  )
}

function Destaques({
  topServico, topProfissional, pacotesCount, pacotesValor, onServicos, onPacotes,
}: {
  topServico: { nome: string; valor: number } | null
  topProfissional: { nome: string; valor: number } | null
  pacotesCount: number; pacotesValor: number
  onServicos: () => void; onPacotes: () => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-primary" /> Destaques do mês
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <DestaqueRow icon={Sparkles} label="Serviço campeão"
          value={topServico ? `${topServico.nome} · ${formatCurrency(topServico.valor)}` : 'Sem dados ainda'}
          onClick={onServicos} />
        <DestaqueRow icon={Award} label="Profissional destaque"
          value={topProfissional ? `${topProfissional.nome.split(' ')[0]} · ${formatCurrency(topProfissional.valor)}` : 'Sem dados ainda'}
          onClick={onServicos} />
        <DestaqueRow icon={PackageCheck} label="Pacotes a renovar"
          value={pacotesCount > 0 ? `${pacotesCount} vencendo · ${formatCurrency(pacotesValor)}` : 'Nenhum vencendo'}
          onClick={onPacotes} />
      </CardContent>
    </Card>
  )
}

function DestaqueRow({ icon: Icon, label, value, onClick }: { icon: LucideIcon; label: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-left transition-colors hover:border-primary/40">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium text-foreground">{value}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function Insights({ itens, onCTA }: { itens: InsightItem[]; onCTA: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" /> Insights de crescimento
        </CardTitle>
        {itens.length > 0 && (
          <Button size="sm" variant="outline" onClick={onCTA}>Ver mais <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {itens.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Conforme você atende, a IA vai destravando insights de gestão aqui.
          </p>
        ) : (
          itens.map((it, i) => {
            const Icon = it.icon
            return (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm text-foreground">{it.texto}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{it.tecnica}</p>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
