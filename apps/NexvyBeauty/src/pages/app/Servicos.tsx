import { useState, useEffect } from 'react'
import { Plus, Search, Scissors, Clock, DollarSign, Pencil, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { db, type Servico } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'

const CATEGORIAS = ['Cabelo', 'Unhas', 'Estética', 'Maquiagem', 'Massagem', 'Sobrancelha', 'Outro']

const EMPTY_FORM = {
  nome: '', categoria: 'Cabelo', duracao_minutos: 60, preco: 0, descricao: '', ativo: true,
}

type FormState = typeof EMPTY_FORM

export default function Servicos() {
  const { salaoId } = useAuth()
  const [servicos, setServicos] = useState<Servico[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Servico | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!salaoId) return
    setLoading(true)
    const { data } = await db.servicos.list(salaoId, false)
    setServicos(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (salaoId) load() }, [salaoId])

  const filtered = servicos.filter(s =>
    s.nome.toLowerCase().includes(search.toLowerCase()) ||
    (s.categoria ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(s: Servico) {
    setEditing(s)
    setForm({ nome: s.nome, categoria: s.categoria ?? 'Cabelo', duracao_minutos: s.duracao_minutos, preco: s.preco, descricao: s.descricao ?? '', ativo: s.ativo })
    setError(null)
    setShowForm(true)
  }

  async function save() {
    if (!salaoId) return
    if (!form.nome.trim()) { setError('Nome é obrigatório'); return }
    if (!form.preco || form.preco <= 0) { setError('Preço deve ser maior que zero'); return }
    setSaving(true)
    setError(null)
    const payload = { salao_id: salaoId, ...form, preco: Number(form.preco), duracao_minutos: Number(form.duracao_minutos) }
    if (editing) {
      await db.servicos.update(editing.id, payload)
    } else {
      await db.servicos.create(payload)
    }
    setSaving(false)
    setShowForm(false)
    load()
  }

  async function toggleAtivo(s: Servico) {
    await db.servicos.update(s.id, { ativo: !s.ativo })
    load()
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-rose-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Serviços</h1>
          <p className="text-slate-400 text-sm">{servicos.filter(s => s.ativo).length} serviços ativos</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Serviço
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          placeholder="Buscar serviço..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-16 text-center">
          <Scissors className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">{search ? 'Nenhum serviço encontrado' : 'Nenhum serviço cadastrado'}</p>
          {!search && <p className="text-slate-500 text-sm mt-1">Cadastre os serviços do seu salão para usar na agenda.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => (
            <div key={s.id} className={`bg-slate-800 border border-slate-700 rounded-xl p-4 transition-opacity ${s.ativo ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-white">{s.nome}</p>
                  <span className="inline-block bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs px-2 py-0.5 rounded-full mt-1">{s.categoria}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleAtivo(s)}
                    className={`p-1.5 rounded-lg transition-colors ${s.ativo ? 'hover:bg-emerald-500/20 text-emerald-400' : 'hover:bg-slate-700 text-slate-500'}`}
                  >
                    {s.ativo ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              {s.descricao && <p className="text-xs text-slate-500 mb-3 leading-relaxed">{s.descricao}</p>}
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-slate-400"><Clock className="w-3.5 h-3.5" />{s.duracao_minutos}min</span>
                <span className="flex items-center gap-1 font-semibold text-emerald-400"><DollarSign className="w-3.5 h-3.5" />{formatCurrency(s.preco)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Serviço' : 'Novo Serviço'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Nome *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Corte feminino"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Categoria</label>
                <select
                  value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500"
                >
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Duração (min)</label>
                  <input
                    type="number"
                    value={form.duracao_minutos}
                    onChange={e => setForm(f => ({ ...f, duracao_minutos: Number(e.target.value) }))}
                    min={5} step={5}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Preço (R$) *</label>
                  <input
                    type="number"
                    value={form.preco}
                    onChange={e => setForm(f => ({ ...f, preco: Number(e.target.value) }))}
                    min={0} step={0.01}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  rows={3}
                  placeholder="Opcional..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={form.ativo}
                  onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  className="w-4 h-4 rounded accent-rose-500"
                />
                <label htmlFor="ativo" className="text-sm text-slate-300">Serviço ativo</label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar Serviço'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
