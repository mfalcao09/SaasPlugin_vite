import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Search, Loader2, Pencil, Trash2, Flame, Merge, Eye } from 'lucide-react'
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { scoreTier } from '@/components/lead/LeadScoreBadge'
import { normalizeBrPhone } from '@/cockpit/types'
import { MaybeSalaoShell, NoOrg, useOrganizationId } from './_shared'
import { PageHeader } from '@/components/layout/PageHeader'
import ClienteDetail from './ClienteDetail'

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
  /** vínculo opcional com um lead do CRM (origem do score/temperatura) */
  lead_id?: string | null
  created_at?: string | null
}

interface FormState {
  nome: string; telefone: string; email: string; cpf_cnpj: string; status: string; tags: string; observacoes: string
}

const EMPTY_FORM: FormState = { nome: '', telefone: '', email: '', cpf_cnpj: '', status: 'ativo', tags: '', observacoes: '' }

type SortMode = 'default' | 'hottest'

// ─── Tier do lead vinculado (Quente/Morno/Frio) ─────────────────────────
// Reusa o helper canônico do LeadScoreBadge (mesmos cortes 70/40 + cores).
function TierBadge({ score }: { score: number }) {
  const t = scoreTier(score)
  return (
    <Badge variant="outline" className={`gap-1 border-transparent ${t.bg} ${t.text}`} title={`Lead score ${Math.round(score)} · ${t.label}`}>
      <Flame className="h-3 w-3" />
      {t.label}
    </Badge>
  )
}

// ─── Detecção de duplicatas (client-side, por telefone normalizado) ──────
interface DupGroup {
  phone: string
  keep: Cliente
  dups: Cliente[]
}

/** Conta quantos campos relevantes do cadastro estão preenchidos (tie de qualidade). */
function filledScore(c: Cliente): number {
  let n = 0
  if (c.nome?.trim()) n++
  if (c.telefone?.trim()) n++
  if (c.email?.trim()) n++
  if (c.cpf_cnpj?.trim()) n++
  if (c.observacoes?.trim()) n++
  if (c.tags && c.tags.length) n++
  if (c.lead_id) n++
  return n
}

/**
 * Agrupa por telefone normalizado; grupos com ≥2 viram duplicatas.
 * keep = mais dados preenchidos; empate → created_at mais antigo.
 */
function detectDuplicates(clientes: Cliente[]): DupGroup[] {
  const byPhone = new Map<string, Cliente[]>()
  for (const c of clientes) {
    const phone = normalizeBrPhone(c.telefone)
    if (!phone) continue // ignora vazios/null
    const arr = byPhone.get(phone) ?? []
    arr.push(c)
    byPhone.set(phone, arr)
  }
  const groups: DupGroup[] = []
  for (const [phone, arr] of byPhone) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => {
      const fd = filledScore(b) - filledScore(a)
      if (fd !== 0) return fd
      // tie-break: created_at mais antigo primeiro (vira o keep)
      const ta = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY
      const tb = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY
      return ta - tb
    })
    const [keep, ...dups] = sorted
    groups.push({ phone, keep, dups })
  }
  return groups
}

