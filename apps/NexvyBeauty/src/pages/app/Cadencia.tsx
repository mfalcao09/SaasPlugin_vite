import { useState, useEffect } from 'react'
import { Plus, X, Zap, MessageCircle, Mail, Phone, CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { db, type Lead, type LeadCadence } from '@/lib/db'
import { formatDate } from '@/lib/utils'

const TIPOS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  { key: 'email',    label: 'E-mail',   icon: Mail,          color: 'text-blue-400',    bg: 'bg-blue-500/20' },
  { key: 'ligacao',  label: 'Ligação',  icon: Phone,         color: 'text-amber-400',   bg: 'bg-amber-500/20' },
] as const

type TipoKey = typeof TIPOS[number]['key']
type CadenceWithLead = LeadCadence & { lead?: Lead }

const hoje = new Date().toISOString().split('T')[0]
const EMPTY_FORM = { lead_id: '', tipo: 'whatsapp' as TipoKey, conteudo: '', data_agendada: hoje }

export default function Cadencia() {
  const { salaoId } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [cadences, setCadences] = useState<CadenceWithLead[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'pendente' | 'todos' | 'feito'>('pendente')

  async function load() {
    if (!salaoId) return
    setLoading(true)
    const { data: ls } = await db.leads.list(salaoId)
    const leadsData = ls ?? []
    setLeads(leadsData)
    const all: CadenceWithLead[] = []
    await Promise.all(leadsData.map(async lead => {
      const { data: cs } = await db.leadCadences.listByLead(lead.id)
      for (const c of cs ?? []) all.push({ ...c, lead })
    }))
    all.sort((a, b) => (a.data_agendada ?? '').localeCompare(b.data_agendada ?? ''))
    setCadences(all)
    setLoading(false)
  }

  useEffect(() => { if (salaoId) load() }, [salaoId])

  function templateMsg(lead: Lead) {
    return `Olá ${lead.nome}, vi que você tem interesse em ${lead.interesse ?? 'nossos serviços'}. Gostaria de agendar um horário?`
  }

  function openForm() {
    const firstLead = leads.find(l => l.status !== 'convertido' && l.status !== 'perdido')
    setForm({ ...EMPTY_FORM, lead_id: firstLead?.id ?? '', conteudo: firstLead ? templateMsg(firstLead) : '' })
    setError(null); setShowForm(true)
  }

  async function salvar() {
    if (!salaoId) return
    if (!form.lead_id) { setError('Selecione um lead'); return }
    setSaving(true); setError(null)
    await db.leadCadences.create({
      salao_id: salaoId, lead_id: form.lead_id, tipo: form.tipo,
      conteudo: form.conteudo, data_agendada: form.data_agendada, status: 'pendente',
    })
    setSaving(false); setShowForm(false); load()
  }

  async function marcarFeito(c: CadenceWithLead) {
    await db.leadCadences.update(c.id, { status: 'feito' })
    load()
  }

  const displayed = cadences.filter(c => filtro === 'todos' || c.status === filtro)
  const tipoInfo = (tipo: string) => TIPOS.find(t => t.key === tipo) ?? TIPOS[0]

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-rose-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Cadência de Follow-up</h1>
          <p className="text-slate-400 text-sm">
            {cadences.filter(c => c.status === 'pendente').length} follow-ups pendentes
          </p>
        </div>
        <button
          onClick={openForm}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Follow-up
        </button>
      </div>

      {/* Filtro */}
      <div className="flex gap-1 bg-slate-800 rounded-lg p-1 w-fit">
        {(['pendente', 'todos', 'feito'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filtro === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            {f === 'pendente' ? 'Pendentes' : f === 'feito' ? 'Feitos' : 'Todos'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {displayed.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-16 text-center">
          <Zap className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">
            {filtro === 'pendente' ? 'Nenhum follow-up pendente' : 'Nenhum follow-up registrado'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(c => {
            const t = tipoInfo(c.tipo)
            const vencido = c.status === 'pendente' && c.data_agendada != null && c.data_agendada < hoje
            return (
              <div key={c.id} className={`bg-slate-800 border rounded-xl p-4 flex items-start gap-4 ${vencido ? 'border-red-500/40' : 'border-slate-700'}`}>
                <div className={`w-9 h-9 ${t.bg} rounded-lg flex items-center justify-center shrink-0 mt-0.5`}>
                  <t.icon className={`w-4 h-4 ${t.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white">{c.lead?.nome ?? '—'}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${t.bg} ${t.color}`}>{t.label}</span>
                    {c.status === 'feito' && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Feito</span>}
                    {vencido && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Atrasado</span>}
                  </div>
                  {c.conteudo && <p className="text-sm text-slate-400 mt-1 leading-relaxed line-clamp-2">{c.conteudo}</p>}
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    {c.data_agendada ? formatDate(c.data_agendada) : 'Sem data'}
                  </div>
                </div>
                {c.status === 'pendente' && (
                  <button onClick={() => marcarFeito(c)} className="p-2 rounded-lg hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-colors shrink-0" title="Marcar como feito">
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Novo Follow-up</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Lead *</label>
                <select
                  value={form.lead_id}
                  onChange={e => {
                    const lead = leads.find(l => l.id === e.target.value)
                    setForm(f => ({ ...f, lead_id: e.target.value, conteudo: lead ? templateMsg(lead) : f.conteudo }))
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500"
                >
                  <option value="">Selecionar lead...</option>
                  {leads.filter(l => l.status !== 'convertido' && l.status !== 'perdido').map(l => (
                    <option key={l.id} value={l.id}>{l.nome} · {l.status}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Canal</label>
                <div className="flex gap-2">
                  {TIPOS.map(t => (
                    <button key={t.key} onClick={() => setForm(f => ({ ...f, tipo: t.key }))} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${form.tipo === t.key ? `${t.bg} ${t.color} border-transparent` : 'border-slate-700 text-slate-500 hover:text-white'}`}>
                      <t.icon className="w-3.5 h-3.5" />{t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Data agendada</label>
                <input type="date" value={form.data_agendada} onChange={e => setForm(f => ({ ...f, data_agendada: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Mensagem / Roteiro</label>
                <textarea value={form.conteudo} onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))} rows={4} placeholder="Mensagem ou roteiro da ligação..." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
