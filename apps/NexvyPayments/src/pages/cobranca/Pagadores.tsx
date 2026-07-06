// ─── Pagadores — cadastro do cliente-final que o tenant cobra (G1) ─────────
// Molde de UI: src/pages/salao/Clientes.tsx (lista + busca + <Table> + Dialog
// CRUD). Import CSV: molde src/components/superadmin/crm/leads/
// PlatformCrmImportLeadsDialog.tsx (upload → mapear colunas → importar → done)
// + parser `parseCsv` de src/lib/leadsExport.ts:91.
//
// Backend (RLS org-scoped): tabela `payers` (billing_model.sql §1) —
// UNIQUE(organization_id, documento) dá a chave natural e a dedup do import
// (violação 23505 = SKIP). Endereço estruturado vai em `endereco` jsonb (NFS-e).
// ADITIVO: vive em src/pages/cobranca/ (novo), zero edição de core.

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Search, Loader2, Pencil, Trash2, Upload, Download, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/PageHeader'
import { parseCsv } from '@/lib/leadsExport'
import { db, useOrganizationId, formatDocumento, onlyDigits } from './_shared'

// ─── Shape do pagador (subset de payers — billing_model.sql §1) ───────────
interface Payer {
  id: string
  organization_id: string
  tipo_documento: 'cpf' | 'cnpj' | null
  documento: string
  nome: string
  email: string | null
  whatsapp: string | null
  endereco: Record<string, string> | null
  status: string | null
  created_at?: string | null
}

interface FormState {
  nome: string; tipo_documento: 'cpf' | 'cnpj'; documento: string; email: string; whatsapp: string
  status: string
  logradouro: string; numero: string; bairro: string; cidade: string; uf: string; cep: string
}
const EMPTY_FORM: FormState = {
  nome: '', tipo_documento: 'cpf', documento: '', email: '', whatsapp: '', status: 'ativo',
  logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '',
}

// documento com 14 dígitos = CNPJ, senão CPF (inferência ao importar).
function inferTipoDoc(doc: string): 'cpf' | 'cnpj' {
  return onlyDigits(doc).length === 14 ? 'cnpj' : 'cpf'
}

