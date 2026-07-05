import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Sparkles, Calendar, AlertCircle } from 'lucide-react';
import type { RealtimeOps } from '@/components/superadmin/crm/data/usePlatformCrmOperationCenter';

interface Props {
  data?: RealtimeOps;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

// Cores das barras via tokens de gráfico (§1.1 / F3: charts SEMPRE por
// `--chart-1..5`). `neutral` usa o cinza semântico para itens já resolvidos.
type BarTone = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'neutral';
const barStyle: Record<BarTone, string> = {
  'chart-1': 'hsl(var(--chart-1))',
  'chart-2': 'hsl(var(--chart-2))',
  'chart-3': 'hsl(var(--chart-3))',
  'chart-4': 'hsl(var(--chart-4))',
  'chart-5': 'hsl(var(--chart-5))',
  neutral: 'hsl(var(--muted-foreground) / 0.5)',
};

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: BarTone }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 truncate" title={label}>{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: barStyle[tone] }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-10 text-right">{value}</span>
    </div>
  );
}

export function RealtimeOpsCard({ data, isLoading, isError, onRetry }: Props) {
  // Estado de erro (§3.1): banner com retry — NUNCA silenciar com barras
  // zeradas (barras em 0 mentem que a operação está parada).
  if (isError) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Operação em Tempo Real</CardTitle>
        </CardHeader>
        <CardContent className="py-8 flex flex-col items-center text-center gap-2">
          <AlertCircle className="h-8 w-8 text-destructive/70" />
          <p className="text-sm text-muted-foreground">Não foi possível carregar a operação em tempo real.</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
              Tentar novamente
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Skeleton anatômico (§3.1): 3 colunas × (título + 3–4 barras).
  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Operação em Tempo Real</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, col) => (
            <div key={col} className="space-y-3">
              <Skeleton className="h-4 w-28" />
              {Array.from({ length: 4 }).map((__, row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2 flex-1 rounded-full" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const c = data?.conversations;
  const cad = data?.cadences;
  const ag = data?.agenda;

  const convMax = Math.max(c?.withAI ?? 0, c?.inAttendance ?? 0, c?.humanQueue ?? 0, c?.resolvedToday ?? 0, 1);
  const cadMax = Math.max(cad?.activeEnrollments ?? 0, cad?.executedToday ?? 0, cad?.responded ?? 0, cad?.paused ?? 0, 1);
  const agMax = Math.max(ag?.todayMeetings ?? 0, ag?.confirmed ?? 0, ag?.pending ?? 0, 1);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Operação em Tempo Real</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="h-4 w-4 text-primary" /> Conversas
          </div>
          <Bar label="Com IA" value={c?.withAI ?? 0} max={convMax} tone="chart-1" />
          <Bar label="Em Atendimento" value={c?.inAttendance ?? 0} max={convMax} tone="chart-4" />
          <Bar label="Fila Humana" value={c?.humanQueue ?? 0} max={convMax} tone="chart-2" />
          <Bar label="Finalizadas Hoje" value={c?.resolvedToday ?? 0} max={convMax} tone="neutral" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Cadências
          </div>
          <Bar label="Ativas" value={cad?.activeEnrollments ?? 0} max={cadMax} tone="chart-3" />
          <Bar label="Executadas Hoje" value={cad?.executedToday ?? 0} max={cadMax} tone="chart-1" />
          <Bar label="Responderam" value={cad?.responded ?? 0} max={cadMax} tone="chart-5" />
          <Bar label="Paradas" value={cad?.paused ?? 0} max={cadMax} tone="neutral" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-primary" /> Agenda
          </div>
          <Bar label="Reuniões Hoje" value={ag?.todayMeetings ?? 0} max={agMax} tone="chart-2" />
          <Bar label="Confirmadas" value={ag?.confirmed ?? 0} max={agMax} tone="chart-5" />
          <Bar label="Pendentes" value={ag?.pending ?? 0} max={agMax} tone="chart-4" />
        </div>
      </CardContent>
    </Card>
  );
}
