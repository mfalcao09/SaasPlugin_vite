import { useState, useEffect } from 'react'
import { Plus, Package, Users, DollarSign, X, Pencil } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { db, type Pacote, type PacoteCliente } from '@/lib/db'
import { formatCurrency, formatDate } from '@/lib/utils'

type PacoteClienteJoin = PacoteCliente & {
  clientes?: { nome: string }
  pacotes?: { nome: string }
}

const EMPTY_PKG = { nome: '', descricao: '', preco: 0 }
const EMPTY_VIN = { pacote_id: '', cliente_id: '', sessoes_total: 1, data_compra: new Date().toISOString().split('T')[0] }

export default function Pacotes() {
  const { salaoId } = useAuth()
  const [pacotes, setPacotes] = useState<Pacote[]>([])
  const [pcs, setPcs] = useState<PacoteClienteJoin[]>([])
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pacotes' | 'clientes'>('pacotes')

  const [showPkg, setShowPkg] = useState(false)
  const [editingPkg, setEditingPkg] = useState<Pacote | null>(null)
  const [formPkg, setFormPkg] = useState(EMPTY_PKG)

  const [showVin, setShowVin] = useState(false)
  const [formVin, setFormVin] = useState(EMPTY_VIN)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!salaoId) return
    setLoading(true)
    const [{ data: p }, { data: pc }, { data: cl }] = await Promise.all([
      db.pacotes.list(salaoId),
      db.pacotesClientes.list(salaoId),
      db.clientes.list(salaoId),
    ])
    setPacotes(p ?? [])
    setPcs((pc ?? []) as PacoteClienteJoin[])
    setClientes((cl ?? []) as { id: string; nome: string }[])
    setLoading(false)
  }

  useEffect(() => { if (salaoId) load() }, [salaoId])

  function openCreatePkg() { setEditingPkg(null); setFormPkg(EMPTY_PKG); setError(null); setShowPkg(true) }
  function openEditPkg(p: Pacote) {
    setEditingPkg(p)
    setFormPkg({ nome: p.nome, descricao: p.descricao ?? '', preco: p.preco })
    setError(null); setShowPkg(true)
  }

  async function savePkg() {
    if (!salaoId) return
    if (!formPkg.nome.trim()) { setError('Nome é obrigatório'); return }
    if (formPkg.preco <= 0) { setError('Preço inválido'); return }
    setSaving(true); setError(null)
    const payload = { salao_id: salaoId, nome: formPkg.nome, descricao: formPkg.descricao, preco: Number(formPkg.preco), ativo: true, servico_ids: [] }
    if (editingPkg) await db.pacotes.update(editingPkg.id, payload)
    else await db.pacotes.create(payload)
    setSaving(false); setShowPkg(false); load()
  }

  function openVincular() {
    setFormVin({ ...EMPTY_VIN, pacote_id: pacotes[0]?.id ?? '' })
    setError(null); setShowVin(true)
  }

  async function saveVincular() {
    if (!salaoId) return
    if (!formVin.pacote_id || !formVin.cliente_id) { setError('Selecione pacote e cliente'); return }
    setSaving(true); setError(null)
    await db.pacotesClientes.create({
      salao_id: salaoId,
      pacote_id: formVin.pacote_id,
      cliente_id: formVin.cliente_id,
      data_compra: formVin.data_compra,
      sessoes_total: Number(formVin.sessoes_total),
      sessoes_usadas: 0,
    })
    setSaving(false); setShowVin(false); load()
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
          <h1 className="text-2xl font-bold text-white">Pacotes</h1>
          <p className="text-slate-400 text-sm">{pcs.length} pacotes vinculados a clientes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openVincular} className="flex items-center gap-2 px-4 py-2 border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-sm font-medium rounded-lg transition-colors">
            <Users className="w-4 h-4" /> Vincular a Cliente
          </button>
          <button onClick={openCreatePkg} className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Novo Pacote
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 rounded-lg p-1 w-fit">
        {(['pacotes', 'clientes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t === 'pacotes' ? 'Catálogo' : 'Por Cliente'}
          </button>
        ))}
      </div>

      {/* Tab Catálogo */}
      {tab === 'pacotes' && (
        pacotes.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-16 text-center">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">Nenhum pacote cadastrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pacotes.map(p => (
              <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-rose-500/20 rounded-xl flex items-center justify-center">
                    <Package className="w-5 h-5 text-rose-400" />
                  </div>
                  <button onClick={() => openEditPkg(p)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="font-semibold text-white mb-1">{p.nome}</p>
                {p.descricao && <p className="text-xs text-slate-500 mb-3 leading-relaxed">{p.descricao}</p>}
                <span className="flex items-center gap-1 text-sm font-bold text-emerald-400">
                  <DollarSign className="w-3.5 h-3.5" />{formatCurrency(p.preco)}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab Por Cliente */}
      {tab === 'clientes' && (
        pcs.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-16 text-center">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">Nenhum pacote vinculado ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pcs.map(pc => {
              const pct = pc.sessoes_total > 0 ? Math.round((pc.sessoes_usadas / pc.sessoes_total) * 100) : 0
              return (
                <div key={pc.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{pc.clientes?.nome ?? '—'}</p>
                    <p className="text-sm text-slate-400">{pc.pacotes?.nome ?? '—'} · comprado em {formatDate(pc.data_compra)}</p>
                  </div>
                  <div className="text-right shrink-0 min-w-[100px]">
                    <p className="text-sm font-semibold text-white">{pc.sessoes_usadas}/{pc.sessoes_total} sessões</p>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1.5">
                      <div className="bg-rose-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Modal Pacote */}
      {showPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">{editingPkg ? 'Editar Pacote' : 'Novo Pacote'}</h2>
              <button onClick={() => setShowPkg(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Nome *</label>
                <input value={formPkg.nome} onChange={e => setFormPkg(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Pacote 10 sessões" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Descrição</label>
                <textarea value={formPkg.descricao} onChange={e => setFormPkg(f => ({ ...f, descricao: e.target.value }))} rows={2} placeholder="Opcional..." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:border-rose-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Preço (R$) *</label>
                <input type="number" value={formPkg.preco} onChange={e => setFormPkg(f => ({ ...f, preco: Number(e.target.value) }))} min={0} step={0.01} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button onClick={() => setShowPkg(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={savePkg} disabled={saving} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : editingPkg ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vincular */}
      {showVin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Vincular Pacote a Cliente</h2>
              <button onClick={() => setShowVin(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Pacote *</label>
                <select value={formVin.pacote_id} onChange={e => setFormVin(f => ({ ...f, pacote_id: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500">
                  <option value="">Selecionar...</option>
                  {pacotes.map(p => <option key={p.id} value={p.id}>{p.nome} — {formatCurrency(p.preco)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Cliente *</label>
                <select value={formVin.cliente_id} onChange={e => setFormVin(f => ({ ...f, cliente_id: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500">
                  <option value="">Selecionar...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Sessões totais</label>
                  <input type="number" value={formVin.sessoes_total} onChange={e => setFormVin(f => ({ ...f, sessoes_total: Number(e.target.value) }))} min={1} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Data de compra</label>
                  <input type="date" value={formVin.data_compra} onChange={e => setFormVin(f => ({ ...f, data_compra: e.target.value }))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm focus:outline-none focus:border-rose-500" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button onClick={() => setShowVin(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={saveVincular} disabled={saving} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Salvando...' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
