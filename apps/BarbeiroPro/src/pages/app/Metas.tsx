// Rota: /metas — importado em App.tsx linha 22
// db.metas.list(barbeariaId) → Meta[] com join professionals(nome)
// Metas mensais por profissional: atendimentos + faturamento. Progress bar vs realizado.

import { useState, useEffect } from 'react'
import { Plus, X, Target, TrendingUp, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { db, type Meta, type Professional } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'

type MetaComPro = Meta & { professionals?: { nome: string } | null }

const TIPOS = [
  { value: 'atendimentos', label: 'Atendimentos', Icon: Users },
  { value: 'faturamento',  label: 'Faturamento (R$)', Icon: TrendingUp },
]

function mesNome(mes: number) {
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mes - 1]
}

function periodoMes(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

export default function Metas() {
  const { barbeariaId } = useAuth()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [metas, setMetas] = useState<MetaComPro[]>([])
  const [profissionais, setProfissionais] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ profissional_id: '', tipo: 'atendimentos', valor_meta: 0 })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    if (!barbeariaId) return
    setLoading(true)
    const [{ data: metasData }, { data: prosData }] = await Promise.all([
      db.metas.list(barbeariaId),
      db.professionals.list(barbeariaId, true),
    ])
    setMetas((metasData ?? []) as MetaComPro[])
    setProfissionais(prosData ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [barbeariaId])

  function navMes(delta: number) {
    let m = mes + delta, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  const periodo = periodoMes(ano, mes)
  const metasDoPeriodo = metas.filter(m => m.periodo === periodo)
  const metasGerais = metasDoPeriodo.filter(m => !m.profissional_id)
  const metasPorPro = profissionais
    .map(pro => ({ pro, metas: metasDoPeriodo.filter(m => m.profissional_id === pro.id) }))
    .filter(g => g.metas.length > 0)

  function progressoPct(meta: MetaComPro, realizado: number) {
    if (meta.valor_meta <= 0) return 0
    return Math.min(100, Math.round((realizado / meta.valor_meta) * 100))
  }

  function abrirModal() {
    setForm({ profissional_id: '', tipo: 'atendimentos', valor_meta: 0 })
    setErro(null)
    setModal(true)
  }

  async function salvar() {
    if (!barbeariaId || form.valor_meta <= 0) { setErro('Valor da meta deve ser maior que zero.'); return }
    setSalvando(true)
    setErro(null)
    const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`
    const dataFim = `${ano}-${String(mes).padStart(2, '0')}-31`
    const { error } = await db.metas.create({
      barbearia_id: barbeariaId,
      profissional_id: form.profissional_id || undefined,
      tipo: form.tipo,
      valor_meta: Number(form.valor_meta),
      periodo,
      data_inicio: dataInicio,
      data_fim: dataFim,
    })
    if (error) { setErro(error.message); setSalvando(false); return }
    setSalvando(false)
    setModal(false)
    carregar()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Metas</h1>
          <p className="text-slate-400 text-sm mt-1">{metasDoPeriodo.length} meta(s) definida(s)</p>
        </div>
        <button onClick={abrirModal} className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#254d7a] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> Nova meta
        </button>
      </div>

      {/* Nav mês */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navMes(-1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-white font-semibold min-w-[120px] text-center">{mesNome(mes)} {ano}</span>
        <button onClick={() => navMes(1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-[#1e3a5f] rounded-full animate-spin" />
        </div>
      ) : metasDoPeriodo.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma meta para {mesNome(mes)}/{ano}.</p>
          <button onClick={abrirModal} className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline transition-colors">
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {metasGerais.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Barbearia (geral)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {metasGerais.map(m => <MetaCard key={m.id} meta={m} realizado={0} pct={progressoPct(m, 0)} />)}
              </div>
            </section>
          )}
          {metasPorPro.map(({ pro, metas: ms }) => (
            <section key={pro.id}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-xs font-bold">
                  {pro.nome.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-sm font-semibold text-white">{pro.nome}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ms.map(m => <MetaCard key={m.id} meta={m} realizado={0} pct={progressoPct(m, 0)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">Nova meta — {mesNome(mes)}/{ano}</h2>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {erro && <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{erro}</p>}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Profissional</label>
                <select value={form.profissional_id} onChange={e => setForm(f => ({ ...f, profissional_id: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  <option value="">Barbearia (geral)</option>
                  {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Tipo de meta</label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, tipo: t.value }))}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
                        form.tipo === t.value
                          ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                          : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <t.Icon className="w-4 h-4" />{t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  {form.tipo === 'faturamento' ? 'Valor da meta (R$)' : 'Quantidade de atendimentos'}
                </label>
                <input type="number" min={1} step={form.tipo === 'faturamento' ? 0.01 : 1}
                  value={form.valor_meta} onChange={e => setForm(f => ({ ...f, valor_meta: Number(e.target.value) }))}
                  placeholder={form.tipo === 'faturamento' ? '5000.00' : '100'}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setModal(false)} className="flex-1 px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="flex-1 px-4 py-2.5 bg-[#1e3a5f] hover:bg-[#254d7a] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MetaCard ─────────────────────────────────────────────────────────────────
function MetaCard({ meta, realizado, pct }: { meta: MetaComPro; realizado: number; pct: number }) {
  const isFat = meta.tipo === 'faturamento'
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#1e3a5f]/60 flex items-center justify-center flex-shrink-0">
          {isFat ? <TrendingUp className="w-4 h-4 text-blue-300" /> : <Users className="w-4 h-4 text-blue-300" />}
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{isFat ? 'Faturamento' : 'Atendimentos'}</p>
          <p className="text-xs text-slate-400">Meta: {isFat ? formatCurrency(meta.valor_meta) : `${meta.valor_meta} atend.`}</p>
        </div>
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-400">
            Realizado: <span className="text-white font-medium">{isFat ? formatCurrency(realizado) : `${realizado} atend.`}</span>
          </span>
          <span className={`font-bold ${pct >= 100 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-slate-400'}`}>{pct}%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-[#1e3a5f]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Faltam: {isFat
          ? formatCurrency(Math.max(0, meta.valor_meta - realizado))
          : `${Math.max(0, meta.valor_meta - realizado)} atend.`}
      </p>
    </div>
  )
}
