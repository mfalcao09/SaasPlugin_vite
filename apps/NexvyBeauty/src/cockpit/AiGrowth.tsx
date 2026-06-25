// ─── AI Growth — lente MACRO do NEGÓCIO (alavancas de receita do histórico) ──
// DIFERENTE do Radar IA (que varre CONVERSAS via useOpportunityScan). Aqui a IA
// olha o HISTÓRICO operacional do salão (agendamentos / pacotes / clientes,
// TODOS por organization_id) e calcula client-side, SEM LLM e SEM edge function,
// quanto de receita está parado em alavancas óbvias: reativação de inativos,
// renovação de pacotes, slots vazios, upsell do serviço âncora e VIPs que sumiram.
//
// Padrão de dados portado do Dashboard/Relatorios: query Supabase por
// organization_id (useOrganizationId de @/pages/salao/_shared), agregação no
// cliente, react-query com enabled:!isDemo. Visual reusa formatBRL da Home e os
// tokens do cockpit (Card / Button / PageHeader) — mesma cara, sem Frankenstein.
// Renderiza BARE (root p-6 space-y-6): vive dentro do CockpitShell/UnifiedShell
// via <Outlet/>, igual HomeDeValor/Relatorios.
//
// Defensivo: orgs hoje quase sem dado → cada card cai num empty state discreto
// ("Sem dados ainda") e TODO número usa `?? 0` (nunca NaN / nunca quebra). Datas
// ancoradas com `T00:00:00` e chave de mês via `.slice(0, 7)` (evita shift de TZ
// — feedback_iso_date_format_br). Modo `demo` injeta DEMO_AIGROWTH (seed realista)
// que popula TODAS as alavancas sem tocar o banco.

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Sparkles, TrendingUp, UserMinus, PackageCheck, CalendarClock, ArrowUpRight, Crown,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId, NoOrg } from '@/pages/salao/_shared'
import { formatBRL } from '@/cockpit/home/format'

// ─── Contrato de uma alavanca (= 1 card de oportunidade macro) ──────────────
export interface GrowthLever {
  /** chave estável (key do React + dedupe) */
  id: string
  /** título lay, sem jargão (ex.: "Clientes sumidas pra reativar") */
  title: string
  /** uma linha explicando o porquê / como agir */
  description: string
  /** receita estimada parada nesta alavanca (R$) */
  estimated: number
  /** quantos itens/clientes alimentam a estimativa */
  count: number
  /** rótulo do CTA do card */
  ctaLabel: string
  /** rota interna do CTA */
  ctaTo: string
  icon: LucideIcon
}

export interface AiGrowthData {
  levers: GrowthLever[]
}

// Rotas do Cockpit (in-shell). Não existe página de pacotes nem /admin?tab=pacotes,
// então renovação de pacote age sobre os clientes (/clientes). Serviços não têm rota
// no Cockpit → usa a página cheia /salao/servicos.
const TO_CLIENTES = '/clientes'
const TO_PACOTES = '/clientes'
const TO_AGENDA = '/agenda'
const TO_SERVICOS = '/salao/servicos'

// Inativo = sem agendamento concluído há mais de N dias.
const INATIVO_DIAS = 45
// VIP que sumiu: ticket histórico >= múltiplo do ticket médio E inativo.
const VIP_TICKET_MULTIPLO = 1.5
// Pacote "quase esgotado": faltam <= N sessões OU vence em <= N dias.
const PACOTE_SESSOES_RESTANTES = 1
const PACOTE_VENCE_EM_DIAS = 30

// ─── Shapes das linhas reais (subset do que cada tabela expõe) ──────────────
interface AgendamentoRow {
  id: string
  cliente_id: string | null
  cliente_nome: string | null
  servico_nome: string | null
  status: string | null
  data: string | null
  hora: string | null
  valor: number | null
}
interface PacoteClienteRow {
  id: string
  pacote_nome: string | null
  cliente_nome: string | null
  total_sessoes: number | null
  sessoes_usadas: number | null
  valor_pago: number | null
  data_validade: string | null
  status: string | null
}

