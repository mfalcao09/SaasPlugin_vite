import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareDashed } from 'lucide-react';
import { ConversationMiniCard } from './ConversationMiniCard';
import type { PlatformPanelConversation } from '../data/usePlatformCrmAttendancePanel';

/**
 * Coluna de conversas do Painel de Atendimentos (por setor/agente/atendente).
 * CASCA LUX: container `.surface-card` + header identitário com pílula-ícone
 * (cor do setor) OU avatar `navy-gradient` (agentes IA / atendentes), título +
 * pílula count tokenizada. Estrutura, itens e `onCardClick` intocados.
 */

interface Props {
  title: string;
  subtitle?: string;
  count: number;
  color?: string | null;
  avatarUrl?: string | null;
  initials?: string;
  icon?: ReactNode;
  items: PlatformPanelConversation[];
  onCardClick: (id: string) => void;
  /**
   * Contexto semântico da coluna. `warning` = fila em espera (§1.3), via TOKEN
   * canônico — espelha o `PanelSection` irmão. `amber` é alias legado do mesmo
   * significado (retrocompat).
   */
  accent?: 'primary' | 'warning' | 'amber' | 'emerald' | 'violet';
}

// §1.2/§1.3: só tokens semânticos — sem override `dark:` por tela nem hex de
// marca. `warning`/`amber` codificam SIGNIFICADO (fila em espera/atenção).
const accentBg: Record<NonNullable<Props['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/15 text-warning',
  amber: 'bg-warning/15 text-warning',
  emerald: 'bg-emerald-500/15 text-emerald-600',
  violet: 'bg-violet-500/15 text-violet-600',
};

const accentPill: Record<NonNullable<Props['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/10 text-warning',
  amber: 'bg-warning/10 text-warning',
  emerald: 'bg-emerald-500/10 text-emerald-600',
  violet: 'bg-violet-500/10 text-violet-600',
};

export function PanelColumn({
  title,
  subtitle,
  count,
  color,
  avatarUrl,
  initials,
  icon,
  items,
  onCardClick,
  accent = 'primary',
}: Props) {
  return (
    <div className="surface-card flex w-72 shrink-0 snap-start flex-col overflow-hidden">
      {/* Header identitário: pílula-ícone (setor) OU avatar navy-gradient (pessoa) */}
      <div className="flex items-center gap-2.5 border-b hairline p-3">
        {icon ? (
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              accentBg[accent],
            )}
            style={color ? { backgroundColor: `${color}20`, color } : undefined}
          >
            {icon}
          </div>
        ) : avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-9 w-9 rounded-xl object-cover shadow-sm" />
        ) : (
          <div className="navy-gradient flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-semibold text-white shadow-sm">
            {initials || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold leading-tight" title={title}>
              {title}
            </span>
            <span
              className={cn(
                'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                count > 0 ? accentPill[accent] : 'bg-muted text-muted-foreground',
              )}
            >
              {count}
            </span>
          </div>
          {subtitle && (
            <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <ScrollArea className="h-[420px]">
        <div className="space-y-1.5 p-2">
          {items.length === 0 ? (
            // Vazio de coluna (§3.1): mesma anatomia nova — ícone esmaecido + dica.
            <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
              <MessageSquareDashed className="h-7 w-7 text-muted-foreground opacity-30" />
              <p className="text-[11px] text-muted-foreground">Nenhuma conversa</p>
            </div>
          ) : (
            items.map((c) => (
              <ConversationMiniCard key={c.id} conversation={c} onClick={onCardClick} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
