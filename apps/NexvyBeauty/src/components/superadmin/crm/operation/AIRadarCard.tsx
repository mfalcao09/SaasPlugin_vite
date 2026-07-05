import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Flame, AlertTriangle, DollarSign, Calendar, Users, ChevronRight, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RadarInsight } from '@/components/superadmin/crm/data/usePlatformCrmOperationCenter';

interface Props {
  items?: RadarInsight[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onNavigate: (section: string) => void;
}

// O TIPO do insight escolhe o ícone; a cor do wrapper é sempre o token de marca
// (F3: bg-primary/10 text-primary) — nada de hex/cor de marca suave hardcoded.
const iconByKind: Record<RadarInsight['icon'], LucideIcon> = {
  fire: Flame,
  warn: AlertTriangle,
  money: DollarSign,
  calendar: Calendar,
  users: Users,
};

export function AIRadarCard({ items, isLoading, isError, onRetry, onNavigate }: Props) {
  // Estado de erro (§3.1): banner com retry — NUNCA silenciar mostrando
  // "Sem alertas" sem dados (senão o radar mente que está tudo limpo).
  if (isError) {
    return (
      <Card className="border-border h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Radar IA
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 flex flex-col items-center text-center gap-2">
          <AlertCircle className="h-8 w-8 text-destructive/70" />
          <p className="text-sm text-muted-foreground">Não foi possível carregar o radar.</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
              Tentar novamente
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Skeleton anatômico (§3.1): ícone + 2 linhas de texto por insight.
  if (isLoading) {
    return (
      <Card className="border-border h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Radar IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 p-2.5">
              <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const data = items ?? [];
  return (
    <Card className="border-border h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Radar IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <div className="py-8 flex flex-col items-center text-center gap-2">
            <Sparkles className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">Sem alertas</p>
            <p className="text-xs text-muted-foreground">Nada exige atenção agora.</p>
          </div>
        ) : (
          data.map((i) => {
            const Icon = iconByKind[i.icon];
            return (
              <button
                key={i.id}
                onClick={() => i.navigateTo && onNavigate(i.navigateTo)}
                aria-label={i.title}
                className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground leading-tight">{i.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{i.hint}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
