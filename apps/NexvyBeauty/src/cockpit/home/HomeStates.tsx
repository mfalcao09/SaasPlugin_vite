// ─── Estados da Home (loading / vazio / analisando) ──────────────────────
// PREMISSA: nunca tela morta. Estes blocos cobrem os 3 estados sem dados
// prontos. Chamados por HomeDeValor.tsx.

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, Loader2 } from 'lucide-react'

/** Esqueletos do card de dinheiro + 3 baldes enquanto carregamos as análises. */
export function HomeLoading() {
  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardContent className="py-6 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-4 w-72" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="py-4 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

/** Nenhuma análise existe ainda: convida a dona a rodar a primeira. */
export function HomeEmpty({
  onAnalyze,
  isAnalyzing,
}: {
  onAnalyze: () => void
  isAnalyzing: boolean
}) {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardContent className="py-16 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Sua IA ainda não rodou a primeira análise
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Ela vai ler suas conversas e mostrar quais clientes dá para reconquistar —
            com a mensagem já pronta para enviar.
          </p>
        </div>
        <Button onClick={onAnalyze} disabled={isAnalyzing} className="gap-2">
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando suas conversas…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Analisar agora
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

/** Análise em andamento (sem resultado anterior pra mostrar). */
export function HomeAnalyzing() {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-12 text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Analisando suas conversas…</p>
          <p className="text-sm text-muted-foreground">
            Sua IA está lendo cada conversa. As oportunidades aparecem aqui em instantes.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
