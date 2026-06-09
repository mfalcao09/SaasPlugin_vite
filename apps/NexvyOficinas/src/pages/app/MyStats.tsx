// Sprint8 F6 — Dashboard individual do agente
// Métricas pessoais: conversas, CSAT, TMA + bar chart + ranking + badge de nível
// Período: 7 / 30 / 90 dias

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, Trophy, Smile, Clock, MessageSquare, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type Period = 7 | 30 | 90

interface ConvRow {
  id: string
  assigned_user_id: string | null
  created_at: string
  closed_at: string | null
  first_response_at: string | null
}

interface CsatRow {
  conversation_id: string
  score: number | null
}

interface AgentStat {
  user_id: string
  totalConvs: number
  avgCsat: number | null
}

function badgeForCount(n: number): { label: string; emoji: string; color: string } {
  if (n >= 201) return { label: 'Ouro', emoji: '🥇', color: 'text-yellow-400' }
  if (n >= 51) return { label: 'Prata', emoji: '🥈', color: 'text-slate-300' }
  if (n >= 10) return { label: 'Bronze', emoji: '🥉', color: 'text-amber-600' }
  return { label: 'Iniciante', emoji: '🌱', color: 'text-green-400' }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${m > 0 ? ` ${m}min` : ''}`
}

export default function MyStats() {
  const { user, empresaId } = useAuth()
  const [period, setPeriod] = useState<Period>(30)
  const [loading, setLoading] = useState(true)
  const [myConvs, setMyConvs] = useState<ConvRow[]>([])
  const [myCsat, setMyCsat] = useState<CsatRow[]>([])
  const [ranking, setRanking] = useState<AgentStat[]>([])

  useEffect(() => {
    if (!user || !empresaId) return
    setLoading(true)

    async function load() {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - period)
      const cutoffIso = cutoff.toISOString()

      // 1. Conversas no período (toda empresa, filtra cliente-side para ranking)
      const { data: convs } = await supabase
        .from('inbox_conversations')
        .select('id,assigned_user_id,created_at,closed_at,first_response_at')
        .eq('empresa_id', empresaId)
        .gte('created_at', cutoffIso)
      const allConvs = (convs ?? []) as ConvRow[]
      const mine = allConvs.filter(c => c.assigned_user_id === user!.id)
      setMyConvs(mine)

      // 2. CSAT do agente
      if (mine.length > 0) {
        const ids = mine.map(c => c.id)
        const { data: csat } = await supabase
          .from('inbox_csat_responses')
          .select('conversation_id,score')
          .in('conversation_id', ids)
          .not('score', 'is', null)
        setMyCsat((csat ?? []) as CsatRow[])
      } else {
        setMyCsat([])
      }

      // 3. Ranking: agrupa por assigned_user_id
      const byAgent = new Map<string, { count: number; csat: number[] }>()
      for (const c of allConvs) {
        if (!c.assigned_user_id) continue
        if (!byAgent.has(c.assigned_user_id)) {
          byAgent.set(c.assigned_user_id, { count: 0, csat: [] })
        }
        byAgent.get(c.assigned_user_id)!.count++
      }
      const allIds = allConvs.filter(c => c.assigned_user_id).map(c => c.id)
      if (allIds.length > 0) {
        const { data: allCsat } = await supabase
          .from('inbox_csat_responses')
          .select('conversation_id,score')
          .in('conversation_id', allIds)
          .not('score', 'is', null)
        const convToAgent = new Map(allConvs.map(c => [c.id, c.assigned_user_id]))
        for (const row of (allCsat ?? []) as CsatRow[]) {
          const agentId = convToAgent.get(row.conversation_id)
          if (agentId && byAgent.has(agentId) && row.score !== null) {
            byAgent.get(agentId)!.csat.push(row.score)
          }
        }
      }
      const stats: AgentStat[] = Array.from(byAgent.entries()).map(([uid, v]) => ({
        user_id: uid,
        totalConvs: v.count,
        avgCsat: v.csat.length > 0 ? v.csat.reduce((a, b) => a + b, 0) / v.csat.length : null,
      }))
      stats.sort((a, b) => (b.avgCsat ?? 0) - (a.avgCsat ?? 0) || b.totalConvs - a.totalConvs)
      setRanking(stats)

      setLoading(false)
    }

    load()
  }, [user, empresaId, period])

  const totalConvs = myConvs.length
  const avgCsat = myCsat.length > 0
    ? myCsat.reduce((a, b) => a + (b.score ?? 0), 0) / myCsat.length
    : null
  const tma = useMemo(() => {
    const closed = myConvs.filter(c => c.closed_at && c.first_response_at)
    if (closed.length === 0) return 0
    const total = closed.reduce((acc, c) => {
      return acc + (new Date(c.closed_at!).getTime() - new Date(c.first_response_at!).getTime())
    }, 0)
    return total / closed.length
  }, [myConvs])

  const badge = badgeForCount(totalConvs)

  const dailyData = useMemo(() => {
    const buckets = new Map<string, number>()
    for (let i = 0; i < period; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      buckets.set(key, 0)
    }
    for (const c of myConvs) {
      const key = c.created_at.slice(0, 10)
      if (buckets.has(key)) {
        buckets.set(key, buckets.get(key)! + 1)
      }
    }
    return Array.from(buckets.entries())
      .map(([date, count]) => ({ date: date.slice(5), count }))
      .reverse()
  }, [myConvs, period])

  const myRank = ranking.findIndex(r => r.user_id === user?.id) + 1

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header com filtro de período */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-orange-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Meu Desempenho</h1>
            <p className="text-sm text-slate-400">Suas métricas de atendimento no inbox</p>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-fit">
          {([7, 30, 90] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* Badge de nível + ranking */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
        <span className="text-4xl">{badge.emoji}</span>
        <div className="flex-1">
          <p className="text-xs text-slate-400">Seu nível</p>
          <p className={`text-xl font-bold ${badge.color}`}>{badge.label}</p>
        </div>
        {myRank > 0 && (
          <div className="text-right">
            <p className="text-xs text-slate-400">Posição no ranking</p>
            <p className="text-xl font-bold text-white">
              {myRank}º <span className="text-sm text-slate-500">de {ranking.length}</span>
            </p>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-2">
            <MessageSquare className="h-4 w-4" />
            Conversas atendidas
          </div>
          <p className="text-3xl font-bold text-white">{totalConvs}</p>
          <p className="text-xs text-slate-500 mt-1">Últimos {period} dias</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-2">
            <Smile className="h-4 w-4" />
            CSAT médio
          </div>
          <p className="text-3xl font-bold text-white">
            {avgCsat !== null ? avgCsat.toFixed(2) : '—'}
            {avgCsat !== null && <span className="text-base text-slate-500 ml-1">/5</span>}
          </p>
          <p className="text-xs text-slate-500 mt-1">{myCsat.length} respostas</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-2">
            <Clock className="h-4 w-4" />
            TMA (tempo de atendimento)
          </div>
          <p className="text-3xl font-bold text-white">{formatDuration(tma)}</p>
          <p className="text-xs text-slate-500 mt-1">média 1ª resposta → fechamento</p>
        </div>
      </div>

      {/* Bar chart: conversas por dia */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-white">Conversas por dia</h2>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
            <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              labelStyle={{ color: '#cbd5e1' }}
            />
            <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Ranking de agentes */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
          <Trophy className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-white">Ranking de agentes</h2>
          <span className="text-xs text-slate-500">({ranking.length})</span>
        </div>
        <div className="divide-y divide-slate-700/50">
          {ranking.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">Sem dados no período</p>
          ) : (
            ranking.map((r, idx) => {
              const isMe = r.user_id === user?.id
              const b = badgeForCount(r.totalConvs)
              return (
                <div
                  key={r.user_id}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    isMe ? 'bg-orange-500/10' : ''
                  }`}
                >
                  <span className={`text-xs font-mono w-6 text-center ${
                    idx === 0 ? 'text-yellow-400' :
                    idx === 1 ? 'text-slate-300' :
                    idx === 2 ? 'text-amber-600' :
                    'text-slate-500'
                  }`}>
                    {idx + 1}º
                  </span>
                  <span className="text-base">{b.emoji}</span>
                  <span className={`text-xs font-mono flex-1 truncate ${isMe ? 'text-orange-300 font-semibold' : 'text-slate-300'}`}>
                    {r.user_id.slice(0, 8)}…{isMe ? ' (você)' : ''}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {r.totalConvs} convs
                  </span>
                  <span className="text-xs text-slate-300 font-medium shrink-0 w-12 text-right">
                    {r.avgCsat !== null ? r.avgCsat.toFixed(2) : '—'}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
