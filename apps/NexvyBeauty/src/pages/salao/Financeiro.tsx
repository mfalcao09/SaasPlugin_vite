// ─── Financeiro — Controladoria do salão (3 abas) ────────────────────────
// Painel de controladoria sobre a tabela `lancamentos` (por organization_id):
//   • Dashboard — KPIs (receitas/despesas/resultado/margem), fluxo de caixa no
//     tempo, entradas vs saídas, despesas por categoria, receitas por forma,
//     top despesas.
//   • Entradas — tabela de lançamentos tipo='entrada' no período + "Nova entrada".
//   • Saídas   — tabela de lançamentos tipo='saida'   no período + "Nova saída".
//
// Filtro de período (FinanceiroPeriodFilter) é ÚNICO e compartilhado pelas 3
// abas. Toda agregação/listagem recorta `lancamentos` pelo {from,to} resolvido,
// via comparação lexicográfica de strings YYYY-MM-DD (TZ-safe — sem new Date(iso)
// cru; chave de mês via slice(0,7)). `new Date()` só para ancorar "hoje".
//
// Camada de dados preservada: query `['lancamentos', organizationId]` com
// enabled:!isDemo (props `demo`/`bare` intactas — consumido também pelo Cockpit
// em modo demo via DemoFinanceiro). A mutation de criação foi generalizada para
// receber o payload (tipo/valor/data/categoria/forma/descricao) sem quebrar o
// create existente.

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DollarSign, Plus, TrendingUp, TrendingDown, Loader2, Scale, Percent, ArrowDownCircle, ArrowUpCircle,
  Sparkles, Target, Lock, Activity,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MaybeSalaoShell, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  FinanceiroPeriodFilter, DEFAULT_PERIOD_STATE, resolvePeriod, periodLabel, fmtDateLocal,
  type FinPeriod, type FinPeriodState,
} from './FinanceiroPeriodFilter'

// Re-skin premium data-injectable. Camada de dados preservada: tabela
// `lancamentos` por organization_id (registro de entradas/saídas).

export interface Lancamento {
  id: string
  organization_id?: string
  descricao: string
  tipo: 'entrada' | 'saida'
  valor: number
  data: string | null
  status: string | null
  forma: string | null
  categoria: string | null
  cliente_id?: string | null
}

const FORMAS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto']

// Paleta de gráficos em HSL (tokens são tripletas → hsl(...) explícito), mesma
// do Cockpit/Relatorios para coerência visual dark/pink.
const CHART_COLORS = ['hsl(330 81% 60%)', 'hsl(280 65% 62%)', 'hsl(250 70% 62%)', 'hsl(45 90% 55%)', 'hsl(160 60% 45%)', 'hsl(0 72% 58%)']
const COLOR_ENTRADA = 'hsl(160 60% 45%)'
const COLOR_SAIDA = 'hsl(0 72% 58%)'

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  color: 'hsl(var(--popover-foreground))',
} as const

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// ─── Classificação fixo × variável das despesas (HEURÍSTICA) ──────────────
// IMPORTANTE: não existe flag no banco distinguindo custo fixo de variável. A
// classificação abaixo é uma HEURÍSTICA por palavra-chave no campo `categoria`
// (case/acento-insensível). FIXO = recorrentes do salão (aluguel, folha,
// contas, software…). VARIÁVEL = atrelados ao volume de atendimentos (insumos,
// comissões, taxas de cartão, marketing…). Categoria sem match cai como
// VARIÁVEL no cálculo (conservador — não infla a margem de contribuição), mas
// é contabilizada à parte como "não classificado" para transparência.
const FIXO_RE = /aluguel|sal[áa]rio|folha|funcion|[áa]gua|luz|energia|internet|telefone|software|sistema|assinatura|contador|cont[áa]bil|seguro|financiamento|parcela/i
const VARIAVEL_RE = /produto|insumo|material|mercadoria|comiss|descart|frete|taxa|cart[aã]o|marketing|an[uú]ncio|ads|publicidade/i

type CustoClasse = 'fixo' | 'variavel' | 'nao_classificado'

