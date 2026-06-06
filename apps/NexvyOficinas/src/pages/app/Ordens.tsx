import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Plus, Loader2, ChevronDown, X, Wrench } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'

const STATUS_OPTIONS = [
  { value: 'aberta', label: 'Aberta', color: 'bg-blue-500/15 text-blue-400' },
  { value: 'em_andamento', label: 'Em andamento', color: 'bg-yellow-500/15 text-yellow-400' },
  { value: 'aguardando_pecas', label: 'Aguardando peças', color: 'bg-orange-500/15 text-orange-400' },
  { value: 'concluida', label: 'Concluída', color: 'bg-green-500/15 text-green-400' },
  { value: 'entregue', label: 'Entregue', color: 'bg-slate-500/15 text-slate-400' },
]

const emptyForm = {
  cliente_id: '',
  veiculo_id: '',
  descricao_servico: '',
  tecnico_nome: '',
  valor_total: '',
  data_saida_prevista: '',
  status: 'aberta',
}

export default function Ordens() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('todos')

  const { data: ordens = [], isLoading } = useQuery({
    queryKey: ['ordens_servico', empresaId],
    queryFn: () => db.ordensServico.list(empresaId!).then(r => r.data ?? []),
    enabled: !!empresaId,
  })

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', empresaId],
    queryFn: () => db.clientes.list(empresaId!).then(r => r.data ?? []),
    enabled: !!empresaId,
  })

  const { data: veiculos = [] } = useQuery({
    queryKey: ['veiculos', empresaId],
    queryFn: () => db.veiculos.list(empresaId!).then(r => r.data ?? []),
    enabled: !!empresaId,
  })

  const veiculosFiltrados = form.cliente_id
    ? (veiculos as any[]).filter((v: any) => v.cliente_id === form.cliente_id)
    : (veiculos as any[])

  const salvar = useMutation({
    mutationFn: () => {
      const payload = {
        empresa_id: empresaId!,
        cliente_id: form.cliente_id || null,
        veiculo_id: form.veiculo_id || null,
        descricao_servico: form.descricao_servico,
        tecnico_nome: form.tecnico_nome,
        valor_total: form.valor_total ? parseFloat(form.valor_total) : null,
        data_saida_prevista: form.data_saida_prevista || null,
        status: form.status,
      }
      if (editId) return db.ordensServico.update(editId, payload)
      return db.ordensServico.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordens_servico', empresaId] })
      toast.success(editId ? 'OS atualizada!' : 'OS criada!')
      resetForm()
    },
    onError: () => toast.error('Erro ao salvar OS.'),
  })

  const atualizar = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      db.ordensServico.update(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordens_servico', empresaId] })
      toast.success('Status atualizado!')
    },
  })

  const excluir = useMutation({
    mutationFn: (id: string) => db.ordensServico.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordens_servico', empresaId] })
      toast.success('OS excluída.')
    },
    onError: () => toast.error('Erro ao excluir.'),
  })

  function resetForm() {
    setForm(emptyForm)
    setEditId(null)
    setShowForm(false)
  }

  function openEdit(os: any) {
    setForm({
      cliente_id: os.cliente_id ?? '',
      veiculo_id: os.veiculo_id ?? '',
      descricao_servico: os.descricao_servico ?? '',
      tecnico_nome: os.tecnico_nome ?? '',
      valor_total: os.valor_total?.toString() ?? '',
      data_saida_prevista: os.data_saida_prevista ?? '',
      status: os.status ?? 'aberta',
    })
    setEditId(os.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filtered = (ordens as any[]).filter(os =>
    filterStatus === 'todos' || os.status === filterStatus
  )

  const getStatusStyle = (status: string) =>
    STATUS_OPTIONS.find(s => s.value === status)?.color ?? 'bg-slate-500/15 text-slate-400'
  const getStatusLabel = (status: string) =>
    STATUS_OPTIONS.find(s => s.value === status)?.label ?? status

  const inp = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500'
  const sel = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-orange-500 appearance-none'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ordens de Serviço</h1>
          <p className="text-slate-400 text-sm mt-1">{(ordens as any[]).length} OS cadastradas</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova OS
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{editId ? 'Editar OS' : 'Nova OS'}</h2>
            <button onClick={resetForm}><X className="h-4 w-4 text-slate-400 hover:text-white" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value, veiculo_id: '' }))} className={sel}>
                <option value="">Selecionar cliente</option>
                {(clientes as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={form.veiculo_id} onChange={e => setForm(f => ({ ...f, veiculo_id: e.target.value }))} className={sel}>
                <option value="">Selecionar veículo</option>
                {veiculosFiltrados.map((v: any) => <option key={v.id} value={v.id}>{v.marca} {v.modelo} {v.placa ? `— ${v.placa}` : ''}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <textarea
              value={form.descricao_servico}
              onChange={e => setForm(f => ({ ...f, descricao_servico: e.target.value }))}
              placeholder="Descrição do serviço *"
              rows={3}
              className={`${inp} sm:col-span-2 resize-none`}
            />
            <input value={form.tecnico_nome} onChange={e => setForm(f => ({ ...f, tecnico_nome: e.target.value }))} placeholder="Técnico responsável" className={inp} />
            <input type="number" value={form.valor_total} onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} placeholder="Valor total (R$)" className={inp} />
            <input type="date" value={form.data_saida_prevista} onChange={e => setForm(f => ({ ...f, data_saida_prevista: e.target.value }))} className={inp} title="Data de saída prevista" />
            <div className="relative">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={sel}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => salvar.mutate()}
              disabled={!form.descricao_servico.trim() || salvar.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {/* Filtro por status */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus('todos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === 'todos' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
          Todas ({(ordens as any[]).length})
        </button>
        {STATUS_OPTIONS.map(s => {
          const count = (ordens as any[]).filter((o: any) => o.status === s.value).length
          return (
            <button
              key={s.value}
              onClick={() => setFilterStatus(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s.value ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              {s.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center bg-slate-900 border border-slate-700 rounded-xl">
            <ClipboardList className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Nenhuma OS encontrada.</p>
          </div>
        ) : (
          filtered.map((os: any) => (
            <div key={os.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-orange-600/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Wrench className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm leading-snug line-clamp-2">{os.descricao_servico}</p>
                    {os.veiculos && (
                      <p className="text-slate-400 text-xs mt-0.5">{os.veiculos.marca} {os.veiculos.modelo} {os.veiculos.placa ? `• ${os.veiculos.placa}` : ''}</p>
                    )}
                    {os.clientes && <p className="text-slate-500 text-xs">{os.clientes.nome}</p>}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${getStatusStyle(os.status)}`}>
                  {getStatusLabel(os.status)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {os.tecnico_nome && <span>Técnico: <span className="text-slate-400">{os.tecnico_nome}</span></span>}
                  {os.data_saida_prevista && <span>Saída: <span className="text-slate-400">{formatDate(os.data_saida_prevista)}</span></span>}
                  {os.valor_total && <span className="text-orange-400 font-semibold">{formatCurrency(os.valor_total)}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={os.status}
                      onChange={e => atualizar.mutate({ id: os.id, status: e.target.value })}
                      className="text-xs bg-slate-800 border border-slate-600 text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-orange-500 appearance-none pr-6"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                  </div>
                  <button onClick={() => openEdit(os)} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">Editar</button>
                  <button onClick={() => { if (confirm('Excluir esta OS?')) excluir.mutate(os.id) }} className="text-xs px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors">Excluir</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
