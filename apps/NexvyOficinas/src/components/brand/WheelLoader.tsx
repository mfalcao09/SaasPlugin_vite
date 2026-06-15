// ─── WheelLoader — loader global: roda de liga girando ─────────────
// Substitui o Loader2 nos loaders de página inteira (conceito v7
// aprovado: roda única). Paleta fixa escura no corpo (pneu/liga são
// "objetos físicos", funcionam em light e dark) + acentos no primary.

import { cn } from '@/lib/utils';

interface WheelLoaderProps {
  size?: number;
  label?: string;
  className?: string;
}

export function WheelLoader({ size = 64, label, className }: WheelLoaderProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3', className)}
      role="status"
      aria-label={label ?? 'Carregando'}
    >
      <svg
        className="animate-spin"
        style={{ animationDuration: '1.15s' }}
        width={size}
        height={size}
        viewBox="0 0 120 120"
        aria-hidden="true"
      >
        <circle cx="60" cy="60" r="54" fill="#161a23" />
        <circle cx="60" cy="60" r="53" fill="none" stroke="#303642" strokeWidth="7" strokeDasharray="5.5 4.5" />
        <circle cx="60" cy="60" r="46" fill="none" stroke="#0e1118" strokeWidth="6" />
        <circle cx="60" cy="60" r="40" fill="#1d222e" stroke="#3a4250" strokeWidth="1.5" />
        <g stroke="#737e92" strokeWidth="5" strokeLinecap="round">
          <line x1="60" y1="58" x2="60" y2="25" />
          <line x1="62" y1="59" x2="93" y2="49" />
          <line x1="61" y1="62" x2="80" y2="89" />
          <line x1="59" y1="62" x2="40" y2="89" />
          <line x1="58" y1="59" x2="27" y2="49" />
        </g>
        <g stroke="#3f4756" strokeWidth="5" strokeLinecap="round">
          <line x1="60" y1="56" x2="60" y2="30" />
          <line x1="62" y1="58" x2="88" y2="50" />
          <line x1="61" y1="61" x2="77" y2="84" />
          <line x1="59" y1="61" x2="43" y2="84" />
          <line x1="58" y1="58" x2="32" y2="50" />
        </g>
        <circle cx="60" cy="60" r="13" fill="#10141d" stroke="#3a4250" strokeWidth="1.5" />
        <g fill="#5b6577">
          <circle cx="60" cy="52.5" r="2" />
          <circle cx="67" cy="57.5" r="2" />
          <circle cx="64.4" cy="65.8" r="2" />
          <circle cx="55.6" cy="65.8" r="2" />
          <circle cx="53" cy="57.5" r="2" />
        </g>
        <circle cx="60" cy="60" r="5" fill="hsl(var(--primary))" />
      </svg>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}
