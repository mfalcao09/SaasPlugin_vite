import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Plus, Search, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { SalaoLayout, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'

interface Agendamento {
  id: string
  organization_id: string
  cliente_id: string | null
  cliente_nome: string | null
  profissional_id: string | null
  profissional_nome: string | null
  servico_id: string | null
  servico_nome: string | null
  data: string
  hora: string
  duracao_minutos: number | null
  valor: number | null
  forma_pagamento: string | null
  status: string | null
  observacoes: string | null
}

interface ClienteOption { id: string; nome: string }
interface ProfissionalOption { id: string; nome: string }
interface ServicoOption { id: string; nome: string; valor: number | null }

const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  agendado: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  concluido: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  cancelado: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

function formatHora(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 5)
}

export default function Agenda() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [clienteId, setClienteId] = useState('')
  const [profissionalId, setProfissionalId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [valor, setValor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [status, setStatus] = useState('agendado')
  const [observacoes, setObservacoes] = useState('')

  const { data: agendamentos = [], isLoading } = useQuery({
    queryKey: ['agendamentos', organizationId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('agendamentos').select('*')
        .eq('organization_id', organizationId!)
        .order('data', { ascending: true }).order('hora', { ascending: true })
      if (error) throw error
      return (rows ?? []) as Agendamento[]
    },
    enabled: !!organizationId,
  })

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', organizationId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('clientes').select('id, nome')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (rows ?? []) as ClienteOption[]
    },
    enabled: !!organizationId,
  })

  const { data: profissionais = [] } = useQuery({
    queryKey: ['profissionais', organizationId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('profissionais').select('id, nome')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (rows ?? []) as ProfissionalOption[]
    },
    enabled: !!organizationId,
  })

  const { data: servicos = [] } = useQuery({
    queryKey: ['servico_catalogo', organizationId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('servico_catalogo').select('id, nome, valor')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (rows ?? []) as ServicoOption[]
    },
    enabled: !!organizationId,
  })

  function resetForm() {
    setShowForm(false); setEditId(null)
    setClienteId(''); setProfissionalId(''); setServicoId('')
    setData(''); setHora(''); setValor(''); setFormaPagamento('')
    setStatus('agendado'); setObservacoes('')
  }

  function openEdit(a: Agendamento) {
    setEditId(a.id)
    setClienteId(a.cliente_id ?? '')
    setProfissionalId(a.profissional_id ?? '')
    setServicoId(a.servico_id ?? '')
    setData(a.data ?? '')
    setHora(a.hora ? a.hora.slice(0, 5) : '')
    setValor(a.valor != null ? String(a.valor) : '')
    setFormaPagamento(a.forma_pagamento ?? '')
    setStatus(a.status ?? 'agendado')
    setObservacoes(a.observacoes ?? '')
    setShowForm(true)
  }

  function onSelectServico(id: string) {
    setServicoId(id)
    const s = servicos.find(sv => sv.id === id)
    if (s && s.valor != null && valor === '') setValor(String(s.valor))
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const cliente = clientes.find(c => c.id === clienteId)
      const profissional = profissionais.find(p => p.id === profissionalId)
      const servico = servicos.find(s => s.id === servicoId)
      const payload = {
        organization_id: organizationId!,
        cliente_id: clienteId || null,
        cliente_nome: cliente?.nome ?? null,
        profissional_id: profissionalId || null,
        profissional_nome: profissional?.nome ?? null,
        servico_id: servicoId || null,
        servico_nome: servico?.nome ?? null,
        data,
        hora,
        valor: valor ? Number(valor) : 0,
        forma_pagamento: formaPagamento || null,
        status: status || 'agendado',
        observacoes: observacoes || null,
      }
      if (editId) {
        const { error } = await supabase.from('agendamentos').update(payload)
          .eq('id', editId).eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('agendamentos').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos', organizationId] })
      toast.success(editId ? 'Agendamento atualizado!' : 'Agendamento criado!')
      resetForm()
    },
    onError: () => toast.error('Erro ao salvar agendamento.'),
  })

  const filtered = agendamentos.filter(a =>
    a.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
    a.profissional_nome?.toLowerCase().includes(search.toLowerCase()) ||
    a.servico_nome?.toLowerCase().includes(search.toLowerCase())
  )

  if (!organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  return (
    <SalaoLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-muted-foreground text-sm mt-1">{agendamentos.length} agendamentos</p>
        </div>
        <button onClick={() => (showForm ? resetForm() : setShowForm(true))} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Agendamento
        </button>
      </div>

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">{editId ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="">Selecionar cliente *</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={profissionalId} onChange={e => setProfissionalId(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="">Selecionar profissional *</option>
              {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <select value={servicoId} onChange={e => onSelectServico(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="">Selecionar serviço *</option>
              {servicos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary" />
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary" />
            <input type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="Valor (R$)" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} placeholder="Forma de pagamento" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="agendado">Agendado</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações" rows={2} className="sm:col-span-2 px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => salvar.mutate()} disabled={!clienteId || !profissionalId || !servicoId || !data || !hora || salvar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
              {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editId ? 'Salvar alterações' : 'Criar agendamento'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente, profissional ou serviço..." className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{search ? 'Nenhum agendamento encontrado.' : 'Nenhum agendamento cadastrado ainda.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Data / Hora</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Profissional</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Serviço</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(a => (
                <tr key={a.id} onClick={() => openEdit(a)} className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <td className="px-5 py-3">
                    <p className="text-foreground font-medium">{formatDate(a.data)}</p>
                    <p className="text-xs text-muted-foreground">{formatHora(a.hora)}</p>
                  </td>
                  <td className="px-5 py-3 text-foreground">{a.cliente_nome ?? '-'}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{a.profissional_nome ?? '-'}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{a.servico_nome ?? '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[a.status ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABEL[a.status ?? ''] ?? a.status ?? '-'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-foreground hidden lg:table-cell">{formatCurrency(a.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </SalaoLayout>
  )
}
