import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, UserCheck, Phone, Clock, Pencil, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import type { Profissional } from '@/lib/db'

const DIAS = [
  { key: 'seg', label: 'Seg' },
  { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' },
  { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
]

const EMPTY_FORM = {
  nome: '',
  especialidades: [] as string[],
  especialidade_input: '',
  telefone: '',
  email: '',
  comissao_pct: 0,
  dias_atendimento: ['seg', 'ter', 'qua', 'qui', 'sex'],
  hora_inicio: '09:00',
  hora_fim: '18:00',
  ativo: true,
}

export default function Profissionais() {
  const { salaoId } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Profissional | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // apenasAtivos=false para listar todos (ativos + inativos) na tela de gestão
  const { data: profissionais = [], isLoading } = useQuery({
    queryKey: ['profissionais-all', salaoId],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.profissionais.list(salaoId!, false)
      if (error) throw error
      return data ?? []
    },
  })

  const filtered = profissionais.filter(
    (p: Profissional) =>
      p.nome?.toLowerCase().includes(search.toLowerCase()) ||
      p.especialidades?.some((e) => e.toLowerCase().includes(search.toLowerCase())),
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p: Profissional) {
    setEditing(p)
    setForm({
      nome: p.nome,
      especialidades: p.especialidades ?? [],
      especialidade_input: '',
      telefone: p.telefone ?? '',
      email: p.email ?? '',
      comissao_pct: p.comissao_pct ?? 0,
      dias_atendimento: (p as any).dias_atendimento ?? ['seg', 'ter', 'qua', 'qui', 'sex'],
      hora_inicio: (p as any).hora_inicio ?? '09:00',
      hora_fim: (p as any).hora_fim ?? '18:00',
      ativo: p.ativo,
    })
    setShowForm(true)
  }

  function toggleDia(dia: string) {
    setForm((f) => ({
      ...f,
      dias_atendimento: f.dias_atendimento.includes(dia)
        ? f.dias_atendimento.filter((d) => d !== dia)
        : [...f.dias_atendimento, dia],
    }))
  }

  function addEspecialidade() {
    const val = form.especialidade_input.trim()
    if (!val || form.especialidades.includes(val)) return
    setForm((f) => ({
      ...f,
      especialidades: [...f.especialidades, val],
      especialidade_input: '',
    }))
  }

  function removeEspecialidade(e: string) {
    setForm((f) => ({ ...f, especialidades: f.especialidades.filter((x) => x !== e) }))
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório.')
      return
    }
    setSaving(true)
    const payload: any = {
      salao_id: salaoId!,
      nome: form.nome.trim(),
      especialidades: form.especialidades.length > 0 ? form.especialidades : [],
      telefone: form.telefone.trim() || undefined,
      email: form.email.trim() || undefined,
      comissao_pct: Number(form.comissao_pct) || 0,
      ativo: form.ativo,
      dias_atendimento: form.dias_atendimento,
      hora_inicio: form.hora_inicio,
      hora_fim: form.hora_fim,
    }
    if (editing) {
      const { error } = await db.profissionais.update(editing.id, payload)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success('Profissional atualizado!')
    } else {
      const { error } = await db.profissionais.create(payload)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success('Profissional criado!')
    }
    setSaving(false)
    setShowForm(false)
    queryClient.invalidateQueries({ queryKey: ['profissionais-all', salaoId] })
    queryClient.invalidateQueries({ queryKey: ['profissionais', salaoId] })
  }

  async function toggleAtivo(p: Profissional) {
    await db.profissionais.update(p.id, { ativo: !p.ativo })
    queryClient.invalidateQueries({ queryKey: ['profissionais-all', salaoId] })
    queryClient.invalidateQueries({ queryKey: ['profissionais', salaoId] })
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
          <h1 className="text-2xl font-bold text-slate-900">Profissionais</h1>
          <p className="text-slate-500 text-sm">
            {profissionais.filter((p: Profissional) => p.ativo).length} profissionais ativos
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Profissional
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar profissional..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-16 text-center">
          <UserCheck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">
            {search ? 'Nenhum profissional encontrado' : 'Nenhum profissional cadastrado'}
          </p>
          {!search && (
            <p className="text-slate-400 text-sm mt-1">
              Cadastre os profissionais para usar na agenda.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p: Profissional) => (
            <div
              key={p.id}
              className={`bg-white rounded-xl border shadow-sm transition-opacity ${!p.ativo ? 'opacity-50' : ''}`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white font-bold">
                      {p.nome?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{p.nome}</p>
                      {p.especialidades && p.especialidades.length > 0 && (
                        <p className="text-xs text-slate-500 truncate max-w-32">
                          {p.especialidades.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleAtivo(p)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        p.ativo
                          ? 'hover:bg-emerald-50 text-emerald-500'
                          : 'hover:bg-slate-100 text-slate-400'
                      }`}
                      title={p.ativo ? 'Desativar' : 'Ativar'}
                    >
                      {p.ativo ? (
                        <ToggleRight className="w-3.5 h-3.5" />
                      ) : (
                        <ToggleLeft className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500">
                  {p.telefone && (
                    <p className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {p.telefone}
                    </p>
                  )}
                  {p.comissao_pct > 0 && (
                    <p className="text-emerald-600 font-medium">{p.comissao_pct}% comissão</p>
                  )}
                  {(p as any).hora_inicio && (
                    <p className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(p as any).hora_inicio} – {(p as any).hora_fim}
                    </p>
                  )}
                  {(p as any).dias_atendimento && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {DIAS.map((d) => (
                        <span
                          key={d.key}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            (p as any).dias_atendimento?.includes(d.key)
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {d.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? 'Editar Profissional' : 'Novo Profissional'}
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
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Especialidades</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: Colorista, Manicure"
                    value={form.especialidade_input}
                    onChange={(e) => setForm((f) => ({ ...f, especialidade_input: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addEspecialidade() }
                    }}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={addEspecialidade}
                    className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>
                {form.especialidades.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.especialidades.map((e) => (
                      <span
                        key={e}
                        className="flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full text-xs font-medium"
                      >
                        {e}
                        <button
                          onClick={() => removeEspecialidade(e)}
                          className="hover:text-rose-900"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Comissão %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={form.comissao_pct}
                    onChange={(e) => setForm((f) => ({ ...f, comissao_pct: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Dias de Atendimento</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DIAS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggleDia(d.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.dias_atendimento.includes(d.key)
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Início</label>
                  <input
                    type="time"
                    value={form.hora_inicio}
                    onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Fim</label>
                  <input
                    type="time"
                    value={form.hora_fim}
                    onChange={(e) => setForm((f) => ({ ...f, hora_fim: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-400 transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ativo: !f.ativo }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.ativo ? 'bg-rose-500' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      form.ativo ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-700">
                  {form.ativo ? 'Profissional ativo' : 'Profissional inativo'}
                </span>
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
                  {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
