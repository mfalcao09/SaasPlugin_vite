// Rota: /profissionais — importado em App.tsx linha 14
// db.professionals.list(barbeariaId) → Professional[]
// CRUD: nome, especialidades (tags), comissao_pct, ativo toggle — grid de cards

import { useState, useEffect } from 'react'
import { Plus, Pencil, X, Check, UserCheck, UserX, Scissors } from 'lucide-react'
import { db, type Professional } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'

const CATS = ['Corte', 'Barba', 'Sobrancelha', 'Tratamento', 'Coloração', 'Outros']

const EMPTY_FORM = {
  nome: '',
  email: '',
  comissao_pct: 0,
  especialidades: [] as string[],
  ativo: true,
}

export default function Profissionais() {
  const { barbeariaId } = useAuth()
  const [profissionais, setProfissionais] = useState<Professional[]>([])
  const [todos, setTodos] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    if (!barbeariaId) return
    setLoading(true)
    const { data: ativos } = await db.professionals.list(barbeariaId, true)
    const { data: inativos } = await db.professionals.list(barbeariaId, false)
    const allData = [...(ativos ?? []), ...(inativos ?? [])]
    setTodos(allData)
    setProfissionais(mostrarInativos ? allData : (ativos ?? []))
    setLoading(false)
  }

  useEffect(() => { carregar() }, [barbeariaId])

  useEffect(() => {
    setProfissionais(mostrarInativos ? todos : todos.filter(p => p.ativo))
  }, [mostrarInativos, todos])

  function abrirNovo() {
    setForm({ ...EMPTY_FORM, especialidades: [] })
    setEditandoId(null)
    setTagInput('')
    setErro(null)
    setModal('novo')
  }

  function abrirEditar(p: Professional) {
    setForm({
      nome: p.nome,
      email: p.email ?? '',
      comissao_pct: p.comissao_pct,
      especialidades: p.especialidades ?? [],
      ativo: p.ativo,
    })
    setEditandoId(p.id)
    setTagInput('')
    setErro(null)
    setModal('editar')
  }

  function addTag(tag: string) {
    const t = tag.trim()
    if (!t || form.especialidades.includes(t)) return
    setForm(f => ({ ...f, especialidades: [...f.especialidades, t] }))
    setTagInput('')
  }

  function removeTag(tag: string) {
    setForm(f => ({ ...f, especialidades: f.especialidades.filter(e => e !== tag) }))
  }

  async function salvar() {
    if (!barbeariaId || !form.nome.trim()) { setErro('Nome é obrigatório.'); return }
    setSalvando(true)
    setErro(null)
    const payload = {
      barbearia_id: barbeariaId,
      nome: form.nome.trim(),
      email: form.email || undefined,
      comissao_pct: Number(form.comissao_pct),
      especialidades: form.especialidades,
      ativo: form.ativo,
    }
    if (modal === 'novo') {
      const { error } = await db.professionals.create(payload)
      if (error) { setErro(error.message); setSalvando(false); return }
    } else if (editandoId) {
      const { error } = await db.professionals.update(editandoId, payload)
      if (error) { setErro(error.message); setSalvando(false); return }
    }
    setSalvando(false)
    setModal(null)
    carregar()
  }

  async function toggleAtivo(p: Professional) {
    await db.professionals.update(p.id, { ativo: !p.ativo })
    carregar()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Profissionais</h1>
          <p className="text-slate-400 text-sm mt-1">{profissionais.length} profissional(is) exibido(s)</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <div
              onClick={() => setMostrarInativos(v => !v)}
              className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${mostrarInativos ? 'bg-[#1e3a5f]' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${mostrarInativos ? 'left-4' : 'left-0.5'}`} />
            </div>
            Mostrar inativos
          </label>
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#254d7a] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo profissional
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-[#1e3a5f] rounded-full animate-spin" />
        </div>
      ) : profissionais.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Scissors className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum profissional cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {profissionais.map(p => (
            <div key={p.id} className={`bg-slate-800/60 border rounded-2xl p-5 transition-all hover:shadow-lg ${p.ativo ? 'border-slate-700' : 'border-slate-700/40 opacity-60'}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-[#1e3a5f] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {p.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-white truncate">{p.nome}</h3>
                  {p.email && <p className="text-xs text-slate-400 truncate">{p.email}</p>}
                  <div className="flex items-center gap-1.5 mt-1">
                    {p.ativo
                      ? <><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-emerald-400">Ativo</span></>
                      : <><div className="w-2 h-2 rounded-full bg-slate-500" /><span className="text-xs text-slate-500">Inativo</span></>
                    }
                  </div>
                </div>
              </div>

              {(p.especialidades ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(p.especialidades ?? []).map(e => (
                    <span key={e} className="text-xs bg-[#1e3a5f]/60 text-blue-300 px-2 py-0.5 rounded-full border border-blue-900/40">{e}</span>
                  ))}
                </div>
              )}

              <div className="bg-slate-900/40 rounded-xl p-3 text-center mb-4">
                <div className="text-2xl font-black text-white">{p.comissao_pct}%</div>
                <div className="text-xs text-slate-400 mt-0.5">comissão</div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => toggleAtivo(p)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors flex-1 justify-center ${
                    p.ativo
                      ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-900/30'
                      : 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 border border-emerald-900/30'
                  }`}
                >
                  {p.ativo ? <><UserX className="w-3.5 h-3.5" />Desativar</> : <><UserCheck className="w-3.5 h-3.5" />Ativar</>}
                </button>
                <button
                  onClick={() => abrirEditar(p)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
              <h2 className="text-lg font-bold text-white">
                {modal === 'novo' ? 'Novo profissional' : 'Editar profissional'}
              </h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {erro && <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{erro}</p>}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome do profissional"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Comissão (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.comissao_pct}
                  onChange={e => setForm(f => ({ ...f, comissao_pct: Number(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Especialidades</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CATS.filter(c => !form.especialidades.includes(c)).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => addTag(c)}
                      className="text-xs px-2.5 py-1 bg-slate-800 border border-slate-600 text-slate-400 rounded-full hover:border-[#1e3a5f] hover:text-blue-300 transition-colors"
                    >
                      + {c}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
                    placeholder="Outra especialidade..."
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                  <button type="button" onClick={() => addTag(tagInput)} className="px-3 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#254d7a] transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {form.especialidades.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.especialidades.map(e => (
                      <span key={e} className="flex items-center gap-1 text-xs bg-[#1e3a5f]/60 text-blue-300 px-2 py-0.5 rounded-full border border-blue-900/40">
                        {e}
                        <button type="button" onClick={() => removeTag(e)} className="hover:text-red-400 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-400">Status</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                  className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    form.ativo
                      ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30'
                      : 'bg-slate-800 text-slate-400 border-slate-600'
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
              <button
                onClick={salvar}
                disabled={salvando}
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
