// ─── Baldes por temperatura (hot/warm/cold) ─────────────────────────────
// Três cartões resumindo soma(dealValue) + contagem por classificação. Sem
// jargão: a dona vê "Prontas pra fechar / Vale um lembrete / Esfriaram".
// Chamado por HomeDeValor.tsx.

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { OpportunityCardData, OpportunityClass } from '@/cockpit/types'
import { formatBRL, CLASS_LABEL, CLASS_HINT, CLASS_ACCENT } from './format'

const BUCKETS: OpportunityClass[] = ['hot', 'warm', 'cold']

export function BucketCards({ cards }: { cards: OpportunityCardData[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {BUCKETS.map((klass) => {
        const inBucket = cards.filter((c) => c.classification === klass)
        const sum = inBucket.reduce((acc, c) => acc + c.dealValue, 0)
        return (
          <Card key={klass} className={cn('border', CLASS_ACCENT[klass])}>
            <CardContent className="py-4 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{CLASS_LABEL[klass]}</span>
                <span className="text-xs opacity-80">
                  {inBucket.length} {inBucket.length === 1 ? 'cliente' : 'clientes'}
                </span>
              </div>
              <div className="text-2xl font-bold tracking-tight">{formatBRL(sum)}</div>
              <p className="text-xs opacity-80">{CLASS_HINT[klass]}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
