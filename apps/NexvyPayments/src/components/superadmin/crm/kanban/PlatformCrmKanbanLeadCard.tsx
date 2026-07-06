import type { CSSProperties, ReactNode } from 'react';
import {
  Globe,
  Phone,
  Instagram,
  MessageCircle,
  Flame,
  Thermometer,
  Snowflake,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isToday, isYesterday, differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
// Identidade nome→telefone (U3): IMPORTAR do exemplar calibrado, NUNCA reimplementar.
import {
  resolveVisitorIdentity,
  visitorInitials,
} from '../inbox/platformCrmIdentity';
import type { PlatformCrmLeadWithStage } from '../data/usePlatformCrmLeads';
import type { PlatformCrmSeller } from '../data/usePlatformCrmSellers';

interface PlatformCrmKanbanLeadCardProps {
  lead: PlatformCrmLeadWithStage;
  stageColor: string;
  /** Abre o detalhe do lead (modal). Torna o card clicável. */
  onViewDetails?: () => void;
  /**
   * Vendedor responsável (rep de venda da plataforma) resolvido pelo mapa de
   * sellers. Fallback para `lead.profiles` (assigned_to resolvido no hook de leads).
   */
  seller?: PlatformCrmSeller | null;
  isDragging?: boolean;
  onDragStart?: () => void;
}

// ── Temperatura (§1.3): ícone + var de cor do tema lux (--hot/--warm/--cold).
// Pílula = color-mix 12% do token + inset ring 30% (anatomia do REF Lovable). ──
const temperatureConfig = {
  hot: { label: 'Quente', icon: Flame, colorVar: 'var(--hot)' },
  warm: { label: 'Morno', icon: Thermometer, colorVar: 'var(--warm)' },
  cold: { label: 'Frio', icon: Snowflake, colorVar: 'var(--cold)' },
} as const;

// ── Canal do lead (§3.2 + §1.3). Leads não são conversas: o canal vem de texto
// livre em `lead_channel`/`source`/`lead_origin`, então resolvemos localmente com
// o MESMO mapa visual do exemplar (resolveProvider da inbox opera sobre conversas).
type LeadChannel = 'whatsapp' | 'instagram' | 'webchat' | 'unknown';

function resolveLeadChannel(lead: PlatformCrmLeadWithStage): LeadChannel {
  const raw = `${lead.lead_channel ?? ''} ${lead.source ?? ''} ${lead.lead_origin ?? ''}`.toLowerCase();
  if (raw.includes('instagram') || raw.includes('insta')) return 'instagram';
  if (raw.includes('whatsapp') || raw.includes('whats') || raw.includes('wpp') || lead.phone) return 'whatsapp';
  if (raw.includes('webchat') || raw.includes('site') || raw.includes('widget') || raw.includes('web')) return 'webchat';
  return 'unknown';
}

const CHANNEL_LABEL: Record<LeadChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  webchat: 'Site',
  unknown: 'Canal',
};

const channelIcon: Record<LeadChannel, ReactNode> = {
  whatsapp: <Phone className="h-2.5 w-2.5" />,
  instagram: <Instagram className="h-2.5 w-2.5" />,
  webchat: <Globe className="h-2.5 w-2.5" />,
  unknown: <MessageCircle className="h-2.5 w-2.5" />,
};

// Cores por canal (§1.3): whatsapp=verde (padrão do REF), webchat=primary
// (troca sozinho por tema), instagram=rosa.
const channelBadgeClass: Record<LeadChannel, string> = {
  whatsapp: 'bg-emerald-500 text-white',
  instagram: 'bg-pink-500 text-white',
  webchat: 'bg-primary text-primary-foreground',
  unknown: 'bg-muted text-muted-foreground',
};

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// Data relativa canônica (§3.8): hoje HH:mm · ontem "Ontem" · <7d "EEE HH:mm" · resto dd/MM/yyyy.
function formatRelative(date: string | null) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  if (Math.abs(differenceInDays(new Date(), d)) < 7) return format(d, 'EEE HH:mm', { locale: ptBR });
  return format(d, 'dd/MM/yyyy');
}