export default function Pagadores() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [importOpen, setImportOpen] = useState(false)

  const { data: rows = [], isLoading } = useQuery<Payer[]>({
    queryKey: ['cobranca-payers', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await db.from('payers')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Payer[]
    },
  })

  const setField = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }))
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false) }
  const openNew = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true) }
  const openEdit = (p: Payer) => {
    const e = p.endereco ?? {}
    setForm({
      nome: p.nome ?? '', tipo_documento: (p.tipo_documento ?? 'cpf'), documento: p.documento ?? '',
      email: p.email ?? '', whatsapp: p.whatsapp ?? '', status: p.status ?? 'ativo',
      logradouro: e.logradouro ?? '', numero: e.numero ?? '', bairro: e.bairro ?? '',
      cidade: e.cidade ?? '', uf: e.uf ?? '', cep: e.cep ?? '',
    })
    setEditingId(p.id); setShowForm(true)
  }

  const buildPayload = () => {
    const g = (s: string) => s.trim()
    const endereco: Record<string, string> = {}
    for (const k of ['logradouro', 'numero', 'bairro', 'cidade', 'uf', 'cep'] as const) {
      const v = g(form[k]); if (v) endereco[k] = v
    }
    return {
      nome: g(form.nome),
      tipo_documento: form.tipo_documento,
      documento: onlyDigits(form.documento), // só dígitos (chave natural)
      email: g(form.email) || null,
      whatsapp: onlyDigits(form.whatsapp) || null,
      status: form.status || 'ativo',
      endereco,
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = buildPayload()
      if (editingId) {
        const { error } = await db.from('payers').update(payload).eq('id', editingId).eq('organization_id', organizationId!)
        if (error) throw error
      } else {
        const { error } = await db.from('payers').insert({ ...payload, organization_id: organizationId! })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranca-payers', organizationId] })
      toast.success(editingId ? 'Pagador atualizado!' : 'Pagador cadastrado!')
      resetForm()
    },
    onError: (e: any) => {
      if ((e as { code?: string })?.code === '23505') toast.error('Já existe um pagador com este documento.')
      else toast.error('Erro ao salvar pagador.')
    },
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('payers').delete().eq('id', id).eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranca-payers', organizationId] })
      toast.success('Pagador excluído.')
    },
    onError: () => toast.error('Erro ao excluir pagador.'),
  })

  const handleDelete = (p: Payer) => {
    if (window.confirm(`Excluir o pagador "${p.nome}"? Esta ação não pode ser desfeita.`)) excluir.mutate(p.id)
  }

  const filtered = useMemo(() => rows.filter((p) =>
    p.nome?.toLowerCase().includes(search.toLowerCase()) ||
    onlyDigits(p.documento).includes(onlyDigits(search)) ||
    p.email?.toLowerCase().includes(search.toLowerCase()) ||
    (p.whatsapp ?? '').includes(onlyDigits(search)),
  ), [rows, search])

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
        title="Pagadores"
        description={`${rows.length} ${rows.length === 1 ? 'pagador cadastrado' : 'pagadores cadastrados'}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Importar CSV</Button>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo pagador</Button>
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, documento, email ou WhatsApp..." className="pl-9" />
      </div>

      <Card className="surface-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{search ? 'Nenhum pagador encontrado.' : 'Nenhum pagador cadastrado ainda.'}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Documento</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">WhatsApp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => openEdit(p)} title="Editar pagador">
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">{formatDocumento(p.documento)}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{p.email ?? '—'}</TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">{p.whatsapp ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={p.status === 'inativo'
                      ? 'border-muted-foreground/30 text-muted-foreground'
                      : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'}>
                      {p.status ?? 'ativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(p) }} title="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(p) }} title="Excluir" className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Form modal (cadastro/edição) */}
      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : resetForm())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar pagador' : 'Novo pagador'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setField('nome', e.target.value)} placeholder="Nome / razão social" /></div>
            <div className="grid grid-cols-[auto_1fr] gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.tipo_documento} onValueChange={(v) => setField('tipo_documento', v)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Documento *</Label><Input value={form.documento} onChange={(e) => setField('documento', e.target.value)} placeholder="Só números" inputMode="numeric" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="email@exemplo.com" /></div>
              <div className="space-y-2"><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setField('whatsapp', e.target.value)} placeholder="(00) 00000-0000" /></div>
            </div>

            {/* ── Endereço (para NFS-e) ── */}
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setField('logradouro', e.target.value)} placeholder="Rua, avenida…" /></div>
              <div className="space-y-2"><Label>Número</Label><Input value={form.numero} onChange={(e) => setField('numero', e.target.value)} className="w-24" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setField('bairro', e.target.value)} /></div>
              <div className="space-y-2"><Label>CEP</Label><Input value={form.cep} onChange={(e) => setField('cep', e.target.value)} placeholder="00000-000" inputMode="numeric" /></div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setField('cidade', e.target.value)} /></div>
              <div className="space-y-2"><Label>UF</Label><Input value={form.uf} onChange={(e) => setField('uf', e.target.value.toUpperCase())} maxLength={2} className="w-16" /></div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={() => salvar.mutate()} disabled={!form.nome.trim() || !onlyDigits(form.documento) || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV (molde PlatformCrmImportLeadsDialog) */}
      <ImportPayersDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        organizationId={organizationId}
        onDone={() => qc.invalidateQueries({ queryKey: ['cobranca-payers', organizationId] })}
      />
    </div>
  )
}

// ─── Import CSV de pagadores (multi-step: upload → mapear → importar → done)
// Molde: PlatformCrmImportLeadsDialog.tsx. Campos-alvo de `payers`.
const FIELD_OPTIONS = [
  { value: '__skip', label: '— ignorar —' },
  { value: 'nome', label: 'Nome' },
  { value: 'documento', label: 'Documento (CPF/CNPJ)' },
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
]
function guessField(header: string): string {
  const h = header.toLowerCase().trim()
  if (/(nome|name|raz[aã]o)/.test(h)) return 'nome'
  if (/(documento|cpf|cnpj|cpf_cnpj|doc)/.test(h)) return 'documento'
  if (/e-?mail/.test(h)) return 'email'
  if (/(whatsapp|telefone|phone|celular|fone)/.test(h)) return 'whatsapp'
  return '__skip'
}

function ImportPayersDialog({
  open, onOpenChange, organizationId, onDone,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; organizationId: string; onDone?: () => void
}) {
  const [step, setStep] = useState<'upload' | 'map' | 'importing' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ created: number; duplicated: number; errors: number } | null>(null)

  const reset = () => { setStep('upload'); setHeaders([]); setCsvRows([]); setMapping({}); setProgress(0); setResult(null) }

  const handleFile = async (file: File) => {
    const text = await file.text()
    const { headers: h, rows: r } = parseCsv(text)
    if (h.length === 0 || r.length === 0) { toast.error('CSV vazio ou inválido'); return }
    setHeaders(h); setCsvRows(r)
    const m: Record<string, string> = {}
    h.forEach((col) => { m[col] = guessField(col) })
    setMapping(m); setStep('map')
  }

  const downloadTemplate = () => {
    const csv = 'nome,documento,email,whatsapp\nJoão Silva,12345678901,joao@email.com,11999999999'
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'modelo-pagadores.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const importNow = async () => {
    setStep('importing')
    const mapped = csvRows
      .map((r) => {
        const obj: Record<string, unknown> = {}
        Object.entries(mapping).forEach(([col, field]) => {
          if (field === '__skip') return
          const v = r[col]; if (v == null || v === '') return
          if (field === 'documento') obj.documento = onlyDigits(v)
          else if (field === 'whatsapp') obj.whatsapp = onlyDigits(v)
          else obj[field] = v
        })
        return obj
      })
      .filter((r) => r.nome && r.documento)
      .map((r) => ({
        ...r,
        organization_id: organizationId,
        tipo_documento: inferTipoDoc(String(r.documento ?? '')),
        status: 'ativo',
      }))

    let created = 0, duplicated = 0, errors = 0
    // insert linha-a-linha: UNIQUE(org,documento) → 23505 conta como duplicado (SKIP).
    for (let i = 0; i < mapped.length; i++) {
      const { error } = await db.from('payers').insert(mapped[i] as never)
      if (!error) created++
      else if ((error as { code?: string }).code === '23505') duplicated++
      else errors++
      setProgress(Math.round(((i + 1) / mapped.length) * 100))
    }
    setResult({ created, duplicated, errors })
    setStep('done')
    onDone?.()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar pagadores</DialogTitle>
          <DialogDescription>Importe pagadores a partir de um CSV. Mapeie cada coluna ao campo correspondente.</DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <Button variant="outline" onClick={downloadTemplate} className="gap-2"><Download className="h-4 w-4" /> Baixar modelo CSV</Button>
            <Label className="block">
              <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" id="cobranca-payers-csv" />
              <Button asChild className="w-full gap-2 cursor-pointer">
                <span onClick={() => document.getElementById('cobranca-payers-csv')?.click()}><Upload className="h-4 w-4" /> Selecionar arquivo CSV</span>
              </Button>
            </Label>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{csvRows.length} linhas detectadas. Mapeie as colunas:</p>
            <div className="max-h-72 overflow-y-auto space-y-2 pr-2">
              {headers.map((h) => (
                <div key={h} className="grid grid-cols-2 gap-3 items-center">
                  <Input value={h} disabled />
                  <Select value={mapping[h]} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 space-y-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">Importando... {progress}%</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="py-6 space-y-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="font-medium">Importação concluída</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>✓ {result.created} criados</p>
              {result.duplicated > 0 && <p>⊘ {result.duplicated} duplicados (documento já existe)</p>}
              {result.errors > 0 && (
                <p className="text-destructive flex items-center justify-center gap-1"><AlertTriangle className="h-4 w-4" /> {result.errors} erros</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
              <Button onClick={importNow}>Importar {csvRows.length} pagadores</Button>
            </>
          )}
          {step === 'done' && <Button onClick={() => onOpenChange(false)}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
