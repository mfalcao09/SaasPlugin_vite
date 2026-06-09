import { Card, CardContent } from '@/components/ui/card';
import { Users, MessageCircle, Flame, Calendar } from 'lucide-react';
import type { OperationKpis } from '@/hooks/useOperationCenter';

interface Props {
  kpis?: OperationKpis;
  onNavigate: (section: string) => void;
}

export function OperationKpiCards({ kpis, onNavigate }: Props) {
  const cards = [
    {
      label: 'Novos leads hoje',
      value: kpis?.newLeadsToday ?? 0,
      hint:
        kpis && kpis.newLeadsDelta !== 0
          ? `${kpis.newLeadsDelta > 0 ? '+' : ''}${kpis.newLeadsDelta}% vs ontem`
          : 'Sem comparação vs ontem',
      hintClass: (kpis?.newLeadsDelta ?? 0) >= 0 ? 'text-emerald-600' : 'text-destructive',
      icon: Users,
      onClick: () => onNavigate('leads'),
    },
    {
      label: 'Atendimentos abertos',
      value: kpis?.openConversations ?? 0,
      hint: kpis?.unansweredConversations
        ? `${kpis.unansweredConversations} sem resposta`
        : 'Todos respondidos',
      hintClass: kpis?.unansweredConversations ? 'text-orange-600' : 'text-muted-foreground',
      icon: MessageCircle,
      onClick: () => onNavigate('inbox'),
    },
    {
      label: 'Leads quentes',
      value: kpis?.hotLeads ?? 0,
      hint: kpis?.hotLeadsNeedingAction
        ? `${kpis.hotLeadsNeedingAction} precisam de ação`
        : 'Todos com responsável',
      hintClass: kpis?.hotLeadsNeedingAction ? 'text-orange-600' : 'text-muted-foreground',
      icon: Flame,
      onClick: () => onNavigate('leads'),
    },
    {
      label: 'Agenda de hoje',
      value: kpis?.todayAgenda ?? 0,
      hint: kpis?.upcomingSoon
        ? `${kpis.upcomingSoon} próximas em 30 min`
        : 'Sem compromissos próximos',
      hintClass: kpis?.upcomingSoon ? 'text-primary' : 'text-muted-foreground',
      icon: Calendar,
      onClick: () => onNavigate('calendar'),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card
            key={c.label}
            onClick={c.onClick}
            className="cursor-pointer hover:shadow-md transition-shadow border-border"
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{c.value}</p>
                  <p className={`text-xs mt-2 ${c.hintClass}`}>{c.hint}</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
