import { Smile } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Reações por emoji da inbox do CRM de PLATAFORMA (picker + lista).
 * PORTE de `seller/inbox/MessageReactions.tsx` (CRM Vendus) — trocas: dado
 * (o tipo `ReactionSummary` do hook tenant `useMessageReactions` vira o tipo
 * local `PlatformCrmReactionSummary` — desacoplamento do canal/tenant); tema já
 * usa tokens (`primary`/`muted`/`border`); UI 1:1 (mesmo popover-pílula e chips).
 *
 * Nota A1: `platform_crm_messages` ainda NÃO materializa reações (a bolha portada
 * documenta "sem reações"). Estes componentes são a UI fiel — o wiring à
 * persistência entra quando existir a tabela de reações da plataforma.
 */

/** Resumo de uma reação (espelho desacoplado de `ReactionSummary` do tenant). */
export interface PlatformCrmReactionSummary {
  emoji: string;
  count: number;
  byMe: boolean;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

interface PlatformCrmReactionPickerProps {
  onPick: (emoji: string) => void;
  align?: 'start' | 'end' | 'center';
  trigger?: React.ReactNode;
}

export function PlatformCrmReactionPicker({
  onPick,
  align = 'center',
  trigger,
}: PlatformCrmReactionPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full bg-background border border-border shadow-sm"
          >
            <Smile className="h-3.5 w-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-1.5 rounded-full" sideOffset={6}>
        <div className="flex items-center gap-0.5">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(emoji);
                // Fecha popover via click outside automático do Radix
                (e.currentTarget.closest('[data-radix-popper-content-wrapper]') as HTMLElement | null)?.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
                );
              }}
              className="text-xl leading-none p-1.5 rounded-full hover:bg-muted transition-colors hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PlatformCrmReactionListProps {
  reactions: PlatformCrmReactionSummary[];
  onToggle: (emoji: string) => void;
  isVisitor: boolean;
}

export function PlatformCrmReactionList({
  reactions,
  onToggle,
  isVisitor,
}: PlatformCrmReactionListProps) {
  if (!reactions.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1 mt-1', isVisitor ? 'justify-start' : 'justify-end')}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(r.emoji);
          }}
          className={cn(
            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs',
            'border transition-all hover:scale-110',
            r.byMe
              ? 'bg-primary/15 border-primary/40 text-foreground'
              : 'bg-background border-border text-muted-foreground',
          )}
          title={r.byMe ? 'Você reagiu — clique para remover' : 'Reagir'}
        >
          <span className="text-sm leading-none">{r.emoji}</span>
          {r.count > 1 && <span className="text-[10px] font-medium">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}
