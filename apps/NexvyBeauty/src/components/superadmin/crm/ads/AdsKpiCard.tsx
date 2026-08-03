import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * NexvyAds — card de KPI com delta vs período anterior. Adaptado do padrão
 * KpiCardWithDelta do hub, mas SEM as deps do hub (motion/react, NumberFlow) e
 * estilizado 100% com os tokens do NexvyBeauty (tema rosé, dark-aware).
 *
 * `delta` é a variação percentual (ex.: 12.4 = +12,4%). `higherIsBetter` define
 * a cor: para gasto/CPC/CPM/CPA um delta negativo é BOM (verde); para
 * ROAS/CTR/conversões um delta positivo é bom. Quando o período anterior é
 * zero (delta indefinido), passe `delta = null` e o selo some.
 */
export interface AdsKpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  isLoading?: boolean;
  /** Variação percentual vs período anterior (null = sem base de comparação). */
  delta?: number | null;
  /** true = subir é bom (ROAS, conversões); false = subir é ruim (CPA, gasto). */
  higherIsBetter?: boolean;
  featured?: boolean;
  className?: string;
}

export function AdsKpiCard({
  title,
  value,
  icon: Icon,
  isLoading,
  delta,
  higherIsBetter = true,
  featured = false,
  className,
}: AdsKpiCardProps) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const isGood = hasDelta ? (higherIsBetter ? (delta as number) > 0 : (delta as number) < 0) : false;
  const isNeutral = hasDelta && (delta as number) === 0;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border transition-shadow duration-200 hover:shadow-md',
        featured
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-border bg-card text-card-foreground',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              featured ? 'bg-primary/20' : 'bg-primary/10',
            )}
          >
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="mt-1 h-8 w-28" />
        ) : (
          <div className="flex items-end gap-2 flex-wrap">
            <span className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
              {value}
            </span>
            {hasDelta && (
              <span
                className={cn(
                  'mb-0.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
                  isNeutral
                    ? 'bg-muted text-muted-foreground'
                    : isGood
                      ? 'bg-success/15 text-success'
                      : 'bg-destructive/10 text-destructive',
                )}
              >
                {(delta as number) > 0 ? (
                  <TrendingUp className="mr-0.5 h-2.5 w-2.5" />
                ) : (delta as number) < 0 ? (
                  <TrendingDown className="mr-0.5 h-2.5 w-2.5" />
                ) : (
                  <Minus className="mr-0.5 h-2.5 w-2.5" />
                )}
                {(delta as number) > 0 ? '+' : ''}
                {(delta as number).toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdsKpiCard;
