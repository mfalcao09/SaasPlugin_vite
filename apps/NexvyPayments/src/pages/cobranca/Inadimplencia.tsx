// ─── Inadimplência — painel de vencidas + baixa manual (B5) ────────────────
// Molde de UI: Faturas.tsx (KPI grid Lux + <Table> + StatusBadge + Dialog).
// Filtra `invoices` com status='vencida'. KPIs: total vencido, nº inadimplentes
// (payers distintos), dias médios de atraso. Ação por linha "Dar baixa manual"
// → edge `billing-baixa-manual`; "Renegociar" = placeholder (tool renegociar/
// billing_agreements, ainda não construída).
//
// Backend (RLS org-scoped): tabela `invoices` (billing_model.sql §5, filtro
// status='vencida') + edge `billing-baixa-manual`. Colunas conferidas: valor_total,
// valor_original, vencimento(date), pago_em, valor_pago, payer_id, referencia.
// ADITIVO: vive em src/pages/cobranca/ (novo), zero edição de core.

import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Users, Clock, Loader2, CheckCircle2, HandCoins, CircleDollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/PageHeader'
import { db, useOrganizationId, formatCurrency, formatDate } from './_shared'

// ─── Shape da fatura vencida (subset de invoices — §5) ─────────────────────
interface Invoice {
  id: string
  organization_id: string
  competencia: string
  referencia: string
  valor_original: number | null
  valor_total: number | null
  vencimento: string | null
  status: string
  payer_id: string
  payers?: { nome: string | null; documento: string | null } | null
}

const val = (i: Invoice) => Number(i.valor_total ?? i.valor_original ?? 0)

// ── dias de atraso (TZ-safe: normaliza p/ meia-noite local, sem shift) ──
function diasAtraso(vencimento: string | null | undefined): number {
  if (!vencimento) return 0
  const d = new Date(vencimento.length <= 10 ? `${vencimento}T00:00:00` : vencimento)
  if (Number.isNaN(d.getTime())) return 0
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const diff = Math.floor((hoje.getTime() - d.getTime()) / 86_400_000)
  return diff > 0 ? diff : 0
}

