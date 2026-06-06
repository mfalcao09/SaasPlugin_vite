// Rota: /financeiro — importado em App.tsx linha 16
// db.financialEntries.listByMonth(barbeariaId, ano, mes) → FinancialEntry[]
// Lançamentos do mês: receitas (entrada) e despesas (saida). Saldo. Filtro por tipo.

import { useState, useEffect } from 'react'
import { Plus, X, TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { db, type FinancialEntry } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatDate } from '@/lib/utils'

const CATEGORIAS_ENTRADA = ['Atendimento', 'Produto vendido', 'Outros']
const CATEGORIAS_SAIDA = ['Aluguel', 'Produtos/Insumos', 'Salário', 'Equipamentos', 'Marketing', 'Outros']

const EMPTY_FORM = { descricao: '', tipo: 'entrada' as 'entrada' | 'saida', valor: 0, data: '', categoria: '' }

function mesNome(mes: number) {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes - 1]
}

export default function Financeiro() {
  const { barbeariaId } = useAuth()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [lancamentos, setLancamentos] = useState<FinancialEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'entrada' | 'saida'>('todos')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM, data: hoje.toISOString().slice(0, 10) })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    if (!barbeariaId) return
    setLoading(true)
    const { data } = await db.financialEntries.listByMonth(barbeariaId, ano, mes)
    setLancamentos(data ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [barbeariaId, ano, mes])

  function navMes(delta: number) {
    let m = mes + delta, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  const filtrados = tipoFiltro === 'todos' ? lancamentos : lancamentos.filter(l => l.tipo === tipoFiltro)
  const totalEntradas = lancamentos.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0)
  const totalSaidas = lancamentos.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0)
  const saldo = totalEntradas - totalSaidas

  function abrirModal() {
    setForm({ ...EMPTY_FORM, data: hoje.toISOString().slice(0, 10) })
    setErro(null)
    setModal(true)
  }

  async function salvar() {
    if (!barbeariaId || !form.descricao.trim()) { setErro('Descrição obrigatória.'); return }
    if (form.valor <= 0) { setErro('Valor deve ser maior que zero.'); return }
    if (!form.data) { setErro('Data obrigatória.'); return }
    setSalvando(true)
    setErro(null)
    const { error } = await db.financialEntries.create({
      barbearia_id: barbeariaId,
      descricao: form.descricao.trim(),
      tipo: form.tipo,
      valor: Number(form.valor),
      data: form.data,
      categoria: form.categoria || undefined,
    })
    if (error) { setErro(error.message); setSalvando(false); return }
    setSalvando(false)
    setModal(false)
    carregar()
  }

  const categoriasAtual = form.tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Financeiro</h1>
        <button
          onClick={abrirModal}
          className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#254d7a] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo lançamento
        </button>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navMes(-1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-white font-semibold min-w-[160px] text-center">{mesNome(mes)} {ano}</span>
        <button onClick={() => navMes(1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-emerald-900/20 border border-emerald-900/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-300 font-medium">Receitas</span>
          </div>
          <p className="text-2xl font-black text-emerald-400">{formatCurrency(totalEntradas)}</p>
        </div>
        <div className="bg-red-900/20 border border-red-900/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-300 font-medium">Despesas</span>
          </div>
          <p className="text-2xl font-black text-red-400">{formatCurrency(totalSaidas)}</p>
        </div>
        <div className={`border rounded-2xl p-4 ${saldo >= 0 ? 'bg-blue-900/20 border-blue-900/40' : 'bg-red-900/20 border-red-900/40'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-blue-300" />
            <span className="text-xs text-blue-300 font-medium">Saldo</span>
          </div>
          <p className={`text-2xl font-black ${saldo >= 0 ? 'text-blue-300' : 'text-red-400'}`}>{formatCurrency(saldo)}</p>
        </div>
      </div>

      {/* Filtro tipo */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-slate-400" />
        {(['todos', 'entrada', 'saida'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTipoFiltro(t)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              tipoFiltro === t
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
            }`}
          >
            {t === 'todos' ? 'Todos' : t === 'entrada' ? 'Receitas' : 'Despesas'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-[#1e3a5f] rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum lançamento para este período.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(l => (
            <div key={l.id} className="flex items-center gap-4 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/80 transition-colors">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                l.tipo === 'entrada' ? 'bg-emerald-900/30' : 'bg-red-900/30'
              }`}>
                {l.tipo === 'entrada'
                  ? <TrendingUp className="w-5 h-5 text-emerald-400" />
                  : <TrendingDown className="w-5 h-5 text-red-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{l.descricao}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatDate(l.data)}{l.categoria ? ` · ${l.categoria}` : ''}
                </p>
              </div>
              <span className={`font-bold text-base flex-shrink-0 ${l.tipo === 'entrada' ? 'text-emerald-400' : 'text-red-400'}`}>
                {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(l.valor)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">Novo lançamento</h2>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {erro && <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{erro}</p>}
              <div className="grid grid-cols-2 gap-2">
                {(['entrada', 'saida'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipo: t, categoria: '' }))}
                    className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                      form.tipo === t
                        ? t === 'entrada'
                          ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                          : 'bg-red-900/40 text-red-300 border-red-700'
                        : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {t === 'entrada' ? 'Receita' : 'Despesa'}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Descrição *</label>
                <input type="text" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Corte + barba — João Silva"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Valor (R$) *</label>
                  <input type="number" min={0} step={0.01} value={form.valor}
                    onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Data *</label>
                  <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Categoria</label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  <option value="">Sem categoria</option>
                  {categoriasAtual.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
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
