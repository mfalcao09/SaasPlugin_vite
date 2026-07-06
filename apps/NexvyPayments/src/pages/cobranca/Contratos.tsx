// ─── Grupos & Contratos — recorrência que o batch materializa (B2) ─────────
// Molde de UI: src/pages/salao/Clientes.tsx (lista + <Table> + Dialog CRUD),
// com Tabs (molde Financeiro.tsx) separando "Contratos" × "Grupos". Contrato =
// form com valor (BRL), dia de vencimento, ciclo (modo_valor), status e pagador
// vinculado (Select de payers). Grupo = agrupador (condomínio/prédio de cowork).
//
// Backend (RLS org-scoped): tabelas `billing_groups` (§2), `contracts` (§3),
// `payers` (§1, só p/ o Select). Colunas conferidas em billing_model.sql:
//   contracts: payer_id, group_id, descricao, modo_valor('fixo'|'variavel'),
//     valor_fixo, dia_vencimento(1..28), status('ativo'|'pausado'|'encerrado').
//   billing_groups: nome, tipo (rótulo livre). ADITIVO: vive em cobranca/ (novo).

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileSignature, Building2, Plus, Loader2, Pencil, Trash2, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/PageHeader'
import { db, useOrganizationId, formatCurrency } from './_shared'

// ─── Shapes (subset — billing_model.sql §2/§3/§1) ─────────────────────────
interface Payer { id: string; nome: string; documento: string }
interface BillingGroup {
  id: string; organization_id: string; nome: string; tipo: string | null; created_at?: string | null
}
interface Contract {
  id: string
  organization_id: string
  payer_id: string
  group_id: string | null
  descricao: string
  modo_valor: 'fixo' | 'variavel'
  valor_fixo: number | null
  dia_vencimento: number | null
  status: 'ativo' | 'pausado' | 'encerrado'
  created_at?: string | null
  payers?: { nome: string | null } | null
  billing_groups?: { nome: string | null } | null
}

