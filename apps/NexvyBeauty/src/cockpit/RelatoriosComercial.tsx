// Relatórios comerciais UNIFICADOS — analytics de todo o comercial em TABS.
//
// • Atendimento  → WebChatReportsTab (KPIs + distribuição por status) reusado
//                  como está + estratificações extras (por atendente, por canal,
//                  por hora/dia da semana, performance por atendente e sentimento
//                  via Radar IA) derivadas de webchat_conversations, com filtro de período.
// • Captação     → CaptureAnalyticsSection (analytics de quizzes/captação)
//                  reusado direto do Admin (?tab=capture-analytics).
// • Vendas       → leads gerados via chat + taxa de conversão chat → venda
//                  (tabela `leads`, por organization_id, respeitando o período).
//
// Nenhuma lógica é duplicada: os componentes originais são importados e compostos.
import { lazy, Suspense, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users, Radio, BarChart3, Clock, CalendarDays, Smile, MessageSquare, TrendingUp,
  DollarSign, Filter, UserCheck,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { supabase } from '@/integrations/supabase/client'
import { WebChatReportsTab } from '@/components/admin/webchat/WebChatReportsTab'
import { useWebChatConversations, type WebChatConversation } from '@/hooks/useWebChat'
import { useOpportunityScans, useScanItems } from '@/hooks/useOpportunityScan'
import { useOrganizationId, formatCurrency } from '@/pages/salao/_shared'

// Analytics de captação (mesmo componente do Admin > Captação > Analytics).
// Carregado sob demanda — só baixa o chunk quando a aba é aberta.
const CaptureAnalyticsSection = lazy(() =>
  import('@/components/admin/capture/channels/CaptureAnalyticsSection').then(
    (m) => ({ default: m.CaptureAnalyticsSection }),
  ),
)

const PERIODS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o período' },
] as const

// Rótulos amigáveis por canal. Canais desconhecidos caem no próprio valor cru.
const CHANNEL_LABELS: Record<string, string> = {
  webchat: 'Site (Web Chat)',
  site: 'Site (Web Chat)',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  telegram: 'Telegram',
}

function channelLabel(channel: string | null | undefined): string {
  if (!channel) return 'Não informado'
  return CHANNEL_LABELS[channel] ?? channel
}

// Canais considerados "chat" para os relatórios de Vendas (leads gerados via chat).
const CHAT_CHANNELS = ['whatsapp', 'webchat', 'site', 'instagram', 'messenger'] as const

