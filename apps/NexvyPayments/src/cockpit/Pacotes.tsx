// Pacotes — catálogo de pacotes de sessões + venda presencial + baixa de sessão.
// Catálogo lê/escreve a VIEW transparente `pacotes` (products tipo=pacote).
// Vendidos lê/escreve `pacote_clientes`. Pagamento é no salão (sem Cakto).
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Package, Plus, Gift, Loader2, Pencil, Trash2, Check } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOrganizationId } from '@/pages/salao/_shared'

const brl = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const localDate = (addDays = 0) => {
  const d = new Date(); d.setDate(d.getDate() + addDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Pacote {
  id: string; nome: string; descricao: string | null; servicos_incluidos: string[] | null
  total_sessoes: number; valor: number | null; validade_dias: number; ativo: boolean | null
}
interface Venda {
  id: string; pacote_nome: string | null; cliente_nome: string | null
  total_sessoes: number; sessoes_usadas: number; valor_pago: number | null
  data_validade: string | null; status: string
}

const EMPTY = { nome: '', descricao: '', servicos: '', total_sessoes: '10', valor: '', validade_dias: '90', ativo: true }

export default function Pacotes() {
  const orgId = useOrganizationId()
  const qc = useQueryClient()

  // ─── Catálogo ───
  const [showCat, setShowCat] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)

  const { data: pacotes = [], isLoading: loadingCat } = useQuery({
    queryKey: ['pacotes-catalogo', orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('pacotes').select('*').eq('organization_id', orgId!).order('nome')
      if (error) throw error
      return (data ?? []) as Pacote[]
    },
  })

  const salvarPacote = useMutation({
    mutationFn: async () => {
      const payload = {
        organization_id: orgId!, nome: form.nome.trim(), descricao: form.descricao.trim() || null,
        servicos_incluidos: form.servicos.split(',').map((s) => s.trim()).filter(Boolean),
        total_sessoes: Number(form.total_sessoes) || 1, valor: form.valor ? Number(form.valor) : 0,
        validade_dias: Number(form.validade_dias) || 90, ativo: form.ativo,
      }
      if (editId) {
        const { error } = await supabase.from('pacotes').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('pacotes').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pacotes-catalogo', orgId] }); toast.success(editId ? 'Pacote atualizado!' : 'Pacote criado!'); setShowCat(false); setEditId(null); setForm(EMPTY) },
    onError: (e: any) => toast.error('Erro ao salvar: ' + e.message),
  })
  const excluirPacote = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('pacotes').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pacotes-catalogo', orgId] }); toast.success('Pacote excluído.') },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  })
  const editarPacote = (p: Pacote) => {
    setEditId(p.id)
    setForm({ nome: p.nome, descricao: p.descricao ?? '', servicos: (p.servicos_incluidos ?? []).join(', '),
      total_sessoes: String(p.total_sessoes), valor: p.valor != null ? String(p.valor) : '', validade_dias: String(p.validade_dias), ativo: p.ativo ?? true })
    setShowCat(true)
  }

  // ─── Vendidos ───
  const [showVenda, setShowVenda] = useState(false)
  const [vendaCliente, setVendaCliente] = useState('')
  const [vendaPacote, setVendaPacote] = useState('')
  const [vendaValor, setVendaValor] = useState('')

  const { data: vendas = [], isLoading: loadingVendas } = useQuery({
    queryKey: ['pacotes-vendidos', orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('pacote_clientes')
        .select('id, pacote_nome, cliente_nome, total_sessoes, sessoes_usadas, valor_pago, data_validade, status')
        .eq('organization_id', orgId!).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Venda[]
    },
  })
  const { data: clientes = [] } = useQuery({
    queryKey: ['pacotes-clientes-opt', orgId], enabled: !!orgId && showVenda,
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nome').eq('organization_id', orgId!).order('nome').limit(500)
      if (error) throw error
      return (data ?? []) as { id: string; nome: string }[]
    },
  })

  const venderPacote = useMutation({
    mutationFn: async () => {
      const p = pacotes.find((x) => x.id === vendaPacote)
      const c = clientes.find((x) => x.id === vendaCliente)
      if (!p || !c) throw new Error('Selecione cliente e pacote')
      const { error } = await supabase.from('pacote_clientes').insert({
        organization_id: orgId!, pacote_id: p.id, pacote_nome: p.nome, cliente_id: c.id, cliente_nome: c.nome,
        total_sessoes: p.total_sessoes, sessoes_usadas: 0,
        valor_pago: vendaValor ? Number(vendaValor) : (p.valor ?? 0),
        data_inicio: localDate(0), data_validade: localDate(p.validade_dias),
        status: 'ativo', pagamento_status: 'pago',
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pacotes-vendidos', orgId] }); toast.success('Pacote vendido! 💖'); setShowVenda(false); setVendaCliente(''); setVendaPacote(''); setVendaValor('') },
    onError: (e: any) => toast.error('Erro ao vender: ' + e.message),
  })
  const darBaixa = useMutation({
    mutationFn: async (v: Venda) => {
      const usadas = v.sessoes_usadas + 1
      const { error } = await supabase.from('pacote_clientes')
        .update({ sessoes_usadas: usadas, status: usadas >= v.total_sessoes ? 'concluido' : 'ativo' })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pacotes-vendidos', orgId] }); toast.success('Sessão registrada ✅') },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  })

  const openVenda = () => { setVendaPacote(''); setVendaCliente(''); setVendaValor(''); setShowVenda(true) }
  const vendaPac = useMemo(() => pacotes.find((p) => p.id === vendaPacote), [pacotes, vendaPacote])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pacotes</h1>
        <p className="text-sm text-muted-foreground">Pacotes de sessões pré-pagos — venda no balcão e dê baixa a cada atendimento.</p>
      </div>

      <Tabs defaultValue="catalogo" className="space-y-4">
        <TabsList>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="vendidos">Vendidos</TabsTrigger>
        </TabsList>

        {/* ── Catálogo ── */}
        <TabsContent value="catalogo" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditId(null); setForm(EMPTY); setShowCat(true) }}><Plus className="mr-2 h-4 w-4" />Novo pacote</Button>
          </div>
          <Card>
            {loadingCat ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : pacotes.length === 0 ? (
              <div className="py-16 text-center"><Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">Nenhum pacote cadastrado.</p></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Pacote</TableHead><TableHead>Sessões</TableHead><TableHead>Validade</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pacotes.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}{p.servicos_incluidos?.length ? <span className="block text-xs font-normal text-muted-foreground">{p.servicos_incluidos.join(', ')}</span> : null}</TableCell>
                      <TableCell>{p.total_sessoes}</TableCell>
                      <TableCell className="text-muted-foreground">{p.validade_dias} dias</TableCell>
                      <TableCell className="font-semibold">{brl(p.valor)}</TableCell>
                      <TableCell><Badge variant="outline" className={p.ativo ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'border-muted-foreground/30 text-muted-foreground'}>{p.ativo ? 'ativo' : 'inativo'}</Badge></TableCell>
                      <TableCell><div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => editarPacote(p)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="hover:text-destructive" onClick={() => window.confirm(`Excluir "${p.nome}"?`) && excluirPacote.mutate(p.id)} title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                      </div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ── Vendidos ── */}
        <TabsContent value="vendidos" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openVenda} disabled={pacotes.length === 0}><Gift className="mr-2 h-4 w-4" />Vender pacote</Button>
          </div>
          <Card>
            {loadingVendas ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : vendas.length === 0 ? (
              <div className="py-16 text-center"><Gift className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" /><p className="text-sm text-muted-foreground">Nenhum pacote vendido ainda.</p></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Pacote</TableHead><TableHead>Sessões</TableHead><TableHead>Validade</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
                <TableBody>
                  {vendas.map((v) => {
                    const done = v.sessoes_usadas >= v.total_sessoes
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.cliente_nome ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{v.pacote_nome ?? '—'}</TableCell>
                        <TableCell><span className={done ? 'text-muted-foreground' : 'font-semibold'}>{v.sessoes_usadas}/{v.total_sessoes}</span></TableCell>
                        <TableCell className="text-muted-foreground">{v.data_validade ?? '—'}</TableCell>
                        <TableCell><Badge variant="outline" className={done ? 'border-muted-foreground/30 text-muted-foreground' : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'}>{done ? 'concluído' : v.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" disabled={done || darBaixa.isPending} onClick={() => darBaixa.mutate(v)} className="gap-1.5"><Check className="h-3.5 w-3.5" />Dar baixa</Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog catálogo */}
      <Dialog open={showCat} onOpenChange={(o) => { if (!o) { setShowCat(false); setEditId(null); setForm(EMPTY) } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Editar pacote' : 'Novo pacote'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Pacote Facial Premium" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Serviços incluídos (separados por vírgula)</Label><Input value={form.servicos} onChange={(e) => setForm((f) => ({ ...f, servicos: e.target.value }))} placeholder="Limpeza, Hidratação" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Sessões</Label><Input type="number" min="1" value={form.total_sessoes} onChange={(e) => setForm((f) => ({ ...f, total_sessoes: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Valor (R$)</Label><Input type="number" min="0" step="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Validade (dias)</Label><Input type="number" min="1" value={form.validade_dias} onChange={(e) => setForm((f) => ({ ...f, validade_dias: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} /><Label className="cursor-pointer">Pacote ativo</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCat(false); setEditId(null); setForm(EMPTY) }}>Cancelar</Button>
            <Button onClick={() => salvarPacote.mutate()} disabled={!form.nome.trim() || salvarPacote.isPending}>{salvarPacote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog vender */}
      <Dialog open={showVenda} onOpenChange={setShowVenda}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vender pacote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Cliente</Label>
              <Select value={vendaCliente} onValueChange={setVendaCliente}>
                <SelectTrigger><SelectValue placeholder="Selecione a cliente" /></SelectTrigger>
                <SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Pacote</Label>
              <Select value={vendaPacote} onValueChange={(v) => { setVendaPacote(v); const p = pacotes.find((x) => x.id === v); setVendaValor(p?.valor != null ? String(p.valor) : '') }}>
                <SelectTrigger><SelectValue placeholder="Selecione o pacote" /></SelectTrigger>
                <SelectContent>{pacotes.filter((p) => p.ativo).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome} · {p.total_sessoes} sessões</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Valor pago (R$)</Label><Input type="number" min="0" step="0.01" value={vendaValor} onChange={(e) => setVendaValor(e.target.value)} /></div>
            {vendaPac && <p className="text-xs text-muted-foreground">{vendaPac.total_sessoes} sessões · validade {vendaPac.validade_dias} dias (até {localDate(vendaPac.validade_dias)}). Pagamento registrado como pago presencialmente.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVenda(false)}>Cancelar</Button>
            <Button onClick={() => venderPacote.mutate()} disabled={!vendaCliente || !vendaPacote || venderPacote.isPending} className="gap-1.5">{venderPacote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}Vender</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
