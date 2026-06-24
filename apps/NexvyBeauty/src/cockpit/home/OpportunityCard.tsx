// ─── Card de oportunidade (TOP-3) ───────────────────────────────────────
// Mostra a cliente, o porquê (reason) e a mensagem pronta que a IA escreveu,
// num box em itálico. Botão real de reativação vem do WS3 (ReactivationButton).
// Em seed-mode (exemplo) o botão vira "Conecte pra disparar" (link p/ conexões)
// — ou, no demo público, um CTA de conversão via onSeedCta. Chamado por
// HomeDeValor.tsx (app logado) e DemoCockpitHome.tsx (demo público).

import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReactivationButton } from '@/cockpit/reactivation/ReactivationButton'
import type { OpportunityCardData } from '@/cockpit/types'
import { formatBRL, CLASS_LABEL, CLASS_ACCENT } from './format'

interface OpportunityCardProps {
  card: OpportunityCardData
  onSent?: (item: OpportunityCardData) => void
  /** exemplo (conta sem dado real): não dispara envio, mostra CTA conectar */
  seed?: boolean
  /** demo público: clicar no card chama isto (ex.: abrir captura de lead) em
   *  vez de linkar p/ a área logada. Só usado quando seed=true. */
  onSeedCta?: () => void
  /** rótulo do CTA do card no demo (default: "Quero isso no meu salão"). */
  seedCtaLabel?: string
}

export function OpportunityCard({ card, onSent, seed, onSeedCta, seedCtaLabel }: OpportunityCardProps) {
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{card.name}</div>
            {card.reason && (
              <p className="text-sm text-muted-foreground mt-0.5">{card.reason}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm font-semibold text-foreground">
              {formatBRL(card.dealValue)}
            </span>
            <Badge variant="outline" className={cn('text-[10px]', CLASS_ACCENT[card.classification])}>
              {CLASS_LABEL[card.classification]}
            </Badge>
          </div>
        </div>

        {card.followupMessage && (
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm italic text-muted-foreground">
            "{card.followupMessage}"
          </div>
        )}

        <div className="flex justify-end">
          {seed ? (
            onSeedCta ? (
              <Button onClick={onSeedCta} size="sm" className="gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                {seedCtaLabel ?? 'Quero isso no meu salão'}
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/admin?tab=connections">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Conecte pra disparar
                </Link>
              </Button>
            )
          ) : (
            <ReactivationButton item={card} onSent={onSent} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
