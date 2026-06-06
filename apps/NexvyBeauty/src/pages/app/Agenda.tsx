import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronLeft, ChevronRight, Calendar, Check, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import type { Agendamento, Cliente, Servico, Profissional } from '@/lib/db'

const STATUS_COLORS: Record<string, string> = {
  agendado: 'bg-slate-100 text-slate-600',
  confirmado: 'bg-blue-100 text-blue-700',
  chegou: 'bg-amber-100 text-amber-700',
  concluido: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-red-100 text-red-700',
}

const EMPTY_FORM = {
  cliente_id: '', cliente_nome: '',
  servico_id: '', servico_nome: '',
  profissional_id: '', profissional_nome: '',
  hora: '09:00', duracao_minutos: 60,
  valor: '', forma_pagamento: '', observacoes: '',
}

function timeToMinutes(t: string) {
  const [h, m] = (t || '00:00').split(':').map(Number)
  return h * 60 + m
}

export default function Agenda() {
  const { salaoId } = useAuth()
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Agendamento | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const { data: agendamentos = [], isLoading } = useQuery({
    queryKey: ['agendamentos', salaoId, selectedDate],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.agendamentos.listByDate(salaoId!, selectedDate)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', salaoId],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.clientes.list(salaoId!)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: servicos = [] } = useQuery({
    queryKey: ['servicos', salaoId],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.servicos.list(salaoId!)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: profissionais = [] } = useQuery({
    queryKey: ['profissionais', salaoId],
    enabled: !!salaoId,
    queryFn: async () => {
      const { data, error } = await db.profissionais.list(salaoId!)
      if (error) throw error
      return data ?? []
    },
  })

  function changeDate(delta: number) {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  function hasConflict(profId: string, hora: string, duracao: number, excludeId?: string) {
    if (!profId) return false
    const startNew = timeToMinutes(hora)
    const endNew = startNew + (duracao || 60)
    return agendamentos.some((ag) => {
      if (ag.id === excludeId) return false
      if (ag.profissional_id !== profId) return false
      if (ag.status === 'cancelado') return false
      const startEx = timeToMinutes(ag.hora)
      const endEx = startEx + (ag.duracao_minutos || 60)
      return startNew < endEx && endNew > startEx
    })
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(ag: Agendamento) {
    setEditing(ag)
    setForm({
      cliente_id: ag.cliente_id ?? '',
      cliente_nome: ag.cliente_nome,
      servico_id: ag.servico_id ?? '',
      servico_nome: ag.servico_nome ?? '',
      profissional_id: ag.profissional_id ?? '',
      profissional_nome: ag.profissional_nome ?? '',
      hora: ag.hora,
      duracao_minutos: ag.duracao_minutos,
      valor: ag.valor != null ? String(ag.valor) : '',
      forma_pagamento: ag.forma_pagamento ?? '',
      observacoes: ag.observacoes ?? '',
    })
    setShowForm(true)
  }

  function onSelectCliente(id: string) {
    const c = clientes.find((x: Cliente) => x.id === id)
    setForm((f) => ({ ...f, cliente_id: id, cliente_nome: c?.nome ?? '' }))
  }

  function onSelectServico(id: string) {
    const s = servicos.find((x: Servico) => x.id === id)
    setForm((f) => ({
      ...f,
      servico_id: id,
      servico_nome: s?.nome ?? '',
      duracao_minutos: s?.duracao_minutos ?? 60,
      valor: s?.preco != null ? String(s.preco) : f.valor,
    }))
  }

  function onSelectProfissional(id: string) {
    const p = profissionais.find((x: Profissional) => x.id === id)
    setForm((f) => ({ ...f, profissional_id: id, profissional_nome: p?.nome ?? '' }))
  }

  async function save() {
    if (!form.cliente_nome || !form.servico_nome || !form.hora) {
      toast.error('Preencha cliente, serviço e horário.')
      return
    }
    if (hasConflict(form.profissional_id, form.hora, Number(form.duracao_minutos), editing?.id)) {
      toast.error('Conflito de horário — este profissional já tem agendamento neste horário.')
      return
    }
    setSaving(true)
    const payload = {
      salao_id: salaoId!,
      data: selectedDate,
      cliente_id: form.cliente_id || undefined,
      cliente_nome: form.cliente_nome,
      servico_id: form.servico_id || undefined,
      servico_nome: form.servico_nome,
      profissional_id: form.profissional_id || undefined,
      profissional_nome: form.profissional_nome || undefined,
      hora: form.hora,
      duracao_minutos: parseInt(String(form.duracao_minutos)) || 60,
      valor: form.valor ? parseFloat(form.valor) : undefined,
      forma_pagamento: form.forma_pagamento || undefined,
      observacoes: form.observacoes || undefined,
      status: editing?.status ?? 'agendado',
    }
    if (editing) {
      const { error } = await db.agendamentos.update(editing.id, payload)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success('Agendamento atualizado!')
    } else {
      const { error } = await db.agendamentos.create(payload)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success('Agendamento criado!')
    }
    setSaving(false)
    setShowForm(false)
    queryClient.invalidateQueries({ queryKey: ['agendamentos', salaoId, selectedDate] })
  }

  async function updateStatus(id: string, status: string) {
    await db.agendamentos.update(id, { status })
    queryClient.invalidateQueries({ queryKey: ['agendamentos', salaoId, selectedDate] })
  }

  const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agenda</h1>
          <p className="text-slate-500 text-sm capitalize">{dateLabel}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </button>
      </div>

      {/* Date Nav */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => changeDate(-1)} className="p-2 rounded-lg hover:bg-white border transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
          className="px-4 py-2 bg-white rounded-lg border text-sm font-medium hover:bg-slate-50 capitalize"
        >
          {dateLabel}
        </button>
        <button onClick={() => changeDate(1)} className="p-2 rounded-lg hover:bg-white border transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="ml-2 text-sm border rounded-lg px-3 py-2 text-slate-600 bg-white"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
        </div>
      ) : agendamentos.length === 0 ? (
        <div className="bg-white rounded-xl border p-16 text-center">
          <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum agendamento neste dia</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo Agendamento" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...agendamentos]
            .sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''))
            .map((ag) => (
              <div
                key={ag.id}
                className="bg-white rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="w-12 text-center flex-shrink-0">
                  <p className="text-sm font-bold text-slate-900">{ag.hora}</p>
                  <p className="text-xs text-slate-400">{ag.duracao_minutos}min</p>
                </div>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-rose-500">
                  {ag.cliente_nome?.[0] ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{ag.cliente_nome}</p>
                  <p className="text-sm text-slate-500 truncate">
                    {ag.servico_nome}
                    {ag.profissional_nome ? ` • ${ag.profissional_nome}` : ''}
                  </p>
                  {ag.valor != null && ag.valor > 0 && (
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">
                      {ag.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  )}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    STATUS_COLORS[ag.status] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {ag.status}
                </span>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(ag)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {ag.status !== 'concluido' && ag.status !== 'cancelado' && (
                    <>
                      <button
                        onClick={() => updateStatus(ag.id, 'concluido')}
                        className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-500 transition-colors"
                        title="Concluir"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => updateStatus(ag.id, 'cancelado')}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                        title="Cancelar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? 'Editar Agendamento' : 'Novo Agendamento'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Cliente */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Cliente *</label>
                {clientes.length > 0 && (
                  <select
                    value={form.cliente_id}
                    onChange={(e) => onSelectCliente(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Selecione a cliente</option>
                    {clientes.map((c: Cliente) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                )}
                {(!form.cliente_id || clientes.length === 0) && (
                  <input
                    className={`w-full border rounded-lg px-3 py-2 text-sm bg-white ${clientes.length > 0 ? 'mt-2' : ''}`}
                    placeholder="Ou digite o nome da cliente"
                    value={form.cliente_nome}
                    onChange={(e) => setForm((f) => ({ ...f, cliente_nome: e.target.value, cliente_id: '' }))}
                  />
                )}
              </div>

              {/* Serviço */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Serviço *</label>
                {servicos.length > 0 && (
                  <select
                    value={form.servico_id}
                    onChange={(e) => onSelectServico(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Selecione o serviço</option>
                    {servicos.map((s: Servico) => (
                      <option key={s.id} value={s.id}>
                        {s.nome} — {s.duracao_minutos}min — {s.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </option>
                    ))}
                  </select>
                )}
                {(!form.servico_id || servicos.length === 0) && (
                  <input
                    className={`w-full border rounded-lg px-3 py-2 text-sm bg-white ${servicos.length > 0 ? 'mt-2' : ''}`}
                    placeholder="Ou digite o nome do serviço"
                    value={form.servico_nome}
                    onChange={(e) => setForm((f) => ({ ...f, servico_nome: e.target.value, servico_id: '' }))}
                  />
                )}
              </div>

              {/* Profissional */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Profissional</label>
                {profissionais.length > 0 ? (
                  <select
                    value={form.profissional_id}
                    onChange={(e) => onSelectProfissional(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Selecione o profissional</option>
                    {profissionais.map((p: Profissional) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="Nome do profissional"
                    value={form.profissional_nome}
                    onChange={(e) => setForm((f) => ({ ...f, profissional_nome: e.target.value }))}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Horário *</label>
                  <input
                    type="time"
                    value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Duração (min)</label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={form.duracao_minutos}
                    onChange={(e) => setForm((f) => ({ ...f, duracao_minutos: parseInt(e.target.value) || 60 }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={form.valor}
                    onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Pagamento</label>
                  <select
                    value={form.forma_pagamento}
                    onChange={(e) => setForm((f) => ({ ...f, forma_pagamento: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Selecionar</option>
                    <option value="Pix">Pix</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Pacote">Pacote</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Observações</label>
                <textarea
                  rows={2}
                  placeholder="Observações opcionais..."
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white resize-none"
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
