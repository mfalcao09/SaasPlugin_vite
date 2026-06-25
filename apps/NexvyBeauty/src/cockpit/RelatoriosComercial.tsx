// Relatórios comerciais UNIFICADOS — analytics de todo o comercial em TABS.
//
// • Atendimento  → WebChatReportsTab (KPIs + distribuição por status) reusado
//                  como está + estratificações extras (por atendente, por canal)
//                  derivadas de webchat_conversations, com filtro de período.
// • Captação     → CaptureAnalyticsSection (analytics de quizzes/captação)
//                  reusado direto do Admin (?tab=capture-analytics).
// • Vendas       → placeholder pronto pra a próxima leva.
//
// Nenhuma lógica é duplicada: os componentes originais são importados e compostos.
import { lazy, Suspense, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Radio, BarChart3 } from 'lucide-react'
import { WebChatReportsTab } from '@/components/admin/webchat/WebChatReportsTab'
import { useWebChatConversations, type WebChatConversation } from '@/hooks/useWebChat'

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

export default function RelatoriosComercial() {
  const [period, setPeriod] = useState<string>('30')

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Analytics comerciais — atendimento e captação
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

        {/* ── Vendas (próxima leva) ───────────────────────────────── */}
        <TabsContent value="vendas" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Relatórios de Vendas (Em Breve)</CardTitle>
              <CardDescription>
                Faturamento, ticket médio e conversão por origem entram na
                próxima leva de enriquecimento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Receita por período e por produto/serviço</li>
                <li>• Ticket médio e taxa de conversão chat → venda</li>
                <li>• Vendas por atendente e por canal de origem</li>
              </ul>
            </CardContent>
          </Card>
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

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  return (
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
