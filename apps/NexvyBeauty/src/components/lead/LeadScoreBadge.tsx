// A1 — Visualização do lead score (0-100) com decay.
// O score é recalculado no banco (recompute_lead_scores, cron diário): temperatura
// + progresso de etapa − decay temporal. Aqui só renderizamos o valor já calculado.
import { cn } from '@/lib/utils';

export function scoreTier(score: number) {
  if (score >= 70) return { text: 'text-emerald-600', bg: 'bg-emerald-500/10', bar: 'bg-emerald-500', label: 'Quente' };
  if (score >= 40) return { text: 'text-amber-600', bg: 'bg-amber-500/10', bar: 'bg-amber-500', label: 'Morno' };
  return { text: 'text-slate-500', bg: 'bg-slate-500/10', bar: 'bg-slate-400', label: 'Frio' };
}

interface LeadScoreBadgeProps {
  score: number | null | undefined;
  /** mostra a barrinha de progresso ao lado do número (default: true) */
  showBar?: boolean;
  className?: string;
}

/**
 * Pílula compacta com o score numérico + (opcional) mini-barra de progresso.
 * `score == null` (lead nunca pontuado) renderiza um traço neutro.
 */
export function LeadScoreBadge({ score, showBar = true, className }: LeadScoreBadgeProps) {
  if (score === null || score === undefined) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>;
  }
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const t = scoreTier(s);
  return (
    <div className={cn('inline-flex items-center gap-2', className)} title={`Score ${s} · ${t.label}`}>
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-[2.25rem] h-6 px-1.5 rounded-md text-xs font-semibold tabular-nums',
          t.bg,
          t.text,
        )}
      >
        {s}
      </span>
      {showBar && (
        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden" aria-hidden>
          <div className={cn('h-full rounded-full transition-all', t.bar)} style={{ width: `${s}%` }} />
        </div>
      )}
    </div>
  );
}
