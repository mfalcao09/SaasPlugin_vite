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
  RefreshCw, MessageCircle, Cake, Layers, Users, MapPin,
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
  buildLevers, aggregateLevers, leverMessage, DEFAULT_TICKET_FALLBACK,
  TO_CLIENTES, TO_PACOTES, TO_AGENDA, TO_SERVICOS,
  type GrowthLever, type AiGrowthData, type AgendamentoRow, type PacoteClienteRow,
} from '@/cockpit/levers'
import {
  buildSegmentOpportunities, segmentMessage, segmentCoverage, aggregateSegments,
  type SegmentOpportunity, type SegmentClienteRow,
} from '@/cockpit/segments'

// O modo demo injeta levers + (opcional) segments. AiGrowthData (levers) vive em
// @/cockpit/levers; segments é separado pra evitar import circular levers↔segments.
type AiGrowthDemoData = AiGrowthData & { segments?: SegmentOpportunity[] }

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
              Falar com {dispatchItems.length === 1 ? 'esse cliente' : `esses ${dispatchItems.length}`}
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

// ─── Card de uma oportunidade de SEGMENTO (cross-sell cross-dimensional) ────
// Mesma estrutura do LeverCard, mas a mensagem é a oferta do serviço sub-consumido
// (segmentMessage) e o chip de dimensão deixa claro o cruzamento (faixa/região).
function SegmentCard({ opp }: { opp: SegmentOpportunity }) {
  const Icon = opp.icon
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const dimChip =
    opp.dimensao === 'faixa' ? 'faixa etária' : opp.dimensao === 'regiao' ? 'região' : 'faixa + região'

  const dispatchItems: OpportunityCardData[] = (opp.clienteList ?? [])
    .map((c) => ({
      id: c.key,
      leadId: c.cliente_id ?? null,
      name: c.nome,
      phone: normalizeBrPhone(c.telefone),
      classification: 'hot' as const,
      dealValue: 0,
      followupMessage: segmentMessage(opp.servico, c.nome),
      reason: null,
    }))
    .filter((item) => item.phone)

  return (
    <Card>
      <CardContent className="py-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-foreground truncate">{opp.titulo}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{dimChip}</span>
        </div>

        <div className="text-2xl font-bold tracking-tight text-foreground">{formatBRL(opp.estimated)}</div>
        <p className="text-sm text-muted-foreground">{opp.insight}</p>

        {opp.clienteList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {opp.clienteList.slice(0, 6).map((c) => (
              <span key={c.key} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {c.nome}
              </span>
            ))}
            {opp.clienteList.length > 6 && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                +{opp.clienteList.length - 6} mais
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {dispatchItems.length > 0 && (
            <Button size="sm" className="gap-1.5" onClick={() => setDispatchOpen(true)}>
              <MessageCircle className="h-3.5 w-3.5" />
              Oferecer a {dispatchItems.length === 1 ? 'esse cliente' : `esses ${dispatchItems.length}`}
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to={TO_CLIENTES}>
              Ver clientes
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>

      {dispatchItems.length > 0 && (
        <BulkReactivationDialog items={dispatchItems} open={dispatchOpen} onOpenChange={setDispatchOpen} />
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

export default function AiGrowth({ demo, embedded }: { demo?: AiGrowthDemoData; embedded?: boolean } = {}) {
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

  // Clientes: telefone (disparo WhatsApp) + data_nascimento (faixa etária / aniversário)
  // + cidade/uf (região) — alimentam tanto as alavancas quanto os segmentos.
  const { data: clientesRows = [], refetch: refetchClientes, isFetching: fetchingCli } = useQuery({
    queryKey: ['aigrowth-clientes', organizationId],
    enabled: !isDemo && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, telefone, data_nascimento, ultima_interacao_wa, cidade, uf')
        .eq('organization_id', organizationId!)
        // [B4] CRÍTICO: esta segmentação alimenta disparo. Mandar campanha para
        // 'a_revisar' (não confirmado) ou 'lixeira' queima número e reputação da instância.
        .eq('carteira_estado', 'principal')
      if (error) throw error
      // as unknown as: types.ts gerado está defasado (sem ultima_interacao_wa em
      // clientes, apesar da coluna existir no banco — F6). Runtime OK. TODO: regenerar types.
      return (data ?? []) as unknown as SegmentClienteRow[]
    },
  })

  if (!isDemo && !organizationId) {
    return <div className="p-6"><NoOrg /></div>
  }

  const d = demo ?? { levers: buildLevers(agendamentos, pacotes, clientesRows, DEFAULT_TICKET_FALLBACK) }
  const { total: totalPotencial, count: totalItens } = aggregateLevers(d.levers)

  // 3ª dimensão: oportunidades de SEGMENTO (faixa × serviço × região). Cruza o
  // cadastro (faixa/região) com o consumo (serviços) → cross-sell certeiro.
  const segments: SegmentOpportunity[] = isDemo
    ? (demo?.segments ?? [])
    : buildSegmentOpportunities(agendamentos, clientesRows)
  const segTotals = aggregateSegments(segments)
  const coverage = isDemo ? null : segmentCoverage(clientesRows)

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6'}>
      {isDemo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          Modo demonstração — dados fictícios, nada é salvo.
        </div>
      )}

      {!embedded && (
        <PageHeader
          title="AI Growth"
          description="Onde está a receita parada no seu negócio — sua IA leu o histórico e mapeou as alavancas."
        />
      )}

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

      {/* Grid de alavancas (por evento/tempo) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {d.levers.map((l) => (
          <LeverCard key={l.id} lever={l} />
        ))}
      </div>

      {/* ── 3ª dimensão: oportunidades por SEGMENTO (faixa × serviço × região) ── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold text-foreground">Oportunidades por segmento</h2>
          {segTotals.count > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatBRL(segTotals.total)} em cross-sell · {segTotals.count} alvo{segTotals.count === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          A IA cruzou <strong className="font-medium text-foreground">faixa etária × serviço × região</strong> pra achar
          ofertas certeiras — cada uma já com os clientes certos e o WhatsApp pronto.
        </p>

        {segments.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {segments.map((o) => (
              <SegmentCard key={o.id} opp={o} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-5 text-sm text-muted-foreground">
              {coverage && coverage.total > 0 ? (
                <>
                  Ainda não dá pra cruzar: faltam <strong className="font-medium text-foreground">faixa etária</strong>{' '}
                  (data de nascimento) e <strong className="font-medium text-foreground">região</strong> (CEP) preenchidas.
                  Hoje {coverage.comFaixa}/{coverage.total} têm faixa e {coverage.comRegiao}/{coverage.total} têm região.
                  Preencha pra destravar — comece pela <Link to="/saude" className="underline">Saúde da Base</Link>.
                </>
              ) : (
                'Conforme você atende e enriquece o cadastro (idade + CEP), os segmentos aparecem aqui.'
              )}
            </CardContent>
          </Card>
        )}

        {coverage && segments.length > 0 && (coverage.comRegiao < coverage.total || coverage.comFaixa < coverage.total) && (
          <p className="text-xs text-muted-foreground">
            Dá pra achar mais: {coverage.total - coverage.comRegiao} sem região e {coverage.total - coverage.comFaixa} sem
            data de nascimento. <Link to="/saude" className="underline">Enriquecer base</Link>.
          </p>
        )}
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
export const DEMO_AIGROWTH: AiGrowthDemoData = {
  levers: [
    {
      id: 'inativos',
      title: 'Clientes sumidos para reativar',
      description: '23 clientes sem voltar há mais de 45 dias. Uma mensagem traz de volta.',
      estimated: 3266,
      count: 23,
      ctaLabel: 'Ver clientes inativos',
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
      title: 'Upsell de "Esmaltação em gel"',
      description: 'Esmaltação em gel é seu carro-chefe. 31 clientes ainda não experimentaram — ofereça.',
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
  // 3ª dimensão — oportunidades de SEGMENTO (cruzamento faixa × serviço × região).
  // count = nº de clientes da lista (igual ao motor real: alvos == clienteList).
  segments: [
    {
      id: 'faixa:25–34 anos:Alongamento de cílios',
      dimensao: 'faixa',
      segmento: '25–34 anos',
      servico: 'Alongamento de cílios',
      titulo: 'Cross-sell de Alongamento de cílios — 25–34 anos',
      insight: '6 clientes de 25–34 anos ainda não fizeram Alongamento de cílios — serviço que 72% do resto da base já faz. Cruzamento por faixa etária: oferta certeira.',
      estimated: 1080,
      count: 6,
      icon: Users,
      clienteList: [
        { nome: 'Marina Souza', key: 'sg1', telefone: '11988881101' },
        { nome: 'Bruna Teixeira', key: 'sg2', telefone: '11988881102' },
        { nome: 'Carolina Dias', key: 'sg3', telefone: '11988881103' },
        { nome: 'Letícia Moraes', key: 'sg4', telefone: '11988881104' },
        { nome: 'Priscila Amaral', key: 'sg5', telefone: '11988881105' },
        { nome: 'Natália Brito', key: 'sg6', telefone: '11988881106' },
      ],
    },
    {
      id: 'regiao:São Paulo/SP:Esmaltação em gel',
      dimensao: 'regiao',
      segmento: 'São Paulo/SP',
      servico: 'Esmaltação em gel',
      titulo: 'Cross-sell de Esmaltação em gel — São Paulo/SP',
      insight: '5 clientes de São Paulo/SP ainda não fizeram Esmaltação em gel — serviço que 68% do resto da base já faz. Cruzamento por região: oferta certeira.',
      estimated: 900,
      count: 5,
      icon: MapPin,
      clienteList: [
        { nome: 'Patrícia Reis', key: 'sg7', telefone: '11988881107' },
        { nome: 'Aline Prado', key: 'sg8', telefone: '11988881108' },
        { nome: 'Vanessa Luz', key: 'sg9', telefone: '11988881109' },
        { nome: 'Débora Pinto', key: 'sg10', telefone: '11988881110' },
        { nome: 'Camila Freitas', key: 'sg11', telefone: '11988881111' },
      ],
    },
    {
      id: 'faixa+regiao:45–59 anos · São Paulo/SP:Hidratação',
      dimensao: 'faixa+regiao',
      segmento: '45–59 anos · São Paulo/SP',
      servico: 'Hidratação',
      titulo: 'Cross-sell de Hidratação — 45–59 anos · São Paulo/SP',
      insight: '3 clientes de 45–59 anos · São Paulo/SP ainda não fizeram Hidratação — serviço que 80% do resto da base já faz. Cruzamento por faixa + região: oferta certeira.',
      estimated: 360,
      count: 3,
      icon: Layers,
      clienteList: [
        { nome: 'Sílvia Nunes', key: 'sg12', telefone: '11988881112' },
        { nome: 'Rosana Maia', key: 'sg13', telefone: '11988881113' },
        { nome: 'Teresa Campos', key: 'sg14', telefone: '11988881114' },
      ],
    },
  ],
}
