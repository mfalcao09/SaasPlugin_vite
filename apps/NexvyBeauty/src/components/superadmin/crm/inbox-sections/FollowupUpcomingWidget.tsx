import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Widget "Próximos disparos" da seção Follow-Up (família F3). Restyle de FORMA
 * sobre o porte 1:1 do CRM Vendus: contrato intacto; tons de urgência agora por
 * TOKEN/§1.3 (proibido violet decorativo) — iminente=emerald (atividade viva),
 * próximo=primary (azul), 1h=warning (âmbar), tardio=muted. Cada linha é uma
 * ação rápida (filtra a fila por "aguardando próxima").
 */

interface Props {
  data?: { in_5m: number; in_15m: number; in_30m: number; in_1h: number; in_2h: number; after_24h: number };
  onBucketClick?: () => void;
}

export function FollowupUpcomingWidget({ data, onBucketClick }: Props) {
  const rows = [
    { label: 'Em 5 minutos', value: data?.in_5m ?? 0, tone: 'text-emerald-600', icon: Clock },
    { label: 'Em 15 minutos', value: data?.in_15m ?? 0, tone: 'text-primary', icon: Clock },
    { label: 'Em 30 minutos', value: data?.in_30m ?? 0, tone: 'text-primary', icon: Clock },
    { label: 'Em 1 hora', value: data?.in_1h ?? 0, tone: 'text-amber-600', icon: Clock },
    { label: 'Em 2 horas', value: data?.in_2h ?? 0, tone: 'text-muted-foreground', icon: Clock },
    { label: 'Após 24 horas', value: data?.after_24h ?? 0, tone: 'text-muted-foreground', icon: AlertTriangle },
  ];
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Próximos disparos</CardTitle>
        <p className="text-[11px] text-muted-foreground">Acompanhe os próximos envios programados</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.label}
              onClick={onBucketClick}
              aria-label={`${r.label}: ${r.value} leads — filtrar fila`}
              className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-muted transition-colors text-left"
            >
              <span className="flex items-center gap-2 text-sm">
                <Icon className={cn('h-4 w-4 flex-shrink-0', r.tone)} />
                {r.label}
              </span>
              <span className="text-sm">
                <span className="font-semibold tabular-nums">{r.value}</span>
                <span className="text-muted-foreground ml-1">leads</span>
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