// ─── KPI card no visual Nexvy Lux (molde Faturas.tsx KpiCard) ──────────────
type KpiTone = 'accent' | 'bad' | 'neutral'
function KpiCard({ label, value, icon: Icon, tone, isLoading }: {
  label: string; value: string; icon: typeof AlertTriangle; tone?: KpiTone; isLoading?: boolean
}) {
  const bad = tone === 'bad'
  const accent = tone === 'accent'
  const tonePill: CSSProperties | undefined = bad
    ? {
        color: 'hsl(0 72% 58%)',
        backgroundColor: 'color-mix(in oklab, hsl(0 72% 58%) 14%, transparent)',
        boxShadow: 'inset 0 0 0 1px color-mix(in oklab, hsl(0 72% 58%) 30%, transparent)',
      }
    : undefined
  return (
    <div className="surface-card surface-card-hover p-5 flex items-start gap-3.5">
      <div
        className={cn(
          'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
          accent ? 'brand-gradient brand-glow text-white' : !bad && 'bg-muted border hairline text-muted-foreground',
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

// ─── Form da baixa manual ──────────────────────────────────────────────────
interface BaixaForm { valor_pago: string; pago_em: string; forma: string }

export default function Inadimplencia() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  const [baixaTarget, setBaixaTarget] = useState<Invoice | null>(null)
  const [renegTarget, setRenegTarget] = useState<Invoice | null>(null)
  const [baixaForm, setBaixaForm] = useState<BaixaForm>({ valor_pago: '', pago_em: '', forma: 'pix' })

  const { data: rows = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['cobranca-inadimplencia', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await db.from('invoices')
        .select('*, payers(nome, documento)')
        .eq('organization_id', organizationId!)
        .eq('status', 'vencida')
        .order('vencimento', { ascending: true })
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })

  // KPIs: total vencido, nº inadimplentes (payers distintos), dias médios.
  const kpis = useMemo(() => {
    const totalVencido = rows.reduce((acc, i) => acc + val(i), 0)
    const inadimplentes = new Set(rows.map((i) => i.payer_id)).size
    const diasMedios = rows.length
      ? Math.round(rows.reduce((acc, i) => acc + diasAtraso(i.vencimento), 0) / rows.length)
      : 0
    return { totalVencido, inadimplentes, diasMedios }
  }, [rows])

  const openBaixa = (i: Invoice) => {
    setBaixaTarget(i)
    setBaixaForm({ valor_pago: String(val(i)), pago_em: new Date().toISOString().slice(0, 10), forma: 'pix' })
  }

  // ── Ação "Dar baixa manual" → edge function billing-baixa-manual ──
  const darBaixa = useMutation({
    mutationFn: async () => {
      if (!baixaTarget) return
      const { data, error } = await db.functions.invoke('billing-baixa-manual', {
        body: {
          invoice_id: baixaTarget.id,
          organization_id: organizationId,
          valor_pago: baixaForm.valor_pago ? Number(baixaForm.valor_pago) : val(baixaTarget),
          pago_em: baixaForm.pago_em || new Date().toISOString().slice(0, 10),
          forma: baixaForm.forma,
        },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobranca-inadimplencia', organizationId] })
      qc.invalidateQueries({ queryKey: ['cobranca-invoices', organizationId] })
      toast.success('Baixa registrada. Fatura marcada como paga.')
      setBaixaTarget(null)
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao dar baixa na fatura.'),
  })

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
        title="Inadimplência"
        description="Faturas vencidas, baixa manual e renegociação"
      />

      {/* KPI grid Lux */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total vencido" value={formatCurrency(kpis.totalVencido)} icon={CircleDollarSign} tone="accent" isLoading={isLoading} />
        <KpiCard label="Inadimplentes" value={String(kpis.inadimplentes)} icon={Users} tone="bad" isLoading={isLoading} />
        <KpiCard label="Atraso médio (dias)" value={String(kpis.diasMedios)} icon={Clock} tone="neutral" isLoading={isLoading} />
      </div>

      <Card className="surface-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500/50" />
              <p className="text-sm text-muted-foreground">Nenhuma fatura vencida. Carteira em dia! 🎉</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pagador</TableHead>
                  <TableHead className="hidden md:table-cell">Competência</TableHead>
                  <TableHead className="w-28">Vencimento</TableHead>
                  <TableHead className="w-24 text-center">Atraso</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => {
                  const dias = diasAtraso(i.vencimento)
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.payers?.nome ?? '—'}</TableCell>
                      <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">{i.competencia}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{formatDate(i.vencimento)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="destructive" className="tabular-nums">{dias}d</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(val(i))}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setRenegTarget(i)} title="Renegociar (em breve)">
                            <HandCoins className="mr-1.5 h-3.5 w-3.5" />Renegociar
                          </Button>
                          <Button size="sm" onClick={() => openBaixa(i)} title="Dar baixa manual">
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Dar baixa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog: baixa manual */}
      <Dialog open={!!baixaTarget} onOpenChange={(o) => { if (!o && !darBaixa.isPending) setBaixaTarget(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dar baixa manual</DialogTitle></DialogHeader>
          {baixaTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Registrando o pagamento de <strong>{baixaTarget.payers?.nome ?? '—'}</strong> — fatura {baixaTarget.referencia}
                ({formatCurrency(val(baixaTarget))}). Isso marca a fatura como <strong>paga</strong>.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor recebido (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={baixaForm.valor_pago}
                    onChange={(e) => setBaixaForm((f) => ({ ...f, valor_pago: e.target.value }))} inputMode="decimal" />
                </div>
                <div className="space-y-2">
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={baixaForm.pago_em}
                    onChange={(e) => setBaixaForm((f) => ({ ...f, pago_em: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <Select value={baixaForm.forma} onValueChange={(v) => setBaixaForm((f) => ({ ...f, forma: v }))}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaTarget(null)} disabled={darBaixa.isPending}>Cancelar</Button>
            <Button onClick={() => darBaixa.mutate()} disabled={!organizationId || darBaixa.isPending}>
              {darBaixa.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirmar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: renegociar (placeholder — tool renegociar/billing_agreements ainda não construída) */}
      <Dialog open={!!renegTarget} onOpenChange={(o) => { if (!o) setRenegTarget(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renegociar dívida</DialogTitle></DialogHeader>
          {renegTarget && (
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl brand-gradient brand-glow text-white flex items-center justify-center flex-shrink-0">
                  <HandCoins className="h-[18px] w-[18px]" />
                </div>
                <p className="text-muted-foreground">
                  A renegociação de <strong>{renegTarget.payers?.nome ?? '—'}</strong> ({formatCurrency(val(renegTarget))})
                  gera um acordo (<code className="text-value">billing_agreements</code>) com parcelas. Este fluxo ainda
                  está em construção — por enquanto, use a baixa manual ou combine diretamente com o pagador.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenegTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
