import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Search, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { OficinaLayout, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'

const STATUS_COLOR: Record<string, string> = {
  pendente: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  aprovado: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  recusado: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

export default function Orcamentos() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [veiculoId, setVeiculoId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')

  const { data: orcamentos = [], isLoading } = useQuery({
    queryKey: ['orcamentos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('orcamentos').select('*')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nome').eq('organization_id', organizationId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const { data: veiculos = [] } = useQuery({
    queryKey: ['veiculos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('veiculos').select('id, marca, modelo, placa, cliente_id').eq('organization_id', organizationId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const criar = useMutation({
    mutationFn: async () => {
      const veiculo = (veiculos as any[]).find((v: any) => v.id === veiculoId)
      const cliente = (clientes as any[]).find((c: any) => c.id === clienteId)
      const total = valor ? parseFloat(valor.replace(',', '.')) : 0
      const { error } = await supabase.from('orcamentos').insert({
        organization_id: organizationId!,
        cliente_id: clienteId || null,
        cliente_nome: cliente?.nome ?? null,
        veiculo_id: veiculoId || null,
        veiculo_desc: veiculo ? `${veiculo.marca} ${veiculo.modelo} - ${veiculo.placa}` : null,
        status: 'pendente',
        total,
        itens: descricao ? [{ descricao, quantidade: 1, valor: total }] : [],
        data: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orcamentos', organizationId] })
      toast.success('Orçamento criado!')
      setShowForm(false); setClienteId(''); setVeiculoId(''); setDescricao(''); setValor('')
    },
    onError: () => toast.error('Erro ao criar orçamento.'),
  })

  const filtered = (orcamentos as any[]).filter(o =>
    o.numero?.toLowerCase().includes(search.toLowerCase()) ||
    o.cliente_nome?.toLowerCase().includes(search.toLowerCase())
  )

  if (!organizationId) return <OficinaLayout><NoOrg /></OficinaLayout>

  return (
    <OficinaLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orçamentos</h1>
          <p className="text-muted-foreground text-sm mt-1">{(orcamentos as any[]).length} orçamentos cadastrados</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Orçamento
        </button>
      </div>

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">Novo Orçamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="">Selecionar cliente *</option>
              {(clientes as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={veiculoId} onChange={e => setVeiculoId(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="">Selecionar veículo *</option>
              {(veiculos as any[]).filter((v: any) => !clienteId || v.cliente_id === clienteId).map((v: any) => <option key={v.id} value={v.id}>{v.marca} {v.modelo} - {v.placa}</option>)}
            </select>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição dos serviços" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={valor} onChange={e => setValor(e.target.value)} placeholder="Valor total (R$)" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => criar.mutate()} disabled={!clienteId || !veiculoId || criar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar orçamentos..." className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum orçamento cadastrado ainda.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Nº / Data</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Veículo</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((o: any) => (
                <tr key={o.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-foreground font-medium">{o.numero ?? o.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{o.data ? formatDate(o.data) : '-'}</p>
                  </td>
                  <td className="px-5 py-3 text-foreground">{o.cliente_nome ?? '-'}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{o.veiculo_desc ?? '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[o.status] ?? 'bg-muted text-muted-foreground'}`}>{o.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-foreground font-medium">{o.total ? formatCurrency(o.total) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </OficinaLayout>
  )
}
