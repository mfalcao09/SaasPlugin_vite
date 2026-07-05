import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformCrmOpportunityScans } from '../data/usePlatformCrmRadar';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye, Clock, CheckCircle2, XCircle, History } from 'lucide-react';

/**
 * Histórico de análises do Radar IA.
 * PORTE 1:1 de `admin/radar/RadarHistory.tsx` do CRM Vendus.
 * Dados via hook stub do platform (TODO(edge)) — renderiza o empty-state 1:1.
 */

export function RadarHistory({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: scans, isLoading } = usePlatformCrmOpportunityScans();

  if (isLoading) {
    // Skeleton anatômico das linhas do histórico (§3.1) — sem spinner central.
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de análises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-3 flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-8 w-16 rounded-md shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!scans?.length) {
    // Empty HONESTO (§3.1): ícone + o que fazer para ter histórico.
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhuma análise realizada ainda</p>
          <p className="text-xs text-muted-foreground mt-1">
            Rode o Radar na aba <span className="font-medium">Rodar Análise</span> — cada execução
            aparece aqui para você revisitar depois.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de análises</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {scans.map((s) => {
          const Icon =
            s.status === 'completed' ? CheckCircle2 : s.status === 'error' ? XCircle : Clock;
          const iconColor =
            s.status === 'completed'
              ? 'text-green-500'
              : s.status === 'error'
                ? 'text-destructive'
                : 'text-orange-500';
          return (
            <div
              key={s.id}
              className="border rounded-lg p-3 flex items-center justify-between hover:bg-muted/30 transition-colors gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ptBR })}
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {s.trigger_type}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                    <span>🔥 {s.hot_count}</span>
                    <span>🌤️ {s.warm_count}</span>
                    <span>❄️ {s.cold_count}</span>
                    <span>💀 {s.lost_count}</span>
                    <span>•</span>
                    <span>R$ {Number(s.potential_revenue || 0).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onSelect(s.id)}>
                <Eye className="h-3 w-3" /> Ver
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
