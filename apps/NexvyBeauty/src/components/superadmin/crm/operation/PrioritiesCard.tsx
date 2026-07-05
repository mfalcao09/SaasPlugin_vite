import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Flame, Calendar, CheckSquare, Send, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OperationPriorities } from '@/components/superadmin/crm/data/usePlatformCrmOperationCenter';

interface Props {
  data?: OperationPriorities;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onNavigate: (section: string) => void;
}

interface PriorityItem {
  icon: LucideIcon;
  count: number;
  label: string;
  section: string;
}

export function PrioritiesCard({ data, isLoading, isError, onRetry, onNavigate }: Props) {
  // Estado de erro (§3.1): banner com retry — NUNCA silenciar mostrando
  // "Tudo em ordem" sem dados (senão o card mente que não há pendências).
  if (isError) {
    return (
      <Card className="border-border h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Prioridades Agora</CardTitle>
        </CardHeader>
        <CardContent className="py-8 px-4 flex flex-col items-center text-center gap-2">
          <AlertCircle className="h-8 w-8 text-destructive/70" />
          <p className="text-sm text-muted-foreground">Não foi possível carregar as prioridades.</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
              Tentar novamente
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Skeleton anatômico (§3.1): 5 linhas com ícone + texto, como o conteúdo real.
  if (isLoading) {
    return (
      <Card className="border-border h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Prioridades Agora</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5">
              <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const items: PriorityItem[] = [
    {
      icon: MessageCircle,
      count: data?.unansweredConversations ?? 0,
      label: 'conversas sem resposta',
      section: 'inbox-chat',
    },
    {
      icon: Flame,
      count: data?.hotLeadsUnassigned ?? 0,
      label: 'leads quentes sem responsável',
      section: 'leads',
    },
    {
      icon: Calendar,
      count: data?.meetingsStartingSoon ?? 0,
      label: 'reuniões começam em 1 hora',
      section: 'calendar',
    },
    {
      icon: CheckSquare,
      count: data?.overdueTasks ?? 0,
      label: 'tarefas atrasadas',
      section: 'leads',
    },
    {
      icon: Send,
      count: data?.scheduledMessagesToday ?? 0,
      label: 'mensagens agendadas para hoje',
      section: 'inbox-chat',
    },
  ];

  // Só as prioridades com contagem > 0 são acionáveis; as zeradas somem para
  // manter o foco (as pendências que importam). Tudo zerado → empty positivo.
  const active = items.filter((i) => i.count > 0);

  return (
    <Card className="border-border h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Prioridades Agora</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {active.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/70" />
            <p className="text-sm font-medium text-foreground">Tudo em ordem</p>
            <p className="text-xs text-muted-foreground">Nenhuma ação urgente agora.</p>
          </div>
        ) : (
          active.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => onNavigate(item.section)}
                aria-label={`${item.count} ${item.label}`}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Ícone via token de marca (F3): bg-primary/10 text-primary */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-foreground truncate">
                    <span className="font-semibold tabular-nums">{item.count}</span> {item.label}
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
