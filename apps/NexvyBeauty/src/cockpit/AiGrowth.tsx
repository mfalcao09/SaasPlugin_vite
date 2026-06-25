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
  RefreshCw,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId, NoOrg } from '@/pages/salao/_shared'
import { formatBRL } from '@/cockpit/home/format'
import {
  buildLevers, aggregateLevers,
  TO_CLIENTES, TO_PACOTES, TO_AGENDA, TO_SERVICOS,
  type GrowthLever, type AiGrowthData, type AgendamentoRow, type PacoteClienteRow,
} from '@/cockpit/levers'

// A lógica das alavancas (tipos GrowthLever/AiGrowthData, shapes das linhas,
// helpers de data, buildLevers e aggregateLevers) vive em @/cockpit/levers (TS
// puro, sem React). Re-exportamos GrowthLever/AiGrowthData para não quebrar quem
// já importava esses tipos do AiGrowth.tsx.
export type { GrowthLever, AiGrowthData }

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

// "Atualizado em dd/mm/aa, às hh:mm:ss" — instante local de dataUpdatedAt (ms epoch).
function formatUpdatedAt(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${p(d.getFullYear() % 100)}, às ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function AiGrowth({ demo }: { demo?: AiGrowthData } = {}) {
  const organizationId = useOrganizationId()
  const isDemo = !!demo

  const {
    data: agendamentos = [], refetch: refetchAgendamentos,
    dataUpdatedAt, isFetching: fetchingAg,
  } = useQuery({
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

  const { data: pacotes = [], refetch: refetchPacotes, isFetching: fetchingPac } = useQuery({
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
  const { total: totalPotencial, count: totalItens } = aggregateLevers(d.levers)

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

      {/* Atualizar a análise sob demanda + carimbo da última atualização */}
      {!isDemo && (
        <div className="flex flex-col items-start gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { refetchAgendamentos(); refetchPacotes(); }}
            disabled={fetchingAg || fetchingPac}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${fetchingAg || fetchingPac ? 'animate-spin' : ''}`} />
            Atualizar agora
          </Button>
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground">
              Atualizado em {formatUpdatedAt(dataUpdatedAt)}
            </span>
          )}
        </div>
      )}

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
