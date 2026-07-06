// ─── Ações com Clientes — a fila "o que fazer com cada cliente AGORA" ────────
// Feature A) do plano de compatibilização (CBA → salão). Transpõe os MESMOS
// sinais do AI Growth (agendamentos / pacotes / clientes por organization_id),
// mas POR CLIENTE: cada cliente que precisa de atenção vira um card com seus
// selos (VIP / em risco / nova) + as ações sugeridas, cada uma com a mensagem
// pronta e 1 botão "Mandar no WhatsApp" (reusa sendReactivation → evolution-send).
//
// Mesma cara/estrutura do AiGrowth (Card / PageHeader / useOrganizationId +
// useQuery por org + demo). A lógica vive em clientActions.ts (TS puro).

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Send, Loader2, Crown, AlertTriangle, Sparkles, RefreshCw,
  UserMinus, PackageCheck, Cake, ArrowUpRight, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId, NoOrg } from '@/pages/salao/_shared'
import { sendReactivation } from '@/cockpit/reactivation/sendReactivation'
import { normalizeBrPhone, type OpportunityCardData } from '@/cockpit/types'
import { buildClientActions, type ClientAction, type ClientAcao, type Selo } from '@/cockpit/clientActions'
import type { AgendamentoRow, PacoteClienteRow, ClienteRow } from '@/cockpit/levers'

