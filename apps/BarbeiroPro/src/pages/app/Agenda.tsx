import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Appointment {
  id: string; cliente_nome: string; cliente_telefone?: string
  profissional_id: string; profissional_nome: string
  servico_id: string; servico_nome: string
  data: string; hora: string; status: string; preco?: number; obs?: string
}
interface Professional { id: string; nome: string }
interface Service { id: string; nome: string; preco?: number; duracao_min?: number }

const statusConfig: Record<string, { label: string; border: string; bg: string; badge: string }> = {
  agendado:  { label: 'Agendado',   border: 'border-l-blue-400',   bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700'   },
  confirmado:{ label: 'Confirmado', border: 'border-l-green-400',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700' },
  chegou:    { label: 'Chegou',     border: 'border-l-yellow-400', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700'},
  concluido: { label: 'Concluído',  border: 'border-l-gray-300',   bg: 'bg-gray-50',   badge: 'bg-gray-100 text-gray-600'   },
  cancelado: { label: 'Cancelado',  border: 'border-l-red-300',    bg: 'bg-red-50',    badge: 'bg-red-100 text-red-600'     },
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8)

const emptyForm = {
  cliente_nome: '', cliente_telefone: '',
  profissional_id: '', servico_id: '',
  hora: '09:00', status: 'agendado', obs: '',
}

export default function Agenda() {
  const { barbeariaId } = useAuth()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const dateStr = format(currentDate, 'yyyy-MM-dd')

  useEffect(() => {
    if (!barbeariaId) return
    Promise.all([
      db.professionals.list(barbeariaId),
      db.services.list(barbeariaId),
    ]).then(([pRes, sRes]) => {
      setProfessionals((pRes.data as Professional[]) ?? [])
      setServices((sRes.data as Service[]) ?? [])
    })
  }, [barbeariaId])

  useEffect(() => {
    if (!barbeariaId) return
    setLoading(true)
    db.appointments.listByDate(barbeariaId, dateStr)
      .then(res => setAppointments((res.data as Appointment[]) ?? []))
      .then(() => setLoading(false), () => setLoading(false))
  }, [barbeariaId, dateStr])

  const reloadAppts = () =>
    db.appointments.listByDate(barbeariaId!, dateStr).then(res =>
      setAppointments((res.data as Appointment[]) ?? [])
    )

  const handleSave = async () => {
    if (!barbeariaId || !form.cliente_nome || !form.hora) return
    setSaving(true)
    const svc = services.find(s => s.id === form.servico_id)
    const pro = professionals.find(p => p.id === form.profissional_id)
    const payload = {
      barbearia_id: barbeariaId,
      data: dateStr,
      cliente_nome: form.cliente_nome,
      cliente_telefone: form.cliente_telefone,
      profissional_id: form.profissional_id,
      profissional_nome: pro?.nome ?? '',
      servico_id: form.servico_id,
      servico_nome: svc?.nome ?? '',
      hora: form.hora,
      duracao_minutos: svc?.duracao_min ?? 30,
      valor: svc?.preco ?? 0,
      status: form.status,
      observacoes: form.obs,
    }
    if (selectedAppt) {
      await db.appointments.update(selectedAppt.id, payload)
    } else {
      await db.appointments.create(payload)
    }
    await reloadAppts()
    closeForm()
    setSaving(false)
  }

  const openEdit = (appt: Appointment) => {
    setSelectedAppt(appt)
    setForm({
      cliente_nome: appt.cliente_nome,
      cliente_telefone: appt.cliente_telefone ?? '',
      profissional_id: appt.profissional_id,
      servico_id: appt.servico_id,
      hora: appt.hora,
      status: appt.status,
      obs: appt.obs ?? '',
    })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setSelectedAppt(null); setForm(emptyForm) }

  return (
    <>
    <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#1B1C1E]">Agenda</h1>
            <p className="text-gray-500 text-sm mt-1">Agendamentos do dia</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-black/10 rounded-lg p-1">
              <button onClick={() => setCurrentDate(d => addDays(d, -1))} className="p-1.5 hover:bg-gray-100 rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold px-3 min-w-[180px] text-center">
                {format(currentDate, "EEEE, d 'de' MMM", { locale: ptBR })}
              </span>
              <button onClick={() => setCurrentDate(d => addDays(d, 1))} className="p-1.5 hover:bg-gray-100 rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { setShowForm(true); setSelectedAppt(null); setForm(emptyForm) }}
              className="flex items-center gap-2 bg-[#1B3A4B] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#1B3A4B]/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo agendamento
            </button>
          </div>
        </div>

        {/* Grade horária */}
        <div className="bg-white rounded-2xl border border-black/8 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-7 h-7 border-2 border-[#1B3A4B] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[640px]">
              {HOURS.map(hour => {
                const hourStr = `${String(hour).padStart(2, '0')}:00`
                const nextStr = `${String(hour + 1).padStart(2, '0')}:00`
                const slotAppts = appointments.filter(a => a.hora >= hourStr && a.hora < nextStr)
                return (
                  <div key={hour} className="flex border-b border-black/5 last:border-b-0">
                    <div className="w-16 shrink-0 text-xs text-gray-400 text-right pr-3 py-3 border-r border-black/8">
                      {hourStr}
                    </div>
                    <div className="flex-1 min-h-[56px] p-2 space-y-1">
                      {slotAppts.map(appt => {
                        const s = statusConfig[appt.status] ?? statusConfig.agendado
                        return (
                          <div
                            key={appt.id}
                            onClick={() => openEdit(appt)}
                            className={`rounded border-l-4 p-2 cursor-pointer hover:opacity-80 transition-opacity ${s.border} ${s.bg}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-800">{appt.cliente_nome}</div>
                                <div className="text-xs text-gray-500">{appt.hora} · {appt.servico_nome} · {appt.profissional_nome}</div>
                              </div>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${s.badge}`}>
                                {s.label}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          {Object.entries(statusConfig).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className={`w-3 h-3 rounded-sm border-l-2 ${val.border} ${val.bg}`} />
              {val.label}
            </div>
          ))}
        </div>
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-black/8">
              <h2 className="font-bold text-[#1B1C1E]">
                {selectedAppt ? 'Editar agendamento' : 'Novo agendamento'}
              </h2>
              <button onClick={closeForm} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente *</label>
                <input
                  value={form.cliente_nome}
                  onChange={e => setForm(f => ({ ...f, cliente_nome: e.target.value }))}
                  placeholder="Nome do cliente"
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</label>
                <input
                  value={form.cliente_telefone}
                  onChange={e => setForm(f => ({ ...f, cliente_telefone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Profissional</label>
                  <select
                    value={form.profissional_id}
                    onChange={e => setForm(f => ({ ...f, profissional_id: e.target.value }))}
                    className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20"
                  >
                    <option value="">Selecione</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Horário *</label>
                  <input
                    type="time"
                    value={form.hora}
                    onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
                    className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Serviço</label>
                <select
                  value={form.servico_id}
                  onChange={e => setForm(f => ({ ...f, servico_id: e.target.value }))}
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20"
                >
                  <option value="">Selecione</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.nome} {s.preco ? `— R$ ${s.preco}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20"
                >
                  {Object.entries(statusConfig).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Observações</label>
                <textarea
                  value={form.obs}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                  rows={2}
                  placeholder="Observações opcionais..."
                  className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A4B]/20 resize-none"
                />
              </div>
            </div>
            <div className="p-5 border-t border-black/8 flex gap-3 justify-end">
              <button onClick={closeForm} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.cliente_nome || !form.hora}
                className="px-4 py-2 text-sm font-semibold bg-[#1B3A4B] text-white rounded-lg hover:bg-[#1B3A4B]/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Salvando...' : selectedAppt ? 'Atualizar' : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
