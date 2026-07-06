// ─── WheelLoader — loader global neutro (NexvyBeauty) ──────────────
// Mantém a MESMA API do componente do Oficinas (size/label/className)
// para não tocar os call-sites (App.tsx PageLoader, ModuleHub hold).
// Visual neutro: arco girando na cor da marca (--primary).

import { cn } from '@/lib/utils';

interface WheelLoaderProps {
  size?: number;
  label?: string;
  className?: string;
}

export function WheelLoader({ size = 64, label, className }: WheelLoaderProps) {
  const stroke = Math.max(3, Math.round(size * 0.09));
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3', className)}
      role="status"
      aria-label={label ?? 'Carregando'}
    >
      <svg
        className="animate-spin"
        style={{ animationDuration: '0.9s' }}
        width={size}
        height={size}
        viewBox="0 0 50 50"
        aria-hidden="true"
      >
        <circle cx="25" cy="25" r="20" fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx="25" cy="25" r="20"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray="90 150"
        />
      </svg>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}
