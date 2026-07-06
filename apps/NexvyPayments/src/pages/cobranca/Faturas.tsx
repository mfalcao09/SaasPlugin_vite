// ─── Faturas — tela-âncora do módulo Cobrança (B3) ─────────────────────────
// Molde de UI: src/pages/salao/Financeiro.tsx (KPI grid + Tabs + <Table> +
// Dialog). KPICards no visual Nexvy Lux (surface-card + text-value dourado no
// valor de destaque) — molde src/components/superadmin/crm/leads/
// PlatformCrmLeadsKPICards.tsx. StatusBadge = map status→{label,variant} +
// <Badge> — molde src/components/superadmin/EvolutionManager.tsx:41.
//
// Backend (RLS org-scoped): tabela `invoices` (billing_model.sql §5). Ação
// "Gerar lote do mês" → edge function `invoice-batch-generate` via
// supabase.functions.invoke (body {competencia:'YYYY-MM', organization_id,
// dry_run}). ADITIVO: vive em src/pages/cobranca/ (novo), zero edição de core.

import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Loader2, TrendingUp, CheckCircle2, AlertTriangle, PlayCircle, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { db, useOrganizationId, formatCurrency, formatDate, currentCompetencia } from './_shared'

// ─── Shape da fatura (subset de invoices — billing_model.sql §5) ──────────
interface Invoice {
  id: string
  organization_id: string
  competencia: string
  referencia: string
  valor_original: number | null
  valor_total: number | null
  vencimento: string | null
  status: string
  pago_em?: string | null
  valor_pago?: number | null
  payer_id: string
  contract_id: string
  created_at?: string | null
  // join opcional (embed do pagador via FK)
  payers?: { nome: string | null; documento: string | null } | null
}

// ─── StatusBadge: map status → {label, variant} (molde EvolutionManager:41) ─
// Máquina de estados §5: rascunho→aprovada→emitindo→emitida→enviada→
// paga/vencida/cancelada/substituida.
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  rascunho: { label: 'Rascunho', variant: 'outline' },
  aprovada: { label: 'Aprovada', variant: 'secondary' },
  emitindo: { label: 'Emitindo', variant: 'secondary' },
  emitida: { label: 'Emitida', variant: 'default' },
  enviada: { label: 'Enviada', variant: 'default' },
  paga: { label: 'Paga', variant: 'default' },
  vencida: { label: 'Vencida', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'outline' },
  substituida: { label: 'Substituída', variant: 'outline' },
}
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

// ─── Tabs por status (o "Todas" agrega; os demais filtram) ────────────────
const TABS: { value: string; label: string; match?: (s: string) => boolean }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'rascunho', label: 'Rascunho', match: (s) => s === 'rascunho' },
  { value: 'emitida', label: 'Emitidas', match: (s) => s === 'emitida' || s === 'emitindo' || s === 'aprovada' },
  { value: 'enviada', label: 'Enviadas', match: (s) => s === 'enviada' },
  { value: 'paga', label: 'Pagas', match: (s) => s === 'paga' },
  { value: 'vencida', label: 'Vencidas', match: (s) => s === 'vencida' },
]

