import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Search, Loader2, Pencil, Trash2 } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SalaoLayout, NoOrg, useOrganizationId } from './_shared'

// Re-skin premium (dark via tokens, shadcn) + data-injectable: sem `demo`
// busca Supabase real; com `demo` usa seed (rota /demo, sem auth, sem gravar).
// Camada de dados preservada: tabela `clientes` por organization_id.

export interface Cliente {
  id: string
  organization_id?: string
  nome: string
  telefone: string | null
  email: string | null
  cpf_cnpj: string | null
  status: string | null
  tags: string[] | null
  observacoes: string | null
}

interface FormState {
  nome: string; telefone: string; email: string; cpf_cnpj: string; status: string; tags: string; observacoes: string
}

const EMPTY_FORM: FormState = { nome: '', telefone: '', email: '', cpf_cnpj: '', status: 'ativo', tags: '', observacoes: '' }

export default function Clientes({ demo }: { demo?: Cliente[] } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['salao-clientes', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes').select('*')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Cliente[]
    },
  })

  const clientes = demo ?? fetched
  const setField = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false) }
  const openNew = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true) }
  const openEdit = (c: Cliente) => {
    setForm({
      nome: c.nome ?? '', telefone: c.telefone ?? '', email: c.email ?? '', cpf_cnpj: c.cpf_cnpj ?? '',
      status: c.status ?? 'ativo', tags: (c.tags ?? []).join(', '), observacoes: c.observacoes ?? '',
    })
    setEditingId(c.id); setShowForm(true)
  }

  const buildPayload = () => ({
    nome: form.nome.trim(),
    telefone: form.telefone.trim() || null,
    email: form.email.trim() || null,
    cpf_cnpj: form.cpf_cnpj.trim() || null,
    status: form.status || 'ativo',
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    observacoes: form.observacoes.trim() || null,
  })

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = buildPayload()
      if (editingId) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', editingId).eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clientes').insert({ ...payload, organization_id: organizationId! })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salao-clientes', organizationId] })
      toast.success(editingId ? 'Cliente atualizado!' : 'Cliente cadastrado!')
      resetForm()
    },
    onError: () => toast.error('Erro ao salvar cliente.'),
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id).eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salao-clientes', organizationId] })
      toast.success('Cliente excluído.')
    },
    onError: () => toast.error('Erro ao excluir cliente.'),
  })

  const onSave = () => isDemo ? toast.info('Ação indisponível no modo demonstração') : salvar.mutate()
  const handleDelete = (c: Cliente) => {
    if (isDemo) return toast.info('Ação indisponível no modo demonstração')
    if (window.confirm(`Excluir o cliente "${c.nome}"? Esta ação não pode ser desfeita.`)) excluir.mutate(c.id)
  }

  const filtered = clientes.filter((c) =>
    c.nome?.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf_cnpj?.includes(search),
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
            <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
            <p className="text-muted-foreground">{clientes.length} {clientes.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}</p>
          </div>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, email ou CPF/CNPJ..." className="pl-9" />
        </div>

        <Card>
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden lg:table-cell">CPF/CNPJ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{c.telefone ?? '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{c.email ?? '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{c.cpf_cnpj ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={c.status === 'inativo'
                        ? 'border-muted-foreground/30 text-muted-foreground'
                        : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'}>
                        {c.status ?? 'ativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(c)} title="Excluir" className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Form modal */}
      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : resetForm())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar cliente' : 'Novo cliente'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setField('nome', e.target.value)} placeholder="Nome completo" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setField('telefone', e.target.value)} placeholder="(00) 00000-0000" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="email@exemplo.com" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>CPF / CNPJ</Label><Input value={form.cpf_cnpj} onChange={(e) => setField('cpf_cnpj', e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Tags</Label><Input value={form.tags} onChange={(e) => setField('tags', e.target.value)} placeholder="separadas por vírgula" /></div>
            <div className="space-y-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setField('observacoes', e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={onSave} disabled={!form.nome.trim() || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalaoLayout>
  )
}
