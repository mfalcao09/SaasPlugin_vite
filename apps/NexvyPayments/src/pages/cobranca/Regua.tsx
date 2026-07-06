// ─── Régua de cobrança — config visual dos passos por vencimento (B4) ──────
// Molde de UI: card por passo (surface-card + brand-gradient no ativo) com
// toggle ativo/inativo (Switch) + edição de mensagem/canal (Dialog). A régua
// dispara POR VENCIMENTO da fatura: cada passo é um offset em dias relativo ao
// vencimento (D-3 lembrete, D0 vencimento, D+1 atraso, D+7 cobrança firme). Os
// eventos são materializados por billing-events e disparados pela cadence-tick.
//
// PERSISTÊNCIA (conferido em migrations_cobranca/20260706101000_billing_model.sql):
//   NÃO existe tabela de CONFIG de passos da régua. `billing_agreements` é
//   RENEGOCIAÇÃO (acordo/parcela), não config de régua. Então esta tela opera
//   sobre ESTADO LOCAL (default seedado) — a persistência entra depois.
//   TODO(persistência): quando existir `billing_cadence_steps` (ou equivalente)
//   em migrations_cobranca/, trocar o useState por useQuery/useMutation
//   (molde: Contratos.tsx) escopado por organization_id. Enquanto isso, o
//   default abaixo é a régua canônica sugerida ao tenant.
//
// ADITIVO: vive em src/pages/cobranca/ (novo), zero edição de core.

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Repeat, Bell, CalendarClock, AlertTriangle, Megaphone, MessageSquare, Mail, Pencil, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId } from './_shared'

type Canal = 'whatsapp' | 'email'

// ─── Passo da régua (relativo ao vencimento da fatura) ─────────────────────
interface ReguaStep {
  id: string
  offset: number            // dias relativos ao vencimento: -3 = D-3, 0 = D0, +7 = D+7
  titulo: string
  icon: typeof Bell
  ativo: boolean
  canal: Canal
  mensagem: string
}

// ── Default canônico (seed local) — a régua sugerida ao tenant ──
const DEFAULT_STEPS: ReguaStep[] = [
  {
    id: 'd-menos-3', offset: -3, titulo: 'Lembrete antecipado', icon: Bell, ativo: true, canal: 'whatsapp',
    mensagem: 'Olá {nome}! Sua fatura de {competencia} no valor de {valor} vence em {vencimento}. Qualquer dúvida, é só responder aqui. 😊',
  },
  {
    id: 'd-zero', offset: 0, titulo: 'No vencimento', icon: CalendarClock, ativo: true, canal: 'whatsapp',
    mensagem: 'Oi {nome}, sua fatura de {valor} vence hoje ({vencimento}). O boleto/PIX está no link enviado. Obrigado!',
  },
  {
    id: 'd-mais-1', offset: 1, titulo: 'Atraso — 1º dia', icon: AlertTriangle, ativo: true, canal: 'whatsapp',
    mensagem: 'Olá {nome}, identificamos que a fatura de {valor} venceu ontem. Se já pagou, ignore. Senão, o link segue ativo. Podemos ajudar?',
  },
  {
    id: 'd-mais-7', offset: 7, titulo: 'Cobrança firme — 7 dias', icon: Megaphone, ativo: false, canal: 'email',
    mensagem: 'Prezado(a) {nome}, sua fatura de {competencia} ({valor}) está em atraso há 7 dias. Regularize para evitar encargos. Fale conosco para renegociar.',
  },
]

const CANAL_META: Record<Canal, { label: string; icon: typeof MessageSquare }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare },
  email: { label: 'E-mail', icon: Mail },
}

// ── rótulo do offset (D-3 / D0 / D+7) ──
function offsetLabel(offset: number): string {
  if (offset === 0) return 'D0'
  return offset > 0 ? `D+${offset}` : `D${offset}`
}

