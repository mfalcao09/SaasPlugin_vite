import { useMemo, useState } from 'react';
import {
  Route,
  ArrowRight,
  Flag,
  Loader2,
  UserPlus,
  UserMinus,
  Repeat,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { usePlatformCrmLeadStageHistory } from '../data/usePlatformCrmLeadStageHistory';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';
import {
  usePlatformCrmConversationJourney,
  type PlatformCrmJourneyEvent,
} from '../data/usePlatformCrmConversationJourney';

/**
 * Linha do tempo da jornada da inbox do CRM de PLATAFORMA.
 *
 * PORTE de `seller/inbox/JourneyTimeline.tsx` (CRM Vendus): a semântica CANÔNICA
 * é a timeline de HANDOFFS (assumiu/devolveu/transferiu entre atendentes/setores)
 * — restaurada aqui (aba "Atendentes", padrão) via
 * `usePlatformCrmConversationJourney` sobre `platform_crm_conversation_transfers`.
 * A jornada no FUNIL (etapas do pipeline) — que uma versão anterior havia colocado
 * no lugar dos handoffs — é MANTIDA como segunda aba ("Funil"), pois tem valor
 * próprio. Estrutura visual dos handoffs 1:1 com o canônico (avatares de→para,
 * ícone por ação, data, nota interna do evento).
 */

interface PlatformCrmJourneyTimelineProps {
  /** Conversa atual — fonte dos eventos de handoff (paridade obrigatória). */
  conversationId?: string | null;
  /** Lead vinculado — fonte da jornada no funil (aba secundária). */
  leadId?: string | null;
}

const actionLabels: Record<string, { label: string; icon: typeof UserPlus }> = {
  assigned: { label: 'Assumiu o atendimento', icon: UserPlus },
  auto_assigned: { label: 'Atribuído automaticamente', icon: UserPlus },
  unassigned: { label: 'Devolvido à fila', icon: UserMinus },
  transferred: { label: 'Transferiu', icon: Repeat },
};

type JourneyTab = 'handoffs' | 'funnel';

export function PlatformCrmJourneyTimeline({ conversationId, leadId }: PlatformCrmJourneyTimelineProps) {
  const [tab, setTab] = useState<JourneyTab>('handoffs');

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setTab('handoffs')}
          className={cn(
            'px-2.5 py-1 rounded-sm transition-colors',
            tab === 'handoffs'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Atendentes
        </button>
        <button
          type="button"
          onClick={() => setTab('funnel')}
          className={cn(
            'px-2.5 py-1 rounded-sm transition-colors',
            tab === 'funnel'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Funil
        </button>
      </div>

      {tab === 'handoffs' ? (
        <HandoffsTimeline conversationId={conversationId ?? null} />
      ) : (
        <FunnelTimeline leadId={leadId ?? null} />
      )}
    </div>
  );
}

/* ───────── Handoffs (paridade canônica) ───────── */

function HandoffsTimeline({ conversationId }: { conversationId: string | null }) {
  const { data: events, isLoading } = usePlatformCrmConversationJourney(conversationId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!events?.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Sem eventos de transferência ainda.
      </p>
    );
  }

  return (
    <ol className="space-y-3 relative">
      <span className="absolute left-3 top-2 bottom-2 w-px bg-border" aria-hidden />
      {events.map((ev) => (
        <HandoffRow key={ev.id} event={ev} />
      ))}
    </ol>
  );
}

function HandoffRow({ event }: { event: PlatformCrmJourneyEvent }) {
  const meta = actionLabels[event.action] || { label: event.action, icon: Repeat };
  const Icon = meta.icon;
  const fromName = event.from_user?.full_name;
  const toName = event.to_user?.full_name;

  return (
    <li className="flex gap-3 relative">
      <div className="flex-shrink-0 z-10 h-6 w-6 rounded-full bg-background border border-border flex items-center justify-center">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs flex items-center gap-1.5 flex-wrap">
          {fromName && (
            <>
              <Avatar className="h-4 w-4">
                {event.from_user?.avatar_url && (
                  <AvatarImage src={event.from_user.avatar_url} alt={fromName} />
                )}
                <AvatarFallback className="text-[8px]">{fromName[0]}</AvatarFallback>
              </Avatar>
              <span className="font-medium truncate">{fromName}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </>
          )}
          {toName ? (
            <>
              <Avatar className="h-4 w-4">
                {event.to_user?.avatar_url && (
                  <AvatarImage src={event.to_user.avatar_url} alt={toName} />
                )}
                <AvatarFallback className="text-[8px]">{toName[0]}</AvatarFallback>
              </Avatar>
              <span className="font-medium truncate">{toName}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{meta.label}</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {format(new Date(event.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
        </p>
        {event.internal_note && (
          <p className="text-[11px] mt-1 px-2 py-1 bg-muted/50 rounded italic">
            "{event.internal_note}"
          </p>
        )}
      </div>
    </li>
  );
}

/* ───────── Jornada no funil (mantida como aba secundária) ───────── */

function FunnelTimeline({ leadId }: { leadId: string | null }) {
  const { data: history, isLoading } = usePlatformCrmLeadStageHistory(leadId ?? undefined);
  const { data: stages = [] } = usePlatformCrmStages();

  const stageById = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    stages.forEach((s) => m.set(s.id, { name: s.name, color: s.color }));
    return m;
  }, [stages]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!leadId) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Vincule um lead para ver a jornada no funil.
      </p>
    );
  }

  if (!history?.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Sem movimentações de etapa ainda.
      </p>
    );
  }

  return (
    <ol className="space-y-3 relative">
      <span className="absolute left-3 top-2 bottom-2 w-px bg-border" aria-hidden />
      {history.map((ev) => {
        const stage = ev.stage_id ? stageById.get(ev.stage_id) : null;
        const isCurrent = !ev.exited_at;
        return (
          <li key={ev.id} className="flex gap-3 relative">
            <div className="flex-shrink-0 z-10 h-6 w-6 rounded-full bg-background border border-border flex items-center justify-center">
              {isCurrent ? (
                <Flag className="h-3 w-3 text-primary" />
              ) : (
                <Route className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs flex items-center gap-1.5 flex-wrap">
                <span className="text-muted-foreground">Entrou em</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="inline-flex items-center gap-1.5 font-medium truncate">
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage?.color || 'hsl(var(--primary))' }}
                  />
                  {stage?.name || 'Etapa'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {format(new Date(ev.entered_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
              </p>
              {typeof ev.days_in_stage === 'number' && ev.days_in_stage > 0 && (
                <p className="text-[11px] mt-1 px-2 py-1 bg-muted/50 rounded italic">
                  {ev.days_in_stage} {ev.days_in_stage === 1 ? 'dia' : 'dias'} nesta etapa
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
