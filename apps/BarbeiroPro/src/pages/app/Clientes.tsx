// Rota: /clientes — importado em App.tsx linha 13
// db.customers.list(barbeariaId) → Customer[]
// CRUD: nome, telefone, email, data_nascimento + total_atendimentos

import { useState, useEffect } from 'react'
import { Search, Plus, Pencil, Trash2, X, User, Phone, Mail, Calendar, Scissors } from 'lucide-react'
import { db, type Customer } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate, formatCurrency } from '@/lib/utils'

const EMPTY_FORM = { nome: '', telefone: '', email: '', data_nascimento: '' }

export default function Clientes() {
  const { barbeariaId } = useAuth()
  const [clientes, setClientes] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    if (!barbeariaId) return
    setLoading(true)
    const { data } = await db.customers.list(barbeariaId)
    setClientes(data ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [barbeariaId])

  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (c.telefone ?? '').includes(busca) ||
    (c.email ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNovo() {
    setForm(EMPTY_FORM)
    setEditandoId(null)
    setErro(null)
    setModal('novo')
  }

  function abrirEditar(c: Customer) {
    setForm({
      nome: c.nome,
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      data_nascimento: c.data_nascimento ?? '',
    })
    setEditandoId(c.id)
    setErro(null)
    setModal('editar')
  }

  async function salvar() {
    if (!barbeariaId || !form.nome.trim()) { setErro('Nome é obrigatório.'); return }
    setSalvando(true)
    setErro(null)
    if (modal === 'novo') {
      const { error } = await db.customers.create({
        barbearia_id: barbeariaId,
        nome: form.nome.trim(),
        telefone: form.telefone || undefined,
        email: form.email || undefined,
        data_nascimento: form.data_nascimento || undefined,
        total_atendimentos: 0,
        total_gasto: 0,
      })
      if (error) { setErro(error.message); setSalvando(false); return }
    } else if (editandoId) {
      const { error } = await db.customers.update(editandoId, {
        nome: form.nome.trim(),
        telefone: form.telefone || undefined,
        email: form.email || undefined,
        data_nascimento: form.data_nascimento || undefined,
      })
      if (error) { setErro(error.message); setSalvando(false); return }
    }
    setSalvando(false)
    setModal(null)
    carregar()
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este cliente?')) return
    await db.customers.delete(id)
    carregar()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-slate-400 text-sm mt-1">{clientes.length} clientes cadastrados</p>
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#254d7a] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo cliente
        </button>
      </div>

      {/* Busca */}
      <div className="relative mb-6 max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar por nome, telefone ou email..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
        />
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-[#1e3a5f] rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{busca ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left p-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Cliente</th>
                <th className="text-left p-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Contato</th>
                <th className="text-left p-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Nascimento</th>
                <th className="text-left p-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Atendimentos</th>
                <th className="text-left p-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total gasto</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c, i) => (
                <tr key={c.id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {c.nome.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white font-medium">{c.nome}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      {c.telefone && (
                        <span className="flex items-center gap-1.5 text-sm text-slate-300">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />{c.telefone}
                        </span>
                      )}
                      {c.email && (
                        <span className="flex items-center gap-1.5 text-sm text-slate-400 truncate max-w-[180px]">
                          <Mail className="w-3.5 h-3.5" />{c.email}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-400">
                    {c.data_nascimento ? formatDate(c.data_nascimento) : '—'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-sm text-slate-300">
                      <Scissors className="w-3.5 h-3.5 text-slate-400" />
                      {c.total_atendimentos}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-emerald-400 font-medium">
                    {formatCurrency(c.total_gasto)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => abrirEditar(c)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => excluir(c.id)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">
                {modal === 'novo' ? 'Novo cliente' : 'Editar cliente'}
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
                  placeholder="Nome completo"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Telefone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={form.telefone}
                    onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="w-full pl-9 pr-3 bg-slate-800 border border-slate-600 rounded-lg py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="w-full pl-9 pr-3 bg-slate-800 border border-slate-600 rounded-lg py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Data de nascimento</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={form.data_nascimento}
                    onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))}
                    className="w-full pl-9 pr-3 bg-slate-800 border border-slate-600 rounded-lg py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-800 transition-colors"
              >
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
