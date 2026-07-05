import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Seção do Painel de Atendimentos (Fila / Agentes IA / Humanos).
 * FORMA F3/§1.3: accents por TOKEN semântico (warning/primary/success) —
 * PROIBIDO cor de marca hardcoded ou override `dark:` por tela (§1.2). O
 * warning/emerald aqui codificam SIGNIFICADO de domínio (fila em espera,
 * atendente humano ativo), não a marca, por isso são permitidos (§1.3).
 */

interface Props {
  title: string;
  icon: ReactNode;
  count: number;
  /** Contexto semântico da seção — mapeia para tokens, nunca hue de marca. */
  accent: 'warning' | 'primary' | 'success';
  children: ReactNode;
}

// RESTRIÇÃO §1.2/§1.3: só tokens semânticos; sem `text-amber-700 dark:…`.
const accentTitle: Record<Props['accent'], string> = {
  warning: 'text-warning',
  primary: 'text-primary',
  success: 'text-emerald-600',
};

const accentDot: Record<Props['accent'], string> = {
  warning: 'bg-warning',
  primary: 'bg-primary',
  success: 'bg-emerald-500',
};

const accentBadge: Record<Props['accent'], string> = {
  warning: 'bg-warning/10 text-warning',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600',
};

export function PanelSection({ title, icon, count, accent, children }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className={cn('h-2 w-2 rounded-full', accentDot[accent])} />
        <div className={cn('flex items-center gap-2', accentTitle[accent])}>
          {icon}
          {/* §1.4: micro-label de seção — semibold, não bold. */}
          <h2 className="text-[13px] font-semibold uppercase tracking-wider">{title}</h2>
        </div>
        {/* §3.4: contador SEMPRE visível (pílula tokenizada, inclusive em 0). */}
        <span
          className={cn(
            'inline-flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
            count > 0 ? accentBadge[accent] : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex gap-3 overflow-x-auto snap-x pb-2 -mx-1 px-1">{children}</div>
    </section>
  );
}