// ─── KPI card no visual Nexvy Lux (molde PlatformCrmLeadsKPICards.tsx) ─────
// `accent` = destaque brand (pílula brand-gradient + valor dourado .text-value).
// `tone` = token semântico (verde recebido / vermelho vencido) via color-mix.
type KpiTone = 'accent' | 'good' | 'bad'
function KpiCard({ label, value, icon: Icon, tone, isLoading }: {
  label: string; value: string; icon: typeof FileText; tone?: KpiTone; isLoading?: boolean
}) {
  const toneVar = tone === 'good' ? '160 60% 45%' : tone === 'bad' ? '0 72% 58%' : null
  const tonePill: CSSProperties | undefined = toneVar
    ? {
        color: `hsl(${toneVar})`,
        backgroundColor: `color-mix(in oklab, hsl(${toneVar}) 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, hsl(${toneVar}) 30%, transparent)`,
      }
    : undefined
  const accent = tone === 'accent'
  return (
    <div className="surface-card surface-card-hover p-5 flex items-start gap-3.5">
      <div
        className={cn(
          'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
          accent ? 'brand-gradient brand-glow text-white' : !toneVar && 'bg-muted border hairline text-muted-foreground',
        )}
        style={tonePill}
      >
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground truncate">{label}</p>
        {isLoading ? (
          <div className="mt-1 h-[30px] w-24 bg-muted animate-pulse rounded" />
        ) : (
          <p className={cn('mt-1 text-[30px] font-semibold tracking-[-0.03em] tabular-nums leading-none truncate', accent && 'text-value')}>
            {value}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── valor efetivo da fatura (total com encargos, cai p/ original) ─────────
const val = (i: Invoice) => Number(i.valor_total ?? i.valor_original ?? 0)

export default function Faturas() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [tab, setTab] = useState('todas')
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [competencia, setCompetencia] = useState(currentCompetencia())

  const { data: rows = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['cobranca-invoices', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await db.from('invoices')
        .select('*, payers(nome, documento)')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })

  // KPIs: a receber (aberto), recebido (pago), vencido. Molde de KPI Lux.
  const kpis = useMemo(() => {
    const openStates = new Set(['rascunho', 'aprovada', 'emitindo', 'emitida', 'enviada'])
    let aReceber = 0, recebido = 0, vencido = 0
    for (const i of rows) {
      if (i.status === 'paga') recebido += Number(i.valor_pago ?? val(i))
      else if (i.status === 'vencida') vencido += val(i)
      else if (openStates.has(i.status)) aReceber += val(i)
    }
    return { aReceber, recebido, vencido }
  }, [rows])

  const visible = useMemo(() => {
    const t = TABS.find((x) => x.value === tab)
    if (!t?.match) return rows
    return rows.filter((i) => t.match!(i.status))
  }, [rows, tab])

  // ── Ação "Gerar lote do mês" → edge function invoice-batch-generate ──
  // Não-cron sempre roda sob JWT do usuário (RLS confina à org); a função só
  // efetiva com dry_run=false p/ admin/manager. Aqui pedimos a gravação real.
  const gerarLote = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.functions.invoke('invoice-batch-generate', {
        body: { competencia, organization_id: organizationId, dry_run: false },
      })
      if (error) throw error
      return data as { created?: number; skipped?: number; contracts?: number }
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['cobranca-invoices', organizationId] })
      const created = r?.created ?? 0
      const skipped = r?.skipped ?? 0
      toast.success(`Lote ${competencia}: ${created} fatura(s) gerada(s)${skipped ? `, ${skipped} já existiam` : ''}.`)
      setBatchOpen(false)
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao gerar o lote do mês.'),
  })

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Faturas"
        description="Boleto + PIX, status e NFS-e — geração em lote por competência"
        action={
          <Button onClick={() => setBatchOpen(true)}>
            <PlayCircle className="mr-2 h-4 w-4" /> Gerar lote do mês
          </Button>
        }
      />

      {/* KPI grid — visual Lux (surface-card + valor dourado no destaque) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="A receber" value={formatCurrency(kpis.aReceber)} icon={TrendingUp} tone="accent" isLoading={isLoading} />
        <KpiCard label="Recebido" value={formatCurrency(kpis.recebido)} icon={CheckCircle2} tone="good" isLoading={isLoading} />
        <KpiCard label="Vencido" value={formatCurrency(kpis.vencido)} icon={AlertTriangle} tone="bad" isLoading={isLoading} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value={tab} className="mt-0">
          <Card className="surface-card">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : visible.length === 0 ? (
                <div className="py-16 text-center">
                  <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {tab === 'todas' ? 'Nenhuma fatura ainda. Gere o lote do mês para começar.' : 'Nenhuma fatura neste status.'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Competência</TableHead>
                      <TableHead>Pagador</TableHead>
                      <TableHead className="hidden md:table-cell">Referência</TableHead>
                      <TableHead className="w-28">Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((i) => (
                      <TableRow key={i.id} className="cursor-pointer" onClick={() => setDetail(i)} title="Ver detalhe da fatura">
                        <TableCell className="tabular-nums text-muted-foreground">{i.competencia}</TableCell>
                        <TableCell className="font-medium">{i.payers?.nome ?? '—'}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{i.referencia}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{formatDate(i.vencimento)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(val(i))}</TableCell>
                        <TableCell><StatusBadge status={i.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: gerar lote do mês (confirma competência) */}
      <Dialog open={batchOpen} onOpenChange={(o) => { if (!o && !gerarLote.isPending) setBatchOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar lote do mês</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Materializa as faturas dos contratos ativos na competência escolhida. É idempotente —
              re-rodar o mesmo mês não duplica faturas já geradas.
            </p>
            <div className="space-y-2">
              <Label>Competência (mês de referência)</Label>
              <Input
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className="w-48"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={gerarLote.isPending}>Cancelar</Button>
            <Button onClick={() => gerarLote.mutate()} disabled={!competencia || !organizationId || gerarLote.isPending}>
              {gerarLote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
              Gerar {competencia}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: detalhe da fatura */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Fatura {detail?.referencia}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={detail.status} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pagador" value={detail.payers?.nome ?? '—'} />
                <Field label="Competência" value={detail.competencia} />
                <Field label="Vencimento" value={formatDate(detail.vencimento)} />
                <Field label="Valor original" value={formatCurrency(Number(detail.valor_original ?? 0))} />
                <Field label="Valor total" value={formatCurrency(val(detail))} highlight />
                {detail.status === 'paga' && (
                  <Field label="Pago em" value={formatDate(detail.pago_em)} />
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-medium tabular-nums', highlight && 'text-value text-base')}>{value}</p>
    </div>
  )
}
