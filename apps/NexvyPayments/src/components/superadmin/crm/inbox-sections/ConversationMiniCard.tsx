import { Globe, Phone, Instagram, Mail, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
// Identidade nome→telefone (§3.3): IMPORTAR do exemplar calibrado, NUNCA reimplementar.
import {
  resolveVisitorIdentity,
  visitorInitials,
} from '../inbox/platformCrmIdentity';
import type { PlatformPanelConversation } from '../data/usePlatformCrmAttendancePanel';

/**
 * Mini-card de conversa do Painel de Atendimentos (família F3 tempo real).
 * CASCA LUX: `.surface-card-hover` (eleva no hover) + avatar `navy-gradient`
 * com badge de canal §3.2 no canto + identidade via `platformCrmIdentity`
 * (§3.3) + pílula de recência tokenizada. Dados/handler intocados: `onClick(c.id)`
 * e o contrato `PlatformPanelConversation`.
 */

interface Props {
  conversation: PlatformPanelConversation;
  onClick: (id: string) => void;
}

// Recência da última mensagem (§1.3 SIGNIFICADO): atividade viva (<5min) = verde;
// esfriando (<30min) = warning (ocre lux, token que troca com o tema); parada =
// destructive. Só tokens semânticos — sem override `dark:` por card.
function timeAgoClass(iso: string | null): string {
  if (!iso) return 'bg-muted text-muted-foreground';
  const diffMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diffMin < 5) return 'bg-emerald-500/15 text-emerald-600';
  if (diffMin < 30) return 'bg-warning/15 text-warning';
  return 'bg-destructive/15 text-destructive';
}

// Canal (§3.2 + §1.3): mesmo mapa visual do exemplar — whatsapp verde,
// instagram rosa, site/webchat/email primary, sms violeta.
function channelMeta(channel: string): { icon: typeof Globe; cls: string; label: string } {
  const ch = (channel || 'webchat').toLowerCase();
  if (ch.includes('whatsapp')) return { icon: Phone, cls: 'bg-emerald-500 text-white', label: 'WhatsApp' };
  if (ch === 'instagram') return { icon: Instagram, cls: 'bg-pink-500 text-white', label: 'Instagram' };
  if (ch === 'email') return { icon: Mail, cls: 'bg-primary text-primary-foreground', label: 'E-mail' };
  if (ch === 'sms') return { icon: MessageSquare, cls: 'bg-violet-500 text-white', label: 'SMS' };
  return { icon: Globe, cls: 'bg-primary text-primary-foreground', label: 'Site' };
}

export function ConversationMiniCard({ conversation: c, onClick }: Props) {
  // Identidade §3.3: nome inútil ("~"/1-2 chars) → telefone formatado vira primário.
  const rawName = c.lead_name || c.visitor_name || null;
  const identity = resolveVisitorIdentity(rawName, c.visitor_phone);
  const initials = visitorInitials(rawName, c.visitor_phone);

  const timeLabel = c.last_message_at
    ? formatDistanceToNowStrict(new Date(c.last_message_at), { locale: ptBR, addSuffix: false })
    : '—';
  const unread = c.unread_count_agents || 0;

  const ch = channelMeta(c.channel || 'webchat');
  const ChannelIcon = ch.icon;

  // Secundário: nome cru "inútil" (quando o telefone virou primário) OU o setor.
  const secondary = identity.secondary ?? c.sector_name;

  return (
    <button
      type="button"
      onClick={() => onClick(c.id)}
      title={identity.primary}
      className={cn(
        // surface-card lux + hover eleva (translateY -2px + sombra). p-2.5, densidade F3.
        'group surface-card surface-card-hover w-full text-left p-2.5',
        'flex items-center gap-2.5',
      )}
    >
      {/* Avatar navy-gradient com iniciais + badge de canal §3.2 no canto */}
      <div className="relative shrink-0">
        {c.visitor_avatar_url ? (
          <img
            src={c.visitor_avatar_url}
            alt=""
            className="h-9 w-9 rounded-xl object-cover"
          />
        ) : (
          <div className="navy-gradient flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-semibold text-white shadow-sm">
            {initials}
          </div>
        )}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card',
            ch.cls,
          )}
          title={ch.label}
          aria-label={ch.label}
        >
          <ChannelIcon className="h-2 w-2" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="flex-1 truncate text-[13px] font-semibold leading-tight">
            {identity.primary}
          </span>
          {/* Não-lidas = atividade viva (§1.3): badge emerald, tabular. */}
          {unread > 0 && (
            <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold tabular-nums text-white">
              {unread}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
              timeAgoClass(c.last_message_at),
            )}
          >
            {timeLabel}
          </span>
          {secondary && (
            <span className="truncate text-[10px] text-muted-foreground" title={secondary}>
              {secondary}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