// Estilo de cada selo (cores na linguagem visual do cockpit, dark-aware).
const SELO: Record<Selo, { label: string; cls: string; icon: LucideIcon }> = {
  vip: { label: 'VIP', cls: 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-300', icon: Crown },
  'em-risco': { label: 'Em risco', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: AlertTriangle },
  nova: { label: 'Nova', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: Sparkles },
}

const ACAO_ICON: Record<ClientAcao['tipo'], LucideIcon> = {
  reativar: UserMinus, pacote: PackageCheck, aniversario: Cake, upsell: ArrowUpRight,
}

// Botão de envio único — reusa o MOTOR (sendReactivation → evolution-send), mas
// com label genérico (o ReactivationButton tem label fixo "Disparar reativação",
// que ficaria errado numa ação de aniversário/upsell).
function AcaoButton({ item }: { item: OpportunityCardData }) {
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  async function go() {
    setSending(true)
    try {
      const r = await sendReactivation(item)
      if (r === 'sent') { toast.success('Mensagem enviada no WhatsApp ✅'); setDone(true) }
      else if (r === 'no_phone') toast.error('Cliente sem telefone — não dá para enviar')
      else if (r === 'no_instance') toast.error('Conecte seu WhatsApp primeiro para disparar')
      else toast.error('Não foi possível enviar agora')
    } finally { setSending(false) }
  }
  return (
    <Button size="sm" variant={done ? 'outline' : 'default'} className="gap-1.5 shrink-0" onClick={go} disabled={sending || done}>
      {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      {done ? 'Enviada' : 'Mandar no WhatsApp'}
    </Button>
  )
}

function ClientCard({ c }: { c: ClientAction }) {
  const phone = normalizeBrPhone(c.telefone)
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{c.nome}</h3>
            {c.diasSemVoltar !== null && (
              <p className="text-xs text-muted-foreground">Última visita há {c.diasSemVoltar} dias</p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {c.selos.map((s) => {
              const cfg = SELO[s]
              const I = cfg.icon
              return (
                <Badge key={s} variant="outline" className={cn('gap-1', cfg.cls)}>
                  <I className="h-3 w-3" />
                  {cfg.label}
                </Badge>
              )
            })}
          </div>
        </div>

        <ul className="space-y-2">
          {c.acoes.map((a, i) => {
            const I = ACAO_ICON[a.tipo]
            const item: OpportunityCardData = {
              id: `${c.key}:${a.tipo}`,
              leadId: c.cliente_id ?? null,
              name: c.nome,
              phone,
              classification: 'hot',
              dealValue: 0,
              followupMessage: a.mensagem,
              reason: a.motivo,
            }
            return (
              <li key={`${a.tipo}-${i}`} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <I className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate text-sm text-foreground">{a.motivo}</span>
                </div>
                {phone ? (
                  <AcaoButton item={item} />
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">Sem WhatsApp cadastrado</span>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export default function AcoesClientes({ demo, embedded }: { demo?: ClientAction[]; embedded?: boolean } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo

  const { data: agendamentos = [], refetch: refAg, isFetching: fAg } = useQuery({
    queryKey: ['acoes-agendamentos', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, cliente_id, cliente_nome, servico_nome, status, data, hora, valor')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as AgendamentoRow[]
    },
  })

  const { data: pacotes = [], refetch: refPac, isFetching: fPac } = useQuery({
    queryKey: ['acoes-pacotes', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacote_clientes')
        .select('id, pacote_nome, cliente_nome, total_sessoes, sessoes_usadas, valor_pago, data_validade, status')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as PacoteClienteRow[]
    },
  })

  const { data: clientesRows = [], refetch: refCli, isFetching: fCli } = useQuery({
    queryKey: ['acoes-clientes', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, telefone, data_nascimento')
        .eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as ClienteRow[]
    },
  })

  if (!isDemo && !organizationId) {
    return <div className="p-6"><NoOrg /></div>
  }

  const fila = demo ?? buildClientActions(agendamentos, pacotes, clientesRows)

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6'}>
      {isDemo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          Modo demonstração — dados fictícios, nada é salvo.
        </div>
      )}

      {!embedded && (
        <PageHeader
          title="Ações com Clientes"
          description="Quem precisa de um toque seu agora — com a mensagem pronta pra mandar no WhatsApp."
        />
      )}

      {!isDemo && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => { refAg(); refPac(); refCli() }}
          disabled={fAg || fPac || fCli}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${fAg || fPac || fCli ? 'animate-spin' : ''}`} />
          Atualizar agora
        </Button>
      )}

      {fila.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma ação pendente agora — sua base está em dia. Conforme você atende, as
            oportunidades de carinho com cada cliente aparecem aqui.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{fila.length}</span>{' '}
            cliente{fila.length === 1 ? '' : 's'} esperando um toque seu.
          </p>
          <div className="space-y-3">
            {fila.map((c) => <ClientCard key={c.key} c={c} />)}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Seed do modo demonstração ──────────────────────────────────────────────
export const DEMO_ACOES: ClientAction[] = [
  {
    key: 'a1', cliente_id: 'a1', nome: 'Fernanda Costa', telefone: '11988880008',
    selos: ['vip', 'em-risco'], diasSemVoltar: 72,
    acoes: [
      { tipo: 'reativar', motivo: 'Sem voltar há 72 dias', mensagem: 'Oi Fernanda! Você faz falta por aqui 👑 Quero reservar um horário especial só pra você — quando fica bom?' },
      { tipo: 'aniversario', motivo: 'Faz aniversário este mês', mensagem: 'Oi Fernanda! 🎉 Feliz aniversário! Pra comemorar, separei um presentinho seu aqui. Vem buscar? 🎂' },
    ],
  },
  {
    key: 'a2', cliente_id: 'a2', nome: 'Joana Lima', telefone: '11988880002',
    selos: ['em-risco'], diasSemVoltar: 58,
    acoes: [
      { tipo: 'reativar', motivo: 'Sem voltar há 58 dias', mensagem: 'Oi Joana! Senti sua falta por aqui 💕 Que tal marcar um horário essa semana? Tenho um mimo te esperando 🎁' },
      { tipo: 'pacote', motivo: 'Pacote quase no fim', mensagem: 'Oi Joana! Seu pacote está quase no fim — bora renovar e manter seu cuidado em dia? Posso já deixar separado 😉' },
    ],
  },
  {
    key: 'a4', nome: 'Lúcia Alves', telefone: undefined,
    selos: ['em-risco'], diasSemVoltar: 64,
    acoes: [
      { tipo: 'reativar', motivo: 'Sem voltar há 64 dias', mensagem: 'Oi Lúcia! Senti sua falta por aqui 💕 Que tal marcar um horário essa semana?' },
    ],
  },
  {
    key: 'a3', cliente_id: 'a3', nome: 'Marina Souza', telefone: '11988880012',
    selos: ['nova'], diasSemVoltar: 12,
    acoes: [
      { tipo: 'upsell', motivo: 'Nunca fez Design de sobrancelha', mensagem: 'Oi Marina! Tenho uma novidade que combina super com você 💁 Quer que eu te conte e já reserve um horário?' },
    ],
  },
]