function sellerInitials(name: string) {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function PlatformCrmKanbanLeadCard({
  lead,
  stageColor,
  onViewDetails,
  seller,
  isDragging,
  onDragStart,
}: PlatformCrmKanbanLeadCardProps) {
  const tempConfig = lead.temperature ? temperatureConfig[lead.temperature] : null;

  const daysSinceContact = lead.last_contact_at
    ? differenceInDays(new Date(), new Date(lead.last_contact_at))
    : null;
  const isStale = daysSinceContact !== null && daysSinceContact > 7;
  const dealValue = lead.deal_value ?? 0;

  // Identidade nome→telefone (U3): nome inútil ("~"/1-2 chars) → telefone vira primário.
  const identity = resolveVisitorIdentity(lead.name, lead.phone);
  const initials = visitorInitials(lead.name, lead.phone);
  // Secundário: empresa quando o nome já é útil; senão o nome cru que sobrou.
  const secondary = identity.usefulName ? lead.company : identity.secondary;

  const channel = resolveLeadChannel(lead);
  const channelLabel = CHANNEL_LABEL[channel];

  // Vendedor: mapa de sellers > profiles resolvido no hook de leads.
  const sellerName = seller?.full_name ?? lead.profiles?.full_name ?? null;
  const sellerAvatar = seller?.avatar_url ?? lead.profiles?.avatar_url ?? null;

  const contactDate = formatRelative(lead.last_contact_at ?? lead.created_at);

  // Pílula de temperatura (REF): color-mix 12% do token + inset ring 30%.
  const tempStyle: CSSProperties | undefined = tempConfig
    ? {
        color: tempConfig.colorVar,
        backgroundColor: `color-mix(in oklab, ${tempConfig.colorVar} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tempConfig.colorVar} 30%, transparent)`,
      }
    : undefined;

  const TempIcon = tempConfig?.icon;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', lead.id);
        onDragStart?.();
      }}
      onClick={onViewDetails}
      className={cn(
        // surface-card lux + hover eleva (translateY -2px + sombra), cursor grab (REF)
        'group surface-card surface-card-hover p-4 space-y-3 cursor-grab active:cursor-grabbing',
        isStale && !isDragging && 'ring-1 ring-amber-500/40',
        isDragging && 'opacity-50',
      )}
      // Cor de estágio no banco (dado) — barra lateral do card.
      style={{ borderLeftWidth: 3, borderLeftColor: stageColor }}
    >
      {/* Linha 1 — identidade (avatar navy-gradient + badge de canal §3.2) */}
      <div className="flex items-start gap-3 min-w-0">
        <div className="relative flex-shrink-0">
          {/* Avatar h-10 w-10 rounded-xl navy-gradient com iniciais (REF) */}
          <div className="navy-gradient h-10 w-10 rounded-xl flex items-center justify-center text-[13px] font-semibold text-white shadow-sm">
            {initials}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center border-2 border-card',
                  channelBadgeClass[channel],
                )}
                aria-label={channelLabel}
              >
                {channelIcon[channel]}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">{channelLabel}</TooltipContent>
          </Tooltip>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-[13.5px] font-semibold leading-tight truncate"
            title={identity.primary}
          >
            {identity.primary}
          </p>
          {secondary && (
            <p className="text-[11.5px] text-muted-foreground truncate" title={secondary}>
              {secondary}
            </p>
          )}
        </div>
      </div>

      {/* Linha 2 — valor BRL DOURADO (.text-value 19px §REF) */}
      {dealValue > 0 && (
        <p className="text-value text-[19px] font-semibold tracking-[-0.02em] tabular-nums leading-none">
          {brl.format(dealValue)}
        </p>
      )}

      {/* Linha 3 — badges (temperatura §1.3: ícone + pílula color-mix do token) */}
      {tempConfig && TempIcon && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
            style={tempStyle}
          >
            <TempIcon className="h-3 w-3" />
            {tempConfig.label}
          </span>
        </div>
      )}

      {/* Rodapé — border-t hairline · mini-avatar navy-gradient + nome + data à direita */}
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t hairline">
        {sellerName ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 min-w-0" aria-label={sellerName}>
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarImage src={sellerAvatar || undefined} />
                  <AvatarFallback className="navy-gradient text-[9px] font-semibold text-white">
                    {sellerInitials(sellerName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[11px] text-muted-foreground truncate">
                  {sellerName}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">{sellerName}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-[10.5px] text-muted-foreground/70 flex-shrink-0">
            Sem responsável
          </span>
        )}

        <span
          className={cn(
            'text-[11px] tabular-nums truncate flex-shrink-0',
            isStale ? 'text-amber-600' : 'text-muted-foreground',
          )}
          title={
            isStale && daysSinceContact !== null
              ? `Sem contato há ${daysSinceContact} dias`
              : undefined
          }
        >
          {isStale && daysSinceContact !== null ? `${daysSinceContact}d sem contato` : contactDate}
        </span>
      </div>
    </div>
  );
}
