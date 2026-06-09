import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

interface MetricCard {
  label: string
  value: number | null
  color: string
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
      setLoading(false)
    }

    load()
  }, [empresaId])

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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">📊 Métricas do Inbox</h1>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
        </div>
      ) : (
        <>
          {/* Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
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
