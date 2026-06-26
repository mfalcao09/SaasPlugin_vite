// Produtos (revenda) — itens físicos que a cliente compra e leva (shampoo, esmalte…).
// Grava em products (tipo=produto); preço/estoque/sku no settings jsonb. Net-new.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingBag, Plus, Loader2, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOrganizationId } from '@/pages/salao/_shared'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Produto { id: string; name: string; category: string | null; settings: any; status: string }
const EMPTY = { nome: '', categoria: '', preco: '', estoque: '', sku: '' }

export default function ProdutosRevenda() {
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const [show, setShow] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ['produtos-revenda', orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, category, settings, status')
        .eq('organization_id', orgId!).eq('tipo', 'produto').order('name')
      if (error) throw error
      return (data ?? []) as Produto[]
    },
  })

  const salvar = useMutation({
    mutationFn: async () => {
      const payload: any = {
        organization_id: orgId!, name: form.nome.trim(), category: form.categoria.trim() || null,
        tipo: 'produto', status: 'published',
        settings: { preco: form.preco ? Number(form.preco) : 0, estoque: form.estoque ? Number(form.estoque) : 0, sku: form.sku.trim() || null },
      }
      if (editId) {
        const { error } = await supabase.from('products').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produtos-revenda', orgId] }); toast.success(editId ? 'Produto atualizado!' : 'Produto cadastrado!'); setShow(false); setEditId(null); setForm(EMPTY) },
    onError: (e: any) => toast.error('Erro ao salvar: ' + e.message),
  })
  const excluir = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('products').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produtos-revenda', orgId] }); toast.success('Produto excluído.') },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  })
  const editar = (p: Produto) => {
    setEditId(p.id)
    setForm({ nome: p.name, categoria: p.category ?? '', preco: p.settings?.preco != null ? String(p.settings.preco) : '', estoque: p.settings?.estoque != null ? String(p.settings.estoque) : '', sku: p.settings?.sku ?? '' })
    setShow(true)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Produtos</h1>
          <p className="text-sm text-muted-foreground">Itens de revenda que a cliente compra e leva — controle estoque e preço.</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(EMPTY); setShow(true) }}><Plus className="mr-2 h-4 w-4" />Novo produto</Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : produtos.length === 0 ? (
          <div className="py-16 text-center"><ShoppingBag className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">Nenhum produto de revenda cadastrado.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead>Preço</TableHead><TableHead>Estoque</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {produtos.map((p) => {
                const estoque = Number(p.settings?.estoque ?? 0)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}{p.settings?.sku ? <span className="block text-xs font-normal text-muted-foreground">SKU {p.settings.sku}</span> : null}</TableCell>
                    <TableCell className="text-muted-foreground">{p.category ?? '—'}</TableCell>
                    <TableCell className="font-semibold">{brl(Number(p.settings?.preco ?? 0))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={estoque <= 0 ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300' : estoque <= 3 ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'border-muted-foreground/30 text-muted-foreground'}>
                        {estoque <= 0 ? <><AlertTriangle className="h-3 w-3 mr-1" />esgotado</> : `${estoque} un`}
                      </Badge>
                    </TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => editar(p)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="hover:text-destructive" onClick={() => window.confirm(`Excluir "${p.name}"?`) && excluir.mutate(p.id)} title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                    </div></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={show} onOpenChange={(o) => { if (!o) { setShow(false); setEditId(null); setForm(EMPTY) } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Editar produto' : 'Novo produto'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Shampoo hidratante 300ml" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Categoria</Label><Input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} placeholder="Cabelo" /></div>
              <div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Preço (R$)</Label><Input type="number" min="0" step="0.01" value={form.preco} onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Estoque (un)</Label><Input type="number" min="0" value={form.estoque} onChange={(e) => setForm((f) => ({ ...f, estoque: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShow(false); setEditId(null); setForm(EMPTY) }}>Cancelar</Button>
            <Button onClick={() => salvar.mutate()} disabled={!form.nome.trim() || salvar.isPending}>{salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
