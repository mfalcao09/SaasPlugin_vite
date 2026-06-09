import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, Flame, Calendar, CheckSquare, ChevronRight } from 'lucide-react';
import type { OperationPriorities } from '@/hooks/useOperationCenter';

interface Props {
  data?: OperationPriorities;
  onNavigate: (section: string) => void;
}

export function PrioritiesCard({ data, onNavigate }: Props) {
  const items = [
    {
      icon: MessageCircle,
      iconBg: 'bg-red-50 text-red-500',
      count: data?.unansweredConversations ?? 0,
      label: 'conversas sem resposta',
      onClick: () => onNavigate('inbox'),
    },
    {
      icon: Flame,
      iconBg: 'bg-orange-50 text-orange-500',
      count: data?.hotLeadsUnassigned ?? 0,
      label: 'leads quentes sem responsável',
      onClick: () => onNavigate('leads'),
    },
    {
      icon: Calendar,
      iconBg: 'bg-blue-50 text-blue-500',
      count: data?.pendingMeetings ?? 0,
      label: 'reuniões pendentes de confirmação',
      onClick: () => onNavigate('calendar'),
    },
    {
      icon: CheckSquare,
      iconBg: 'bg-violet-50 text-violet-500',
      count: data?.overdueTasks ?? 0,
      label: 'tarefas atrasadas',
      onClick: () => onNavigate('leads'),
    },
  ];

  const allZero = items.every((i) => i.count === 0);

  return (
    <Card className="border-border h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Prioridades de agora</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {allZero ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Tudo em ordem por enquanto. Nenhuma ação urgente no momento.
          </div>
        ) : (
          items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-foreground truncate">
                    <span className="font-semibold">{item.count}</span> {item.label}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
