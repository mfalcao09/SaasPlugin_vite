import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Plus, Search, Loader2, Clock } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SalaoLayout, NoOrg, useOrganizationId, formatCurrency, formatDate } from './_shared'
import { convertLeadToCliente } from '@/hooks/useLeadToCliente'

// Re-skin premium data-injectable. Camada de dados preservada: tabela
// `agendamentos` + opções (clientes/profissionais/servico_catalogo/leads) por
// organization_id, conversão lead→cliente, pré-seleção via ?cliente=.

export interface Agendamento {
  id: string
  organization_id?: string
  cliente_id?: string | null
  cliente_nome: string | null
  profissional_id?: string | null
  profissional_nome: string | null
  servico_id?: string | null
  servico_nome: string | null
  data: string
  hora: string
  duracao_minutos?: number | null
  valor: number | null
  forma_pagamento?: string | null
  status: string | null
  observacoes?: string | null
}

interface ClienteOption { id: string; nome: string }
interface ProfissionalOption { id: string; nome: string }
interface ServicoOption { id: string; nome: string; valor: number | null }

const STATUS_LABEL: Record<string, string> = { agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado' }
const STATUS_BADGE: Record<string, string> = {
  agendado: 'border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-300',
  concluido: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  cancelado: 'border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-300',
}

function formatHora(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 5)
}

