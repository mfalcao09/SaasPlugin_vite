import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, Phone, Mail, CalendarClock, DollarSign, Receipt, TrendingUp, Package,
  MessageSquare, Sparkles, Bot, User as UserIcon, Headset,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { normalizeBrPhone } from '@/cockpit/types'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatDate, useOrganizationId } from './_shared'
import type { Cliente } from './Clientes'

// PERFIL 360 do cliente — abre num Sheet a partir da lista "Meus Clientes".
// Objetivo: conhecer o cliente a fundo a partir do cadastro (KPIs, serviços que
// mais fecha, histórico de atendimentos, pacotes e histórico de conversa).
// Camada de dados: queries por organization_id + cliente_id, habilitadas só
// quando o Sheet está aberto E não é modo demo. Nenhuma escrita.

// `pacote_clientes` não está nos types gerados (migration posterior) — mesmo
// padrão destipado do Agenda.tsx para as tabelas fora do schema gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ─── Shapes locais (só os campos lidos) ────────────────────────────────────
interface AgendamentoRow {
  id: string
  data: string
  hora: string | null
  servico_nome: string | null
  profissional_nome: string | null
  valor: number | null
  status: string | null
}

interface PacoteRow {
  id: string
  pacote_nome: string | null
  sessoes_usadas: number | null
  total_sessoes: number | null
  valor_pago: number | null
}

interface ConversaMsg {
  id: string
  content: string
  sender_type: string
  created_at: string | null
}

const STATUS_BADGE: Record<string, string> = {
  agendado: 'border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-300',
  concluido: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  cancelado: 'border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-300',
}
const STATUS_LABEL: Record<string, string> = { agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado' }

function statusBadge(status: string | null) {
  const s = status ?? 'agendado'
  return (
    <Badge variant="outline" className={STATUS_BADGE[s] ?? 'border-muted-foreground/30 text-muted-foreground'}>
      {STATUS_LABEL[s] ?? s}
    </Badge>
  )
}

// Quem mandou a mensagem (cor + ícone), espelhando sender_type do webchat.
function SenderTag({ type }: { type: string }) {
  if (type === 'agent') return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-300"><Headset className="h-3 w-3" />Atendente</span>
  if (type === 'bot') return <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-300"><Bot className="h-3 w-3" />IA</span>
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><UserIcon className="h-3 w-3" />Cliente</span>
}

function formatHora(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 5)
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface KpiProps { icon: React.ElementType; label: string; value: string }
function Kpi({ icon: Icon, label, value }: KpiProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </Card>
  )
}

export interface ClienteDetailProps {
  cliente: Cliente | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** No modo demonstração não disparamos queries reais. */
  demo?: boolean
}

