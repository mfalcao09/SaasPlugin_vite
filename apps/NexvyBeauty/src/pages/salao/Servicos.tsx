import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Plus, Search, Loader2, Pencil, Trash2, Gift } from 'lucide-react'
import { CrossSellDialog } from '@/components/salao/CrossSellDialog'
import { ImageUpload } from '@/components/ui/image-upload'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MaybeSalaoShell, NoOrg, formatCurrency, useOrganizationId } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'

// Reads em `servico_catalogo` (view); writes em `products` tipo=servico.

export interface Servico {
  id: string
  organization_id?: string
  nome: string
  preco_base: number | null
  ativo: boolean | null
  duracao_minutos: number | null
  categoria: string | null
  descricao: string | null
  /** 'principal' aparece no catálogo público; 'extra' só como adicional no cross-sell. */
  tipo?: 'principal' | 'extra' | null
  /** Quando preenchido (e menor que preco_base), é o valor cobrado. */
  preco_promocional?: number | null
  imagem_url?: string | null
  /** Combo: serviços que ele inclui (vitrine; não expande na agenda). */
  combo_servico_ids?: string[] | null
}

interface ServicoForm {
  nome: string; categoria: string; descricao: string; duracao_minutos: string; preco_base: string
  ativo: boolean; tipo: 'principal' | 'extra'
  preco_promocional: string
  imagem_url: string
  /** Combo: serviços que ele inclui. Vitrine — não expande na agenda. */
  combo_servico_ids: string[]
}

const EMPTY_FORM: ServicoForm = {
  nome: '', categoria: '', descricao: '', duracao_minutos: '30', preco_base: '', ativo: true, tipo: 'principal',
  preco_promocional: '', imagem_url: '', combo_servico_ids: [],
}

// Nichos multi-uso (cabeleireira/manicure/lash/podóloga/...). Categoria = nicho do serviço.
const NICHOS = ['Cabelo', 'Unhas', 'Cílios', 'Sobrancelha', 'Maquiagem', 'Podologia', 'Estética', 'Depilação', 'Massagem', 'Outros']