// Client destipado (mesmo motivo do original: TS2589 no union de tabelas).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export default function Agenda({ demo }: { demo?: Agendamento[] } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const [searchParams] = useSearchParams()
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

  const enabled = !isDemo && !!organizationId

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['agendamentos', organizationId],
    enabled,
    queryFn: async () => {
      const { data: rows, error } = await db.from('agendamentos').select('*')
        .eq('organization_id', organizationId!)
        .order('data', { ascending: true }).order('hora', { ascending: true })
      if (error) throw error
      return (rows ?? []) as Agendamento[]
    },
  })

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-opt', organizationId], enabled,
    queryFn: async () => {
      const { data: rows, error } = await db.from('clientes').select('id, nome').eq('organization_id', organizationId!)
      if (error) throw error
      return (rows ?? []) as ClienteOption[]
    },
  })

  const { data: profissionais = [] } = useQuery({
    queryKey: ['profissionais-opt', organizationId], enabled,
    queryFn: async () => {
      const { data: rows, error } = await db.from('profissionais').select('id, nome').eq('organization_id', organizationId!)
      if (error) throw error
      return (rows ?? []) as ProfissionalOption[]
    },
  })

  const { data: servicos = [] } = useQuery({
    queryKey: ['servico_catalogo-opt', organizationId], enabled,
    queryFn: async () => {
      const { data: rows, error } = await db.from('servico_catalogo').select('id, nome, valor:preco_base').eq('organization_id', organizationId!)
      if (error) throw error
      return (rows ?? []) as ServicoOption[]
    },
  })

  const { data: leads = [] } = useQuery({
    queryKey: ['agenda-leads', organizationId], enabled,
    queryFn: async () => {
      const { data: rows, error } = await db.from('leads').select('id, name, phone')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false }).limit(200)
      if (error) return []
      return (rows ?? []) as { id: string; name: string; phone: string | null }[]
    },
  })

  const agendamentos = demo ?? fetched

  // Pré-seleção vinda do botão "Agendar" no lead (/salao/agenda?cliente=<id>).
  useEffect(() => {
    const cid = searchParams.get('cliente')
    if (cid) { setClienteId('cli:' + cid); setShowForm(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function resetForm() {
    setShowForm(false); setEditId(null)
    setClienteId(''); setProfissionalId(''); setServicoId('')
    setData(''); setHora(''); setValor(''); setFormaPagamento('')
    setStatus('agendado'); setObservacoes('')
  }

  function openEdit(a: Agendamento) {
    setEditId(a.id)
    setClienteId(a.cliente_id ? 'cli:' + a.cliente_id : '')
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
    const s = servicos.find((sv) => sv.id === id)
    if (s && s.valor != null && valor === '') setValor(String(s.valor))
  }

  const salvar = useMutation({
    mutationFn: async () => {
      let resolvedClienteId: string | null = null
      let resolvedClienteNome: string | null = null
      if (clienteId.startsWith('lead:')) {
        const leadId = clienteId.slice(5)
        const lead = leads.find((l) => l.id === leadId)
        const res = await convertLeadToCliente({ leadId, nome: lead?.name ?? 'Cliente', telefone: lead?.phone ?? null, organizationId: organizationId! })
        resolvedClienteId = res.clienteId
        resolvedClienteNome = lead?.name ?? null
      } else if (clienteId.startsWith('cli:')) {
        resolvedClienteId = clienteId.slice(4)
        resolvedClienteNome = clientes.find((c) => c.id === resolvedClienteId)?.nome ?? null
      }
      const profissional = profissionais.find((p) => p.id === profissionalId)
      const servico = servicos.find((s) => s.id === servicoId)
      const payload = {
        organization_id: organizationId!,
        cliente_id: resolvedClienteId, cliente_nome: resolvedClienteNome,
        profissional_id: profissionalId || null, profissional_nome: profissional?.nome ?? null,
        servico_id: servicoId || null, servico_nome: servico?.nome ?? null,
        data, hora, valor: valor ? Number(valor) : 0,
        forma_pagamento: formaPagamento || null, status: status || 'agendado', observacoes: observacoes || null,
      }
      if (editId) {
        const { error } = await db.from('agendamentos').update(payload).eq('id', editId).eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await db.from('agendamentos').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agendamentos', organizationId] })
      qc.invalidateQueries({ queryKey: ['clientes-opt', organizationId] })
      qc.invalidateQueries({ queryKey: ['agenda-leads', organizationId] })
      toast.success(editId ? 'Agendamento atualizado!' : 'Agendamento criado!')
      resetForm()
    },
    onError: () => toast.error('Erro ao salvar agendamento.'),
  })

  const onSave = () => isDemo ? toast.info('Ação indisponível no modo demonstração') : salvar.mutate()

  const filtered = agendamentos.filter((a) =>
    a.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
    a.profissional_nome?.toLowerCase().includes(search.toLowerCase()) ||
    a.servico_nome?.toLowerCase().includes(search.toLowerCase()),
  )

  if (!isDemo && !organizationId) return <SalaoLayout><NoOrg /></SalaoLayout>

  return (
    <SalaoLayout>
      <div className="p-6 space-y-6">
        {isDemo && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            Modo demonstração — dados fictícios, nada é salvo.
          </div>
        )}

        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
            <p className="text-muted-foreground">{agendamentos.length} {agendamentos.length === 1 ? 'agendamento' : 'agendamentos'}</p>
          </div>
          <Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />Novo agendamento</Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, profissional ou serviço..." className="pl-9" />
        </div>

        <Card>
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{search ? 'Nenhum agendamento encontrado.' : 'Nenhum agendamento cadastrado ainda.'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">Profissional</TableHead>
                  <TableHead className="hidden md:table-cell">Serviço</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id} onClick={() => openEdit(a)} className="cursor-pointer">
                    <TableCell>
                      <p className="font-medium">{formatDate(a.data)}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{formatHora(a.hora)}</p>
                    </TableCell>
                    <TableCell className="font-medium">{a.cliente_nome ?? '-'}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{a.profissional_nome ?? '-'}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{a.servico_nome ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[a.status ?? ''] ?? ''}>
                        {STATUS_LABEL[a.status ?? ''] ?? a.status ?? '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-right font-medium lg:table-cell">{formatCurrency(a.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : resetForm())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cliente / Lead *</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {clientes.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Clientes</SelectLabel>
                        {clientes.map((c) => <SelectItem key={c.id} value={`cli:${c.id}`}>{c.nome}</SelectItem>)}
                      </SelectGroup>
                    )}
                    {leads.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Leads (viram cliente ao agendar)</SelectLabel>
                        {leads.map((l) => <SelectItem key={l.id} value={`lead:${l.id}`}>{l.name}{l.phone ? ` · ${l.phone}` : ''}</SelectItem>)}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Profissional *</Label>
                <Select value={profissionalId} onValueChange={setProfissionalId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {profissionais.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Serviço *</Label>
                <Select value={servicoId} onValueChange={onSelectServico}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {servicos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendado">Agendado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Data *</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
              <div className="space-y-2"><Label>Hora *</Label><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
              <div className="space-y-2"><Label>Valor (R$)</Label><Input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
              <div className="space-y-2"><Label>Forma de pagamento</Label><Input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="PIX, cartão..." /></div>
            </div>
            <div className="space-y-2"><Label>Observações</Label><Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={onSave} disabled={!clienteId || !profissionalId || !servicoId || !data || !hora || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editId ? 'Salvar alterações' : 'Criar agendamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalaoLayout>
  )
}
