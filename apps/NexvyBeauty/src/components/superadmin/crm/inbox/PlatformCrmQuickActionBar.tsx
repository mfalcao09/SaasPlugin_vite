import {
  CalendarClock,
  Flame,
  Sparkles,
  Workflow,
  CalendarDays,
  BarChart3,
  CalendarPlus,
  DollarSign,
  Route,
  ExternalLink,
  Package,
  CreditCard,
  MessageSquare,
  StickyNote,
  Clock,
  Forward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Barra de ações rápidas do composer da inbox do CRM de PLATAFORMA.
 * PORTE de `seller/inbox/QuickActionBar.tsx` (CRM Vendus) — trocas: UI pura (todas
 * as ações são callbacks opcionais); tema já em tokens; desacoplamento: as ações do
 * original que dependem de tenant/canal (catálogo, cobrança, fluxo, cadência, etc.)
 * seguem como props opcionais FIÉIS — o ChatArea de plataforma simplesmente não as
 * passa (não renderizam). ADIÇÃO A1 (sem simplificar): as ações do composer que este
 * re-porte liga — Respostas rápidas, Notas internas, Agendar mensagem, Encaminhar.
 */

interface PlatformCrmQuickActionBarProps {
  // ── Ações herdadas 1:1 do original (opcionais; fidelidade de porte) ──
  onScheduleFollowup?: () => void;
  onMarkHot?: () => void;
  onSuggestReply?: () => void;
  isSuggestingReply?: boolean;
  onSendFlow?: () => void;
  onSendCadence?: () => void;
  onAnalyze?: () => void;
  /** Cria um evento de calendário (atalho rápido). */
  onCreateEvent?: () => void;
  /** Cria uma oportunidade de venda. Visível só com lead vinculado. */
  onCreateDeal?: () => void;
  /** Abre os "Dados do Contato" / detalhe do lead. */
  onViewLead?: () => void;
  /** Move o lead para outro estágio do funil — opcional. */
  onMoveStageQuick?: (stageId: string) => void;
  pipelineStages?: { id: string; name: string; color: string | null }[];
  currentStageId?: string | null;
  /** Abre seletor de produto do catálogo para enviar como mensagem rica. */
  onPickCatalog?: () => void;
  /** Abre dialog de gerar/enviar link de pagamento. */
  onSendPaymentLink?: () => void;

  // ── ADIÇÃO A1: ações do composer que este re-porte conecta ──
  /** Abre o seletor de Respostas Rápidas (também acionável por `/`). */
  onQuickReplies?: () => void;
  /** Abre as Notas Internas da conversa. */
  onOpenNotes?: () => void;
  /** Abre o diálogo de Agendar Mensagem (fila interna). */
  onScheduleMessage?: () => void;
  /** Abre o diálogo de Encaminhar para outra conversa. */
  onForward?: () => void;
}

export function PlatformCrmQuickActionBar({
  onScheduleFollowup,
  onMarkHot,
  onSuggestReply,
  isSuggestingReply,
  onSendFlow,
  onSendCadence,
  onAnalyze,
  onCreateEvent,
  onCreateDeal,
  onViewLead,
  onMoveStageQuick,
  pipelineStages = [],
  currentStageId,
  onPickCatalog,
  onSendPaymentLink,
  onQuickReplies,
  onOpenNotes,
  onScheduleMessage,
  onForward,
}: PlatformCrmQuickActionBarProps) {
  const currentStage = pipelineStages.find((s) => s.id === currentStageId);

  return (
    <div className="flex w-full max-w-full min-w-0 flex-shrink-0 items-center gap-1 overflow-x-auto px-3 py-1.5 border-t border-border bg-muted/20">
      {onSuggestReply && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-primary hover:text-primary shrink-0"
              onClick={onSuggestReply}
              disabled={isSuggestingReply}
            >
              <Sparkles className={cn('h-3.5 w-3.5', isSuggestingReply && 'animate-spin')} />
              Sugerir Resposta IA
            </Button>
          </TooltipTrigger>
          <TooltipContent>Gerar sugestão com IA baseada no contexto</TooltipContent>
        </Tooltip>
      )}

      {onQuickReplies && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0"
              onClick={onQuickReplies}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Respostas
            </Button>
          </TooltipTrigger>
          <TooltipContent>Respostas rápidas (ou digite / no composer)</TooltipContent>
        </Tooltip>
      )}

      {onOpenNotes && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-amber-600 hover:text-amber-700"
              onClick={onOpenNotes}
            >
              <StickyNote className="h-3.5 w-3.5" />
              Notas
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notas internas desta conversa</TooltipContent>
        </Tooltip>
      )}

      {onScheduleMessage && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0"
              onClick={onScheduleMessage}
            >
              <Clock className="h-3.5 w-3.5" />
              Agendar msg
            </Button>
          </TooltipTrigger>
          <TooltipContent>Agendar uma mensagem para envio posterior</TooltipContent>
        </Tooltip>
      )}

      {onForward && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0"
              onClick={onForward}
            >
              <Forward className="h-3.5 w-3.5" />
              Encaminhar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Encaminhar para outra conversa</TooltipContent>
        </Tooltip>
      )}

      {onPickCatalog && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-blue-600 hover:text-blue-700"
              onClick={onPickCatalog}
            >
              <Package className="h-3.5 w-3.5" />
              Catálogo
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enviar produto do catálogo no chat</TooltipContent>
        </Tooltip>
      )}

      {onSendPaymentLink && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-green-600 hover:text-green-700"
              onClick={onSendPaymentLink}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Cobrar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Gerar e enviar link de pagamento</TooltipContent>
        </Tooltip>
      )}

      {onCreateEvent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-emerald-600 hover:text-emerald-700"
              onClick={onCreateEvent}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Agendar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Agendar um atendimento na agenda</TooltipContent>
        </Tooltip>
      )}

      {onScheduleFollowup && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onScheduleFollowup}>
              <CalendarClock className="h-3.5 w-3.5" />
              Retorno
            </Button>
          </TooltipTrigger>
          <TooltipContent>Agendar lembrete de retorno do lead</TooltipContent>
        </Tooltip>
      )}

      {onCreateDeal && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-amber-600 hover:text-amber-700"
              onClick={onCreateDeal}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Oportunidade
            </Button>
          </TooltipTrigger>
          <TooltipContent>Registrar uma nova oportunidade (deal)</TooltipContent>
        </Tooltip>
      )}

      {onMoveStageQuick && pipelineStages.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0">
              <Route className="h-3.5 w-3.5" />
              {currentStage?.name ?? 'Mover etapa'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
              Mover para etapa
            </div>
            <div className="flex flex-col">
              {pipelineStages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => onMoveStageQuick(stage.id)}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted text-left',
                    stage.id === currentStageId && 'bg-muted font-medium',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color || 'hsl(var(--muted-foreground))' }}
                  />
                  <span className="truncate">{stage.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {onMarkHot && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-orange-500 hover:text-orange-600 shrink-0" onClick={onMarkHot}>
              <Flame className="h-3.5 w-3.5" />
              Quente
            </Button>
          </TooltipTrigger>
          <TooltipContent>Marcar lead como quente</TooltipContent>
        </Tooltip>
      )}

      {onViewLead && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onViewLead}>
              <ExternalLink className="h-3.5 w-3.5" />
              Ver Lead
            </Button>
          </TooltipTrigger>
          <TooltipContent>Abrir/ocultar os dados do lead (painel à direita)</TooltipContent>
        </Tooltip>
      )}

      {onSendFlow && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onSendFlow}>
              <Workflow className="h-3.5 w-3.5" />
              Fluxo
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enviar fluxo para o visitante</TooltipContent>
        </Tooltip>
      )}

      {onSendCadence && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onSendCadence}>
              <CalendarDays className="h-3.5 w-3.5" />
              Cadência
            </Button>
          </TooltipTrigger>
          <TooltipContent>Iniciar cadência para o lead</TooltipContent>
        </Tooltip>
      )}

      {onAnalyze && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onAnalyze}>
              <BarChart3 className="h-3.5 w-3.5" />
              Analisar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Analisar conversa com IA</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