export default function Servicos({ demo, bare }: { demo?: Servico[]; bare?: boolean } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ServicoForm>(EMPTY_FORM)
  const [crossSellDe, setCrossSellDe] = useState<{ id: string; nome: string } | null>(null)

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
        name: form.nome.trim(),
        tipo: 'servico' as const,
        status: (form.ativo ? 'published' : 'draft') as 'published' | 'draft',
        category: form.categoria.trim() || null,
        description: form.descricao.trim() || null,
        product_image_url: form.imagem_url || null,
        settings: {
          preco_base: form.preco_base ? Number(form.preco_base) : 0,
          duracao_minutos: form.duracao_minutos ? Number(form.duracao_minutos) : 30,
          tipo_servico: form.tipo,
          // a view ignora promoção >= preço cheio, mas não adianta nem gravar
          preco_promocional: form.preco_promocional ? Number(form.preco_promocional) : null,
          combo_servico_ids: form.combo_servico_ids.length ? form.combo_servico_ids : null,
        },
      }
      if (editingId) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingId).eq('organization_id', organizationId!).eq('tipo', 'servico')
        if (error) throw error
      } else {
        const { error } = await supabase.from('products').insert(payload)
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
      const { error } = await supabase.from('products').delete().eq('id', id).eq('organization_id', organizationId!).eq('tipo', 'servico')
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
      tipo: s.tipo === 'extra' ? 'extra' : 'principal',
      preco_promocional: s.preco_promocional != null ? String(s.preco_promocional) : '',
      imagem_url: s.imagem_url ?? '',
      combo_servico_ids: Array.isArray(s.combo_servico_ids) ? s.combo_servico_ids : [],
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

  if (!isDemo && !organizationId) return <MaybeSalaoShell bare={bare}><NoOrg /></MaybeSalaoShell>

  return (
    <MaybeSalaoShell bare={bare}>
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
                      <span className="flex items-center gap-2">
                        {s.imagem_url && (
                          <img src={s.imagem_url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                        )}
                        {s.nome}
                        {s.tipo === 'extra' && (
                          <Badge variant="secondary" className="text-[10px] font-normal">extra</Badge>
                        )}
                        {s.preco_promocional != null && (
                          <Badge variant="secondary" className="text-[10px] font-normal text-primary">promo</Badge>
                        )}
                      </span>
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
                        <Button
                          size="icon" variant="ghost" title="Sugestões no agendamento online"
                          onClick={() => isDemo
                            ? toast.info('Ação indisponível no modo demonstração')
                            : setCrossSellDe({ id: s.id, nome: s.nome })}
                        >
                          <Gift className="h-4 w-4" />
                        </Button>
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
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Alongamento de cílios" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Nicho</Label>
                <Select value={form.categoria || undefined} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {NICHOS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Duração (min)</Label><Input type="number" min="0" step="5" value={form.duracao_minutos} onChange={(e) => setForm((f) => ({ ...f, duracao_minutos: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Preço (R$)</Label><Input type="number" min="0" step="0.01" value={form.preco_base} onChange={(e) => setForm((f) => ({ ...f, preco_base: e.target.value }))} /></div>
            </div>

            <div className="space-y-2">
              <Label>Preço promocional (R$) <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input
                type="number" min="0" step="0.01" placeholder="deixe vazio para não ter promoção"
                value={form.preco_promocional}
                onChange={(e) => setForm((f) => ({ ...f, preco_promocional: e.target.value }))}
              />
              {form.preco_promocional && Number(form.preco_promocional) >= Number(form.preco_base || 0) && (
                <p className="text-xs text-amber-600">
                  A promoção precisa ser menor que o preço cheio, senão será ignorada.
                </p>
              )}
              {form.preco_promocional && Number(form.preco_promocional) > 0
                && Number(form.preco_promocional) < Number(form.preco_base || 0) && (
                <p className="text-xs text-muted-foreground">
                  No agendamento aparece {formatCurrency(Number(form.preco_base))} riscado e{' '}
                  {formatCurrency(Number(form.preco_promocional))} como valor cobrado.
                </p>
              )}
            </div>

            <ImageUpload
              label="Foto do serviço (opcional)"
              description="Aparece no card do agendamento online. Quadrada fica melhor."
              bucket="catalog-media"
              folder={`${organizationId ?? 'sem-org'}/servicos`}
              aspectRatio="square"
              value={form.imagem_url}
              onChange={(url) => setForm((f) => ({ ...f, imagem_url: url }))}
              onRemove={() => setForm((f) => ({ ...f, imagem_url: '' }))}
              disabled={isDemo}
            />

            {/* Combo: vitrine. O serviço continua sendo UM bloco na agenda. */}
            <div className="space-y-2">
              <Label>Este serviço é um combo? <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {servicos.filter((o) => o.id !== editingId).map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={form.combo_servico_ids.includes(o.id)}
                      onChange={() => setForm((f) => ({
                        ...f,
                        combo_servico_ids: f.combo_servico_ids.includes(o.id)
                          ? f.combo_servico_ids.filter((x) => x !== o.id)
                          : [...f.combo_servico_ids, o.id],
                      }))}
                    />
                    <span className="truncate">{o.nome}</span>
                  </label>
                ))}
                {servicos.filter((o) => o.id !== editingId).length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">Cadastre outros serviços primeiro.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Marcados aparecem como “inclui X + Y”. Duração e preço continuam sendo os deste serviço.
              </p>
            </div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} /></div>

            {/* Define onde o serviço aparece na página pública de agendamento. */}
            <div className="space-y-2">
              <Label>Onde aparece no agendamento online</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: 'principal', t: 'Principal', d: 'Aparece na lista de serviços' },
                  { v: 'extra', t: 'Extra', d: 'Só como adicional sugerido' },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tipo: o.v }))}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      form.tipo === o.v ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-accent'
                    }`}
                  >
                    <div className="text-sm font-medium">{o.t}</div>
                    <div className="text-xs text-muted-foreground">{o.d}</div>
                  </button>
                ))}
              </div>
            </div>

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

      {organizationId && (
        <CrossSellDialog
          organizationId={organizationId}
          servico={crossSellDe}
          servicos={servicos}
          onClose={() => setCrossSellDe(null)}
        />
      )}
    </MaybeSalaoShell>
  )
}