export default function ClienteDetail({ cliente, open, onOpenChange, demo }: ClienteDetailProps) {
  const organizationId = useOrganizationId()
  const clienteId = cliente?.id ?? null
  // Só busca quando: Sheet aberto + tem cliente + tem org + NÃO é demo.
  const canQuery = !!open && !!clienteId && !!organizationId && !demo

  // ─── Agendamentos do cliente (data desc) ──────────────────────────────────
  const { data: agendamentos = [], isLoading: loadingAgs } = useQuery({
    queryKey: ['cliente-detail-agendamentos', organizationId, clienteId],
    enabled: canQuery,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, data, hora, servico_nome, profissional_nome, valor, status')
        .eq('organization_id', organizationId!)
        .eq('cliente_id', clienteId!)
        .order('data', { ascending: false })
        .order('hora', { ascending: false })
      if (error) throw error
      return (data ?? []) as AgendamentoRow[]
    },
  })

  // ─── Pacotes do cliente (tabela fora dos types → db destipado) ────────────
  const { data: pacotes = [], isLoading: loadingPac } = useQuery({
    queryKey: ['cliente-detail-pacotes', organizationId, clienteId],
    enabled: canQuery,
    queryFn: async () => {
      const { data, error } = await db
        .from('pacote_clientes')
        .select('id, pacote_nome, sessoes_usadas, total_sessoes, valor_pago')
        .eq('organization_id', organizationId!)
        .eq('cliente_id', clienteId!)
      if (error) throw error
      return (data ?? []) as PacoteRow[]
    },
  })

  // ─── Histórico de conversa ─────────────────────────────────────────────────
  // Match por telefone normalizado: a coluna canônica é `visitor_phone_normalized`
  // (mesmo output de normalizeBrPhone). Fallback nas colunas cruas
  // (`visitor_phone`/`visitor_whatsapp`) cobre conversas antigas sem o campo
  // normalizado. Pega a conversa mais recente e lista as últimas ~15 mensagens.
  const phoneNorm = normalizeBrPhone(cliente?.telefone)
  const { data: conversa = [], isLoading: loadingConv } = useQuery({
    queryKey: ['cliente-detail-conversa', organizationId, phoneNorm],
    enabled: canQuery && !!phoneNorm,
    queryFn: async () => {
      // 1) acha a conversa do cliente por telefone normalizado (ou cru)
      const { data: convs, error: convErr } = await supabase
        .from('webchat_conversations')
        .select('id, last_message_at, created_at')
        .eq('organization_id', organizationId!)
        .or(`visitor_phone_normalized.eq.${phoneNorm},visitor_phone.eq.${phoneNorm},visitor_whatsapp.eq.${phoneNorm}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
      if (convErr) throw convErr
      const conversationId = (convs ?? [])[0]?.id as string | undefined
      if (!conversationId) return [] as ConversaMsg[]

      // 2) últimas ~15 mensagens dessa conversa (mostradas em ordem cronológica)
      const { data: msgs, error: msgErr } = await supabase
        .from('webchat_messages')
        .select('id, content, sender_type, created_at')
        .eq('conversation_id', conversationId)
        .neq('is_deleted', true)
        .order('created_at', { ascending: false })
        .limit(15)
      if (msgErr) throw msgErr
      return ((msgs ?? []) as ConversaMsg[]).slice().reverse()
    },
  })

  // ─── Agregados (KPIs + "o que mais fecha") ────────────────────────────────
  const concluidos = useMemo(() => agendamentos.filter((a) => a.status === 'concluido'), [agendamentos])

  const totalGasto = useMemo(() => concluidos.reduce((sum, a) => sum + Number(a.valor ?? 0), 0), [concluidos])
  const numConcluidos = concluidos.length
  const ticketMedio = numConcluidos > 0 ? totalGasto / numConcluidos : 0
  // Último atendimento concluído (agendamentos já vêm data desc).
  const ultimoAtendimento = concluidos[0]?.data ?? null

  // Top serviços do cliente: count + soma valor (considera concluídos — o que
  // de fato "fecha"). Ordenado por receita desc.
  const topServicos = useMemo(() => {
    const agg = new Map<string, { nome: string; count: number; valor: number }>()
    for (const a of concluidos) {
      const nome = a.servico_nome?.trim() || '—'
      const cur = agg.get(nome) ?? { nome, count: 0, valor: 0 }
      cur.count += 1
      cur.valor += Number(a.valor ?? 0)
      agg.set(nome, cur)
    }
    return Array.from(agg.values()).sort((a, b) => b.valor - a.valor || b.count - a.count)
  }, [concluidos])

  if (!cliente) return null

  const tags = cliente.tags ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="h-5 w-5 text-primary" />
                {cliente.nome}
              </SheetTitle>
              <SheetDescription className="mt-1">
                Cliente desde {formatDate(cliente.created_at)}
              </SheetDescription>
            </div>
            <Badge variant="outline" className={cliente.status === 'inativo'
              ? 'border-muted-foreground/30 text-muted-foreground'
              : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'}>
              {cliente.status ?? 'ativo'}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{cliente.telefone || '—'}</span>
            <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{cliente.email || '—'}</span>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>)}
            </div>
          )}
        </SheetHeader>

        <Separator className="my-4" />

        {demo ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-300">
            Perfil 360 indisponível no modo demonstração — dados reais aparecem para a sua organização.
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
              <TabsTrigger value="conversas">Conversas</TabsTrigger>
            </TabsList>

            {/* ── Visão geral: KPIs + o que mais fecha + pacotes ── */}
            <TabsContent value="overview" className="mt-4 space-y-5">
              {loadingAgs ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Kpi icon={DollarSign} label="Total gasto" value={formatCurrency(totalGasto)} />
                    <Kpi icon={Receipt} label="Atendimentos" value={String(numConcluidos)} />
                    <Kpi icon={TrendingUp} label="Ticket médio" value={formatCurrency(ticketMedio)} />
                    <Kpi icon={CalendarClock} label="Último atendimento" value={ultimoAtendimento ? formatDate(ultimoAtendimento) : '—'} />
                  </div>

                  {/* O que mais fecha */}
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Sparkles className="h-4 w-4 text-primary" />O que mais fecha
                    </h3>
                    {topServicos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum atendimento concluído ainda.</p>
                    ) : (
                      <Card>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Serviço</TableHead>
                              <TableHead className="text-center">Qtd</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topServicos.map((s) => (
                              <TableRow key={s.nome}>
                                <TableCell className="font-medium">{s.nome}</TableCell>
                                <TableCell className="text-center tabular-nums">{s.count}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(s.valor)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    )}
                  </div>

                  {/* Pacotes do cliente */}
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Package className="h-4 w-4 text-primary" />Pacotes
                    </h3>
                    {loadingPac ? (
                      <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
                    ) : pacotes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum pacote contratado.</p>
                    ) : (
                      <div className="space-y-2">
                        {pacotes.map((p) => {
                          const usadas = Number(p.sessoes_usadas ?? 0)
                          const total = Number(p.total_sessoes ?? 0)
                          return (
                            <Card key={p.id} className="flex items-center justify-between gap-3 p-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium">{p.pacote_nome ?? 'Pacote'}</div>
                                <div className="text-xs text-muted-foreground">
                                  {usadas}/{total} sessões usadas
                                </div>
                              </div>
                              <Badge variant="outline">{formatCurrency(Number(p.valor_pago ?? 0))}</Badge>
                            </Card>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── Agendamentos: histórico completo (data desc) ── */}
            <TabsContent value="agendamentos" className="mt-4">
              {loadingAgs ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : agendamentos.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum agendamento registrado.</p>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead className="hidden sm:table-cell">Profissional</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agendamentos.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(a.data)}
                            {a.hora && <span className="ml-1 text-xs text-muted-foreground">{formatHora(a.hora)}</span>}
                          </TableCell>
                          <TableCell className="font-medium">{a.servico_nome ?? '—'}</TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">{a.profissional_nome ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(Number(a.valor ?? 0))}</TableCell>
                          <TableCell>{statusBadge(a.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>

            {/* ── Conversas: últimas mensagens do webchat ── */}
            <TabsContent value="conversas" className="mt-4">
              {!phoneNorm ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Cliente sem telefone — não há como localizar conversas.</p>
              ) : loadingConv ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : conversa.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Sem conversas registradas.</p>
              ) : (
                <div className="space-y-3">
                  {conversa.map((m) => (
                    <div key={m.id} className="rounded-lg border bg-card/50 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <SenderTag type={m.sender_type} />
                        <span className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                    </div>
                  ))}
                  <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />Últimas {conversa.length} mensagens
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}
