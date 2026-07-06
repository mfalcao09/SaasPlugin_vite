// ─── "Precisa de você" — triagem DETERMINÍSTICA de atendimentos (sem LLM) ────
// Diferente do RadarPanel (que depende do scan LLM "Rodar Análise"), esta seção
// é SEMPRE visível e calculada client-side a partir do estado real das conversas.
// Responde à pergunta do dono: "quem está esperando resposta?" e "onde a IA
// travou e precisa de humano?".
//
// Padrão de dados portado do AiGrowth/Relatorios: query Supabase direto por
// organization_id (useOrganizationId de @/pages/salao/_shared), agregação no
// cliente, react-query com enabled:!!org. Colunas reais confirmadas em
// src/hooks/useWebChat.ts (WebChatConversation / WebChatMessage).
//
// TZ-safe: last_message_at e created_at são timestamps ISO completos; uso
// new Date(iso) sobre eles é seguro (instante absoluto, sem ambiguidade de
// date-only) e new Date() para "agora". Nunca construo Date a partir de uma
// data YYYY-MM-DD crua (feedback_iso_date_format_br).

import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Bot, ArrowRight, type LucideIcon } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useOrganizationId } from '@/pages/salao/_shared'

// ─── Regras dos sinais (números explícitos = fáceis de revisar) ─────────────
// Sinal 2: a IA "engajou" se recebeu pelo menos esta qtd de mensagens do cliente…
const IA_TRAVADA_MIN_MSGS_CLIENTE = 2
// …E parou de avançar há mais de este tempo (ms).
const IA_TRAVADA_PARADA_MS = 2 * 60 * 60 * 1000 // 2h

type Motivo = 'waiting_human' | 'ia_travada'

export interface AtencaoItem {
  id: string
  nome: string
  motivo: Motivo
  /** rótulo do badge */
  badgeText: string
  /** variante visual do badge (destructive = vermelho urgente) */
  badgeVariant: 'destructive' | 'secondary'
  /** explicação curta da ação esperada */
  descricao: string
  /** "parado há Xh/Xd" derivado de last_message_at; null se sem referência */
  paradoHa: string | null
  /** quanto tempo está parado, em ms (chave de ordenação secundária) */
  paradoMs: number
  icon: LucideIcon
  /** urgentes (waiting_human) primeiro */
  urgente: boolean
}

// ─── Shapes mínimos das linhas reais (subset de WebChatConversation/Message) ─
interface ConvRow {
  id: string
  status: string | null
  last_message_at: string | null
  created_at: string | null
  visitor_name: string | null
  visitor_phone: string | null
}
interface MsgSenderRow {
  conversation_id: string
  sender_type: string | null
}

// "parado há Xmin / Xh / Xd" a partir de um instante ISO. Conservador: nunca
// negativo, retorna null se a referência for inválida/ausente.
function formatParadoHa(iso: string | null, nowMs: number): { label: string | null; ms: number } {
  if (!iso) return { label: null, ms: 0 }
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return { label: null, ms: 0 }
  const diff = Math.max(0, nowMs - t)
  const min = Math.floor(diff / 60000)
  if (min < 60) return { label: `parado há ${min}min`, ms: diff }
  const h = Math.floor(min / 60)
  if (h < 24) return { label: `parado há ${h}h`, ms: diff }
  const d = Math.floor(h / 24)
  return { label: `parado há ${d}d`, ms: diff }
}

function nomeDe(c: ConvRow): string {
  return c.visitor_name?.trim() || c.visitor_phone?.trim() || 'Visitante'
}

