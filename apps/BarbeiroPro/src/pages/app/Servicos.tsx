// Rota: /servicos — importado em App.tsx linha 15
// db.services.list(barbeariaId) → Service[]
// CRUD: nome, preco, duracao_minutos, categoria (corte/barba/sobrancelha/tratamento), ativo toggle

import { useState, useEffect } from 'react'
import { Plus, Pencil, X, Check, Clock, DollarSign, Tag, Scissors } from 'lucide-react'
import { db, type Service } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'

const CATEGORIAS = ['corte', 'barba', 'sobrancelha', 'tratamento', 'coloração', 'outros']
const CAT_LABELS: Record<string, string> = {
  corte: 'Corte', barba: 'Barba', sobrancelha: 'Sobrancelha',
  tratamento: 'Tratamento', coloração: 'Coloração', outros: 'Outros',
}
const CAT_COLORS: Record<string, string> = {
  corte: 'bg-blue-900/30 text-blue-300 border-blue-900/40',
  barba: 'bg-amber-900/30 text-amber-300 border-amber-900/40',
  sobrancelha: 'bg-purple-900/30 text-purple-300 border-purple-900/40',
  tratamento: 'bg-emerald-900/30 text-emerald-300 border-emerald-900/40',
  coloração: 'bg-pink-900/30 text-pink-300 border-pink-900/40',
  outros: 'bg-slate-700/50 text-slate-300 border-slate-600',
}

const EMPTY_FORM = { nome: '', preco: 0, duracao_minutos: 30, categoria: 'corte', ativo: true, descricao: '' }

export default function Servicos() {
  const { barbeariaId } = useAuth()
  const [servicos, setServicos] = useState<Service[]>([])
  const [todos, setTodos] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [catFiltro, setCatFiltro] = useState('todos')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    if (!barbeariaId) return
    setLoading(true)
    const { data: ativos } = await db.services.list(barbeariaId, true)
    const { data: inativos } = await db.services.list(barbeariaId, false)
    const all = [...(ativos ?? []), ...(inativos ?? [])]
    setTodos(all)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [barbeariaId])

  useEffect(() => {
    let lista = mostrarInativos ? todos : todos.filter(s => s.ativo)
    if (catFiltro !== 'todos') lista = lista.filter(s => s.categoria === catFiltro)
    setServicos(lista)
  }, [todos, mostrarInativos, catFiltro])

  function abrirNovo() {
    setForm(EMPTY_FORM)
    setEditandoId(null)
    setErro(null)
    setModal('novo')
  }

  function abrirEditar(s: Service) {
    setForm({
      nome: s.nome, preco: s.preco, duracao_minutos: s.duracao_minutos,
      categoria: s.categoria ?? 'corte', ativo: s.ativo, descricao: s.descricao ?? '',
    })
    setEditandoId(s.id)
    setErro(null)
    setModal('editar')
  }

  async function salvar() {
    if (!barbeariaId || !form.nome.trim()) { setErro('Nome é obrigatório.'); return }
    if (form.preco <= 0) { setErro('Preço deve ser maior que zero.'); return }
    setSalvando(true)
    setErro(null)
    const payload = {
      barbearia_id: barbeariaId,
      nome: form.nome.trim(),
      preco: Number(form.preco),
      duracao_minutos: Number(form.duracao_minutos),
      categoria: form.categoria,
      ativo: form.ativo,
      descricao: form.descricao || undefined,
    }
    if (modal === 'novo') {
      const { error } = await db.services.create(payload)
      if (error) { setErro(error.message); setSalvando(false); return }
    } else if (editandoId) {
      const { error } = await db.services.update(editandoId, payload)
      if (error) { setErro(error.message); setSalvando(false); return }
    }
    setSalvando(false)
    setModal(null)
    carregar()
  }

  async function toggleAtivo(s: Service) {
    await db.services.update(s.id, { ativo: !s.ativo })
    carregar()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Serviços</h1>
          <p className="text-slate-400 text-sm mt-1">{servicos.length} serviço(s) exibido(s)</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <div
              onClick={() => setMostrarInativos(v => !v)}
              className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${mostrarInativos ? 'bg-[#1e3a5f]' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${mostrarInativos ? 'left-4' : 'left-0.5'}`} />
            </div>
            Inativos
          </label>
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#254d7a] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo serviço
          </button>
        </div>
      </div>

      {/* Filtros por categoria */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['todos', ...CATEGORIAS].map(cat => (
          <button
            key={cat}
            onClick={() => setCatFiltro(cat)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border ${
              catFiltro === cat
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
            }`}
          >
            {cat === 'todos' ? 'Todos' : CAT_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-[#1e3a5f] rounded-full animate-spin" />
        </div>
      ) : servicos.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Scissors className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum serviço encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {servicos.map(s => (
            <div key={s.id} className={`bg-slate-800/60 border rounded-2xl p-4 transition-all hover:shadow-lg ${s.ativo ? 'border-slate-700' : 'border-slate-700/40 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${CAT_COLORS[s.categoria ?? 'outros'] ?? CAT_COLORS['outros']}`}>
                  {CAT_LABELS[s.categoria ?? 'outros'] ?? s.categoria}
                </span>
                {!s.ativo && <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">Inativo</span>}
              </div>
              <h3 className="font-bold text-white mb-1 leading-tight">{s.nome}</h3>
              {s.descricao && <p className="text-xs text-slate-400 mb-3 line-clamp-2">{s.descricao}</p>}
              <div className="flex items-center gap-3 mt-3">
                <span className="text-emerald-400 font-bold text-sm">{formatCurrency(s.preco)}</span>
                <div className="flex items-center gap-1 text-slate-400 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{s.duracao_minutos} min</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => toggleAtivo(s)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex-1 justify-center ${
                    s.ativo
                      ? 'bg-red-900/20 text-red-400 border-red-900/30 hover:bg-red-900/40'
                      : 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30 hover:bg-emerald-900/40'
                  }`}
                >
                  {s.ativo ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => abrirEditar(s)}
                  className="p-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">{modal === 'novo' ? 'Novo serviço' : 'Editar serviço'}</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {erro && <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{erro}</p>}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome *</label>
                <input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Corte degradê"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Descrição</label>
                <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Descrição opcional..." rows={2}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    <DollarSign className="inline w-3.5 h-3.5 mr-0.5" />Preço (R$) *
                  </label>
                  <input type="number" min={0} step={0.01} value={form.preco}
                    onChange={e => setForm(f => ({ ...f, preco: Number(e.target.value) }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    <Clock className="inline w-3.5 h-3.5 mr-0.5" />Duração (min)
                  </label>
                  <input type="number" min={5} step={5} value={form.duracao_minutos}
                    onChange={e => setForm(f => ({ ...f, duracao_minutos: Number(e.target.value) }))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  <Tag className="inline w-3.5 h-3.5 mr-0.5" />Categoria
                </label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-400">Status</label>
                <button type="button" onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                  className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    form.ativo ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30' : 'bg-slate-800 text-slate-400 border-slate-600'
                  }`}
                >
                  {form.ativo ? <><Check className="w-3.5 h-3.5" />Ativo</> : 'Inativo'}
                </button>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-800 transition-colors">
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