// ─── StatusBadge do contrato (map status → {label, variant}) ───────────────
const CONTRACT_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo: { label: 'Ativo', variant: 'default' },
  pausado: { label: 'Pausado', variant: 'secondary' },
  encerrado: { label: 'Encerrado', variant: 'outline' },
}
function ContractStatusBadge({ status }: { status: string }) {
  const cfg = CONTRACT_STATUS[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

// ─── Form do contrato ──────────────────────────────────────────────────────
interface ContractForm {
  payer_id: string; group_id: string; descricao: string
  modo_valor: 'fixo' | 'variavel'; valor_fixo: string; dia_vencimento: string
  status: 'ativo' | 'pausado' | 'encerrado'
}
const EMPTY_CONTRACT: ContractForm = {
  payer_id: '', group_id: '', descricao: '', modo_valor: 'fixo', valor_fixo: '', dia_vencimento: '10', status: 'ativo',
}
// ─── Form do grupo ─────────────────────────────────────────────────────────
interface GroupForm { nome: string; tipo: string }
const EMPTY_GROUP: GroupForm = { nome: '', tipo: '' }

const NO_GROUP = '__none' // sentinel do Select (Radix não aceita value="")

export default function Contratos() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [tab, setTab] = useState('contratos')
  const [search, setSearch] = useState('')

  // Contratos
  const [showContract, setShowContract] = useState(false)
  const [editingContract, setEditingContract] = useState<string | null>(null)
  const [contractForm, setContractForm] = useState<ContractForm>(EMPTY_CONTRACT)
  // Grupos
  const [showGroup, setShowGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState<GroupForm>(EMPTY_GROUP)

  const { data: payers = [] } = useQuery<Payer[]>({
    queryKey: ['cobranca-payers-mini', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await db.from('payers')
        .select('id, nome, documento')
        .eq('organization_id', organizationId!)
        .order('nome', { ascending: true })
      if (error) throw error
      return (data ?? []) as Payer[]
    },
  })

  const { data: groups = [], isLoading: loadingGroups } = useQuery<BillingGroup[]>({
    queryKey: ['cobranca-groups', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await db.from('billing_groups')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as BillingGroup[]
    },
  })

  const { data: contracts = [], isLoading: loadingContracts } = useQuery<Contract[]>({
    queryKey: ['cobranca-contracts', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await db.from('contracts')
        .select('*, payers(nome), billing_groups(nome)')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Contract[]
    },
  })

  // ── Contratos: CRUD ──
  const openNewContract = () => { setContractForm(EMPTY_CONTRACT); setEditingContract(null); setShowContract(true) }
  const openEditContract = (c: Contract) => {
    setContractForm({
      payer_id: c.payer_id, group_id: c.group_id ?? '', descricao: c.descricao ?? '',
      modo_valor: c.modo_valor ?? 'fixo', valor_fixo: c.valor_fixo != null ? String(c.valor_fixo) : '',
      dia_vencimento: c.dia_vencimento != null ? String(c.dia_vencimento) : '', status: c.status ?? 'ativo',
    })
    setEditingContract(c.id); setShowContract(true)
  }
  const resetContract = () => { setContractForm(EMPTY_CONTRACT); setEditingContract(null); setShowContract(false) }

  const saveContract = useMutation({
    mutationFn: async () => {
      const dia = Number(contractForm.dia_vencimento)
      const payload = {
        payer_id: contractForm.payer_id,
        group_id: contractForm.group_id || null,
        descricao: contractForm.descricao.trim(),
        modo_valor: contractForm.modo_valor,
        valor_fixo: contractForm.modo_valor === 'fixo' && contractForm.valor_fixo
          ? Number(contractForm.valor_fixo) : null,
        dia_vencimento: dia >= 1 && dia <= 28 ? dia : null,
        status: contractForm.status,
      }
      if (editingContract) {
        const { error } = await db.from('contracts').update(payload).eq('id', editingContract).eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await db.from('contracts').insert({ ...payload, organization_id: organizationId! })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranca-contracts', organizationId] })
      toast.success(editingContract ? 'Contrato atualizado!' : 'Contrato criado!')
      resetContract()
    },
    onError: () => toast.error('Erro ao salvar contrato.'),
  })

  const deleteContract = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('contracts').delete().eq('id', id).eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranca-contracts', organizationId] })
      toast.success('Contrato excluído.')
    },
    onError: () => toast.error('Erro ao excluir contrato (pode ter faturas vinculadas).'),
  })

  // ── Grupos: CRUD ──
  const openNewGroup = () => { setGroupForm(EMPTY_GROUP); setEditingGroup(null); setShowGroup(true) }
  const openEditGroup = (g: BillingGroup) => {
    setGroupForm({ nome: g.nome ?? '', tipo: g.tipo ?? '' })
    setEditingGroup(g.id); setShowGroup(true)
  }
  const resetGroup = () => { setGroupForm(EMPTY_GROUP); setEditingGroup(null); setShowGroup(false) }

  const saveGroup = useMutation({
    mutationFn: async () => {
      const payload = { nome: groupForm.nome.trim(), tipo: groupForm.tipo.trim() || null }
      if (editingGroup) {
        const { error } = await db.from('billing_groups').update(payload).eq('id', editingGroup).eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await db.from('billing_groups').insert({ ...payload, organization_id: organizationId! })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranca-groups', organizationId] })
      toast.success(editingGroup ? 'Grupo atualizado!' : 'Grupo criado!')
      resetGroup()
    },
    onError: (e: any) => {
      if ((e as { code?: string })?.code === '23505') toast.error('Já existe um grupo com este nome.')
      else toast.error('Erro ao salvar grupo.')
    },
  })

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('billing_groups').delete().eq('id', id).eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranca-groups', organizationId] })
      toast.success('Grupo excluído.')
    },
    onError: () => toast.error('Erro ao excluir grupo.'),
  })

  const handleDeleteContract = (c: Contract) => {
    if (window.confirm(`Excluir o contrato "${c.descricao}"? Esta ação não pode ser desfeita.`)) deleteContract.mutate(c.id)
  }
  const handleDeleteGroup = (g: BillingGroup) => {
    if (window.confirm(`Excluir o grupo "${g.nome}"? Esta ação não pode ser desfeita.`)) deleteGroup.mutate(g.id)
  }

  const filteredContracts = useMemo(() => contracts.filter((c) =>
    c.descricao?.toLowerCase().includes(search.toLowerCase()) ||
    (c.payers?.nome ?? '').toLowerCase().includes(search.toLowerCase()),
  ), [contracts, search])
  const filteredGroups = useMemo(() => groups.filter((g) =>
    g.nome?.toLowerCase().includes(search.toLowerCase()) ||
    (g.tipo ?? '').toLowerCase().includes(search.toLowerCase()),
  ), [groups, search])

  if (!organizationId) {
    return (
      <div className="p-12 text-center text-muted-foreground text-sm">
        Sua conta ainda não está vinculada a uma organização.
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Grupos & Contratos"
        description="Contratos recorrentes (pagador → valor → vencimento) e grupos que os agregam"
        action={
          tab === 'contratos'
            ? <Button onClick={openNewContract}><Plus className="mr-2 h-4 w-4" />Novo contrato</Button>
            : <Button onClick={openNewGroup}><Plus className="mr-2 h-4 w-4" />Novo grupo</Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
        </TabsList>

        {/* ── Contratos ── */}
        <TabsContent value="contratos" className="mt-0">
          <Card className="surface-card">
            {loadingContracts ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : filteredContracts.length === 0 ? (
              <div className="py-16 text-center">
                <FileSignature className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{search ? 'Nenhum contrato encontrado.' : 'Nenhum contrato ainda. Crie o primeiro.'}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Pagador</TableHead>
                    <TableHead className="hidden md:table-cell">Grupo</TableHead>
                    <TableHead className="w-24 text-center">Venc.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => openEditContract(c)} title="Editar contrato">
                      <TableCell className="font-medium">{c.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">{c.payers?.nome ?? '—'}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{c.billing_groups?.nome ?? '—'}</TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">{c.dia_vencimento ? `dia ${c.dia_vencimento}` : '—'}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {c.modo_valor === 'variavel' ? <span className="text-muted-foreground">variável</span> : formatCurrency(Number(c.valor_fixo ?? 0))}
                      </TableCell>
                      <TableCell><ContractStatusBadge status={c.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditContract(c) }} title="Editar"><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteContract(c) }} title="Excluir" className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ── Grupos ── */}
        <TabsContent value="grupos" className="mt-0">
          <Card className="surface-card">
            {loadingGroups ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{search ? 'Nenhum grupo encontrado.' : 'Nenhum grupo ainda (condomínio, prédio de cowork…).'}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((g) => (
                    <TableRow key={g.id} className="cursor-pointer" onClick={() => openEditGroup(g)} title="Editar grupo">
                      <TableCell className="font-medium">{g.nome}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{g.tipo ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditGroup(g) }} title="Editar"><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g) }} title="Excluir" className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: contrato (cadastro/edição) */}
      <Dialog open={showContract} onOpenChange={(o) => (o ? setShowContract(true) : resetContract())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingContract ? 'Editar contrato' : 'Novo contrato'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pagador *</Label>
              <Select value={contractForm.payer_id} onValueChange={(v) => setContractForm((f) => ({ ...f, payer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o pagador" /></SelectTrigger>
                <SelectContent>
                  {payers.length === 0
                    ? <SelectItem value="__empty" disabled>Cadastre um pagador primeiro</SelectItem>
                    : payers.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Descrição *</Label><Input value={contractForm.descricao} onChange={(e) => setContractForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Ex.: Mensalidade apto 101" /></div>
            <div className="space-y-2">
              <Label>Grupo (opcional)</Label>
              <Select value={contractForm.group_id || NO_GROUP} onValueChange={(v) => setContractForm((f) => ({ ...f, group_id: v === NO_GROUP ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Sem grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP}>Sem grupo</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Modo de valor</Label>
                <Select value={contractForm.modo_valor} onValueChange={(v) => setContractForm((f) => ({ ...f, modo_valor: v as 'fixo' | 'variavel' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixo">Fixo (mensalidade)</SelectItem>
                    <SelectItem value="variavel">Variável (leitura/mês)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor fixo (R$)</Label>
                <Input type="number" step="0.01" min="0" value={contractForm.valor_fixo}
                  onChange={(e) => setContractForm((f) => ({ ...f, valor_fixo: e.target.value }))}
                  disabled={contractForm.modo_valor === 'variavel'} placeholder="0,00" inputMode="decimal" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Dia de vencimento (1–28)</Label>
                <Input type="number" min="1" max="28" value={contractForm.dia_vencimento}
                  onChange={(e) => setContractForm((f) => ({ ...f, dia_vencimento: e.target.value }))} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={contractForm.status} onValueChange={(v) => setContractForm((f) => ({ ...f, status: v as ContractForm['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="encerrado">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetContract}>Cancelar</Button>
            <Button onClick={() => saveContract.mutate()} disabled={!contractForm.payer_id || !contractForm.descricao.trim() || saveContract.isPending}>
              {saveContract.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: grupo (cadastro/edição) */}
      <Dialog open={showGroup} onOpenChange={(o) => (o ? setShowGroup(true) : resetGroup())}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingGroup ? 'Editar grupo' : 'Novo grupo'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={groupForm.nome} onChange={(e) => setGroupForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Condomínio Jardins" /></div>
            <div className="space-y-2"><Label>Tipo (rótulo livre)</Label><Input value={groupForm.tipo} onChange={(e) => setGroupForm((f) => ({ ...f, tipo: e.target.value }))} placeholder="condomínio, cowork…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetGroup}>Cancelar</Button>
            <Button onClick={() => saveGroup.mutate()} disabled={!groupForm.nome.trim() || saveGroup.isPending}>
              {saveGroup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