// ─── Carga + classificação determinística ────────────────────────────────────
async function fetchAtencao(orgId: string): Promise<AtencaoItem[]> {
  // 1) Conversas abertas (não 'closed') que são candidatas a algum sinal.
  const { data: convRows, error: convErr } = await supabase
    .from('webchat_conversations')
    .select('id, status, last_message_at, created_at, visitor_name, visitor_phone')
    .eq('organization_id', orgId)
    .neq('status', 'closed')
    .in('status', ['waiting_human', 'bot_active'])
    .order('last_message_at', { ascending: true, nullsFirst: false })
    .limit(200)

  if (convErr) throw convErr
  const convs = (convRows ?? []) as ConvRow[]
  if (convs.length === 0) return []

  const nowMs = Date.now()

  // 2) Sinal 1 — aguardando resposta humana (urgente). Determinístico por status.
  const aguardando = convs.filter((c) => c.status === 'waiting_human')

  // 3) Sinal 2 — IA travada: status bot_active, parada há > IA_TRAVADA_PARADA_MS
  //    E com >= IA_TRAVADA_MIN_MSGS_CLIENTE mensagens do cliente (engajou).
  //    Primeiro corta por tempo (barato), depois conta msgs só dos finalistas.
  const botParadas = convs.filter((c) => {
    if (c.status !== 'bot_active') return false
    if (!c.last_message_at) return false
    const t = new Date(c.last_message_at).getTime()
    if (Number.isNaN(t)) return false
    return nowMs - t > IA_TRAVADA_PARADA_MS
  })

  // Conta mensagens do cliente por conversa em UMA query (sem N+1) e agrega.
  const msgCountByConv = new Map<string, number>()
  if (botParadas.length > 0) {
    const ids = botParadas.map((c) => c.id)
    const { data: msgRows, error: msgErr } = await supabase
      .from('webchat_messages')
      .select('conversation_id, sender_type')
      .in('conversation_id', ids)
      .eq('sender_type', 'visitor') // remetente = cliente (WebChatMessage.sender_type)
      .limit(5000)
    if (msgErr) throw msgErr
    for (const m of (msgRows ?? []) as MsgSenderRow[]) {
      msgCountByConv.set(m.conversation_id, (msgCountByConv.get(m.conversation_id) ?? 0) + 1)
    }
  }
  const iaTravadas = botParadas.filter(
    (c) => (msgCountByConv.get(c.id) ?? 0) >= IA_TRAVADA_MIN_MSGS_CLIENTE,
  )

  // 4) Monta os itens.
  const items: AtencaoItem[] = []

  for (const c of aguardando) {
    const ref = c.last_message_at ?? c.created_at
    const { label, ms } = formatParadoHa(ref, nowMs)
    items.push({
      id: c.id,
      nome: nomeDe(c),
      motivo: 'waiting_human',
      badgeText: 'Urgente',
      badgeVariant: 'destructive',
      descricao: 'Aguardando resposta humana',
      paradoHa: label,
      paradoMs: ms,
      icon: AlertCircle,
      urgente: true,
    })
  }

  for (const c of iaTravadas) {
    const { label, ms } = formatParadoHa(c.last_message_at ?? c.created_at, nowMs)
    items.push({
      id: c.id,
      nome: nomeDe(c),
      motivo: 'ia_travada',
      badgeText: 'IA travada',
      badgeVariant: 'secondary',
      descricao: 'A IA está atendendo mas não avançou — assuma',
      paradoHa: label,
      paradoMs: ms,
      icon: Bot,
      urgente: false,
    })
  }

  // 5) Ordena: urgentes primeiro, depois mais tempo parado.
  items.sort((a, b) => {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1
    return b.paradoMs - a.paradoMs
  })

  return items
}

export default function PrecisaDeVoce() {
  const orgId = useOrganizationId()
  const navigate = useNavigate()

  const { data: items, isLoading } = useQuery({
    queryKey: ['precisa-de-voce', orgId],
    queryFn: () => fetchAtencao(orgId as string),
    enabled: !!orgId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const list = items ?? []

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4 text-primary" />
          Precisa de você
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Verificando atendimentos…</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum atendimento precisa de você agora 🎉
          </p>
        ) : (
          list.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Icon
                    className={
                      item.urgente
                        ? 'mt-0.5 h-4 w-4 shrink-0 text-destructive'
                        : 'mt-0.5 h-4 w-4 shrink-0 text-primary'
                    }
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{item.nome}</span>
                      <Badge variant={item.badgeVariant}>{item.badgeText}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.descricao}</p>
                    {item.paradoHa && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70">{item.paradoHa}</p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={item.urgente ? 'destructive' : 'default'}
                  className="shrink-0"
                  onClick={() => navigate(`/conversas?conv=${item.id}`)}
                >
                  Assumir
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