// ─── Helpers de data (T00:00:00 ancora local; sem shift de TZ) ──────────────
function todayMidnight(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
function parseDateLocal(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(`${raw.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}
function faixaHorario(hora: string | null | undefined): string {
  const h = Number((hora ?? '').slice(0, 2))
  if (Number.isNaN(h)) return 'Sem horário'
  if (h < 12) return 'manhã (até 12h)'
  if (h < 18) return 'tarde (12h–18h)'
  return 'noite (após 18h)'
}
const DOW_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// ─── Agregação dos dados reais → alavancas ──────────────────────────────────
function buildLevers(agendamentos: AgendamentoRow[], pacotes: PacoteClienteRow[]): GrowthLever[] {
  const hoje = todayMidnight()
  const concluidos = agendamentos.filter((a) => a.status === 'concluido')

  // Ticket médio = média do valor dos concluídos (base p/ várias alavancas).
  const totalConcluidos = concluidos.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const ticketMedio = concluidos.length ? totalConcluidos / concluidos.length : 0

  // Por cliente: última visita concluída (Date) + total histórico gasto.
  // Chave preferencial = cliente_id; fallback = cliente_nome (dado antigo sem id).
  interface CliAgg { key: string; nome: string; ultima: Date | null; gasto: number; visitas: number }
  const porCliente = new Map<string, CliAgg>()
  for (const a of concluidos) {
    const key = a.cliente_id ?? (a.cliente_nome ? `nome:${a.cliente_nome}` : null)
    if (!key) continue
    const d = parseDateLocal(a.data)
    const cur = porCliente.get(key) ?? {
      key, nome: a.cliente_nome ?? 'Cliente', ultima: null, gasto: 0, visitas: 0,
    }
    cur.gasto += Number(a.valor ?? 0)
    cur.visitas += 1
    if (d && (!cur.ultima || d > cur.ultima)) cur.ultima = d
    if (a.cliente_nome && cur.nome === 'Cliente') cur.nome = a.cliente_nome
    porCliente.set(key, cur)
  }
  const clientes = [...porCliente.values()]

  // ── Alavanca 1: Clientes inativos → reativação ──────────────────────────
  const inativos = clientes.filter((c) => c.ultima && daysBetween(hoje, c.ultima) > INATIVO_DIAS)
  const lever1: GrowthLever = {
    id: 'inativos',
    title: 'Clientes sumidas para reativar',
    description:
      inativos.length > 0
        ? `${inativos.length} cliente${inativos.length === 1 ? '' : 's'} sem voltar há mais de ${INATIVO_DIAS} dias. Uma mensagem traz de volta.`
        : `Nenhuma cliente parada há mais de ${INATIVO_DIAS} dias — sua base está em dia.`,
    estimated: (ticketMedio || 0) * inativos.length,
    count: inativos.length,
    ctaLabel: 'Ver clientes inativas',
    ctaTo: TO_CLIENTES,
    icon: UserMinus,
  }

  // ── Alavanca 2: Pacotes a renovar (quase esgotados / vencendo) ───────────
  const quaseEsgotados = pacotes.filter((p) => {
    if (p.status && p.status !== 'ativo') return false
    const total = Number(p.total_sessoes ?? 0)
    const usadas = Number(p.sessoes_usadas ?? 0)
    const restantes = total - usadas
    const quaseSemSessao = total > 0 && restantes <= PACOTE_SESSOES_RESTANTES
    const venc = parseDateLocal(p.data_validade)
    const venceLogo = !!venc && daysBetween(venc, hoje) >= 0 && daysBetween(venc, hoje) <= PACOTE_VENCE_EM_DIAS
    return quaseSemSessao || venceLogo
  })
  const lever2: GrowthLever = {
    id: 'pacotes',
    title: 'Pacotes para renovar',
    description:
      quaseEsgotados.length > 0
        ? `${quaseEsgotados.length} pacote${quaseEsgotados.length === 1 ? '' : 's'} quase no fim ou vencendo. Ofereça a renovação antes que esfrie.`
        : 'Nenhum pacote no fim agora.',
    estimated: quaseEsgotados.reduce((s, p) => s + Number(p.valor_pago ?? 0), 0),
    count: quaseEsgotados.length,
    ctaLabel: 'Ver pacotes',
    ctaTo: TO_PACOTES,
    icon: PackageCheck,
  }

  // ── Alavanca 3: Horários/dias de baixa ocupação → promo pra preencher ────
  // Agrupa concluídos por (dia-da-semana × faixa horária); o slot menos usado é
  // o candidato a promoção. Receita potencial = ticketMedio × (média − mínimo).
  const slotCount = new Map<string, { count: number; dow: number; faixa: string }>()
  for (const a of concluidos) {
    const d = parseDateLocal(a.data)
    if (!d) continue
    const dow = d.getDay()
    const faixa = faixaHorario(a.hora)
    const key = `${dow}|${faixa}`
    const cur = slotCount.get(key) ?? { count: 0, dow, faixa }
    cur.count += 1
    slotCount.set(key, cur)
  }
  const slots = [...slotCount.values()]
  let lever3: GrowthLever
  if (slots.length >= 2) {
    const counts = slots.map((s) => s.count)
    const media = counts.reduce((s, n) => s + n, 0) / counts.length
    const pior = slots.reduce((m, s) => (s.count < m.count ? s : m), slots[0])
    const gap = Math.max(0, Math.round(media - pior.count))
    lever3 = {
      id: 'ocupacao',
      title: 'Horário vazio para encher',
      description: `${DOW_PT[pior.dow]} de ${pior.faixa} é seu horário mais fraco. Uma promo enche essa janela.`,
      estimated: (ticketMedio || 0) * gap,
      count: gap,
      ctaLabel: 'Abrir agenda',
      ctaTo: TO_AGENDA,
      icon: CalendarClock,
    }
  } else {
    lever3 = {
      id: 'ocupacao',
      title: 'Horário vazio para encher',
      description: 'Ainda não há histórico suficiente para achar seus horários fracos.',
      estimated: 0,
      count: 0,
      ctaLabel: 'Abrir agenda',
      ctaTo: TO_AGENDA,
      icon: CalendarClock,
    }
  }

  // ── Alavanca 4: Upsell do serviço âncora ────────────────────────────────
  // Serviço âncora = o mais agendado (maior recorrência). Quem nunca fez = alvo
  // de upsell. Receita = preço médio do âncora × nº de clientes que ainda não fez.
  const srvCount = new Map<string, number>()
  const srvValorTotal = new Map<string, number>()
  for (const a of concluidos) {
    const s = a.servico_nome
    if (!s) continue
    srvCount.set(s, (srvCount.get(s) ?? 0) + 1)
    srvValorTotal.set(s, (srvValorTotal.get(s) ?? 0) + Number(a.valor ?? 0))
  }
  let lever4: GrowthLever
  if (srvCount.size > 0) {
    const entries = [...srvCount.entries()].sort(([, a], [, b]) => b - a)
    const ancora = entries[0][0]
    const ancoraCount = srvCount.get(ancora) ?? 0
    const precoAncora = ancoraCount > 0 ? (srvValorTotal.get(ancora) ?? 0) / ancoraCount : 0
    // clientes que JÁ fizeram o âncora (por chave de cliente)
    const fezAncora = new Set<string>()
    for (const a of concluidos) {
      if (a.servico_nome !== ancora) continue
      const key = a.cliente_id ?? (a.cliente_nome ? `nome:${a.cliente_nome}` : null)
      if (key) fezAncora.add(key)
    }
    const naoFizeram = clientes.filter((c) => !fezAncora.has(c.key))
    lever4 = {
      id: 'upsell',
      title: `Upsell de "${ancora}"`,
      description:
        naoFizeram.length > 0
          ? `${ancora} é seu carro-chefe. ${naoFizeram.length} cliente${naoFizeram.length === 1 ? '' : 's'} ainda não experimentaram — ofereça.`
          : `${ancora} é seu carro-chefe e já alcança toda a base.`,
      estimated: (precoAncora || 0) * naoFizeram.length,
      count: naoFizeram.length,
      ctaLabel: 'Ver serviços',
      ctaTo: TO_SERVICOS,
      icon: ArrowUpRight,
    }
  } else {
    lever4 = {
      id: 'upsell',
      title: 'Upsell do serviço âncora',
      description: 'Ainda não há serviços concluídos para identificar seu carro-chefe.',
      estimated: 0,
      count: 0,
      ctaLabel: 'Ver serviços',
      ctaTo: TO_SERVICOS,
      icon: ArrowUpRight,
    }
  }

  // ── Alavanca 5: VIPs que sumiram (ticket alto + inativos) ────────────────
  const vips = inativos.filter((c) => {
    const ticketCliente = c.visitas > 0 ? c.gasto / c.visitas : 0
    return ticketMedio > 0 && ticketCliente >= ticketMedio * VIP_TICKET_MULTIPLO
  })
  const lever5: GrowthLever = {
    id: 'vips',
    title: 'Clientes VIP que sumiram',
    description:
      vips.length > 0
        ? `${vips.length} cliente${vips.length === 1 ? '' : 's'} de ticket alto pararam de vir. Vale uma atenção pessoal.`
        : 'Nenhuma cliente de ticket alto sumida no momento.',
    estimated: vips.reduce((s, c) => s + (c.visitas > 0 ? c.gasto / c.visitas : 0), 0),
    count: vips.length,
    ctaLabel: 'Ver clientes',
    ctaTo: TO_CLIENTES,
    icon: Crown,
  }

  return [lever1, lever2, lever3, lever4, lever5]
}

// ─── Card de uma alavanca (visual no padrão dos cards do cockpit) ───────────
function LeverCard({ lever }: { lever: GrowthLever }) {
  const isEmpty = lever.count === 0
  const Icon = lever.icon
  return (
    <Card>
      <CardContent className="py-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-foreground truncate">{lever.title}</h3>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {lever.count} {lever.count === 1 ? 'item' : 'itens'}
          </span>
        </div>

        {isEmpty ? (
          <p className="text-sm text-muted-foreground">Sem dados ainda</p>
        ) : (
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {formatBRL(lever.estimated)}
          </div>
        )}

        <p className="text-sm text-muted-foreground">{lever.description}</p>

        <div className="flex justify-end pt-1">
          <Button asChild variant={isEmpty ? 'ghost' : 'outline'} size="sm" className="gap-1.5">
            <Link to={lever.ctaTo}>
              {lever.ctaLabel}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AiGrowth({ demo }: { demo?: AiGrowthData } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo

  const { data: agendamentos = [] } = useQuery({
    queryKey: ['aigrowth-agendamentos', organizationId],
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

  const { data: pacotes = [] } = useQuery({
    queryKey: ['aigrowth-pacotes', organizationId],
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

  if (!isDemo && !organizationId) {
    return <div className="p-6"><NoOrg /></div>
  }

  const d = demo ?? { levers: buildLevers(agendamentos, pacotes) }
  const totalPotencial = d.levers.reduce((s, l) => s + (l.estimated ?? 0), 0)
  const totalItens = d.levers.reduce((s, l) => s + (l.count ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      {isDemo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          Modo demonstração — dados fictícios, nada é salvo.
        </div>
      )}

      <PageHeader
        title="AI Growth"
        description="Onde está a receita parada no seu negócio — sua IA leu o histórico e mapeou as alavancas."
      />

      {/* Headline: receita potencial recuperável (soma das alavancas) */}
      <MoneyHeadlineMacro total={totalPotencial} count={totalItens} />

      {/* Grid de alavancas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {d.levers.map((l) => (
          <LeverCard key={l.id} lever={l} />
        ))}
      </div>
    </div>
  )
}

// Headline macro: mesma linguagem visual do MoneyHeadline da Home (primary +
// gradiente), mas com a copy do NEGÓCIO (não "esta semana / conversas"). Inline
// pra não acoplar a copy da Home (que fala de reativação de conversas).
function MoneyHeadlineMacro({ total, count }: { total: number; count: number }) {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardContent className="py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <TrendingUp className="h-4 w-4" />
              Receita potencial recuperável
            </div>
            <div className="text-4xl font-bold tracking-tight text-foreground">{formatBRL(total)}</div>
            <p className="text-sm text-muted-foreground">
              {count > 0 ? (
                <>
                  Sua IA mapeou{' '}
                  <span className="font-semibold text-foreground">{count}</span>{' '}
                  oportunidade{count === 1 ? '' : 's'} espalhadas pelo seu histórico.
                </>
              ) : (
                'Sua IA ainda não tem histórico suficiente para mapear alavancas — conforme você atende, elas aparecem aqui.'
              )}
            </p>
          </div>
          <Sparkles className="h-5 w-5 text-primary/60 shrink-0" />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Seed do modo demonstração ──────────────────────────────────────────────
// Dados FICTÍCIOS que populam TODAS as alavancas (nada toca o Supabase). Usado
// pra prova visual e pelas rotas /demo do cockpit. Soma das estimativas alimenta
// o headline "Receita potencial recuperável".
export const DEMO_AIGROWTH: AiGrowthData = {
  levers: [
    {
      id: 'inativos',
      title: 'Clientes sumidas para reativar',
      description: '23 clientes sem voltar há mais de 45 dias. Uma mensagem traz de volta.',
      estimated: 3266,
      count: 23,
      ctaLabel: 'Ver clientes inativas',
      ctaTo: TO_CLIENTES,
      icon: UserMinus,
    },
    {
      id: 'pacotes',
      title: 'Pacotes para renovar',
      description: '7 pacotes quase no fim ou vencendo. Ofereça a renovação antes que esfrie.',
      estimated: 3640,
      count: 7,
      ctaLabel: 'Ver pacotes',
      ctaTo: TO_PACOTES,
      icon: PackageCheck,
    },
    {
      id: 'ocupacao',
      title: 'Horário vazio para encher',
      description: 'terça de manhã (até 12h) é seu horário mais fraco. Uma promo enche essa janela.',
      estimated: 1278,
      count: 9,
      ctaLabel: 'Abrir agenda',
      ctaTo: TO_AGENDA,
      icon: CalendarClock,
    },
    {
      id: 'upsell',
      title: 'Upsell de "Coloração"',
      description: 'Coloração é seu carro-chefe. 31 clientes ainda não experimentaram — ofereça.',
      estimated: 5642,
      count: 31,
      ctaLabel: 'Ver serviços',
      ctaTo: TO_SERVICOS,
      icon: ArrowUpRight,
    },
    {
      id: 'vips',
      title: 'Clientes VIP que sumiram',
      description: '4 clientes de ticket alto pararam de vir. Vale uma atenção pessoal.',
      estimated: 1840,
      count: 4,
      ctaLabel: 'Ver clientes',
      ctaTo: TO_CLIENTES,
      icon: Crown,
    },
  ],
}
