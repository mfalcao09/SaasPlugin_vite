import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Widget "Próximos disparos" da seção Follow-Up na anatomia LUX. Restyle de
 * FORMA sobre o porte 1:1 do CRM Vendus: contrato intacto; casca `.surface-card`;
 * cada linha é um card-ação `.surface-card-hover` (hover eleva -2px) que filtra a
 * fila por "aguardando próxima". Tons de urgência = cores de SIGNIFICADO (§1.3):
 * iminente=emerald (atividade viva), 1h=âmbar (atenção), tardio=muted; próximo
 * segue o `text-primary` (dourado no tema lux).
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
    <div className="surface-card p-5 h-full flex flex-col">
      <div className="pb-3">
        <h3 className="text-sm font-semibold">Próximos disparos</h3>
        <p className="text-[11px] text-muted-foreground">Acompanhe os próximos envios programados</p>
      </div>
      <div className="space-y-2 flex-1">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.label}
              onClick={onBucketClick}
              aria-label={`${r.label}: ${r.value} leads — filtrar fila`}
              className="surface-card surface-card-hover w-full flex items-center justify-between px-3.5 py-2.5 text-left"
            >
              <span className="flex items-center gap-2.5 text-sm">
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
      </div>
    </div>
  );
}
