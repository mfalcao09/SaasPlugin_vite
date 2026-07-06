import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Phone, CheckSquare } from 'lucide-react';
import type { AgendaItem } from '@/hooks/useOperationCenter';

interface Props {
  items?: AgendaItem[];
  onNavigate: (section: string) => void;
}

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--:--';
  }
};

export function TodayAgendaCard({ items, onNavigate }: Props) {
  const list = items ?? [];

  return (
    <Card className="border-border h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Agenda e Tarefas de Hoje</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma tarefa ou reunião para hoje.
          </div>
        ) : (
          list.map((item) => {
            const Icon = item.type === 'task' ? CheckSquare : item.type === 'call' ? Phone : Video;
            const iconBg =
              item.type === 'task'
                ? 'bg-violet-50 text-violet-500'
                : item.type === 'call'
                ? 'bg-blue-50 text-blue-500'
                : 'bg-emerald-50 text-emerald-600';
            const actionLabel =
              item.type === 'task' ? 'Ver tarefa' : item.type === 'call' ? 'Ligar' : 'Entrar';

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {formatTime(item.time)}
                    </span>
                    <span className="text-sm text-foreground truncate">{item.title}</span>
                  </div>
                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate(item.type === 'task' ? 'leads' : 'calendar')}
                  className="flex-shrink-0"
                >
                  {actionLabel}
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
