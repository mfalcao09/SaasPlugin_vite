// ─── Home de Valor — "Início / Meu Dia" da dona do salão ─────────────────
// O AHA: ela abre e em <30s vê quanto dá pra recuperar + as mensagens prontas
// da IA. CACHE-FIRST: NÃO dispara análise no mount — lê a última análise
// concluída (useOpportunityScans). Só roda nova análise por ação explícita.
//
// Vocabulário lay (pt-BR): "cliente", "oportunidade", "análise", "sua IA".
// Nada de "lead", "pipeline", "scan", "agente".

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { useAuth } from '@/hooks/useAuth'
import {
  useOpportunityScans,
  useScanItems,
  useRunOpportunityScan,
} from '@/hooks/useOpportunityScan'
import {
  toOpportunityCard,
  RECUPERAVEL_CLASSES,
  type OpportunityCardData,
} from '@/cockpit/types'

import { OnboardingBanner } from '@/components/onboarding/OnboardingBanner'
import { SalaoActivationChecklist } from '@/pages/salao/ActivationChecklist'
import { BulkReactivationDialog } from '@/cockpit/reactivation/BulkReactivationDialog'

import { MoneyHeadline } from '@/cockpit/home/MoneyHeadline'
import { BucketCards } from '@/cockpit/home/BucketCards'
import { OpportunityCard } from '@/cockpit/home/OpportunityCard'
import { HomeLoading, HomeEmpty, HomeAnalyzing } from '@/cockpit/home/HomeStates'

export default function HomeDeValor() {
  const { profile, isSuperAdmin } = useAuth()
  const orgId = profile?.organization_id ?? null
  const firstName = profile?.full_name?.split(' ')[0] || ''

  // 1) Análises (desc por created_at). Cache-first: não roda nada no mount.
  const { data: scans, isLoading } = useOpportunityScans()
  // 2) Última concluída + detecção de uma nova em andamento.
  const latest = scans?.find((s) => s.status === 'completed') ?? null
  const running = scans?.find((s) => s.status === 'running' || s.status === 'pending') ?? null

  // 3) Itens da última análise concluída.
  const { data: items = [] } = useScanItems(latest?.id ?? null)

  // Disparo manual de nova análise (empty state / "atualizar agora").
  const runScan = useRunOpportunityScan()
  const handleAnalyze = () => runScan.mutate({ filters: {}, actions_config: {} })
  const isAnalyzing = !!running || runScan.isPending

  // Otimismo: mensagens já enviadas somem do headline e dos cards.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)

  // 4) Mapeia ScanItem → card, removendo os já enviados nesta sessão.
  const cards = useMemo(
    () => items.map(toOpportunityCard).filter((c) => !sentIds.has(c.id)),
    [items, sentIds],
  )

  // 5) Headline "recuperável" = soma(dealValue) de hot+warm.
  const recuperaveis = useMemo(
    () => cards.filter((c) => RECUPERAVEL_CLASSES.includes(c.classification)),
    [cards],
  )
  const totalRecuperavel = recuperaveis.reduce((acc, c) => acc + c.dealValue, 0)

  // 7) TOP-3: hot+warm, com mensagem pronta, por dealValue desc (já vêm score-desc).
  const topCards = useMemo(
    () =>
      recuperaveis
        .filter((c) => !!c.followupMessage)
        .sort((a, b) => b.dealValue - a.dealValue)
        .slice(0, 3),
    [recuperaveis],
  )

  const handleSent = (item: OpportunityCardData) => {
    setSentIds((prev) => {
      const next = new Set(prev)
      next.add(item.id)
      return next
    })
  }

  const handleBulkDone = ({ sent, failed }: { sent: number; failed: number }) => {
    // Só some com os cards se TODOS foram enviados. Com falha parcial, mantém
    // tudo visível pra ela reenviar os que falharam — não esconde falha.
    if (failed === 0 && sent > 0) {
      setSentIds((prev) => {
        const next = new Set(prev)
        topCards.forEach((c) => next.add(c.id))
        return next
      })
    }
    setBulkOpen(false)
  }

  // ─── Render ────────────────────────────────────────────────────────────
  // Nudges de onboarding só pra não-super-admin com org (reuso da home antiga).
  const nudges = orgId && !isSuperAdmin() ? (
    <SalaoActivationChecklist organizationId={orgId} />
  ) : null

  const greeting = firstName ? `Olá, ${firstName}` : 'Olá'

  // Estado: carregando.
  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <OnboardingBanner />
        {nudges}
        <Header greeting={greeting} />
        <HomeLoading />
      </div>
    )
  }

  // Estado: nenhuma análise concluída ainda.
  if (!latest) {
    return (
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <OnboardingBanner />
        {nudges}
        <Header greeting={greeting} />
        {running ? (
          <HomeAnalyzing />
        ) : (
          <HomeEmpty onAnalyze={handleAnalyze} isAnalyzing={isAnalyzing} />
        )}
      </div>
    )
  }

  // Estado: temos uma análise concluída → mostra valor + cards.
  const staleSubtitle = `Análise de ${formatDistanceToNow(new Date(latest.created_at), {
    addSuffix: true,
    locale: ptBR,
  })}`

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <OnboardingBanner />
      {nudges}
      <Header greeting={greeting} />

      <MoneyHeadline
        total={totalRecuperavel}
        count={recuperaveis.length}
        subtitle={staleSubtitle}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isAnalyzing ? 'Atualizando…' : 'Atualizar agora'}
          </Button>
        }
      />

      {running && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          Sua IA está atualizando a análise…
        </div>
      )}

      <BucketCards cards={cards} />

      {topCards.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-foreground">
              As 3 melhores oportunidades de hoje
            </h2>
            <Button onClick={() => setBulkOpen(true)} className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              Disparar reativação pra todas ({topCards.length})
            </Button>
          </div>
          <div className="space-y-3">
            {topCards.map((card) => (
              <OpportunityCard key={card.id} card={card} onSent={handleSent} />
            ))}
          </div>
        </section>
      ) : (
        <Card>
          <CardContent className="py-10 text-center space-y-1">
            <p className="font-medium text-foreground">Nenhuma cliente esperando contato agora</p>
            <p className="text-sm text-muted-foreground">
              Quando sua IA encontrar oportunidades com mensagem pronta, elas aparecem aqui.
            </p>
          </CardContent>
        </Card>
      )}

      <BulkReactivationDialog
        items={topCards}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onDone={handleBulkDone}
      />
    </div>
  )
}

function Header({ greeting }: { greeting: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{greeting}</h1>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        Sua IA trabalhou enquanto você dormia.
      </p>
    </div>
  )
}
