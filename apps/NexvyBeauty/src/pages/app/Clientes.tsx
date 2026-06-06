import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, User, Phone, Mail, Calendar, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import type { Cliente } from '@/lib/db'

const ORIGENS = [
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'outro', label: 'Outro' },
]

const EMPTY_FORM = {
  nome: '',
  telefone: '',
  email: '',
  data_nascimento: '',
  observacoes: '',
  origem: 'walk-in',
}

export default function Clientes() {
  const { salaoId } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes', salaoId],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.clientes.list(salaoId!)
      if (error) throw error
      return data ?? []
    },
  })

  const filtered = clientes.filter(
    (c: Cliente) =>
      c.nome?.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase()),
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(c: Cliente) {
    setEditing(c)
    setForm({
      nome: c.nome,
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      data_nascimento: c.data_nascimento ?? '',
      observacoes: c.observacoes ?? '',
      origem: c.origem ?? 'walk-in',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório.')
      return
    }
    setSaving(true)
    const payload = {
      salao_id: salaoId!,
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || undefined,
      email: form.email.trim() || undefined,
      data_nascimento: form.data_nascimento || undefined,
      observacoes: form.observacoes.trim() || undefined,
      origem: form.origem,
      total_atendimentos: editing?.total_atendimentos ?? 0,
      total_gasto: editing?.total_gasto ?? 0,
    }
    if (editing) {
      const { error } = await db.clientes.update(editing.id, payload)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success('Cliente atualizado!')
    } else {
      const { error } = await db.clientes.create(payload)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success('Cliente cadastrado!')
    }
    setSaving(false)
    setShowForm(false)
    queryClient.invalidateQueries({ queryKey: ['clientes', salaoId] })
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-slate-500 text-sm">{clientes.length} clientes cadastrados</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome, telefone ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-16 text-center">
          <User className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          </p>
          {!search && (
            <p className="text-slate-400 text-sm mt-1">Clique em "Novo Cliente" para começar.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {filtered.map((c: Cliente) => (
              <div
                key={c.id}
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
                className={`bg-white rounded-xl border p-4 cursor-pointer hover:border-rose-200 hover:shadow-sm transition-all ${
                  selected?.id === c.id ? 'border-rose-300 shadow-sm' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {c.nome?.[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{c.nome}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{c.telefone ?? c.email ?? 'Sem contato'}</span>
                      {c.origem && (
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 capitalize">
                          {c.origem}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(c) }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div>
            {selected ? (
              <div className="bg-white rounded-xl border shadow-sm sticky top-4">
                <div className="p-4 border-b flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold">
                    {selected.nome?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{selected.nome}</p>
                    {selected.origem && (
                      <span className="text-xs text-slate-500 capitalize">{selected.origem}</span>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {selected.telefone && (
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span>{selected.telefone}</span>
                    </div>
                  )}
                  {selected.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{selected.email}</span>
                    </div>
                  )}
                  {selected.data_nascimento && (
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span>
                        {new Date(selected.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )}
                  {selected.total_atendimentos > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-lg font-bold text-slate-900">{selected.total_atendimentos}</p>
                        <p className="text-xs text-slate-500">Atendimentos</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-lg font-bold text-emerald-600">
                          {selected.total_gasto.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                            minimumFractionDigits: 0,
                          })}
                        </p>
                        <p className="text-xs text-slate-500">Gasto total</p>
                      </div>
                    </div>
                  )}
                  {selected.observacoes && (
                    <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                      {selected.observacoes}
                    </div>
                  )}
                  <p className="text-xs text-slate-400">
                    Cadastrado em {new Date(selected.created_at).toLocaleDateString('pt-BR')}
                  </p>
                  <button
                    onClick={() => openEdit(selected)}
                    className="w-full px-4 py-2 rounded-lg border text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Editar Cliente
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border p-8 text-center text-slate-400 text-sm">
                Clique em um cliente para ver detalhes
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Nome *</label>
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Telefone</label>
                <input
                  type="tel"
                  placeholder="(11) 99999-0000"
                  value={form.telefone}
                  onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">E-mail</label>
                <input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Data de Nascimento</label>
                <input
                  type="date"
                  value={form.data_nascimento}
                  onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Origem</label>
                <select
                  value={form.origem}
                  onChange={(e) => setForm((f) => ({ ...f, origem: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                >
                  {ORIGENS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Observações</label>
                <textarea
                  rows={2}
                  placeholder="Preferências, alergias..."
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:border-rose-400 transition-colors"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {saving ? 'Salvando…' : editing ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
