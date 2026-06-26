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

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Sparkles, TrendingUp, UserMinus, PackageCheck, CalendarClock, ArrowUpRight, Crown,
  RefreshCw, MessageCircle, Cake,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId, NoOrg } from '@/pages/salao/_shared'
import { formatBRL } from '@/cockpit/home/format'
import { BulkReactivationDialog } from '@/cockpit/reactivation/BulkReactivationDialog'
import { normalizeBrPhone, type OpportunityCardData } from '@/cockpit/types'
import {
  buildLevers, aggregateLevers, leverMessage,
  TO_CLIENTES, TO_PACOTES, TO_AGENDA, TO_SERVICOS,
  type GrowthLever, type AiGrowthData, type AgendamentoRow, type PacoteClienteRow,
  type ClienteRow,
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
  const [dispatchOpen, setDispatchOpen] = useState(false)

  // Clientes da alavanca COM telefone → alvos do disparo WhatsApp (sem telefone
  // não dá pra falar). Cada um vira um OpportunityCardData com a mensagem por tipo;
  // o BulkReactivationDialog (mesmo motor do botão único) faz o envio espaçado.
  const dispatchItems: OpportunityCardData[] = (lever.clienteList ?? [])
    .map((c) => ({
      id: c.key,
      leadId: c.cliente_id ?? null,
      name: c.nome,
      phone: normalizeBrPhone(c.telefone),
      classification: 'hot' as const,
      dealValue: 0,
      followupMessage: leverMessage(lever.id, c.nome),
      reason: null,
    }))
    // Filtra DEPOIS do normalize: telefone só com lixo ('()', '---') vira null e
    // não pode ser disparado — fora da lista (senão o botão dispararia em vão).
    .filter((item) => item.phone)

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

        {/* Lista nomeada: a cabeleireira vê QUEM alimenta a alavanca (até ~6 +
            "N mais"), não só o número agregado. Só aparece quando há nomes. */}
        {lever.clienteList && lever.clienteList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {lever.clienteList.slice(0, 6).map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {c.nome}
              </span>
            ))}
            {lever.clienteList.length > 6 && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                +{lever.clienteList.length - 6} mais
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {dispatchItems.length > 0 && (
            <Button size="sm" className="gap-1.5" onClick={() => setDispatchOpen(true)}>
              <MessageCircle className="h-3.5 w-3.5" />
              Falar com {dispatchItems.length === 1 ? 'essa cliente' : `essas ${dispatchItems.length}`}
            </Button>
          )}
          <Button asChild variant={isEmpty ? 'ghost' : 'outline'} size="sm" className="gap-1.5">
            <Link to={lever.ctaTo}>
              {lever.ctaLabel}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>

      {/* Disparo em lote reusando o motor de reativação (sendReactivation +
          evolution-send): mensagem por tipo de alavanca, envio espaçado. */}
      {dispatchItems.length > 0 && (
        <BulkReactivationDialog
          items={dispatchItems}
          open={dispatchOpen}
          onOpenChange={setDispatchOpen}
        />
      )}
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

  // Clientes: telefone (p/ disparo WhatsApp) + data_nascimento (alavanca aniversário).
  const { data: clientesRows = [], refetch: refetchClientes, isFetching: fetchingCli } = useQuery({
    queryKey: ['aigrowth-clientes', organizationId],
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

  const d = demo ?? { levers: buildLevers(agendamentos, pacotes, clientesRows) }
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
            onClick={() => { refetchAgendamentos(); refetchPacotes(); refetchClientes(); }}
            disabled={fetchingAg || fetchingPac || fetchingCli}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${fetchingAg || fetchingPac || fetchingCli ? 'animate-spin' : ''}`} />
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
      clienteList: [
        { nome: 'Maria Souza', key: 'd1', telefone: '11988880001' },
        { nome: 'Joana Lima', key: 'd2', telefone: '11988880002' },
        { nome: 'Lúcia Alves', key: 'd3', telefone: '11988880003' },
        { nome: 'Carla Dias', key: 'd4', telefone: '11988880004' },
        { nome: 'Patrícia Reis', key: 'd5', telefone: '11988880005' },
        { nome: 'Renata Melo', key: 'd6', telefone: '11988880006' },
        { nome: 'Bianca Rocha', key: 'd7', telefone: '11988880007' },
      ],
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
      clienteList: [
        { nome: 'Débora Pinto', key: 'p1' },
        { nome: 'Camila Freitas', key: 'p2' },
        { nome: 'Vanessa Luz', key: 'p3' },
      ],
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
      clienteList: [
        { nome: 'Fernanda Costa', key: 'v1', telefone: '11988880008' },
        { nome: 'Aline Prado', key: 'v2', telefone: '11988880009' },
        { nome: 'Tatiane Gomes', key: 'v3', telefone: '11988880010' },
        { nome: 'Sílvia Nunes', key: 'v4' },
      ],
    },
    {
      id: 'aniversario',
      title: 'Aniversariantes do mês',
      description: '3 clientes fazem aniversário este mês. Um carinho + mimo traz de volta.',
      estimated: 426,
      count: 3,
      ctaLabel: 'Ver clientes',
      ctaTo: TO_CLIENTES,
      icon: Cake,
      clienteList: [
        { nome: 'Helena Castro', key: 'a1', telefone: '11988880011' },
        { nome: 'Marina Souza', key: 'a2', telefone: '11988880012' },
        { nome: 'Yara Lopes', key: 'a3', telefone: '11988880013' },
      ],
    },
  ],
}
