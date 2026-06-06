import { useState, useEffect } from 'react'
import { Plus, X, Trophy, Target } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { db, type Meta, type Profissional, type Transacao, type Agendamento } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'

type MetaWithProf = Meta & { profissionais?: { nome: string } }

const hoje = new Date()
const periodoAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
const inicioMes = `${periodoAtual}-01`
const fimMes = `${periodoAtual}-31`

const TIPOS = [
  { key: 'faturamento',  label: 'Faturamento' },
  { key: 'atendimentos', label: 'Atendimentos' },
] as const

type TipoKey = typeof TIPOS[number]['key']

const EMPTY_FORM = { tipo: 'faturamento' as TipoKey, valor_meta: 0, periodo: periodoAtual, profissional_id: '' }

export default function Metas() {
  const { salaoId } = useAuth()
  const [metas, setMetas] = useState<MetaWithProf[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!salaoId) return
    setLoading(true)
    const [{ data: m }, { data: p }, { data: t }, { data: a }] = await Promise.all([
      db.metas.list(salaoId),
      db.profissionais.list(salaoId),
      db.transacoes.listByMonth(salaoId, hoje.getFullYear(), hoje.getMonth() + 1),
      db.agendamentos.listByRange(salaoId, inicioMes, fimMes),
    ])
    setMetas((m ?? []) as MetaWithProf[])
    setProfissionais(p ?? [])
    setTransacoes(t ?? [])
    setAgendamentos(a ?? [])
    setLoading(false)
  }

  useEffect(() => { if (salaoId) load() }, [salaoId])

  function realizado(meta: MetaWithProf): number {
    if ((meta.periodo ?? periodoAtual) !== periodoAtual) return 0
    if (meta.tipo === 'faturamento') {
      return transacoes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0)
    }
    return agendamentos.filter(a => !meta.profissional_id || a.profissional_id === meta.profissional_id).length
  }

  async function salvar() {
    if (!salaoId) return
    if (!form.valor_meta || form.valor_meta <= 0) { setError('Valor da meta inválido'); return }
    setSaving(true); setError(null)
    await db.metas.create({
      salao_id: salaoId,
      tipo: form.tipo,
      valor_meta: Number(form.valor_meta),
      periodo: form.periodo,
      profissional_id: form.profissional_id || undefined,
      data_inicio: `${form.periodo}-01`,
      data_fim: `${form.periodo}-31`,
    })
    setSaving(false); setShowForm(false); setForm(EMPTY_FORM); load()
  }

  const metasMes = metas.filter(m => (m.periodo ?? periodoAtual) === periodoAtual)
  const metasHist = metas.filter(m => (m.periodo ?? periodoAtual) !== periodoAtual)

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-rose-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Metas</h1>
          <p className="text-slate-400 text-sm">{metasMes.length} metas para {periodoAtual}</p>
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setError(null); setShowForm(true) }} className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Nova Meta
        </button>
      </div>

      {/* Metas mês atual */}
      {metasMes.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-16 text-center">
          <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">Nenhuma meta para {periodoAtual}</p>
          <p className="text-slate-500 text-sm mt-1">Defina metas mensais para acompanhar o desempenho.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mês atual — {periodoAtual}</p>
          {metasMes.map(meta => {
            const real = realizado(meta)
            const pct = Math.min(100, meta.valor_meta > 0 ? Math.round((real / meta.valor_meta) * 100) : 0)
            const profNome = meta.profissionais?.nome ?? 'Salão (geral)'
            const atingida = pct >= 100
            const label = meta.tipo === 'faturamento' ? 'Faturamento' : 'Atendimentos'

            return (
              <div key={meta.id} className={`bg-slate-800 border rounded-xl p-5 ${atingida ? 'border-emerald-500/40' : 'border-slate-700'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${atingida ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                      {atingida ? <Trophy className="w-5 h-5 text-emerald-400" /> : <Target className="w-5 h-5 text-rose-400" />}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{label}</p>
                      <p className="text-xs text-slate-400">{profNome}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${atingida ? 'text-emerald-400' : 'text-white'}`}>{pct}%</p>
                    {atingida && <p className="text-xs text-emerald-400">Atingida!</p>}
                  </div>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 mb-3">
                  <div className={`h-2 rounded-full transition-all ${atingida ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Realizado: <span className="text-white font-medium">
                    {meta.tipo === 'faturamento' ? formatCurrency(real) : `${real} atend.`}
                  </span></span>
                  <span className="text-slate-400">Meta: <span className="text-white font-medium">
                    {meta.tipo === 'faturamento' ? formatCurrency(meta.valor_meta) : `${meta.valor_meta} atend.`}
                  </span></span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Histórico */}
      {metasHist.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Histórico</p>
          {metasHist.map(meta => (
            <div key={meta.id} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-3">
              <Target className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-sm text-slate-400 flex-1">
                {meta.tipo === 'faturamento' ? 'Faturamento' : 'Atendimentos'} · {meta.profissionais?.nome ?? 'Geral'} · {meta.periodo}
              </span>
              <span className="text-sm font-medium text-white">
                {meta.tipo === 'faturamento' ? formatCurrency(meta.valor_meta) : `${meta.valor_meta} atend.`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Nova Meta</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Tipo</label>
                <div className="flex gap-2">
                  {TIPOS.map(t => (
                    <button key={t.key} onClick={() => setForm(f => ({ ...f, tipo: t.key }))} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${form.tipo === t.key ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'border-slate-700 text-slate-500 hover:text-white'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    {form.tipo === 'faturamento' ? 'Meta (R$)' : 'Meta (atend.)'}
                  </label>
                  <input type="number" value={form.valor_meta} onChange={e => setForm(f => ({ ...f, valor_meta: Number(e.target.value) }))} min={1} step={form.tipo === 'faturamento' ? 100 : 1} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Período</label>
                  <input type="month" value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Profissional (opcional)</label>
                <select value={form.profissional_id} onChange={e => setForm(f => ({ ...f, profissional_id: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500">
                  <option value="">Salão (geral)</option>
                  {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : 'Criar Meta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
