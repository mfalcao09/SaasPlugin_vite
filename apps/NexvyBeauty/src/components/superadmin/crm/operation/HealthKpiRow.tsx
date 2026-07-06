import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Flame, Calendar, AlertTriangle, Send, Users, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HealthKpis } from '@/components/superadmin/crm/data/usePlatformCrmOperationCenter';

interface Props {
  kpis?: HealthKpis;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onNavigate: (section: string) => void;
}

// Tom do "hint" abaixo do valor. Cores de SIGNIFICADO (§1.3), não de marca:
// vermelho = pendência, âmbar = atenção, neutro = informativo.
type HintTone = 'danger' | 'warn' | 'muted';
const hintClass: Record<HintTone, string> = {
  danger: 'text-red-600',
  warn: 'text-orange-600',
  muted: 'text-muted-foreground',
};

interface KpiCard {
  label: string;
  value: number;
  hint: string;
  hintTone: HintTone;
  icon: LucideIcon;
  section: string;
  /**
   * KPI de destaque da operação (pílula brand-gradient + brand-glow), espelho do
   * KPI de receita do exemplar Kanban. Como esta tela não tem valor R$, o destaque
   * vai no proxy de atenção (Conversas Abertas) — os demais em bg-muted + hairline.
   */
  accent?: boolean;
}

export function HealthKpiRow({ kpis, isLoading, isError, onRetry, onNavigate }: Props) {
  // Estado de erro (§3.1): banner com retry — nunca silenciar. Anatomia lux:
  // surface-card + hairline destrutiva, mesma anatomia dos demais estados.
  if (isError) {
    return (
      <div className="surface-card p-4 flex items-center justify-between gap-3 border-[color:hsl(var(--destructive)/0.3)]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          Não foi possível carregar os indicadores.
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  // Skeleton anatômico (§3.1): mesma grade e anatomia lux dos KPIs reais
  // (surface-card + pílula-ícone h-10 rounded-xl + micro-label + valor 30px).
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="surface-card p-5 flex items-start gap-3.5">
            <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const cards: KpiCard[] = [
    {
      label: 'Conversas Abertas',
      value: kpis?.openConversations ?? 0,
      hint: kpis?.unanswered ? `${kpis.unanswered} sem resposta` : 'Todas em dia',
      hintTone: kpis?.unanswered ? 'danger' : 'muted',
      icon: MessageCircle,
      section: 'inbox-chat',
      accent: true,
    },
    {
      label: 'Leads Quentes',
      value: kpis?.hotLeads ?? 0,
      hint: kpis?.hotNeedAction ? `${kpis.hotNeedAction} precisam ação` : 'Todos com responsável',
      hintTone: kpis?.hotNeedAction ? 'warn' : 'muted',
      icon: Flame,
      section: 'leads',
    },
    {
      label: 'Agenda Hoje',
      value: kpis?.todayAgenda ?? 0,
      hint: 'Reuniões + tarefas',
      hintTone: 'muted',
      icon: Calendar,
      section: 'calendar',
    },
    {
      label: 'Atividades Atrasadas',
      value: kpis?.overdueActivities ?? 0,
      hint: 'Follow-ups pendentes',
      hintTone: kpis?.overdueActivities ? 'danger' : 'muted',
      icon: AlertTriangle,
      section: 'leads',
    },
    {
      label: 'Mensagens Agendadas',
      value: kpis?.scheduledMessagesToday ?? 0,
      hint: 'Hoje',
      hintTone: 'muted',
      icon: Send,
      section: 'inbox-chat',
    },
    {
      label: 'Atendentes Online',
      value: kpis?.onlineAttendants ?? 0,
      hint: `${kpis?.attendingNow ?? 0} em atendimento`,
      hintTone: 'muted',
      icon: Users,
      section: 'team',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate(c.section)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigate(c.section);
              }
            }}
            aria-label={`${c.label}: ${c.value}`}
            className="surface-card surface-card-hover p-5 flex items-start gap-3.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* pílula-ícone (§L2 REF): destaque = brand-gradient + brand-glow;
               demais = bg-muted + hairline text-muted-foreground */}
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                c.accent
                  ? 'brand-gradient brand-glow text-white'
                  : 'bg-muted border hairline text-muted-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground truncate" title={c.label}>
                {c.label}
              </p>
              <p className="mt-1 text-[30px] font-semibold tracking-[-0.03em] tabular-nums leading-none">
                {c.value}
              </p>
              <p className={cn('text-[11px] mt-1.5 truncate', hintClass[c.hintTone])} title={c.hint}>
                {c.hint}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
