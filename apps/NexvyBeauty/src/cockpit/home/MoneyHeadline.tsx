// ─── Headline de dinheiro recuperável ───────────────────────────────────
// O AHA da Home: em <30s a dona vê quanto dá pra recuperar esta semana e
// quantas clientes estão por trás disso. Reusa o tom da plataforma (primary +
// gradiente) já visto no RadarPanel.

import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles, TrendingUp } from 'lucide-react'
import { formatBRL } from './format'

interface MoneyHeadlineProps {
  total: number
  count: number
  /** legenda discreta sob o valor (ex: "Análise de há 2 horas") */
  subtitle?: string
  /** ação à direita (ex: botão "Atualizar agora") */
  action?: ReactNode
}

export function MoneyHeadline({ total, count, subtitle, action }: MoneyHeadlineProps) {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardContent className="py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <TrendingUp className="h-4 w-4" />
              Recuperável esta semana
            </div>
            <div className="text-4xl font-bold tracking-tight text-foreground">
              {formatBRL(total)}
            </div>
            <p className="text-sm text-muted-foreground">
              {count > 0 ? (
                <>
                  Sua IA encontrou{' '}
                  <span className="font-semibold text-foreground">
                    {count} {count === 1 ? 'cliente' : 'clientes'}
                  </span>{' '}
                  que dá pra reconquistar com uma mensagem.
                </>
              ) : (
                'Sua IA não encontrou clientes pra reconquistar agora — bom sinal, sua base está em dia.'
              )}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground/80 pt-1">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Sparkles className="h-5 w-5 text-primary/60" />
            {action}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
