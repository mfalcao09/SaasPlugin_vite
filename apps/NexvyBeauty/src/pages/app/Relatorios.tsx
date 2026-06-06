import { useState, useEffect } from 'react'
import { BarChart2, TrendingUp, Scissors } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useAuth } from '@/contexts/AuthContext'
import { db, type Transacao, type Agendamento } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const PIE_COLORS = ['#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4']
const hoje = new Date()

export default function Relatorios() {
  const { salaoId } = useAuth()
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)

  async function load() {
    if (!salaoId) return
    setLoading(true)
    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
    const fim = `${ano}-${String(mes).padStart(2, '0')}-31`
    const [{ data: t }, { data: a }] = await Promise.all([
      db.transacoes.listByMonth(salaoId, ano, mes),
      db.agendamentos.listByRange(salaoId, inicio, fim),
    ])
    setTransacoes(t ?? [])
    setAgendamentos(a ?? [])
    setLoading(false)
  }

  useEffect(() => { if (salaoId) load() }, [salaoId, ano, mes])

  // Faturamento por dia
  const byDay: Record<string, number> = {}
  for (const t of transacoes.filter(t => t.tipo === 'receita')) {
    const dia = t.data.slice(8, 10)
    byDay[dia] = (byDay[dia] ?? 0) + t.valor
  }
  const faturDia = Object.entries(byDay).sort().map(([dia, valor]) => ({ dia, valor }))

  // Top 5 profissionais
  const byProf: Record<string, { nome: string; total: number; valor: number }> = {}
  for (const a of agendamentos) {
    const k = a.profissional_id ?? '__sem__'
    if (!byProf[k]) byProf[k] = { nome: a.profissional_nome ?? 'Sem profissional', total: 0, valor: 0 }
    byProf[k].total++
    byProf[k].valor += a.valor ?? 0
  }
  const topProfs = Object.values(byProf).sort((a, b) => b.total - a.total).slice(0, 5)

  // Top serviços
  const byServ: Record<string, { nome: string; count: number }> = {}
  for (const a of agendamentos) {
    const k = a.servico_id ?? '__sem__'
    if (!byServ[k]) byServ[k] = { nome: a.servico_nome ?? 'Sem serviço', count: 0 }
    byServ[k].count++
  }
  const pieData = Object.values(byServ).sort((a, b) => b.count - a.count).slice(0, 6)
    .map(s => ({ name: s.nome, value: s.count }))

  const totalReceita = transacoes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0)

  function prevMes() { if (mes === 1) { setMes(12); setAno(a => a - 1) } else setMes(m => m - 1) }
  function nextMes() { if (mes === 12) { setMes(1); setAno(a => a + 1) } else setMes(m => m + 1) }

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-rose-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatórios</h1>
          <p className="text-slate-400 text-sm">{agendamentos.length} atendimentos em {MESES[mes - 1]}/{ano}</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-1">
          <button onClick={prevMes} className="p-1.5 text-slate-400 hover:text-white transition-colors text-base">‹</button>
          <span className="text-sm font-medium text-white min-w-[72px] text-center">{MESES[mes - 1]} {ano}</span>
          <button onClick={nextMes} className="p-1.5 text-slate-400 hover:text-white transition-colors text-base">›</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Faturamento', value: formatCurrency(totalReceita), icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
          { label: 'Atendimentos', value: String(agendamentos.length), icon: Scissors, color: 'text-blue-400', bg: 'bg-blue-500/20' },
          { label: 'Ticket Médio', value: agendamentos.length > 0 ? formatCurrency(totalReceita / agendamentos.length) : '—', icon: BarChart2, color: 'text-purple-400', bg: 'bg-purple-500/20' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className={`w-9 h-9 ${kpi.bg} rounded-lg flex items-center justify-center mb-3`}>
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico faturamento/dia */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <p className="text-sm font-semibold text-white mb-4">Faturamento por dia — {MESES[mes - 1]}/{ano}</p>
        {faturDia.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Sem faturamento neste período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={faturDia} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
                formatter={(v: number) => [formatCurrency(v), 'Faturamento']}
              />
              <Bar dataKey="valor" fill="#f43f5e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top profissionais */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-4">Top 5 Profissionais</p>
          {topProfs.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">Nenhum atendimento registrado.</p>
          ) : (
            <div className="space-y-3">
              {topProfs.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-700 text-xs text-slate-400 flex items-center justify-center shrink-0 font-medium">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.nome}</p>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
                      <div
                        className="bg-rose-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (p.total / (topProfs[0]?.total || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-white">{p.total} atend.</p>
                    <p className="text-xs text-slate-500">{formatCurrency(p.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top serviços */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-4">Top Serviços</p>
          {pieData.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">Nenhum atendimento registrado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
