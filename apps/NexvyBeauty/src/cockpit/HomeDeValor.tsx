// ─── Home de Valor — "Início / Meu Dia" da dona do salão ─────────────────
// O AHA: ela abre e em <30s vê quanto dá pra recuperar + as mensagens prontas
// da IA. CACHE-FIRST: NÃO dispara análise no mount — lê a última análise
// concluída. Se a conta ainda não tem dado real acionável (0 conversas),
// mostra oportunidades-EXEMPLO rotuladas + CTA "conecte seu WhatsApp" — a tela
// NUNCA abre vazia e o AHA dispara mesmo em conta nova (dívida da Onda 1).
//
// Vocabulário lay (pt-BR): "cliente", "oportunidade", "análise", "sua IA".

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles, Loader2, RefreshCw, MessageCircle } from 'lucide-react'
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
import { HomeLoading } from '@/cockpit/home/HomeStates'
import { SEED_OPPORTUNITIES } from '@/cockpit/home/seedOpportunities'

// Conexão do WhatsApp vive no Admin > Configurações > Conexões (EvolutionInstancesPanel).
const WHATSAPP_CONNECT_TO = '/admin?tab=connections'

export default function HomeDeValor() {
  const { profile, isSuperAdmin } = useAuth()
  const orgId = profile?.organization_id ?? null
  const firstName = profile?.full_name?.split(' ')[0] || ''

  // Cache-first: lê a última análise concluída; NÃO roda nada no mount.
  const { data: scans, isLoading } = useOpportunityScans()
  const latest = scans?.find((s) => s.status === 'completed') ?? null
  const running = scans?.find((s) => s.status === 'running' || s.status === 'pending') ?? null

  const { data: items = [] } = useScanItems(latest?.id ?? null)

  const runScan = useRunOpportunityScan()
  const handleAnalyze = () => runScan.mutate({ filters: {}, actions_config: {} })
  const isAnalyzing = !!running || runScan.isPending

  // Otimismo: mensagens já enviadas somem do headline e dos cards.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)

  const cards = useMemo(
    () => items.map(toOpportunityCard).filter((c) => !sentIds.has(c.id)),
    [items, sentIds],
  )
  const recuperaveis = useMemo(
    () => cards.filter((c) => RECUPERAVEL_CLASSES.includes(c.classification)),
    [cards],
  )
  // TOP-3 REAIS: hot+warm, com mensagem pronta, por dealValue desc.
  const realTop = useMemo(
    () =>
      recuperaveis
        .filter((c) => !!c.followupMessage)
        .sort((a, b) => b.dealValue - a.dealValue)
        .slice(0, 3),
    [recuperaveis],
  )

  // Seed-mode: sem oportunidade real acionável → mostra exemplos (tela NUNCA vazia).
  // Cobre os 3 casos mortos: sem análise, análise rodando 1ª vez, análise com 0 hot/warm.
  const isSeed = realTop.length === 0

  const handleSent = (item: OpportunityCardData) => {
    setSentIds((prev) => {
      const next = new Set(prev)
      next.add(item.id)
      return next
    })
  }
  const handleBulkDone = ({ sent, failed }: { sent: number; failed: number }) => {
    // Só some com os cards se TODOS foram enviados; com falha parcial mantém
    // tudo visível pra reenviar — não esconde falha.
    if (failed === 0 && sent > 0) {
      setSentIds((prev) => {
        const next = new Set(prev)
        realTop.forEach((c) => next.add(c.id))
        return next
      })
    }
    setBulkOpen(false)
  }

  const nudges = orgId && !isSuperAdmin() ? (
    <SalaoActivationChecklist organizationId={orgId} />
  ) : null
  const greeting = firstName ? `Olá, ${firstName}` : 'Olá'

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

  // Dados a exibir: reais ou exemplo.
  const displayCards = isSeed ? SEED_OPPORTUNITIES : cards
  const displayRecuperaveis = isSeed ? SEED_OPPORTUNITIES : recuperaveis
  const displayTop = isSeed ? SEED_OPPORTUNITIES : realTop
  const displayTotal = displayRecuperaveis.reduce((acc, c) => acc + c.dealValue, 0)

  const realSubtitle = latest
    ? `Análise de ${formatDistanceToNow(new Date(latest.created_at), { addSuffix: true, locale: ptBR })}`
    : undefined

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <OnboardingBanner />
      {nudges}
      <Header greeting={greeting} />

      {isSeed && <SeedBanner onAnalyze={handleAnalyze} isAnalyzing={isAnalyzing} running={!!running} />}

      <MoneyHeadline
        total={displayTotal}
        count={displayRecuperaveis.length}
        subtitle={
          isSeed
            ? 'Exemplo — é assim que vai aparecer quando você conectar seu WhatsApp'
            : realSubtitle
        }
        action={
          isSeed ? undefined : (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isAnalyzing ? 'Atualizando…' : 'Atualizar agora'}
            </Button>
          )
        }
      />

      {running && !isSeed && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          Sua IA está atualizando a análise…
        </div>
      )}

      <BucketCards cards={displayCards} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-foreground">
            {isSeed
              ? 'Exemplos de oportunidades que sua IA encontra'
              : 'As 3 melhores oportunidades de hoje'}
          </h2>
          {isSeed ? (
            <Button asChild className="gap-1.5">
              <Link to={WHATSAPP_CONNECT_TO}>
                <MessageCircle className="h-4 w-4" />
                Conectar meu WhatsApp
              </Link>
            </Button>
          ) : (
            <Button onClick={() => setBulkOpen(true)} className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              Disparar reativação pra todas ({displayTop.length})
            </Button>
          )}
        </div>
        <div className="space-y-3">
          {displayTop.map((card) => (
            <OpportunityCard key={card.id} card={card} seed={isSeed} onSent={handleSent} />
          ))}
        </div>
      </section>

      {!isSeed && (
        <BulkReactivationDialog
          items={realTop}
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          onDone={handleBulkDone}
        />
      )}
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

// Faixa de exemplo: deixa explícito que os números são ilustrativos e oferece
// o caminho real (conectar WhatsApp) + atalho pra quem já conectou.
function SeedBanner({
  onAnalyze,
  isAnalyzing,
  running,
}: {
  onAnalyze: () => void
  isAnalyzing: boolean
  running: boolean
}) {
  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardContent className="py-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            Estes números são um exemplo
          </div>
          <p className="text-sm text-muted-foreground max-w-prose">
            {running
              ? 'Sua IA está analisando suas conversas… em instantes os números reais aparecem aqui.'
              : 'Conecte seu WhatsApp pra sua IA varrer suas conversas e mostrar quanto VOCÊ pode recuperar de verdade.'}
          </p>
        </div>
        {running ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm">
              <Link to={WHATSAPP_CONNECT_TO}>Conectar WhatsApp</Link>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onAnalyze} disabled={isAnalyzing}>
              {isAnalyzing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Já conectei — analisar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