// Normaliza a categoria e classifica. Sem match em nenhuma regra → "não
// classificado" (que o cálculo trata como variável, mas o card expõe à parte).
function classificarCusto(categoria: string | null): CustoClasse {
  const c = (categoria ?? '').trim()
  if (!c) return 'nao_classificado'
  if (FIXO_RE.test(c)) return 'fixo'
  if (VARIAVEL_RE.test(c)) return 'variavel'
  return 'nao_classificado'
}

// ─── Helpers TZ-safe (comparação só pela parte de data, lexicográfica) ───
// O lançamento entra no período quando sua data (slice 0..10) cai em [from,to],
// inclusivo. `from`/`to` null (modo "Todo o período") → sem recorte.
function inPeriod(iso: string | null, p: FinPeriod): boolean {
  if (!p.from || !p.to) return true
  if (!iso) return false
  const day = iso.slice(0, 10)
  return day >= p.from && day <= p.to
}

// Confirmados contam como realizado; lançamentos com status diferente de
// "confirmado" são ignorados nos totais financeiros (mesma regra do Cockpit).
function isConfirmado(l: Lancamento): boolean {
  return !l.status || l.status === 'confirmado'
}

// chaves YYYY-MM cobrindo [from,to] (mais antigo → recente). Cap de 36 meses.
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

