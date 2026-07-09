import { useMemo } from 'react';
import { Route, ArrowRight, Flag, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePlatformCrmLeadStageHistory } from '../data/usePlatformCrmLeadStageHistory';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';

/**
 * Linha do tempo da JORNADA DO LEAD na inbox do CRM de PLATAFORMA.
 * PORTE de `seller/inbox/JourneyTimeline.tsx` (CRM Vendus) — trocas: dado
 * (o hook tenant `useConversationJourney` de eventos de transferência/atribuição
 * NÃO existe na plataforma → usa `platform_crm_lead_stage_history` = jornada no
 * FUNIL, resolvendo o nome/cor da etapa em `platform_crm_pipeline_stages`);
 * desacoplamento: sem usuários de/para de transferência (conceito que não existe
 * na jornada de plataforma) — cada evento é a ENTRADA numa etapa do funil. Tema
 * em tokens. Estrutura visual 1:1 (lista ordenada + linha-guia + ícone + data).
 */

interface PlatformCrmJourneyTimelineProps {
  leadId?: string | null;
}

export function PlatformCrmJourneyTimeline({ leadId }: PlatformCrmJourneyTimelineProps) {
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
