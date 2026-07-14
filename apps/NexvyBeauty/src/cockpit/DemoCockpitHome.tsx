// ─── Demo PÚBLICO da Home de Valor (V5 — "o demo que se vende sozinho") ──
// Rota pública /demo/cockpit (SEM login). Reusa as peças PURAS da Home
// (MoneyHeadline/BucketCards/OpportunityCard-seed) com SEED_OPPORTUNITIES e
// ZERO hooks de auth/dados/Supabase — o prospect vê a IA achando dinheiro em
// <30s e converte pelo funil REAL (LeadCaptureModal, igual à SalesPage).
//
// Por que componente próprio (não prop `demo` na HomeDeValor): a HomeDeValor
// chama useAuth/useOpportunityScans/useGuidedOnboarding no topo (Regras de
// Hooks), e os CTAs do seed apontam pra /admin (área logada). Aqui isolamos
// tudo: nenhum hook de sessão, CTAs de conversão.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Sparkles, ArrowRight, LogIn } from 'lucide-react'
import { MoneyHeadline } from '@/cockpit/home/MoneyHeadline'
import { BucketCards } from '@/cockpit/home/BucketCards'
import { OpportunityCard } from '@/cockpit/home/OpportunityCard'
import { SEED_OPPORTUNITIES } from '@/cockpit/home/seedOpportunities'
import { RECUPERAVEL_CLASSES } from '@/cockpit/types'
import { LeadCaptureModal } from '@/components/sales/LeadCaptureModal'

const recuperaveis = SEED_OPPORTUNITIES.filter((c) => RECUPERAVEL_CLASSES.includes(c.classification))
const TOTAL = recuperaveis.reduce((acc, c) => acc + c.dealValue, 0)

export default function DemoCockpitHome() {
  const [buyOpen, setBuyOpen] = useState(false)
  const openBuy = () => setBuyOpen(true)

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar pública (estática — sem auth) */}
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            NexvyBeauty
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/login"><LogIn className="h-4 w-4" /> Entrar</Link>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openBuy}>
              Começar grátis <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Hero / framing honesto */}
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Demonstração · dados de exemplo
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground pt-2">
            É assim que a sua EquipIA acha dinheiro para você
          </h1>
          <p className="text-sm text-muted-foreground">
            Toda manhã ela varre suas conversas e te entrega quem dá para reconquistar — com a mensagem já pronta.
          </p>
        </div>

        <MoneyHeadline
          total={TOTAL}
          count={recuperaveis.length}
          subtitle="Exemplo do que aparece no seu Início assim que você conecta o WhatsApp"
          action={
            <Button onClick={openBuy} className="gap-1.5">
              Quero isso no meu negócio <ArrowRight className="h-4 w-4" />
            </Button>
          }
        />

        <BucketCards cards={SEED_OPPORTUNITIES} />

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">As 3 melhores oportunidades de hoje</h2>
          <div className="space-y-3">
            {SEED_OPPORTUNITIES.map((card) => (
              <OpportunityCard
                key={card.id}
                card={card}
                seed
                onSeedCta={openBuy}
                seedCtaLabel="Disparar no meu negócio"
              />
            ))}
          </div>
        </section>

        {/* CTA final */}
        <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 text-center space-y-3">
          <h3 className="text-lg font-semibold text-foreground">Pronto para ver os SEUS números?</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Conecte seu WhatsApp e a sua EquipIA mostra quanto VOCÊ pode recuperar essa semana — de verdade.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            <Button size="lg" onClick={openBuy} className="gap-1.5">
              Começar grátis <ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/demo/salao">Ver o painel do negócio</Link>
            </Button>
          </div>
        </div>
      </main>

      <LeadCaptureModal open={buyOpen} onOpenChange={setBuyOpen} />
    </div>
  )
}