// dias YYYY-MM-DD cobrindo [from,to] inclusive (mais antigo → recente). Usado no
// fluxo de caixa quando o período é curto. Cap de 92 dias. T00:00:00 ancora local
// (evita shift de TZ de new Date(iso) cru — feedback_iso_date_format_br).
function dayKeysInRange(from: string, to: string): string[] {
  const out: string[] = []
  const end = new Date(`${to}T00:00:00`)
  const cur = new Date(`${from}T00:00:00`)
  for (let guard = 0; guard < 92 && cur.getTime() <= end.getTime(); guard++) {
    out.push(fmtDateLocal(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}
function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// Diferença em dias entre dois ISO (inclusive). Decide granularidade do fluxo.
function spanDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime()
  const b = new Date(`${to}T00:00:00`).getTime()
  return Math.round((b - a) / 86_400_000) + 1
}

// ─── Agregação para o Dashboard ──────────────────────────────────────────
interface DashboardData {
  receitas: number
  despesas: number
  resultado: number
  margem: number // % do resultado sobre as receitas
  // ── Controladoria (fixo × variável e derivadas) ──
  custoFixo: number
  custoVariavel: number       // já inclui o "não classificado" (conservador)
  custoNaoClassificado: number // subconjunto de custoVariavel, exposto à parte
  margemContribuicaoValor: number // receitas − custoVariável (R$)
  margemContribuicaoPct: number   // (receitas − custoVariável) / receitas (%)
  margemLucroPct: number          // resultado / receitas (%) — alias semântico de `margem`
  pontoEquilibrio: number         // custoFixo / (margemContribuicaoPct/100); 0 se indefinido
  fixoVsVariavel: { name: string; value: number }[]
  fluxo: { label: string; receitas: number; despesas: number; saldo: number }[]
  entradasVsSaidas: { label: string; entradas: number; saidas: number }[]
  despesaPorCategoria: { name: string; value: number }[]
  receitaPorForma: { name: string; value: number }[]
  topDespesas: { nome: string; valor: number }[]
}

function aggregateDashboard(rows: Lancamento[], p: FinPeriod): DashboardData {
  const inRange = rows.filter((l) => inPeriod(l.data, p) && isConfirmado(l))
  const entradas = inRange.filter((l) => l.tipo === 'entrada')
  const saidas = inRange.filter((l) => l.tipo === 'saida')

  const receitas = entradas.reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const despesas = saidas.reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const resultado = receitas - despesas
  const margem = receitas > 0 ? (resultado / receitas) * 100 : 0

  // ── Controladoria: custo fixo × variável (heurística por categoria) ──
  // Não classificado entra no variável para o cálculo (conservador: não infla a
  // margem de contribuição), mas é somado à parte para exibição discreta.
  let custoFixo = 0
  let custoVariavelPuro = 0
  let custoNaoClassificado = 0
  saidas.forEach((l) => {
    const v = Number(l.valor ?? 0)
    switch (classificarCusto(l.categoria)) {
      case 'fixo': custoFixo += v; break
      case 'variavel': custoVariavelPuro += v; break
      default: custoNaoClassificado += v; break
    }
  })
  const custoVariavel = custoVariavelPuro + custoNaoClassificado
  // Fórmulas (guards: só divide se receitas>0; sem NaN; ?? 0):
  //   Margem de lucro %        = resultado / receitas
  //   Margem de contribuição $ = receitas − custoVariável
  //   Margem de contribuição % = (receitas − custoVariável) / receitas
  //   Ponto de equilíbrio (R$) = custoFixo / (margemContribuição% / 100)
  //     → faturamento mínimo para resultado zero. Indefinido (→ 0) quando a
  //       margem de contribuição não é positiva (não há como cobrir o fixo).
  const margemLucroPct = receitas > 0 ? (resultado / receitas) * 100 : 0
  const margemContribuicaoValor = receitas - custoVariavel
  const margemContribuicaoPct = receitas > 0 ? (margemContribuicaoValor / receitas) * 100 : 0
  const pontoEquilibrio = margemContribuicaoPct > 0 ? custoFixo / (margemContribuicaoPct / 100) : 0
  const fixoVsVariavel = [
    { name: 'Custo fixo', value: custoFixo },
    { name: 'Custo variável', value: custoVariavel },
  ].filter((x) => x.value > 0)

  // Fluxo de caixa no tempo: dia-a-dia se o período cabe em ~60 dias; senão por
  // mês. Para "Todo o período" / sem range, deriva os limites dos próprios dados.
  const dates = inRange.map((l) => (l.data ?? '').slice(0, 10)).filter(Boolean).sort()
  const lo = p.from ?? dates[0] ?? null
  const hi = p.to ?? dates[dates.length - 1] ?? null

  let fluxo: DashboardData['fluxo'] = []
  let entradasVsSaidas: DashboardData['entradasVsSaidas'] = []

  if (lo && hi) {
    const useDays = spanDays(lo, hi) <= 60
    if (useDays) {
      const keys = dayKeysInRange(lo, hi)
      const ent: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]))
      const des: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]))
      entradas.forEach((l) => { const k = (l.data ?? '').slice(0, 10); if (k in ent) ent[k] += Number(l.valor ?? 0) })
      saidas.forEach((l) => { const k = (l.data ?? '').slice(0, 10); if (k in des) des[k] += Number(l.valor ?? 0) })
      fluxo = keys.map((k) => ({ label: dayLabel(k), receitas: ent[k], despesas: des[k], saldo: ent[k] - des[k] }))
      entradasVsSaidas = keys.map((k) => ({ label: dayLabel(k), entradas: ent[k], saidas: des[k] }))
    } else {
      const monthKeys = monthKeysInRange(lo, hi)
      const ent: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]))
      const des: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]))
      entradas.forEach((l) => { const k = (l.data ?? '').slice(0, 7); if (k in ent) ent[k] += Number(l.valor ?? 0) })
      saidas.forEach((l) => { const k = (l.data ?? '').slice(0, 7); if (k in des) des[k] += Number(l.valor ?? 0) })
      fluxo = monthKeys.map((k) => ({ label: monthLabel(k), receitas: ent[k], despesas: des[k], saldo: ent[k] - des[k] }))
      entradasVsSaidas = monthKeys.map((k) => ({ label: monthLabel(k), entradas: ent[k], saidas: des[k] }))
    }
  }

  // Despesas por categoria (top 6, demais → "Outros").
  const despCat: Record<string, number> = {}
  saidas.forEach((l) => { const k = l.categoria?.trim() || 'Outros'; despCat[k] = (despCat[k] ?? 0) + Number(l.valor ?? 0) })
  const despEntries = Object.entries(despCat).sort(([, a], [, b]) => b - a)
  const despesaPorCategoria = despEntries.slice(0, 6).map(([name, value]) => ({ name, value }))
  const restoDesp = despEntries.slice(6).reduce((s, [, v]) => s + v, 0)
  if (restoDesp > 0) despesaPorCategoria.push({ name: 'Outros', value: restoDesp })

  // Receitas por forma de pagamento.
  const recForma: Record<string, number> = {}
  entradas.forEach((l) => { const k = l.forma?.trim() || 'Não informado'; recForma[k] = (recForma[k] ?? 0) + Number(l.valor ?? 0) })
  const receitaPorForma = Object.entries(recForma).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }))

  // Top despesas individuais (lançamento a lançamento, top 8).
  const topDespesas = [...saidas]
    .sort((a, b) => Number(b.valor ?? 0) - Number(a.valor ?? 0))
    .slice(0, 8)
    .map((l) => ({ nome: l.descricao || l.categoria || '—', valor: Number(l.valor ?? 0) }))

  return {
    receitas, despesas, resultado, margem,
    custoFixo, custoVariavel, custoNaoClassificado,
    margemContribuicaoValor, margemContribuicaoPct, margemLucroPct, pontoEquilibrio, fixoVsVariavel,
    fluxo, entradasVsSaidas, despesaPorCategoria, receitaPorForma, topDespesas,
  }
}

