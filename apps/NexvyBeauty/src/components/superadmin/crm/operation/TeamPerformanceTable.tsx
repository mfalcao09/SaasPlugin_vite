import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, AlertCircle } from 'lucide-react';
import type { SellerPerformance } from '@/components/superadmin/crm/data/usePlatformCrmOperationCenter';

interface Props {
  rows?: SellerPerformance[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onNavigate: (section: string) => void;
}

// Status do vendedor via dot semântico (§1.3): verde/laranja/vermelho.
const statusLabel: Record<SellerPerformance['status'], { dot: string; text: string; label: string }> = {
  healthy: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'Ótimo' },
  attention: { dot: 'bg-orange-500', text: 'text-orange-600', label: 'Atenção' },
  critical: { dot: 'bg-red-500', text: 'text-red-600', label: 'Crítico' },
};

// Vendedor é um PROFILE do sistema (full_name), não um visitante de WhatsApp —
// portanto iniciais de nome de sistema, não o helper de identidade §3.3.
function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}

const thBase = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-2 py-2';

export function TeamPerformanceTable({ rows, isLoading, isError, onRetry, onNavigate }: Props) {
  return (
    <Card className="border-border h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Performance da Equipe</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          // Estado de erro (§3.1): retry, nunca silenciar.
          <div className="py-8 px-4 flex flex-col items-center text-center gap-2">
            <AlertCircle className="h-8 w-8 text-destructive/70" />
            <p className="text-sm text-muted-foreground">Não foi possível carregar a equipe.</p>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
                Tentar novamente
              </Button>
            )}
          </div>
        ) : isLoading ? (
          // Skeleton anatômico (§3.1): avatar + nome + métricas por linha.
          <div className="px-4 py-2 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (rows ?? []).length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center gap-2">
            <Users className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">Sem vendedores ativos</p>
            <p className="text-xs text-muted-foreground">Nenhuma atividade da equipe agora.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={`${thBase} text-left px-4`}>Vendedor</th>
                  <th className={`${thBase} text-right`}>Conversas</th>
                  <th className={`${thBase} text-right`}>Leads</th>
                  <th className={`${thBase} text-right`}>Atrasadas</th>
                  <th className={`${thBase} text-right`}>Reuniões Hoje</th>
                  <th className={`${thBase} text-right px-4`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).slice(0, 6).map((r) => {
                  const s = statusLabel[r.status];
                  return (
                    <tr key={r.userId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7">
                            {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.name} />}
                            <AvatarFallback className="text-[10px]">{initials(r.name)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium truncate" title={r.name}>{r.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.conversations}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.leads}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${r.overdue > 0 ? 'text-red-600 font-medium' : ''}`}>
                        {r.overdue}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.meetingsToday}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !isError && (rows ?? []).length > 6 && (
          <button
            onClick={() => onNavigate('team')}
            className="w-full px-4 py-2.5 border-t text-sm text-muted-foreground hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver todos os vendedores →
          </button>
        )}
      </CardContent>
    </Card>
  );
}
