import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Flame, Calendar, AlertTriangle, Send, Users, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
}

export function HealthKpiRow({ kpis, isLoading, isError, onRetry, onNavigate }: Props) {
  // Estado de erro (§3.1): banner com retry — nunca silenciar.
  if (isError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            Não foi possível carregar os indicadores.
          </div>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
              Tentar novamente
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Skeleton anatômico (§3.1): mesma grade e anatomia dos KPIs reais.
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
                <Skeleton className="h-9 w-9 rounded-lg flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
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
          <Card
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
            className="cursor-pointer hover:shadow-md transition-shadow border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
                    {c.label}
                  </p>
                  <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{c.value}</p>
                  <p className={`text-[11px] mt-1 truncate ${hintClass[c.hintTone]}`} title={c.hint}>
                    {c.hint}
                  </p>
                </div>
                {/* Ícone de KPI via token de marca (F3): bg-primary/10 text-primary */}
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
