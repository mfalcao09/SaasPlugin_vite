// Rota: /leads — importado em App.tsx linha 21
// db.leads.list(barbeariaId) → Lead[]
// Pipeline kanban: novo_contato → interesse → agendamento_marcado → convertido

import { useState, useEffect } from 'react'
import { Plus, X, Phone, Mail, ArrowRight, User } from 'lucide-react'
import { db, type Lead } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'

type StatusLead = 'novo_contato' | 'interesse' | 'agendamento_marcado' | 'convertido'

const COLUNAS: { key: StatusLead; label: string; cor: string; bg: string }[] = [
  { key: 'novo_contato',        label: 'Novo contato',        cor: 'text-slate-300',   bg: 'bg-slate-700/40 border-slate-600' },
  { key: 'interesse',           label: 'Interesse',           cor: 'text-blue-300',    bg: 'bg-blue-900/20 border-blue-900/40' },
  { key: 'agendamento_marcado', label: 'Agendamento marcado', cor: 'text-amber-300',   bg: 'bg-amber-900/20 border-amber-900/40' },
  { key: 'convertido',          label: 'Convertido',          cor: 'text-emerald-300', bg: 'bg-emerald-900/20 border-emerald-900/40' },
]

const ORDEM_STATUS: StatusLead[] = ['novo_contato', 'interesse', 'agendamento_marcado', 'convertido']

const EMPTY_FORM = {
  nome: '', telefone: '', email: '', interesse: '',
  status: 'novo_contato' as StatusLead, observacoes: '',
}

export default function Leads() {
  const { barbeariaId } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    if (!barbeariaId) return
    setLoading(true)
    const { data } = await db.leads.list(barbeariaId)
    setLeads(data ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [barbeariaId])

  function leadsDeColuna(status: StatusLead) {
    return leads.filter(l => l.status === status)
  }

  function abrirNovo() {
    setForm(EMPTY_FORM)
    setEditandoId(null)
    setErro(null)
    setModal('novo')
  }

  function abrirEditar(l: Lead) {
    setForm({
      nome: l.nome, telefone: l.telefone ?? '', email: l.email ?? '',
      interesse: l.interesse ?? '', status: l.status as StatusLead,
      observacoes: l.observacoes ?? '',
    })
    setEditandoId(l.id)
    setErro(null)
    setModal('editar')
  }

  async function avancarStatus(l: Lead) {
    const idx = ORDEM_STATUS.indexOf(l.status as StatusLead)
    if (idx < 0 || idx >= ORDEM_STATUS.length - 1) return
    await db.leads.update(l.id, { status: ORDEM_STATUS[idx + 1] })
    carregar()
  }

  async function salvar() {
    if (!barbeariaId || !form.nome.trim()) { setErro('Nome é obrigatório.'); return }
    setSalvando(true)
    setErro(null)
    const payload = {
      barbearia_id: barbeariaId,
      nome: form.nome.trim(),
      telefone: form.telefone || undefined,
      email: form.email || undefined,
      interesse: form.interesse || undefined,
      status: form.status,
      observacoes: form.observacoes || undefined,
    }
    if (modal === 'novo') {
      const { error } = await db.leads.create(payload)
      if (error) { setErro(error.message); setSalvando(false); return }
    } else if (editandoId) {
      const { error } = await db.leads.update(editandoId, payload)
      if (error) { setErro(error.message); setSalvando(false); return }
    }
    setSalvando(false)
    setModal(null)
    carregar()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads — Pipeline CRM</h1>
          <p className="text-slate-400 text-sm mt-1">{leads.length} lead(s) no funil</p>
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#254d7a] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo lead
        </button>
      </div>

      {/* Pipeline kanban */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-[#1e3a5f] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUNAS.map(col => {
            const itens = leadsDeColuna(col.key)
            return (
              <div key={col.key} className={`rounded-2xl border p-4 ${col.bg}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-bold ${col.cor}`}>{col.label}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full bg-black/20 ${col.cor} font-semibold`}>{itens.length}</span>
                </div>
                <div className="space-y-3">
                  {itens.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">Nenhum lead aqui</p>
                  )}
                  {itens.map(l => (
                    <div
                      key={l.id}
                      className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3 hover:bg-slate-900/80 transition-colors cursor-pointer"
                      onClick={() => abrirEditar(l)}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                          {l.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{l.nome}</p>
                          {l.interesse && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">{l.interesse}</p>
                          )}
                        </div>
                      </div>
                      {l.telefone && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                          <Phone className="w-3 h-3 flex-shrink-0" />{l.telefone}
                        </div>
                      )}
                      {col.key !== 'convertido' && (
                        <button
                          onClick={e => { e.stopPropagation(); avancarStatus(l) }}
                          className="mt-2 w-full flex items-center justify-center gap-1 text-xs py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors border border-slate-700/40"
                        >
                          Avançar <ArrowRight className="w-3 h-3" />
                        </button>
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
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">
                {modal === 'novo' ? 'Novo lead' : 'Editar lead'}
              </h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {erro && <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{erro}</p>}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Nome do lead"
                    className="w-full pl-9 pr-3 bg-slate-800 border border-slate-600 rounded-lg py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Telefone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="tel" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="w-full pl-9 pr-3 bg-slate-800 border border-slate-600 rounded-lg py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@exemplo.com"
                    className="w-full pl-9 pr-3 bg-slate-800 border border-slate-600 rounded-lg py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Serviço de interesse</label>
                <input type="text" value={form.interesse} onChange={e => setForm(f => ({ ...f, interesse: e.target.value }))}
                  placeholder="Ex: Corte + barba"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Etapa no funil</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as StatusLead }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  {COLUNAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Anotações sobre o lead..." rows={2}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] resize-none"
                />
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
