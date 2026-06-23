import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Plus, Search, Loader2, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SalaoLayout, NoOrg, formatCurrency, useOrganizationId } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'

// Re-skin premium data-injectable. Camada de dados preservada: tabela
// `servico_catalogo` por organization_id (CRUD completo).

export interface Servico {
  id: string
  organization_id?: string
  nome: string
  preco_base: number | null
  ativo: boolean | null
  duracao_minutos: number | null
  categoria: string | null
  descricao: string | null
}

interface ServicoForm {
  nome: string; categoria: string; descricao: string; duracao_minutos: string; preco_base: string; ativo: boolean
}

const EMPTY_FORM: ServicoForm = { nome: '', categoria: '', descricao: '', duracao_minutos: '30', preco_base: '', ativo: true }

export default function Servicos({ demo }: { demo?: Servico[] } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ServicoForm>(EMPTY_FORM)

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['servicos', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servico_catalogo').select('*')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Servico[]
    },
  })

  const servicos = demo ?? fetched
  const resetForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM) }

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        organization_id: organizationId!,
        nome: form.nome.trim(),
        categoria: form.categoria.trim() || null,
        descricao: form.descricao.trim() || null,
        duracao_minutos: form.duracao_minutos ? Number(form.duracao_minutos) : 30,
        preco_base: form.preco_base ? Number(form.preco_base) : 0,
        ativo: form.ativo,
      }
      if (editingId) {
        const { error } = await supabase.from('servico_catalogo').update(payload).eq('id', editingId).eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await supabase.from('servico_catalogo').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicos', organizationId] })
      toast.success(editingId ? 'Serviço atualizado!' : 'Serviço cadastrado!')
      resetForm()
    },
    onError: () => toast.error('Erro ao salvar serviço.'),
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('servico_catalogo').delete().eq('id', id).eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicos', organizationId] })
      toast.success('Serviço excluído!')
    },
    onError: () => toast.error('Erro ao excluir serviço.'),
  })

  const abrirNovo = () => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true) }
  const abrirEdicao = (s: Servico) => {
    setEditingId(s.id)
    setForm({
      nome: s.nome ?? '', categoria: s.categoria ?? '', descricao: s.descricao ?? '',
      duracao_minutos: s.duracao_minutos != null ? String(s.duracao_minutos) : '30',
      preco_base: s.preco_base != null ? String(s.preco_base) : '', ativo: s.ativo ?? true,
    })
    setShowForm(true)
  }
  const onSave = () => isDemo ? toast.info('Ação indisponível no modo demonstração') : salvar.mutate()
  const onDelete = (s: Servico) => {
    if (isDemo) return toast.info('Ação indisponível no modo demonstração')
    if (window.confirm(`Excluir o serviço "${s.nome}"?`)) excluir.mutate(s.id)
  }

  const filtered = servicos.filter((s) =>
    s.nome?.toLowerCase().includes(search.toLowerCase()) || s.categoria?.toLowerCase().includes(search.toLowerCase()),
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

        <PageHeader
          title="Serviços"
          description={`${servicos.length} ${servicos.length === 1 ? 'serviço cadastrado' : 'serviços cadastrados'}`}
          action={<Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" />Novo serviço</Button>}
        />

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou categoria..." className="pl-9" />
        </div>

        <Card>
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{search ? 'Nenhum serviço encontrado.' : 'Nenhum serviço cadastrado ainda.'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                  <TableHead className="hidden md:table-cell">Duração</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.nome}
                      {s.descricao ? <span className="block text-xs font-normal text-muted-foreground">{s.descricao}</span> : null}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{s.categoria ?? '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{s.duracao_minutos != null ? `${s.duracao_minutos} min` : '—'}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(s.preco_base)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.ativo
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                        : 'border-muted-foreground/30 text-muted-foreground'}>
                        {s.ativo ? 'ativo' : 'inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => abrirEdicao(s)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => onDelete(s)} title="Excluir" className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : resetForm())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar serviço' : 'Novo serviço'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Corte feminino" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Categoria</Label><Input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Duração (min)</Label><Input type="number" min="0" step="5" value={form.duracao_minutos} onChange={(e) => setForm((f) => ({ ...f, duracao_minutos: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Preço (R$)</Label><Input type="number" min="0" step="0.01" value={form.preco_base} onChange={(e) => setForm((f) => ({ ...f, preco_base: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
              <Label className="cursor-pointer">Serviço ativo</Label>
            </div>
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
