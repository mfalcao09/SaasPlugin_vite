// ─── RoadProgress — barra de progresso neutra (NexvyBeauty) ────────
// Mantém a MESMA API do componente do Oficinas (value/className) para
// não tocar o call-site (GuidedOnboarding). Visual neutro: trilho +
// preenchimento na cor da marca (--primary). Sem metáfora de estrada.

import { cn } from '@/lib/utils';

interface RoadProgressProps {
  /** progresso 0–100 */
  value: number;
  className?: string;
}

export function RoadProgress({ value, className }: RoadProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
