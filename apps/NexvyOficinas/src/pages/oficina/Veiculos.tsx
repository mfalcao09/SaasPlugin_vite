import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Car, Plus, Search, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { OficinaLayout, NoOrg, useOrganizationId } from './_shared'

export default function Veiculos() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [placa, setPlaca] = useState('')
  const [ano, setAno] = useState('')
  const [cor, setCor] = useState('')

  const { data: veiculos = [], isLoading } = useQuery({
    queryKey: ['veiculos', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veiculos').select('*, clientes(nome)')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
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

  const criar = useMutation({
    mutationFn: async () => {
      const cliente = (clientes as any[]).find((c: any) => c.id === clienteId)
      const { error } = await supabase.from('veiculos').insert({
        organization_id: organizationId!, cliente_id: clienteId || null, cliente_nome: cliente?.nome ?? null,
        marca, modelo, placa, ano: ano ? Number(ano) : null, cor,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['veiculos', organizationId] })
      toast.success('Veículo cadastrado!')
      setShowForm(false); setClienteId(''); setMarca(''); setModelo(''); setPlaca(''); setAno(''); setCor('')
    },
    onError: () => toast.error('Erro ao cadastrar veículo.'),
  })

  const filtered = (veiculos as any[]).filter(v =>
    v.placa?.toLowerCase().includes(search.toLowerCase()) ||
    v.marca?.toLowerCase().includes(search.toLowerCase()) ||
    v.modelo?.toLowerCase().includes(search.toLowerCase())
  )

  if (!organizationId) return <OficinaLayout><NoOrg /></OficinaLayout>

  return (
    <OficinaLayout>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Veículos</h1>
          <p className="text-muted-foreground text-sm mt-1">{(veiculos as any[]).length} veículos cadastrados</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Veículo
        </button>
      </div>

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">Novo Veículo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} className="px-3 py-2 rounded-lg bg-background border border-input text-foreground text-sm focus:outline-none focus:border-primary">
              <option value="">Selecionar cliente *</option>
              {(clientes as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input value={marca} onChange={e => setMarca(e.target.value)} placeholder="Marca *" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Modelo *" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="Placa *" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={ano} onChange={e => setAno(e.target.value)} placeholder="Ano" type="number" min="1950" max="2030" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
            <input value={cor} onChange={e => setCor(e.target.value)} placeholder="Cor" className="px-3 py-2 rounded-lg bg-background border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => criar.mutate()} disabled={!clienteId || !marca || !modelo || !placa || criar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por placa, marca ou modelo..." className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-card border border-input text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Car className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{search ? 'Nenhum veículo encontrado.' : 'Nenhum veículo cadastrado ainda.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Placa</th>
                <th className="px-5 py-3 font-medium">Veículo</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Cliente</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Ano / Cor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((v: any) => (
                <tr key={v.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-primary font-mono font-semibold">{v.placa}</td>
                  <td className="px-5 py-3 text-foreground">{v.marca} {v.modelo}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{v.clientes?.nome ?? v.cliente_nome ?? '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">{v.ano ?? '—'}{v.cor ? ` · ${v.cor}` : ''}</td>
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
