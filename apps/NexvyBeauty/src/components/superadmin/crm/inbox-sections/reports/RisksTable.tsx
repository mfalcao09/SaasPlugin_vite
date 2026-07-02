import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PlatformRiskLeadRow } from '../../data/usePlatformCrmAttendanceReports';
import { channelLabel } from '../../data/usePlatformCrmAttendanceReports';
import { ArrowUpRight } from 'lucide-react';

/**
 * Leads em Risco — Relatórios de Atendimento do CRM de PLATAFORMA.
 * PORTE 1:1 de `admin/webchat/reports/RisksTable.tsx` do CRM Vendus.
 * Adaptações: tipos/`channelLabel` vêm de `usePlatformCrmAttendanceReports`;
 * o "Abrir Conversa" do tenant (sessionStorage + searchParams `tab=inbox-chat`)
 * vira o callback `onOpenConversation` injetado pelo pai — mesmo padrão do
 * `PlatformCrmInboxPanel` (fiação do menu fica com o orquestrador).
 */

interface Props {
  rows: PlatformRiskLeadRow[];
  onOpenConversation?: (id: string) => void;
}

function fmtIdle(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function RisksTable({ rows, onOpenConversation }: Props) {
  return (
    <Card className="rounded-2xl border bg-card shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Leads em Risco</CardTitle>
        <p className="text-sm text-muted-foreground">Conversas paradas há mais de 30 minutos</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
            Nenhum lead em risco agora. 🎉
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Lead</th>
                  <th className="px-2 py-2 text-left font-medium">Canal</th>
                  <th className="px-2 py-2 text-right font-medium">Tempo Parado</th>
                  <th className="px-2 py-2 text-left font-medium">Responsável</th>
                  <th className="px-2 py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.conversationId} className="border-t border-border/60">
                    <td className="px-2 py-3 font-medium text-foreground truncate max-w-[200px]">{r.leadName}</td>
                    <td className="px-2 py-3">
                      <Badge variant="secondary" className="font-normal">{channelLabel(r.channel)}</Badge>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-destructive font-semibold">{fmtIdle(r.idleMinutes)}</td>
                    <td className="px-2 py-3 text-muted-foreground truncate max-w-[180px]">{r.responsible}</td>
                    <td className="px-2 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenConversation?.(r.conversationId)}
                        className="gap-1.5"
                      >
                        Abrir Conversa
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
