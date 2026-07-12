import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';

/**
 * KPI Card dos Relatórios de Atendimento do CRM de PLATAFORMA (super_admin).
 * PORTE 1:1 de `admin/webchat/reports/KpiCard.tsx` do CRM Vendus — componente
 * puramente visual, sem camada de dados (nenhuma adaptação necessária).
 */

export type KpiTone = 'neutral' | 'amber' | 'primary' | 'destructive' | 'success';

const toneIconBg: Record<KpiTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  primary: 'bg-primary/10 text-primary',
  destructive: 'bg-destructive/10 text-destructive',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
};

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  invertDelta?: boolean; // tempo de resposta: subir é ruim
  tone?: KpiTone;
  icon?: LucideIcon;
}

export function KpiCard({ label, value, hint, delta, invertDelta, tone = 'neutral', icon: Icon }: KpiCardProps) {
  const showDelta = typeof delta === 'number' && Number.isFinite(delta);
  const isUp = showDelta && delta! > 0;
  const isDown = showDelta && delta! < 0;
  const isGood = invertDelta ? isDown : isUp;
  const isBad = invertDelta ? isUp : isDown;
  const deltaClass = showDelta
    ? delta === 0
      ? 'text-muted-foreground'
      : isGood
        ? 'text-emerald-600 dark:text-emerald-400'
        : isBad
          ? 'text-destructive'
          : 'text-muted-foreground'
    : 'text-muted-foreground';
  const DeltaIcon = showDelta ? (delta === 0 ? Minus : delta! > 0 ? ArrowUpRight : ArrowDownRight) : Minus;

  return (
    <Card className="rounded-2xl border bg-card p-5 shadow-sm h-full">
      {/* SIMETRIA (Marcelo 07-12): h-full + coluna flex com rodapé em mt-auto →
          cards da linha têm a mesma altura e o hint/delta alinha no pé de todos. */}
      <div className="flex h-full items-stretch justify-between gap-3">
        <div className="min-w-0 flex-1 flex flex-col">
          <p className="text-sm font-medium text-muted-foreground truncate">{label}</p>
          <p className={cn(
            'mt-2 text-3xl font-bold tabular-nums tracking-tight leading-tight',
            tone === 'destructive' && 'text-destructive',
            tone === 'amber' && 'text-amber-700 dark:text-amber-300',
            tone === 'success' && 'text-emerald-700 dark:text-emerald-400',
            tone === 'primary' && 'text-primary',
          )}>
            {value}
          </p>
          <div className="mt-auto pt-2 flex min-h-[20px] items-center gap-1.5 text-xs">
            {showDelta && (
              <span className={cn('inline-flex items-center gap-0.5 font-medium', deltaClass)}>
                <DeltaIcon className="h-3.5 w-3.5" />
                {delta === 0 ? '0%' : `${delta! > 0 ? '+' : ''}${delta!.toFixed(0)}%`}
              </span>
            )}
            {hint && <span className="text-muted-foreground truncate">{hint}</span>}
          </div>
        </div>
        {Icon && (
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl shrink-0', toneIconBg[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}
