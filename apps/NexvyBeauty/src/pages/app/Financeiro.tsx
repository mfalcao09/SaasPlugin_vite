import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Plus, X, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuth } from '@/contexts/AuthContext'
import { db, type Transacao } from '@/lib/db'
import { formatCurrency, formatDate } from '@/lib/utils'

const FORMAS = ['Pix', 'Cartão de Débito', 'Cartão de Crédito', 'Dinheiro', 'Transferência']
const CATS_RECEITA = ['Serviço', 'Pacote', 'Produto', 'Outro']
const CATS_DESPESA = ['Aluguel', 'Material', 'Salário', 'Equipamento', 'Conta', 'Outro']
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const hoje = new Date()
const EMPTY_FORM = {
  descricao: '', tipo: 'receita' as 'receita' | 'despesa',
  valor: 0, forma_pagamento: 'Pix', data: hoje.toISOString().split('T')[0], categoria: 'Serviço',
}

export default function Financeiro() {
  const { salaoId } = useAuth()
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [loading, setLoading] = useState(true)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!salaoId) return
    setLoading(true)
    const { data } = await db.transacoes.listByMonth(salaoId, ano, mes)
    setTransacoes(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (salaoId) load() }, [salaoId, ano, mes])

  const receitas = transacoes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0)
  const despesas = transacoes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0)
  const saldo = receitas - despesas

  const byDay: Record<string, { receita: number; despesa: number }> = {}
  for (const t of transacoes) {
    const dia = t.data.slice(8, 10)
    if (!byDay[dia]) byDay[dia] = { receita: 0, despesa: 0 }
    byDay[dia][t.tipo] += t.valor
  }
  const chartData = Object.entries(byDay).sort().map(([dia, v]) => ({ dia, ...v }))

  function prevMes() { if (mes === 1) { setMes(12); setAno(a => a - 1) } else setMes(m => m - 1) }
  function nextMes() { if (mes === 12) { setMes(1); setAno(a => a + 1) } else setMes(m => m + 1) }

  async function salvar() {
    if (!salaoId) return
    if (!form.descricao.trim()) { setError('Descrição é obrigatória'); return }
    if (!form.valor || form.valor <= 0) { setError('Valor inválido'); return }
    setSaving(true); setError(null)
    await db.transacoes.create({ salao_id: salaoId, ...form, valor: Number(form.valor) })
    setSaving(false); setShowForm(false); setForm(EMPTY_FORM); load()
  }

  const categorias = form.tipo === 'receita' ? CATS_RECEITA : CATS_DESPESA

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
          <h1 className="text-2xl font-bold text-white">Financeiro</h1>
          <p className="text-slate-400 text-sm">{transacoes.length} lançamentos em {MESES[mes - 1]}/{ano}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-1">
            <button onClick={prevMes} className="p-1.5 text-slate-400 hover:text-white transition-colors text-base">‹</button>
            <span className="text-sm font-medium text-white min-w-[72px] text-center">{MESES[mes - 1]} {ano}</span>
            <button onClick={nextMes} className="p-1.5 text-slate-400 hover:text-white transition-colors text-base">›</button>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setError(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Lançamento
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Receitas', value: receitas, icon: ArrowUpRight, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
          { label: 'Despesas', value: despesas, icon: ArrowDownRight, color: 'text-red-400', bg: 'bg-red-500/20' },
          { label: 'Saldo', value: saldo, icon: DollarSign, color: saldo >= 0 ? 'text-blue-400' : 'text-orange-400', bg: saldo >= 0 ? 'bg-blue-500/20' : 'bg-orange-500/20' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${kpi.bg} rounded-xl flex items-center justify-center`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <p className="text-sm text-slate-400">{kpi.label}</p>
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{formatCurrency(kpi.value)}</p>
          </div>
        ))}
      </div>

      {/* Gráfico por dia */}
      {chartData.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <p className="text-sm font-medium text-white mb-4">Faturamento por dia — {MESES[mes - 1]}/{ano}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
                formatter={(v: number) => [formatCurrency(v)]}
              />
              <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="despesa" name="Despesa" fill="#f43f5e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Lista */}
      {transacoes.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-16 text-center">
          <DollarSign className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">Nenhum lançamento em {MESES[mes - 1]}/{ano}</p>
          <p className="text-slate-500 text-sm mt-1">Use o botão "Lançamento" para registrar receitas e despesas.</p>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700">
            <p className="text-sm font-semibold text-white">Lançamentos</p>
          </div>
          <div className="divide-y divide-slate-700/50">
            {transacoes.map(t => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-700/30 transition-colors">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.tipo === 'receita' ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                  {t.tipo === 'receita'
                    ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                    : <TrendingDown className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.descricao}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(t.data)}
                    {t.forma_pagamento ? ` · ${t.forma_pagamento}` : ''}
                    {t.categoria ? ` · ${t.categoria}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-bold shrink-0 ${t.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.tipo === 'receita' ? '+' : '−'}{formatCurrency(t.valor)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Novo Lançamento</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-2">
                {(['receita', 'despesa'] as const).map(tipo => (
                  <button
                    key={tipo}
                    onClick={() => setForm(f => ({ ...f, tipo, categoria: tipo === 'receita' ? 'Serviço' : 'Aluguel' }))}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors border ${form.tipo === tipo
                      ? tipo === 'receita' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-red-500/20 border-red-500/50 text-red-400'
                      : 'border-slate-700 text-slate-500 hover:text-white'}`}
                  >
                    {tipo === 'receita' ? 'Receita' : 'Despesa'}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Descrição *</label>
                <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Corte da Ana" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Valor (R$) *</label>
                  <input type="number" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))} min={0} step={0.01} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Data</label>
                  <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Pagamento</label>
                  <select value={form.forma_pagamento} onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500">
                    {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Categoria</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500">
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : 'Lançar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
