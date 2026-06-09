import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, Download } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

interface MetricCard {
  label: string
  value: number | null
  color: string
}

// ── Sprint9 F1 — Filtro de período ────────────────────────────────────────────
type Period = '7d' | '30d' | '90d' | 'month'

function getPeriodStart(period: Period): string {
  const now = new Date()
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'month', label: 'Este mês' },
]

// ── Sprint7 F6 — CSV helpers ──────────────────────────────────────────────────
function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
  const header = cols.join(',')
  const body = rows.map(r =>
    cols.map(c => JSON.stringify(r[c] ?? '')).join(',')
  ).join('\n')
  return `${header}\n${body}`
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sprint7 F2 — SLA helper ───────────────────────────────────────────────────
function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000
}

export default function InboxMetrics() {
  const { empresaId } = useAuth()
  const [loading, setLoading] = useState(true)
  // Sprint9 F1 — filtro de período
  const [period, setPeriod] = useState<Period>('30d')
  const [cards, setCards] = useState<MetricCard[]>([
    { label: 'Conversas abertas',      value: null, color: 'text-blue-400' },
    { label: 'Em atendimento humano',  value: null, color: 'text-green-400' },
    { label: 'Aguardando resposta',    value: null, color: 'text-yellow-400' },
    { label: 'Encerradas hoje',        value: null, color: 'text-slate-400' },
    { label: 'Bot ativo',              value: null, color: 'text-purple-400' },
    { label: 'Instâncias conectadas',  value: null, color: 'text-orange-400' },
  ])

  // Sprint7 F2 — SLA stats
  const [slaStats, setSlaStats] = useState<{
    tmaMinutes: number | null
    tmrMinutes: number | null
    withinSla: number | null
    slaFirstResponseMinutes: number
  }>({ tmaMinutes: null, tmrMinutes: null, withinSla: null, slaFirstResponseMinutes: 30 })

  // Sprint7 F1 — CSAT stats
  const [csatStats, setCsatStats] = useState<{
    avgScore: number | null
    responseRate: number | null
    distribution: { score: number; count: number }[]
  }>({ avgScore: null, responseRate: null, distribution: [] })

  // Sprint7 F6 — export loading
  const [exporting, setExporting] = useState(false)

  // Sprint9 F2 — Funil de conversação
  const [funnel, setFunnel] = useState<{
    received: number
    reachedHuman: number
    closed: number
  }>({ received: 0, reachedHuman: 0, closed: 0 })

  // Sprint9 F3 — Performance por agente
  const [agentPerf, setAgentPerf] = useState<{
    user_id: string
    name: string
    total: number
    closed: number
    avgCsat: number | null
    avgTmaMinutes: number | null
  }[]>([])

  useEffect(() => {
    if (!empresaId) return

    async function load() {
      setLoading(true)
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      // Sprint9 F1 — período de análise
      const periodStart = getPeriodStart(period)

      const [
        { count: abertas },
        { count: humanActive },
        { count: waiting },
        { count: closedToday },
        { count: botActive },
        { count: instances },
      ] = await Promise.all([
        supabase
          .from('inbox_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .neq('status', 'closed'),
        supabase
          .from('inbox_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'human_active'),
        supabase
          .from('inbox_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'waiting_human'),
        supabase
          .from('inbox_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'closed')
          .gte('closed_at', todayStart), // Encerradas HOJE: card sempre olha o dia
        supabase
          .from('inbox_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'bot_active'),
        supabase
          .from('evolution_instances')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'connected'),
      ])

      setCards([
        { label: 'Conversas abertas',      value: abertas ?? 0,      color: 'text-blue-400' },
        { label: 'Em atendimento humano',  value: humanActive ?? 0,  color: 'text-green-400' },
        { label: 'Aguardando resposta',    value: waiting ?? 0,      color: 'text-yellow-400' },
        { label: 'Encerradas hoje',        value: closedToday ?? 0,  color: 'text-slate-400' },
        { label: 'Bot ativo',              value: botActive ?? 0,    color: 'text-purple-400' },
        { label: 'Instâncias conectadas',  value: instances ?? 0,    color: 'text-orange-400' },
      ])

      // Sprint7 F2 — SLA metrics
      const [{ data: slaConfig }, { data: closedConvs }] = await Promise.all([
        supabase
          .from('empresas')
          .select('sla_first_response_minutes')
          .eq('id', empresaId)
          .single(),
        supabase
          .from('inbox_conversations')
          .select('created_at, first_response_at, closed_at')
          .eq('empresa_id', empresaId)
          .eq('status', 'closed')
          .not('closed_at', 'is', null)
          .gte('created_at', periodStart) // Sprint9 F1 — filtro de período
          .order('closed_at', { ascending: false })
          .limit(500),
      ])

      const slaFirstResponseMinutes = slaConfig?.sla_first_response_minutes ?? 30

      if (closedConvs && closedConvs.length > 0) {
        const responseTimes = closedConvs
          .map(c => minutesBetween(c.created_at, c.first_response_at))
          .filter((v): v is number => v !== null)

        const resolutionTimes = closedConvs
          .map(c => minutesBetween(c.created_at, c.closed_at))
          .filter((v): v is number => v !== null)

        const tmrMinutes = responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : null

        const tmaMinutes = resolutionTimes.length > 0
          ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
          : null

        const withinSlaCount = responseTimes.filter(t => t <= slaFirstResponseMinutes).length
        const withinSla = responseTimes.length > 0
          ? Math.round((withinSlaCount / responseTimes.length) * 100)
          : null

        setSlaStats({ tmaMinutes, tmrMinutes, withinSla, slaFirstResponseMinutes })
      } else {
        setSlaStats(prev => ({ ...prev, slaFirstResponseMinutes }))
      }

      // Sprint7 F1 — CSAT metrics (Sprint9 F1: filtra por período via sent_at)
      const { data: csatData } = await supabase
        .from('inbox_csat_responses')
        .select('score, sent_at')
        .eq('empresa_id', empresaId)
        .not('sent_at', 'is', null)
        .gte('sent_at', periodStart)

      if (csatData && csatData.length > 0) {
        const responded = csatData.filter(r => r.score !== null)
        const avgScore = responded.length > 0
          ? responded.reduce((s, r) => s + (r.score as number), 0) / responded.length
          : null
        const responseRate = Math.round((responded.length / csatData.length) * 100)
        const dist: { score: number; count: number }[] = [1, 2, 3, 4, 5].map(s => ({
          score: s,
          count: responded.filter(r => r.score === s).length,
        }))
        setCsatStats({ avgScore, responseRate, distribution: dist })
      }

      // Sprint9 F2 — Funil de conversação (no período selecionado)
      const [
        { count: receivedCount },
        { count: humanCount },
        { count: closedPeriodCount },
      ] = await Promise.all([
        supabase
          .from('inbox_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .gte('created_at', periodStart),
        supabase
          .from('inbox_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .gte('created_at', periodStart)
          .or('status.in.(human_active,waiting_human),closed_at.not.is.null'),
        supabase
          .from('inbox_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresaId)
          .eq('status', 'closed')
          .gte('created_at', periodStart),
      ])

      setFunnel({
        received: receivedCount ?? 0,
        reachedHuman: humanCount ?? 0,
        closed: closedPeriodCount ?? 0,
      })

      // Sprint9 F3 — Performance por agente
      const [{ data: agentConvs }, { data: agentCsat }, { data: agentRows }] = await Promise.all([
        supabase
          .from('inbox_conversations')
          .select('id, assigned_user_id, closed_at, first_response_at, created_at')
          .eq('empresa_id', empresaId)
          .not('assigned_user_id', 'is', null)
          .gte('created_at', periodStart),
        supabase
          .from('inbox_csat_responses')
          .select('score, conversation_id')
          .eq('empresa_id', empresaId)
          .not('score', 'is', null)
          .gte('sent_at', periodStart),
        supabase
          .from('empresa_users')
          .select('user_id')
          .eq('empresa_id', empresaId),
      ])

      if (agentConvs && agentConvs.length > 0) {
        // Mapa conversation_id → score
        const csatByConv: Record<string, number> = {}
        for (const r of agentCsat ?? []) {
          if (r.score !== null && r.conversation_id) csatByConv[r.conversation_id] = r.score
        }

        // Agrupa por user
        const byUser: Record<string, {
          total: number
          closed: number
          csatSum: number
          csatCount: number
          tmaSum: number
          tmaCount: number
        }> = {}

        for (const c of agentConvs) {
          if (!c.assigned_user_id) continue
          const uid = c.assigned_user_id
          if (!byUser[uid]) byUser[uid] = { total: 0, closed: 0, csatSum: 0, csatCount: 0, tmaSum: 0, tmaCount: 0 }
          byUser[uid].total++
          if (c.closed_at) {
            byUser[uid].closed++
            const tma = minutesBetween(c.created_at, c.closed_at)
            if (tma !== null) { byUser[uid].tmaSum += tma; byUser[uid].tmaCount++ }
          }
          const score = csatByConv[c.id]
          if (typeof score === 'number') { byUser[uid].csatSum += score; byUser[uid].csatCount++ }
        }

        const knownIds = new Set((agentRows ?? []).map(r => r.user_id as string))
        const rows = Object.entries(byUser)
          .filter(([uid]) => knownIds.size === 0 || knownIds.has(uid))
          .map(([uid, s]) => ({
            user_id: uid,
            name: `${uid.slice(0, 8)}…`,
            total: s.total,
            closed: s.closed,
            avgCsat: s.csatCount > 0 ? s.csatSum / s.csatCount : null,
            avgTmaMinutes: s.tmaCount > 0 ? s.tmaSum / s.tmaCount : null,
          }))
          .sort((a, b) => {
            // CSAT desc; sem CSAT vai pro fim
            if (a.avgCsat === null && b.avgCsat === null) return b.total - a.total
            if (a.avgCsat === null) return 1
            if (b.avgCsat === null) return -1
            return b.avgCsat - a.avgCsat
          })

        setAgentPerf(rows)
      } else {
        setAgentPerf([])
      }

      setLoading(false)
    }

    load()
  }, [empresaId, period])

  // Sprint7 F6 — Exportar CSV
  async function handleExportCsv() {
    if (!empresaId || exporting) return
    setExporting(true)
    try {
      const { data: convs } = await supabase
        .from('inbox_conversations')
        .select('id,contact_phone,contact_name,status,created_at,first_response_at,closed_at,assigned_user_id,tags')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (!convs || convs.length === 0) return

      const convIds = convs.map(c => c.id)
      const { data: csatRows } = await supabase
        .from('inbox_csat_responses')
        .select('conversation_id, score')
        .in('conversation_id', convIds)

      const csatMap: Record<string, number | null> = {}
      for (const r of csatRows ?? []) csatMap[r.conversation_id] = r.score

      const rows: Record<string, unknown>[] = convs.map(c => ({
        id: c.id,
        contact_phone: c.contact_phone,
        contact_name: c.contact_name ?? '',
        status: c.status,
        created_at: c.created_at,
        first_response_at: c.first_response_at ?? '',
        closed_at: c.closed_at ?? '',
        assigned_user_id: c.assigned_user_id ?? '',
        tags: Array.isArray(c.tags) ? c.tags.join(';') : '',
        csat_score: csatMap[c.id] ?? '',
      }))

      const cols = ['id','contact_phone','contact_name','status','created_at','first_response_at','closed_at','assigned_user_id','tags','csat_score']
      downloadCsv(toCsv(rows, cols), 'metricas-inbox.csv')
    } finally {
      setExporting(false)
    }
  }

  const statusChartData = [
    { name: 'Bot ativo',    value: cards[4].value ?? 0, fill: '#a855f7' },
    { name: 'Aguardando',   value: cards[2].value ?? 0, fill: '#eab308' },
    { name: 'Atendendo',    value: cards[1].value ?? 0, fill: '#22c55e' },
    { name: 'Enc. hoje',    value: cards[3].value ?? 0, fill: '#64748b' },
  ]

  const instancesChartData = [
    { name: 'Conectadas',     value: cards[5].value ?? 0, fill: '#f97316' },
    { name: 'Total abertas',  value: cards[0].value ?? 0, fill: '#3b82f6' },
  ]

  // Sprint7 F1 — cores do CSAT por score (1=vermelho … 5=verde)
  const csatBarColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white">📊 Métricas do Inbox</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sprint9 F1 — Seletor de período */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  period === opt.value
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Sprint7 F6 — Exportar CSV */}
          <button
            onClick={handleExportCsv}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-sm text-slate-200 transition-colors"
          >
            {exporting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            Exportar CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
        </div>
      ) : (
        <>
          {/* Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {cards.map(card => (
              <div
                key={card.label}
                className="bg-slate-800 rounded-xl p-4 border border-slate-700"
              >
                <p className="text-3xl font-bold text-white">{card.value ?? 0}</p>
                <p className="text-xs text-slate-400 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Sprint7 F2 — SLA Section */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
            <p className="text-sm font-semibold text-white mb-3">⏱ SLA de Atendimento</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-bold text-white">
                  {slaStats.tmrMinutes !== null ? `${Math.round(slaStats.tmrMinutes)}min` : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">TMR — Tempo Médio de Resposta</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {slaStats.tmaMinutes !== null ? `${Math.round(slaStats.tmaMinutes)}min` : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">TMA — Tempo Médio de Atendimento</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${
                  slaStats.withinSla === null ? 'text-slate-400'
                  : slaStats.withinSla >= 80 ? 'text-green-400'
                  : slaStats.withinSla >= 60 ? 'text-yellow-400'
                  : 'text-red-400'
                }`}>
                  {slaStats.withinSla !== null ? `${slaStats.withinSla}%` : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Dentro do SLA (≤{slaStats.slaFirstResponseMinutes}min)</p>
              </div>
            </div>
          </div>

          {/* Sprint9 F2 — Funil de Conversação */}
          {funnel.received > 0 && (
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
              <p className="text-sm font-semibold text-white mb-3">🔁 Funil de Conversação</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={[
                    {
                      name: '📥 Recebidas',
                      value: funnel.received,
                      pct: 100,
                      fill: '#3b82f6',
                    },
                    {
                      name: '👤 Chegaram ao humano',
                      value: funnel.reachedHuman,
                      pct: funnel.received > 0 ? Math.round((funnel.reachedHuman / funnel.received) * 100) : 0,
                      fill: '#22c55e',
                    },
                    {
                      name: '✅ Encerradas',
                      value: funnel.closed,
                      pct: funnel.received > 0 ? Math.round((funnel.closed / funnel.received) * 100) : 0,
                      fill: '#a855f7',
                    },
                  ]}
                  layout="vertical"
                  margin={{ top: 4, right: 60, left: 100, bottom: 4 }}
                >
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#cbd5e1', fontSize: 11 }} axisLine={false} tickLine={false} width={95} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#f8fafc' }}
                    formatter={(value: number, _name, props) => {
                      const pct = (props.payload as { pct?: number }).pct ?? 0
                      return [`${value} (${pct}%)`, 'Conversas']
                    }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {[0, 1, 2].map(i => (
                      <Cell key={`funnel-${i}`} fill={['#3b82f6', '#22c55e', '#a855f7'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="text-xs">
                  <span className="text-blue-400 font-bold">{funnel.received}</span>
                  <span className="text-slate-500 ml-1">(100%)</span>
                </div>
                <div className="text-xs">
                  <span className="text-green-400 font-bold">{funnel.reachedHuman}</span>
                  <span className="text-slate-500 ml-1">
                    ({funnel.received > 0 ? Math.round((funnel.reachedHuman / funnel.received) * 100) : 0}%)
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-purple-400 font-bold">{funnel.closed}</span>
                  <span className="text-slate-500 ml-1">
                    ({funnel.received > 0 ? Math.round((funnel.closed / funnel.received) * 100) : 0}%)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Sprint9 F3 — Performance por Agente */}
          {agentPerf.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6 overflow-x-auto">
              <p className="text-sm font-semibold text-white mb-3">👥 Performance por Agente</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                    <th className="py-2 pr-3 font-medium">Agente</th>
                    <th className="py-2 px-3 font-medium text-right">Conversas</th>
                    <th className="py-2 px-3 font-medium text-right">Encerradas</th>
                    <th className="py-2 px-3 font-medium text-right">CSAT médio</th>
                    <th className="py-2 pl-3 font-medium text-right">TMA médio</th>
                  </tr>
                </thead>
                <tbody>
                  {agentPerf.map((row, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                    return (
                      <tr key={row.user_id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                        <td className="py-2 pr-3 text-slate-200 font-mono text-xs">
                          {medal && <span className="mr-1">{medal}</span>}
                          {row.name}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">{row.total}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{row.closed}</td>
                        <td className="py-2 px-3 text-right">
                          {row.avgCsat !== null ? (
                            <span className={
                              row.avgCsat >= 4 ? 'text-green-400 font-semibold'
                              : row.avgCsat >= 3 ? 'text-yellow-400 font-semibold'
                              : 'text-red-400 font-semibold'
                            }>
                              {row.avgCsat.toFixed(1)} ⭐
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-2 pl-3 text-right text-slate-300">
                          {row.avgTmaMinutes !== null ? `${Math.round(row.avgTmaMinutes)}min` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sprint7 F1 — CSAT Section (só quando há dados) */}
          {csatStats.distribution.some(d => d.count > 0) && (
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
              <p className="text-sm font-semibold text-white mb-3">⭐ Satisfação do Cliente (CSAT)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div>
                  <div className="flex items-end gap-2 mb-1">
                    <p className="text-4xl font-bold text-white">
                      {csatStats.avgScore !== null ? csatStats.avgScore.toFixed(1) : '—'}
                    </p>
                    <p className="text-slate-400 text-sm mb-1">/ 5.0</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    Taxa de resposta: {csatStats.responseRate !== null ? `${csatStats.responseRate}%` : '—'}
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={csatStats.distribution} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                    <XAxis dataKey="score" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#f8fafc' }}
                      itemStyle={{ color: '#94a3b8' }}
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {csatStats.distribution.map((_, idx) => (
                        <Cell key={`csat-${idx}`} fill={csatBarColors[idx]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chart 1: Status breakdown */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-sm font-semibold text-white mb-4">Conversas por status</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={statusChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#f8fafc' }}
                    itemStyle={{ color: '#94a3b8' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Instâncias */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-sm font-semibold text-white mb-4">Instâncias e conversas</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={instancesChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#f8fafc' }}
                    itemStyle={{ color: '#94a3b8' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {instancesChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