export default function Clientes({ demo, bare }: { demo?: Cliente[]; bare?: boolean } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [mergeTarget, setMergeTarget] = useState<DupGroup | null>(null)
  // Perfil 360: cliente selecionado abre o Sheet de detalhe.
  const [selected, setSelected] = useState<Cliente | null>(null)

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

  // ─── Feature #3: scores dos leads vinculados ──────────────────────────
  // Busca leads referenciados por clientes.lead_id (só dado real, só se houver vínculos).
  const leadIds = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.lead_id).filter((id): id is string => !!id))),
    [clientes],
  )

  const { data: leadScores = {} } = useQuery({
    queryKey: ['salao-clientes-lead-scores', organizationId, leadIds],
    enabled: !isDemo && !!organizationId && leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads').select('id, score, temperature')
        .eq('organization_id', organizationId!)
        .in('id', leadIds)
      if (error) throw error
      const map: Record<string, { score: number | null; temperature: string | null }> = {}
      for (const l of (data ?? []) as { id: string; score: number | null; temperature: string | null }[]) {
        map[l.id] = { score: l.score, temperature: l.temperature }
      }
      return map
    },
  })

  /** score do lead vinculado a um cliente (ou null se sem lead/sem score). */
  const scoreOf = (c: Cliente): number | null => {
    if (!c.lead_id) return null
    const s = leadScores[c.lead_id]?.score
    return s == null ? null : s
  }

  // ─── Feature #4: duplicatas (só dado real) ────────────────────────────
  const dupGroups = useMemo(() => (isDemo ? [] : detectDuplicates(clientes)), [isDemo, clientes])

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

  // ─── Feature #4: merge transacional via RPC ───────────────────────────
  const juntar = useMutation({
    mutationFn: async (group: DupGroup) => {
      const { data, error } = await supabase.rpc('merge_clientes', {
        p_keep: group.keep.id,
        p_dups: group.dups.map((d) => d.id),
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (removidos) => {
      qc.invalidateQueries({ queryKey: ['salao-clientes', organizationId] })
      toast.success(`${removidos ?? 0} cadastro(s) duplicado(s) removido(s).`)
      setMergeTarget(null)
    },
    onError: (e) => {
      toast.error((e as Error)?.message || 'Erro ao juntar cadastros.')
      setMergeTarget(null)
    },
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

  // Ordenação: default mantém a ordem da query (created_at desc); "hottest"
  // ordena por score do lead desc, clientes sem score por último (estável).
  const visible = useMemo(() => {
    if (sortMode !== 'hottest') return filtered
    return [...filtered].sort((a, b) => {
      const sa = scoreOf(a)
      const sb = scoreOf(b)
      if (sa == null && sb == null) return 0
      if (sa == null) return 1
      if (sb == null) return -1
      return sb - sa
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortMode, leadScores])

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
          title="Clientes"
          description={`${clientes.length} ${clientes.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}`}
          action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>}
        />

        {/* Feature #4: banner de duplicatas (só dado real) */}
        {!isDemo && dupGroups.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <Merge className="h-4 w-4" />
              Clientes duplicadas: {dupGroups.length} — juntar
            </div>
            <div className="mt-3 space-y-2">
              {dupGroups.map((g) => (
                <div key={g.phone} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card/50 px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">{[g.keep, ...g.dups].map((c) => c.nome).join(' · ')}</span>
                    <span className="ml-2 text-muted-foreground">{g.keep.telefone ?? g.phone}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setMergeTarget(g)}>
                    <Merge className="mr-1 h-3.5 w-3.5" />Juntar
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, email ou CPF/CNPJ..." className="pl-9" />
          </div>
          {/* Feature #3: ordenação */}
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Mais recentes primeiro</SelectItem>
              <SelectItem value="hottest">Mais quentes primeiro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : visible.length === 0 ? (
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
                {visible.map((c) => {
                  const score = scoreOf(c)
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(c)}
                      title="Ver perfil 360"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{c.nome}</span>
                          {score != null && <TierBadge score={score} />}
                        </div>
                      </TableCell>
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
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(c) }} title="Ver perfil 360"><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(c) }} title="Editar"><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(c) }} title="Excluir" className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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

      {/* Feature #4: confirmação de merge */}
      <AlertDialog open={!!mergeTarget} onOpenChange={(o) => { if (!o) setMergeTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Juntar cadastros duplicados?</AlertDialogTitle>
            <AlertDialogDescription>
              {mergeTarget && (
                <>Juntar {mergeTarget.dups.length + 1} cadastros de {mergeTarget.keep.nome} num só? Agendamentos e histórico vão pro cadastro mantido.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={juntar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (mergeTarget) juntar.mutate(mergeTarget) }}
              disabled={juntar.isPending}
            >
              {juntar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Juntar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Perfil 360 do cliente (Sheet shadcn). No demo mostra só o cabeçalho +
          aviso; fora do demo dispara as queries por organization_id+cliente_id. */}
      <ClienteDetail
        cliente={selected}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null) }}
        demo={isDemo}
      />
    </MaybeSalaoShell>
  )
}
