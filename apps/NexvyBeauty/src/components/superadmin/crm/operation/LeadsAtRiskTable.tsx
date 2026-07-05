import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import type { LeadAtRisk } from '@/components/superadmin/crm/data/usePlatformCrmOperationCenter';
// Identidade canônica nome→telefone (§3.3): IMPORTAR, nunca reimplementar.
import { resolveVisitorIdentity } from '@/components/superadmin/crm/inbox/platformCrmIdentity';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  rows?: LeadAtRisk[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onResolve: (leadId: string) => void;
}

export function LeadsAtRiskTable({ rows, isLoading, isError, onRetry, onResolve }: Props) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Leads em Risco</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          // Estado de erro (§3.1): retry, nunca silenciar.
          <div className="py-8 px-4 flex flex-col items-center text-center gap-2">
            <AlertCircle className="h-8 w-8 text-destructive/70" />
            <p className="text-sm text-muted-foreground">Não foi possível carregar os leads em risco.</p>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
                Tentar novamente
              </Button>
            )}
          </div>
        ) : isLoading ? (
          // Skeleton anatômico (§3.1): reproduz linhas da tabela.
          <div className="px-4 py-2 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-7 w-20 rounded-md" />
              </div>
            ))}
          </div>
        ) : (rows ?? []).length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center gap-2">
            <ShieldCheck className="h-8 w-8 text-emerald-500/70" />
            <p className="text-sm font-medium text-foreground">Nenhum lead em risco</p>
            <p className="text-xs text-muted-foreground">Toda a base está sendo acompanhada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-4 py-2">Lead</th>
                  <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-2 py-2">Responsável</th>
                  <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-2 py-2">Motivo</th>
                  <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-2 py-2">Última ação</th>
                  <th className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-4 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => {
                  // O contrato de LeadAtRisk não traz telefone; o helper degrada
                  // corretamente (nome útil → primary) e trata "~"/nomes crus.
                  const identity = resolveVisitorIdentity(r.name, null);
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium truncate max-w-[220px]" title={identity.primary}>
                        {identity.primary}
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">{r.assignedName ?? '—'}</td>
                      <td className="px-2 py-2.5">{r.reason}</td>
                      <td className="px-2 py-2.5 text-muted-foreground text-[11px] tabular-nums">
                        {r.lastActionAt
                          ? formatDistanceToNow(new Date(r.lastActionAt), { addSuffix: true, locale: ptBR })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onResolve(r.id)}
                          aria-label={`Resolver lead ${identity.primary}`}
                          className="h-7 text-xs"
                        >
                          Resolver
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
