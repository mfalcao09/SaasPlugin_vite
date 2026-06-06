import { useState, useEffect } from 'react'
import { Plus, X, Phone, Mail, ChevronRight, ChevronLeft, Target } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { db, type Lead } from '@/lib/db'

const PIPELINE: { key: Lead['status']; label: string; color: string; dot: string }[] = [
  { key: 'novo',          label: 'Novo',      color: 'border-slate-600',      dot: 'bg-slate-400' },
  { key: 'contato_feito', label: 'Contato',   color: 'border-blue-500/40',    dot: 'bg-blue-400' },
  { key: 'interesse',     label: 'Interesse', color: 'border-amber-500/40',   dot: 'bg-amber-400' },
  { key: 'agendado',      label: 'Agendado',  color: 'border-purple-500/40',  dot: 'bg-purple-400' },
  { key: 'convertido',    label: 'Convertido',color: 'border-emerald-500/40', dot: 'bg-emerald-400' },
  { key: 'perdido',       label: 'Perdido',   color: 'border-red-500/40',     dot: 'bg-red-400' },
]
const STATUS_ORDER = PIPELINE.map(p => p.key)
const ORIGENS = ['Instagram', 'WhatsApp', 'Indicação', 'Google', 'Facebook', 'Outro']
const EMPTY_FORM = { nome: '', telefone: '', email: '', origem: 'Instagram', interesse: '' }

export default function Leads() {
  const { salaoId } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!salaoId) return
    setLoading(true)
    const { data } = await db.leads.list(salaoId)
    setLeads(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (salaoId) load() }, [salaoId])

  async function criar() {
    if (!salaoId) return
    if (!form.nome.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError(null)
    await db.leads.create({ salao_id: salaoId, ...form, status: 'novo' })
    setSaving(false); setShowForm(false); setForm(EMPTY_FORM); load()
  }

  async function mover(lead: Lead, delta: 1 | -1) {
    const idx = STATUS_ORDER.indexOf(lead.status)
    const novoIdx = idx + delta
    if (novoIdx < 0 || novoIdx >= STATUS_ORDER.length - 2) return // -2: não entra em convertido/perdido via seta
    await db.leads.update(lead.id, { status: STATUS_ORDER[novoIdx] })
    load()
  }

  async function terminal(lead: Lead, status: 'convertido' | 'perdido') {
    await db.leads.update(lead.id, { status })
    load()
  }

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-rose-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-slate-400 text-sm">
            {leads.length} leads · {leads.filter(l => l.status === 'convertido').length} convertidos
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setError(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Lead
        </button>
      </div>

      {/* Kanban */}
      {leads.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-16 text-center">
          <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">Nenhum lead cadastrado</p>
          <p className="text-slate-500 text-sm mt-1">Adicione leads para gerenciar seu pipeline de vendas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 overflow-x-auto">
          {PIPELINE.map(col => {
            const colLeads = leads.filter(l => l.status === col.key)
            const isTerminal = col.key === 'convertido' || col.key === 'perdido'
            return (
              <div key={col.key} className={`bg-slate-800 border ${col.color} rounded-xl flex flex-col min-h-[200px] min-w-[160px]`}>
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/50">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${col.dot}`} />
                  <span className="text-xs font-semibold text-slate-300 truncate">{col.label}</span>
                  <span className="ml-auto text-xs text-slate-500 shrink-0">{colLeads.length}</span>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
                  {colLeads.map(lead => (
                    <div key={lead.id} className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-semibold text-white leading-tight">{lead.nome}</p>
                      {lead.telefone && (
                        <p className="flex items-center gap-1 text-xs text-slate-400">
                          <Phone className="w-3 h-3 shrink-0" />{lead.telefone}
                        </p>
                      )}
                      {lead.email && (
                        <p className="flex items-center gap-1 text-xs text-slate-400 truncate">
                          <Mail className="w-3 h-3 shrink-0" />{lead.email}
                        </p>
                      )}
                      {lead.origem && (
                        <span className="inline-block text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                          {lead.origem}
                        </span>
                      )}
                      {lead.interesse && (
                        <p className="text-xs text-slate-500 italic truncate">{lead.interesse}</p>
                      )}
                      {!isTerminal && (
                        <div className="flex items-center gap-1 pt-1 border-t border-slate-700/50">
                          <button
                            onClick={() => mover(lead, -1)}
                            disabled={STATUS_ORDER.indexOf(lead.status) === 0}
                            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors"
                            title="Retroceder"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => mover(lead, 1)}
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                            title="Avançar"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex-1" />
                          <button
                            onClick={() => terminal(lead, 'convertido')}
                            className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                            title="Marcar convertido"
                          >✓</button>
                          <button
                            onClick={() => terminal(lead, 'perdido')}
                            className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                            title="Marcar perdido"
                          >✗</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
              <h2 className="text-lg font-semibold text-white">Novo Lead</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Nome *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Telefone</label>
                  <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(11) 9xxxx-xxxx" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">E-mail</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@ex.com" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Origem</label>
                <select value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500">
                  {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Interesse</label>
                <input value={form.interesse} onChange={e => setForm(f => ({ ...f, interesse: e.target.value }))} placeholder="Ex: Coloração, design de sobrancelha..." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={criar} disabled={saving} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : 'Criar Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