export default function Regua() {
  const organizationId = useOrganizationId()
  const qc = useQueryClient()
  // TODO(persistência): substituir por useQuery(['cobranca-regua', organizationId]).
  const [steps, setSteps] = useState<ReguaStep[]>(DEFAULT_STEPS)
  const [editing, setEditing] = useState<ReguaStep | null>(null)
  const [draftMsg, setDraftMsg] = useState('')
  const [draftCanal, setDraftCanal] = useState<Canal>('whatsapp')

  const toggleAtivo = (id: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ativo: !s.ativo } : s)))
    // TODO(persistência): PATCH do passo (ativo) escopado por organization_id.
  }

  const openEdit = (s: ReguaStep) => { setEditing(s); setDraftMsg(s.mensagem); setDraftCanal(s.canal) }
  const saveEdit = () => {
    if (!editing) return
    setSteps((prev) => prev.map((s) => (s.id === editing.id ? { ...s, mensagem: draftMsg, canal: draftCanal } : s)))
    setEditing(null)
    // TODO(persistência): UPSERT do passo (mensagem, canal) por organization_id.
    // Sem tabela ainda → só estado local. invalidateQueries fica de ref p/ quando existir.
    void qc
    toast.success('Passo atualizado (em memória). A persistência entra quando a tabela de régua existir.')
  }

  const ativos = steps.filter((s) => s.ativo).length

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
        title="Régua de cobrança"
        description={`${ativos} de ${steps.length} passos ativos · dispara pelo vencimento de cada fatura`}
      />

      {/* Explicação: a régua dispara por vencimento da fatura */}
      <Card className="surface-card p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl brand-gradient brand-glow text-white flex items-center justify-center flex-shrink-0">
          <Info className="h-[18px] w-[18px]" />
        </div>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Como a régua funciona</p>
          <p className="mt-1">
            Cada passo é disparado em relação ao <strong>vencimento da fatura</strong> — não a uma data fixa.
            <span className="whitespace-nowrap"> D-3</span> avisa 3 dias antes, <span className="whitespace-nowrap">D0</span> no dia,
            <span className="whitespace-nowrap"> D+1</span>/<span className="whitespace-nowrap">D+7</span> após o atraso.
            Placeholders <code className="text-value">{'{nome}'}</code>, <code className="text-value">{'{valor}'}</code>,
            <code className="text-value"> {'{vencimento}'}</code> e <code className="text-value">{'{competencia}'}</code> são
            preenchidos por fatura no disparo (billing-cadence-tick).
          </p>
        </div>
      </Card>

      {/* Timeline de passos (card por passo, ativo = brand-gradient) */}
      <div className="space-y-3">
        {steps.map((s) => {
          const CanalIcon = CANAL_META[s.canal].icon
          const Icon = s.icon
          return (
            <Card key={s.id} className={cn('surface-card surface-card-hover p-5', !s.ativo && 'opacity-60')}>
              <div className="flex items-start gap-4">
                {/* Selo do offset */}
                <div className={cn(
                  'h-12 w-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-white',
                  s.ativo ? 'brand-gradient brand-glow' : 'bg-muted border hairline text-muted-foreground',
                )}>
                  <Icon className="h-4 w-4" />
                  <span className="text-[10px] font-semibold tabular-nums mt-0.5">{offsetLabel(s.offset)}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{s.titulo}</span>
                    <Badge variant="outline" className="gap-1">
                      <CanalIcon className="h-3 w-3" />{CANAL_META[s.canal].label}
                    </Badge>
                    {!s.ativo && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{s.mensagem}</p>
                </div>

                {/* Ações: toggle + editar */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Switch checked={s.ativo} onCheckedChange={() => toggleAtivo(s.id)} aria-label="Ativar/desativar passo" />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)} title="Editar mensagem/canal"><Pencil className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Dialog: editar mensagem/canal do passo */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              {editing ? `${offsetLabel(editing.offset)} · ${editing.titulo}` : 'Editar passo'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={draftCanal} onValueChange={(v) => setDraftCanal(v as Canal)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea value={draftMsg} onChange={(e) => setDraftMsg(e.target.value)} rows={5}
                placeholder="Use {nome}, {valor}, {vencimento}, {competencia}…" />
              <p className="text-xs text-muted-foreground">
                Placeholders disponíveis: <code className="text-value">{'{nome}'}</code>, <code className="text-value">{'{valor}'}</code>,
                <code className="text-value"> {'{vencimento}'}</code>, <code className="text-value">{'{competencia}'}</code>.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={!draftMsg.trim()}>Salvar passo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