// Converte o `period` ('7'|'30'|'90'|'all') em um range {from,to} ISO.
// `from === null` significa "todo o período" (sem corte inferior). Não usa
// `new Date(iso)` cru sobre strings YYYY-MM-DD — aqui é só aritmética de Date.
function periodRange(period: string): { from: string | null; to: string } {
  const to = new Date().toISOString()
  if (period === 'all') return { from: null, to }
  const days = Number(period)
  if (!Number.isFinite(days)) return { from: null, to }
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  return { from, to }
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

export default function RelatoriosComercial() {
  const [period, setPeriod] = useState<string>('30')

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Analytics Comerciais
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="atendimento">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="atendimento">Atendimento</TabsTrigger>
          <TabsTrigger value="captacao">Captação / Quizzes</TabsTrigger>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
        </TabsList>

        {/* ── Atendimento ─────────────────────────────────────────── */}
        <TabsContent value="atendimento" className="mt-4 space-y-6">
          {/* KPIs + distribuição por status (componente original, intacto) */}
          <WebChatReportsTab />
          {/* Estratificações extras (por atendente, por canal) */}
          <AtendimentoStratification period={period} />
        </TabsContent>

        {/* ── Captação / Quizzes ──────────────────────────────────── */}
        <TabsContent value="captacao" className="mt-4">
          <Suspense
            fallback={
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
              </div>
            }
          >
            <CaptureAnalyticsSection />
          </Suspense>
        </TabsContent>

        {/* ── Vendas ──────────────────────────────────────────────── */}
        <TabsContent value="vendas" className="mt-4 space-y-6">
          <VendasReports period={period} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Estratificações do atendimento. Reusa o MESMO hook do WebChatReportsTab
// (react-query desduplica a chamada), aplica o filtro de período no cliente
// e quebra por atendente e por canal. Sem dado → empty state discreto.
// ───────────────────────────────────────────────────────────────────
function AtendimentoStratification({ period }: { period: string }) {
  const { data: allConversations, isLoading } = useWebChatConversations({ tab: 'all', limit: 200 })

  const inPeriod = useMemo(() => {
    const rows = allConversations || []
    if (period === 'all') return rows
    const days = Number(period)
    if (!Number.isFinite(days)) return rows
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    return rows.filter((c) => {
      const t = c.created_at ? new Date(c.created_at).getTime() : NaN
      return Number.isFinite(t) && t >= since
    })
  }, [allConversations, period])

  const byAgent = useMemo(() => groupByAgent(inPeriod), [inPeriod])
  const byChannel = useMemo(() => groupByChannel(inPeriod), [inPeriod])
  const byHour = useMemo(() => groupByHour(inPeriod), [inPeriod])
  const byWeekday = useMemo(() => groupByWeekday(inPeriod), [inPeriod])
  const agentPerf = useMemo(() => agentPerformance(inPeriod), [inPeriod])

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  const hasHourData = byHour.some((h) => h.count > 0)
  const hasWeekdayData = byWeekday.some((d) => d.count > 0)

  return (
    <div className="space-y-6">
    {/* Distribuição por atendente / canal */}
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Por atendente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Conversas por Atendente
          </CardTitle>
          <CardDescription>
            Distribuição das conversas atribuídas no período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {byAgent.length === 0 ? (
            <EmptyRow text="Nenhuma conversa atribuída a atendentes no período." />
          ) : (
            <DistributionBars
              items={byAgent}
              total={inPeriod.length}
              barClass="bg-primary"
            />
          )}
        </CardContent>
      </Card>

      {/* Por canal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Conversas por Canal
          </CardTitle>
          <CardDescription>
            Origem das conversas (site, WhatsApp, etc.) no período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {byChannel.length === 0 ? (
            <EmptyRow text="Sem conversas no período selecionado." />
          ) : (
            <DistributionBars
              items={byChannel}
              total={inPeriod.length}
              barClass="bg-emerald-500"
            />
          )}
        </CardContent>
      </Card>
    </div>

    {/* Conversas por hora do dia / por dia da semana */}
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Conversas por Hora do Dia
          </CardTitle>
          <CardDescription>
            Distribuição das conversas por hora de início (0h–23h)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasHourData ? (
            <EmptyRow text="Sem dados ainda." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byHour}>
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={1} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Conversas por Dia da Semana
          </CardTitle>
          <CardDescription>
            Volume de conversas iniciadas por dia (dom–sáb)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasWeekdayData ? (
            <EmptyRow text="Sem dados ainda." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byWeekday}>
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>

    {/* Performance por atendente */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Performance por Atendente
        </CardTitle>
        <CardDescription>
          Conversas, tempo médio de 1ª resposta e tempo médio de resolução no período
        </CardDescription>
      </CardHeader>
      <CardContent>
        {agentPerf.length === 0 ? (
          <EmptyRow text="Sem dados ainda." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Atendente</th>
                  <th className="py-2 px-4 font-medium text-right">Conversas</th>
                  <th className="py-2 px-4 font-medium text-right">1ª resposta (méd.)</th>
                  <th className="py-2 pl-4 font-medium text-right">Resolução (méd.)</th>
                </tr>
              </thead>
              <tbody>
                {agentPerf.map((a) => (
                  <tr key={a.key} className="border-b last:border-0">
                    <td className="py-2 pr-4 truncate max-w-[16rem]">{a.label}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{a.conversations}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{fmtMinutes(a.avgFirstResponseMin)}</td>
                    <td className="py-2 pl-4 text-right tabular-nums">{fmtMinutes(a.avgResolutionMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Sentimento das conversas (proxy via Radar IA) */}
    <SentimentReport />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Sentimento das conversas — NÃO há campo de sentiment no banco. Usamos a
// classificação do Radar IA (último scan completo) como proxy: a distribuição
// de hot/warm/cold/lost dos itens analisados. Sem scan → CTA pra rodar o Radar.
// O `period` da página NÃO se aplica aqui (um scan já é um recorte próprio);
// mostramos o último scan completo independentemente do período selecionado.
// ───────────────────────────────────────────────────────────────────
function SentimentReport() {
  const { data: scans, isLoading: scansLoading } = useOpportunityScans()
  const lastCompleted = useMemo(
    () => (scans || []).find((s) => s.status === 'completed') ?? null,
    [scans],
  )
  const { data: items, isLoading: itemsLoading } = useScanItems(lastCompleted?.id ?? null)

  const dist = useMemo(() => {
    const counts: Record<SentimentKey, number> = { hot: 0, warm: 0, cold: 0, lost: 0 }
    for (const it of items || []) {
      const c = it.classification
      if (c in counts) counts[c as SentimentKey] += 1
    }
    return SENTIMENT_TIERS.map((t) => ({
      key: t.key,
      label: t.label,
      color: t.color,
      count: counts[t.key] ?? 0,
    }))
  }, [items])

  const total = dist.reduce((s, d) => s + (d.count ?? 0), 0)
  const loading = scansLoading || (!!lastCompleted && itemsLoading)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smile className="h-5 w-5" />
          Sentimento das Conversas
        </CardTitle>
        <CardDescription>
          Proxy via Radar IA — distribuição de temperatura do último scan concluído
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40" />
        ) : !lastCompleted ? (
          <EmptyRow text="Rode o Radar IA para analisar o sentimento das conversas." />
        ) : total === 0 ? (
          <EmptyRow text="Sem dados ainda." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dist}>
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {dist.map((d) => <Cell key={d.key} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

interface DistRow {
  key: string
  label: string
  count: number
}

function groupByAgent(rows: WebChatConversation[]): DistRow[] {
  const map = new Map<string, DistRow>()
  for (const c of rows) {
    if (!c.assigned_user_id) continue // bot/sem atribuição não conta aqui
    const key = c.assigned_user_id
    const label = c.profiles?.full_name?.trim() || 'Atendente sem nome'
    const cur = map.get(key)
    if (cur) cur.count += 1
    else map.set(key, { key, label, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

function groupByChannel(rows: WebChatConversation[]): DistRow[] {
  const map = new Map<string, DistRow>()
  for (const c of rows) {
    const key = c.channel || '__none__'
    const label = channelLabel(c.channel)
    const cur = map.get(key)
    if (cur) cur.count += 1
    else map.set(key, { key, label, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

interface ChartRow {
  label: string
  count: number
}

// Conversas por hora do dia (0–23) a partir de created_at. Hora local do browser.
function groupByHour(rows: WebChatConversation[]): ChartRow[] {
  const counts = new Array(24).fill(0) as number[]
  for (const c of rows) {
    if (!c.created_at) continue
    const t = new Date(c.created_at)
    if (Number.isNaN(t.getTime())) continue
    counts[t.getHours()] += 1
  }
  return counts.map((count, h) => ({ label: `${h}h`, count: count ?? 0 }))
}

// Conversas por dia da semana (dom→sáb) a partir de created_at.
function groupByWeekday(rows: WebChatConversation[]): ChartRow[] {
  const counts = new Array(7).fill(0) as number[]
  for (const c of rows) {
    if (!c.created_at) continue
    const t = new Date(c.created_at)
    if (Number.isNaN(t.getTime())) continue
    counts[t.getDay()] += 1
  }
  return counts.map((count, d) => ({ label: WEEKDAY_LABELS[d], count: count ?? 0 }))
}

interface AgentPerfRow {
  key: string
  label: string
  conversations: number
  avgFirstResponseMin: number | null
  avgResolutionMin: number | null
}

// Diferença em minutos entre dois timestamps ISO; null se inválida/negativa.
function diffMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const min = (b - a) / 1000 / 60
  return min >= 0 ? min : null
}

// Performance por atendente: nº conversas, tempo médio de 1ª resposta
// (first_response_at - created_at) e tempo médio de resolução
// (closed_at - created_at, só conversas fechadas).
function agentPerformance(rows: WebChatConversation[]): AgentPerfRow[] {
  interface Acc {
    label: string
    conversations: number
    firstRespSum: number
    firstRespN: number
    resolSum: number
    resolN: number
  }
  const map = new Map<string, Acc>()
  for (const c of rows) {
    if (!c.assigned_user_id) continue
    const key = c.assigned_user_id
    const label = c.profiles?.full_name?.trim() || 'Atendente sem nome'
    let acc = map.get(key)
    if (!acc) {
      acc = { label, conversations: 0, firstRespSum: 0, firstRespN: 0, resolSum: 0, resolN: 0 }
      map.set(key, acc)
    }
    acc.conversations += 1
    const fr = diffMinutes(c.created_at, c.first_response_at)
    if (fr !== null) { acc.firstRespSum += fr; acc.firstRespN += 1 }
    if (c.status === 'closed') {
      const res = diffMinutes(c.created_at, c.closed_at)
      if (res !== null) { acc.resolSum += res; acc.resolN += 1 }
    }
  }
  return [...map.entries()]
    .map(([key, a]) => ({
      key,
      label: a.label,
      conversations: a.conversations,
      avgFirstResponseMin: a.firstRespN > 0 ? a.firstRespSum / a.firstRespN : null,
      avgResolutionMin: a.resolN > 0 ? a.resolSum / a.resolN : null,
    }))
    .sort((x, y) => y.conversations - x.conversations)
}

// Minutos → rótulo amigável ("--" se sem amostra; "Xmin" ou "Xh Ymin").
function fmtMinutes(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return '--'
  if (min < 60) return `${min.toFixed(1)}min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h ${m}min`
}

// Tiers de "sentimento" derivados da classificação do Radar IA.
type SentimentKey = 'hot' | 'warm' | 'cold' | 'lost'
const SENTIMENT_TIERS: Array<{ key: SentimentKey; label: string; color: string }> = [
  { key: 'hot', label: 'Quente', color: '#ef4444' },
  { key: 'warm', label: 'Morno', color: '#f97316' },
  { key: 'cold', label: 'Frio', color: '#0ea5e9' },
  { key: 'lost', label: 'Perdido', color: '#6b7280' },
]

function DistributionBars({
  items, total, barClass,
}: { items: DistRow[]; total: number; barClass: string }) {
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const pct = total > 0 ? (item.count / total) * 100 : 0
        return (
          <div key={item.key} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate pr-2">{item.label}</span>
              <span className="font-medium tabular-nums">
                {item.count}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({pct.toFixed(0)}%)
                </span>
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${barClass} rounded-full transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <BarChart3 className="h-4 w-4 opacity-50" />
      {text}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Aba Vendas — relatórios reais derivados da tabela `leads`, no ângulo
// COMERCIAL / atribuição (deal_value + lead_channel + assigned_to). NÃO
// duplica "Relatórios & Gestão" (Meu salão), que mede faturamento/serviço/
// profissional/ticket a partir de `agendamentos`.
//
//  Já existentes (não duplicar):
//   • Leads gerados via chat (KPI + série mensal)
//   • Taxa de conversão chat → venda (% deal_value>0)
//   • Negócios a partir de chat (KPI)
//  Adicionados aqui:
//   • Funil chat → venda (estágios + % de queda)
//   • Receita gerada via chat por mês (SUM deal_value)
//   • Vendas por canal de origem (nº negócios + receita por lead_channel)
//   • Ticket médio de venda via chat (KPI)
//   • Vendas por atendente (assigned_to → profiles.full_name)
//
// Query por organization_id (igual ao resto), react-query, enabled !demo + org.
// ───────────────────────────────────────────────────────────────────
interface ChatLeadRow {
  id: string
  created_at: string
  deal_value: number | null
  lead_channel: string | null
  assigned_to: string | null
}

function VendasReports({ period }: { period: string }) {
  const organizationId = useOrganizationId()
  const range = useMemo(() => periodRange(period), [period])

  const { data, isLoading } = useQuery({
    queryKey: ['vendas-chat-leads', organizationId, range.from, range.to],
    enabled: !!organizationId,
    queryFn: async () => {
      const chatList = CHAT_CHANNELS.join(',')
      let q = supabase
        .from('leads')
        .select('id, created_at, deal_value, lead_channel, assigned_to')
        .eq('organization_id', organizationId!)
        // lead_channel OU lead_origin em um dos canais de chat
        .or(`lead_channel.in.(${chatList}),lead_origin.in.(${chatList})`)
        .order('created_at', { ascending: true })
        .limit(5000)
      if (range.from) q = q.gte('created_at', range.from)
      q = q.lte('created_at', range.to)
      const { data: rows, error } = await q
      if (error) throw error
      return (rows || []) as ChatLeadRow[]
    },
  })

  const rows = useMemo(() => data || [], [data])
  // Série por mês (YYYY-MM) — fatia a string ISO, sem `new Date(iso)` cru.
  const byMonth = useMemo(() => monthlySeries(rows), [rows])
  const revenueByMonth = useMemo(() => revenueMonthlySeries(rows), [rows])
  const byChannel = useMemo(() => salesByChannel(rows), [rows])
  const byAgent = useMemo(() => salesByAgent(rows), [rows])

  // Resolve nomes dos atendentes (assigned_to → profiles.full_name), mesma
  // resolução usada no AtendimentoStratification (join profiles). Só dispara
  // quando há atendentes com vendas no período.
  const agentIds = useMemo(() => byAgent.map((a) => a.key), [byAgent])
  const { data: agentNames } = useQuery({
    queryKey: ['vendas-agent-names', organizationId, agentIds],
    enabled: !!organizationId && agentIds.length > 0,
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', agentIds)
      if (error) throw error
      const map: Record<string, string> = {}
      for (const p of profiles || []) {
        if (p?.id) map[p.id] = (p.full_name ?? '').trim() || 'Atendente sem nome'
      }
      return map
    },
  })

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  const totalChatLeads = rows.length
  const wonRows = rows.filter((r) => (r.deal_value ?? 0) > 0)
  const wonLeads = wonRows.length
  const conversionRate = totalChatLeads > 0 ? (wonLeads / totalChatLeads) * 100 : 0
  const hasMonthly = byMonth.some((m) => m.count > 0)

  // Ticket médio de venda via chat: média do deal_value dos leads ganhos.
  const wonRevenue = wonRows.reduce((s, r) => s + (r.deal_value ?? 0), 0)
  const avgTicket = wonLeads > 0 ? wonRevenue / wonLeads : 0

  // Funil chat → venda (2 estágios — "com conversa" não é derivável de forma
  // confiável a partir de `leads`, então ficamos nos 2 estágios pedidos).
  const funnel = [
    { key: 'leads', label: 'Leads via chat', count: totalChatLeads },
    { key: 'won', label: 'Viraram negócio', count: wonLeads },
  ]

  const hasRevenueMonthly = revenueByMonth.some((m) => m.count > 0)

  return (
    <>
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads gerados via chat</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalChatLeads}</div>
            <p className="text-xs text-muted-foreground">
              WhatsApp, site, Instagram, etc. no período
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de conversão chat → venda</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalChatLeads > 0 ? `${conversionRate.toFixed(1)}%` : '--'}
            </div>
            <p className="text-xs text-muted-foreground">
              Leads de chat que viraram negócio (deal_value &gt; 0)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Negócios a partir de chat</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{wonLeads}</div>
            <p className="text-xs text-muted-foreground">
              de {totalChatLeads} leads de chat
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket médio de venda via chat</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {wonLeads > 0 ? formatCurrency(avgTicket) : '--'}
            </div>
            <p className="text-xs text-muted-foreground">
              Média do valor dos negócios fechados via chat
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Série mensal de leads de chat */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Leads de chat por mês
          </CardTitle>
          <CardDescription>
            Volume de leads gerados via chat ao longo do período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasMonthly ? (
            <EmptyRow text="Sem dados ainda." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byMonth}>
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Funil chat → venda + Receita gerada via chat por mês */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Funil chat → venda (estágios + % de queda) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Funil chat → venda
            </CardTitle>
            <CardDescription>
              Do lead de chat ao negócio fechado, com a queda entre estágios
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalChatLeads === 0 ? (
              <EmptyRow text="Sem dados ainda." />
            ) : (
              <FunnelBars stages={funnel} />
            )}
          </CardContent>
        </Card>

        {/* Receita gerada via chat por mês */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Receita gerada via chat por mês
            </CardTitle>
            <CardDescription>
              Soma do valor (deal_value) dos negócios fechados via chat por mês
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasRevenueMonthly ? (
              <EmptyRow text="Sem dados ainda." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revenueByMonth}>
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickFormatter={(v: number) => formatCurrency(v)}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Bar dataKey="count" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vendas por canal de origem */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Vendas por canal de origem
          </CardTitle>
          <CardDescription>
            Negócios fechados (deal_value &gt; 0) e receita por canal de chat no período
          </CardDescription>
        </CardHeader>
        <CardContent>
          {byChannel.length === 0 ? (
            <EmptyRow text="Sem dados ainda." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Canal</th>
                    <th className="py-2 px-4 font-medium text-right">Negócios</th>
                    <th className="py-2 pl-4 font-medium text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {byChannel.map((c) => (
                    <tr key={c.key} className="border-b last:border-0">
                      <td className="py-2 pr-4 truncate max-w-[16rem]">{c.label}</td>
                      <td className="py-2 px-4 text-right tabular-nums">{c.deals}</td>
                      <td className="py-2 pl-4 text-right tabular-nums">{formatCurrency(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vendas por atendente (assigned_to → profiles.full_name) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Vendas por atendente
          </CardTitle>
          <CardDescription>
            Negócios fechados via chat e receita por atendente responsável (assigned_to)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {byAgent.length === 0 ? (
            <EmptyRow text="Nenhuma venda via chat atribuída a atendentes no período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Atendente</th>
                    <th className="py-2 px-4 font-medium text-right">Negócios</th>
                    <th className="py-2 pl-4 font-medium text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {byAgent.map((a) => (
                    <tr key={a.key} className="border-b last:border-0">
                      <td className="py-2 pr-4 truncate max-w-[16rem]">
                        {agentNames?.[a.key] ?? 'Atendente sem nome'}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums">{a.deals}</td>
                      <td className="py-2 pl-4 text-right tabular-nums">{formatCurrency(a.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// Agrupa leads por mês (YYYY-MM) usando fatia da string ISO — evita shift de TZ
// que `new Date(iso)` causaria. Ordena cronologicamente. Função pura.
function monthlySeries(rows: ChatLeadRow[]): ChartRow[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.created_at) continue
    const ym = String(r.created_at).slice(0, 7) // "YYYY-MM"
    if (ym.length !== 7) continue
    map.set(ym, (map.get(ym) ?? 0) + 1)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, count]) => ({ label: ym, count: count ?? 0 }))
}

// Receita gerada via chat por mês (YYYY-MM) — SUM de deal_value dos leads
// ganhos. Mesma fatia de string ISO (TZ-safe). `count` reaproveita o eixo do
// BarChart (aqui carrega R$, não contagem). Função pura.
function revenueMonthlySeries(rows: ChatLeadRow[]): ChartRow[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const v = r.deal_value ?? 0
    if (v <= 0 || !r.created_at) continue
    const ym = String(r.created_at).slice(0, 7)
    if (ym.length !== 7) continue
    map.set(ym, (map.get(ym) ?? 0) + v)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, total]) => ({ label: ym, count: total ?? 0 }))
}

interface ChannelSalesRow {
  key: string
  label: string
  deals: number
  revenue: number
}

// Vendas por canal de origem: agrupa os leads de chat GANHOS (deal_value>0)
// por `lead_channel`, contando negócios e somando receita. Rótulos amigáveis
// via channelLabel. Ordena por receita desc. Função pura.
function salesByChannel(rows: ChatLeadRow[]): ChannelSalesRow[] {
  const map = new Map<string, ChannelSalesRow>()
  for (const r of rows) {
    const v = r.deal_value ?? 0
    if (v <= 0) continue
    const key = r.lead_channel || '__none__'
    const cur = map.get(key)
    if (cur) { cur.deals += 1; cur.revenue += v }
    else map.set(key, { key, label: channelLabel(r.lead_channel), deals: 1, revenue: v })
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

interface AgentSalesRow {
  key: string // assigned_to (UUID) — nome resolvido fora, via profiles
  deals: number
  revenue: number
}

// Vendas por atendente: leads de chat GANHOS (deal_value>0) agrupados por
// `assigned_to`. Quem não tem atendente atribuído não entra. Ordena por
// receita desc. Os nomes são resolvidos depois via profiles.full_name.
function salesByAgent(rows: ChatLeadRow[]): AgentSalesRow[] {
  const map = new Map<string, AgentSalesRow>()
  for (const r of rows) {
    const v = r.deal_value ?? 0
    if (v <= 0 || !r.assigned_to) continue
    const cur = map.get(r.assigned_to)
    if (cur) { cur.deals += 1; cur.revenue += v }
    else map.set(r.assigned_to, { key: r.assigned_to, deals: 1, revenue: v })
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

// Funil em barras horizontais: cada estágio mostra contagem, % do topo e a
// queda (% perdido) em relação ao estágio anterior. Largura da barra ∝ ao topo.
function FunnelBars({ stages }: { stages: Array<{ key: string; label: string; count: number }> }) {
  const top = stages[0]?.count ?? 0
  return (
    <div className="space-y-4">
      {stages.map((stage, i) => {
        const widthPct = top > 0 ? (stage.count / top) * 100 : 0
        const prev = i > 0 ? (stages[i - 1]?.count ?? 0) : null
        const dropPct = prev && prev > 0 ? ((prev - stage.count) / prev) * 100 : null
        const ofTopPct = top > 0 ? (stage.count / top) * 100 : 0
        return (
          <div key={stage.key} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate pr-2">{stage.label}</span>
              <span className="font-medium tabular-nums">
                {stage.count}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({ofTopPct.toFixed(0)}% do topo)
                </span>
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${widthPct}%` }}
              />
            </div>
            {dropPct !== null && (
              <p className="text-xs text-muted-foreground">
                Queda de {dropPct.toFixed(0)}% em relação ao estágio anterior
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
