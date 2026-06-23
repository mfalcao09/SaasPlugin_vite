// ─── Card de oportunidade (TOP-3) ───────────────────────────────────────
// Mostra a cliente, o porquê (reason) e a mensagem pronta que a IA escreveu,
// num box em itálico (mesmo padrão visual do RadarDashboard). O botão de
// reativação vem do WS3 (ReactivationButton). Chamado por HomeDeValor.tsx.

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ReactivationButton } from '@/cockpit/reactivation/ReactivationButton'
import type { OpportunityCardData } from '@/cockpit/types'
import { formatBRL, CLASS_LABEL, CLASS_ACCENT } from './format'

interface OpportunityCardProps {
  card: OpportunityCardData
  onSent: (item: OpportunityCardData) => void
}

export function OpportunityCard({ card, onSent }: OpportunityCardProps) {
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
          <ReactivationButton item={card} onSent={onSent} />
        </div>
      </CardContent>
    </Card>
  )
}