// Empty state discreto reusado por todos os cards.
function EmptyState({ label = 'Sem dados ainda' }: { label?: string }) {
  return (
    <div className="flex h-72 w-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function ChartCard({
  title, isEmpty, className, children, emptyLabel,
}: { title: string; isEmpty: boolean; className?: string; children: React.ReactNode; emptyLabel?: string }) {
  return (
    <Card className={className}>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {isEmpty ? <EmptyState label={emptyLabel} /> : <div className="h-72 w-full">{children}</div>}
      </CardContent>
    </Card>
  )
}

// ─── Payload de criação de lançamento (compartilhado pelos 2 dialogs) ────
interface NovoLancamento {
  tipo: 'entrada' | 'saida'
  descricao: string
  valor: string
  categoria: string
  forma: string
  data: string // YYYY-MM-DD
}

// ─── Payload de métricas enviado à IA financeira (Edge Function) ─────────
// Espelha exatamente o `metrics` consumido por `financial-advisor`. Tipado solto
// (tsconfig strict:false), mas explícito para servir de contrato com o backend.
interface FinanceiroMetrics {
  periodo: string
  receitas: number
  despesas: number
  resultado: number
  margemLucro: number
  custoFixo: number
  custoVariavel: number
  margemContribuicaoPct: number
  margemContribuicaoValor: number
  pontoEquilibrio: number
  topDespesas: { categoria: string; valor: number }[]
}

