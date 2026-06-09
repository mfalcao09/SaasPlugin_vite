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

  useEffect(() => {
    if (!empresaId) return

    async function load() {
      setLoading(true)
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

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
          .gte('closed_at', todayStart),
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
          .order('closed_at', { ascending: false })
          .limit(200),
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

      // Sprint7 F1 — CSAT metrics
      const { data: csatData } = await supabase
        .from('inbox_csat_responses')
        .select('score, sent_at')
        .eq('empresa_id', empresaId)
        .not('sent_at', 'is', null)

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

      setLoading(false)
    }

    load()
  }, [empresaId])

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">📊 Métricas do Inbox</h1>
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