// ─── Bloco: Análise da IA financeira ─────────────────────────────────────
// Card com botão "Gerar análise". NÃO dispara automático (controle de custo) —
// só no clique. Em modo demo o botão é desabilitado com aviso. Chama a Edge
// Function `financial-advisor` passando { organization_id, metrics } e renderiza
// `data.answer` como markdown (mesmo componente ReactMarkdown usado no app).
// "Gerado em dd/mm/aa, às hh:mm:ss" — instante local da última geração (ms epoch).
function formatGeradoEm(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${p(d.getFullYear() % 100)}, às ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function AnaliseIACard({
  metrics, organizationId, isDemo,
}: { metrics: FinanceiroMetrics; organizationId: string | null | undefined; isDemo: boolean }) {
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [geradoEm, setGeradoEm] = useState<number | null>(null)

  const gerar = async () => {
    if (isDemo || !organizationId) return
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('financial-advisor', {
        body: { organization_id: organizationId, metrics },
      })
      if (error) throw error
      const texto = (data?.answer ?? '').toString().trim()
      if (!texto) {
        toast.error('A IA não retornou análise. Tente novamente.')
        return
      }
      setAnswer(texto)
      setGeradoEm(Date.now())
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar a análise financeira.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Análise da IA financeira
        </CardTitle>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={gerar} disabled={loading || isDemo} size="sm">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {answer ? 'Gerar novamente' : 'Gerar análise'}
          </Button>
          {geradoEm != null && (
            <span className="text-xs text-muted-foreground">Gerado em {formatGeradoEm(geradoEm)}</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isDemo ? (
          <p className="text-sm text-muted-foreground">
            Análise por IA indisponível no modo demonstração.
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analisando os números do período…
          </div>
        ) : answer ? (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground">
            <ReactMarkdown>{answer}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Clique em <span className="font-medium text-foreground">Gerar análise</span> para receber um
            diagnóstico de controladoria com base nos números do período selecionado.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Aba: Dashboard ──────────────────────────────────────────────────────
function DashboardTab({
  rows, period, periodoLabel, organizationId, isDemo,
}: {
  rows: Lancamento[]
  period: FinPeriod
  periodoLabel: string
  organizationId: string | null | undefined
  isDemo: boolean
}) {
  const d = useMemo(() => aggregateDashboard(rows, period), [rows, period])

  // metrics enviado à Edge Function `financial-advisor` (memoizado, deriva do
  // mesmo `d` que alimenta os cards — sempre coerente com o período ativo).
  const metrics = useMemo<FinanceiroMetrics>(() => ({
    periodo: periodoLabel,
    receitas: d.receitas ?? 0,
    despesas: d.despesas ?? 0,
    resultado: d.resultado ?? 0,
    margemLucro: d.margemLucroPct ?? 0,
    custoFixo: d.custoFixo ?? 0,
    custoVariavel: d.custoVariavel ?? 0,
    margemContribuicaoPct: d.margemContribuicaoPct ?? 0,
    margemContribuicaoValor: d.margemContribuicaoValor ?? 0,
    pontoEquilibrio: d.pontoEquilibrio ?? 0,
    topDespesas: d.despesaPorCategoria.map((c) => ({ categoria: c.name, valor: c.value })),
  }), [d, periodoLabel])

  const kpis = [
    { label: 'Receitas', value: formatCurrency(d.receitas), icon: TrendingUp, cls: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Despesas', value: formatCurrency(d.despesas), icon: TrendingDown, cls: 'text-red-600 dark:text-red-400' },
    { label: 'Resultado', value: formatCurrency(d.resultado), icon: Scale, cls: d.resultado >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400' },
    { label: 'Margem', value: `${d.margem.toFixed(1)}%`, icon: Percent, cls: d.margem >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400' },
  ]

  // KPIs de controladoria (respeitam o período via `d`). Ponto de equilíbrio só
  // aparece quando definido (margem de contribuição positiva).
  const kpisControladoria = [
    { label: 'Margem de lucro', value: `${(d.margemLucroPct ?? 0).toFixed(1)}%`, icon: Percent, cls: (d.margemLucroPct ?? 0) >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400' },
    { label: 'Custo fixo', value: formatCurrency(d.custoFixo ?? 0), icon: Lock, cls: 'text-amber-600 dark:text-amber-400' },
    { label: 'Custo variável', value: formatCurrency(d.custoVariavel ?? 0), icon: Activity, cls: 'text-sky-600 dark:text-sky-400' },
    {
      label: 'Margem de contribuição',
      value: `${(d.margemContribuicaoPct ?? 0).toFixed(1)}%`,
      sub: formatCurrency(d.margemContribuicaoValor ?? 0),
      icon: Scale,
      cls: (d.margemContribuicaoValor ?? 0) >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400',
    },
  ]

  const fluxoEmpty = d.fluxo.every((x) => x.receitas === 0 && x.despesas === 0)
  const evsEmpty = d.entradasVsSaidas.every((x) => x.entradas === 0 && x.saidas === 0)

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle>
              <k.icon className={`h-4 w-4 ${k.cls}`} />
            </CardHeader>
            <CardContent><div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* KPI grid — controladoria (fixo/variável + margens) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpisControladoria.map((k) => (
          <Card key={k.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle>
              <k.icon className={`h-4 w-4 ${k.cls}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${k.cls}`}>{k.value}</div>
              {k.sub && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Análise da IA financeira (sob demanda) */}
      <AnaliseIACard metrics={metrics} organizationId={organizationId} isDemo={isDemo} />

      {/* Estrutura de custo (fixo × variável, pie) + Ponto de equilíbrio (card) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Custo fixo × variável" isEmpty={d.fixoVsVariavel.length === 0} className="lg:col-span-2"
          emptyLabel="Sem despesas no período">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={d.fixoVsVariavel} dataKey="value" nameKey="name" outerRadius={90} innerRadius={45} paddingAngle={2}>
                <Cell fill="hsl(45 90% 55%)" />
                <Cell fill="hsl(200 80% 55%)" />
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />Ponto de equilíbrio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {d.pontoEquilibrio > 0 ? formatCurrency(d.pontoEquilibrio) : '—'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Faturamento mínimo para não ter prejuízo no período (custo fixo ÷ margem de contribuição).
              </p>
            </div>
            {d.pontoEquilibrio <= 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Indefinido — a margem de contribuição precisa ser positiva para calcular.
              </p>
            )}
            {d.custoNaoClassificado > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">{formatCurrency(d.custoNaoClassificado)}</span> em despesas não
                classificadas estão contadas como variável (categoria sem correspondência na heurística).
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fluxo de caixa (line, largo) + Despesas por categoria (pie) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Fluxo de caixa" isEmpty={fluxoEmpty} className="lg:col-span-2">
          <ResponsiveContainer>
            <LineChart data={d.fluxo}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} interval="preserveStartEnd" />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="receitas" name="Receitas" stroke={COLOR_ENTRADA} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="despesas" name="Despesas" stroke={COLOR_SAIDA} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="saldo" name="Saldo" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Despesas por categoria" isEmpty={d.despesaPorCategoria.length === 0}>
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

      {/* Entradas vs Saídas (bar agrupado) + Receitas por forma (bar) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Entradas vs Saídas" isEmpty={evsEmpty}>
          <ResponsiveContainer>
            <BarChart data={d.entradasVsSaidas}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} interval="preserveStartEnd" />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="entradas" name="Entradas" fill={COLOR_ENTRADA} radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill={COLOR_SAIDA} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Receitas por forma de pagamento" isEmpty={d.receitaPorForma.length === 0}>
          <ResponsiveContainer>
            <BarChart data={d.receitaPorForma}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="value" name="Receita" fill="hsl(280 65% 62%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Top despesas (lista) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Maiores despesas do período</CardTitle></CardHeader>
        <CardContent className="p-0">
          {d.topDespesas.length === 0 ? (
            <div className="flex h-40 w-full items-center justify-center">
              <p className="text-sm text-muted-foreground">Sem despesas no período</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {d.topDespesas.map((t, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-3">
                  <span className="truncate text-sm font-medium">{t.nome}</span>
                  <span className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(t.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Aba: lista de lançamentos (Entradas ou Saídas) ──────────────────────
function LancamentosTab({
  rows, period, tipo, isLoading, onNew,
}: {
  rows: Lancamento[]
  period: FinPeriod
  tipo: 'entrada' | 'saida'
  isLoading: boolean
  onNew: () => void
}) {
  const list = useMemo(
    () => rows
      .filter((l) => l.tipo === tipo && inPeriod(l.data, period))
      .sort((a, b) => (b.data ?? '').slice(0, 10).localeCompare((a.data ?? '').slice(0, 10))),
    [rows, period, tipo],
  )
  const total = list.reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const isEntrada = tipo === 'entrada'
  const labelNovo = isEntrada ? 'Nova entrada' : 'Nova saída'
  const amountCls = isEntrada ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {list.length} {list.length === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
          <span className={`font-semibold ${amountCls}`}>{formatCurrency(total)}</span>
        </div>
        <Button onClick={onNew}>
          <Plus className="mr-2 h-4 w-4" />{labelNovo}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : list.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {isEntrada ? 'Sem entradas no período.' : 'Sem saídas no período.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Data</TableHead>
                  <TableHead>{isEntrada ? 'Descrição / Cliente' : 'Descrição'}</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{l.data ? formatDate(l.data) : '-'}</TableCell>
                    <TableCell className="font-medium">{l.descricao || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{l.categoria ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{l.forma ?? '-'}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${amountCls}`}>
                      {isEntrada ? '+' : '-'}{formatCurrency(Number(l.valor ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Dialog de criação (entrada OU saída, conforme `tipo` pré-fixado) ─────
function NovoLancamentoDialog({
  open, onOpenChange, tipo, onSubmit, pending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tipo: 'entrada' | 'saida'
  onSubmit: (payload: NovoLancamento) => void
  pending: boolean
}) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [forma, setForma] = useState('PIX')
  const [data, setData] = useState(fmtDateLocal(new Date()))

  const reset = () => { setDescricao(''); setValor(''); setCategoria(''); setForma('PIX'); setData(fmtDateLocal(new Date())) }
  const close = () => { reset(); onOpenChange(false) }

  const isEntrada = tipo === 'entrada'
  const titulo = isEntrada ? 'Nova entrada' : 'Nova saída'

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{isEntrada ? 'Descrição / Cliente *' : 'Descrição *'}</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={isEntrada ? 'Ex: Serviço — coloração (Maria)' : 'Ex: Compra de produtos'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Valor (R$) *</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" inputMode="decimal" /></div>
            <div className="space-y-2"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Categoria</Label><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder={isEntrada ? 'Ex: Serviços' : 'Ex: Produtos'} /></div>
            <div className="space-y-2">
              <Label>Forma</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button
            onClick={() => onSubmit({ tipo, descricao, valor, categoria, forma, data })}
            disabled={!descricao || !valor || pending}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Componente raiz ─────────────────────────────────────────────────────
export default function Financeiro({ demo, bare }: { demo?: Lancamento[]; bare?: boolean } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const qc = useQueryClient()

  const [tab, setTab] = useState<'dashboard' | 'entradas' | 'saidas'>('dashboard')
  const [periodState, setPeriodState] = useState<FinPeriodState>(DEFAULT_PERIOD_STATE)
  const period = resolvePeriod(periodState)

  // Dialog de criação: aberto + tipo pré-fixado pelo botão da aba.
  const [novoTipo, setNovoTipo] = useState<'entrada' | 'saida' | null>(null)

  const { data: fetched = [], isLoading } = useQuery<Lancamento[]>({
    queryKey: ['lancamentos', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('lancamentos').select('*')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Lancamento[]
    },
  })

  const lancamentos = demo ?? fetched

  // Mutation de criação generalizada (recebe o payload). Preserva o comportamento
  // anterior: status 'confirmado', invalida a query, toast e fecha o dialog.
  const criar = useMutation({
    mutationFn: async (payload: NovoLancamento) => {
      const { error } = await supabase.from('lancamentos').insert({
        organization_id: organizationId!,
        descricao: payload.descricao,
        tipo: payload.tipo,
        valor: parseFloat(payload.valor.replace(',', '.')),
        categoria: payload.categoria || null,
        forma: payload.forma,
        status: 'confirmado',
        data: payload.data, // YYYY-MM-DD vindo do input date (TZ-safe)
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos', organizationId] })
      toast.success('Lançamento registrado!')
      setNovoTipo(null)
    },
    onError: () => toast.error('Erro ao registrar lançamento.'),
  })

  const onSubmit = (payload: NovoLancamento) =>
    isDemo ? toast.info('Ação indisponível no modo demonstração') : criar.mutate(payload)

  if (!isDemo && !organizationId) return <MaybeSalaoShell bare={bare}><NoOrg /></MaybeSalaoShell>

  return (
    <MaybeSalaoShell bare={bare}>
      <div className="p-6 space-y-6">
        {isDemo && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            Modo demonstração — dados fictícios, nada é salvo.
          </div>
        )}

        <PageHeader
          title="Financeiro"
          description="Controladoria — receitas, despesas e fluxo de caixa"
          action={<FinanceiroPeriodFilter value={periodState} onChange={setPeriodState} />}
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="dashboard" className="gap-2"><DollarSign className="h-4 w-4" />Dashboard</TabsTrigger>
              <TabsTrigger value="entradas" className="gap-2"><ArrowUpCircle className="h-4 w-4" />Entradas</TabsTrigger>
              <TabsTrigger value="saidas" className="gap-2"><ArrowDownCircle className="h-4 w-4" />Saídas</TabsTrigger>
            </TabsList>
            <span className="text-sm text-muted-foreground">{periodLabel(period)}</span>
          </div>

          <TabsContent value="dashboard" className="mt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <DashboardTab
                rows={lancamentos}
                period={period}
                periodoLabel={periodLabel(period)}
                organizationId={organizationId}
                isDemo={isDemo}
              />
            )}
          </TabsContent>

          <TabsContent value="entradas" className="mt-0">
            <LancamentosTab rows={lancamentos} period={period} tipo="entrada" isLoading={isLoading} onNew={() => setNovoTipo('entrada')} />
          </TabsContent>

          <TabsContent value="saidas" className="mt-0">
            <LancamentosTab rows={lancamentos} period={period} tipo="saida" isLoading={isLoading} onNew={() => setNovoTipo('saida')} />
          </TabsContent>
        </Tabs>
      </div>

      <NovoLancamentoDialog
        key={novoTipo ?? 'closed'}
        open={novoTipo !== null}
        onOpenChange={(o) => { if (!o) setNovoTipo(null) }}
        tipo={novoTipo ?? 'entrada'}
        onSubmit={onSubmit}
        pending={criar.isPending}
      />
    </MaybeSalaoShell>
  )
}
