import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useAffiliateCommissions,
  useApproveCommission,
  useCancelCommission,
  type CommissionStatus,
} from '@/hooks/useAffiliateAdmin';

interface Props {
  affiliateId?: string;
}

const STATUS_META: Record<CommissionStatus, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  approved: { label: 'Aprovada', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  paid: { label: 'Paga', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  cancelled: { label: 'Cancelada', className: 'bg-muted text-muted-foreground border-border' },
};

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CommissionsTable({ affiliateId }: Props) {
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | 'all'>('all');

  const { data, isLoading } = useAffiliateCommissions({
    affiliate_id: affiliateId,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const approve = useApproveCommission();
  const cancel = useCancelCommission();
  const commissions = data?.commissions ?? [];

  const handleApprove = async (id: string) => {
    try {
      await approve.mutateAsync(id);
      toast.success('Comissão aprovada');
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao aprovar');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar esta comissão? Esta ação não pode ser desfeita.')) return;
    try {
      await cancel.mutateAsync({ id });
      toast.success('Comissão cancelada');
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao cancelar');
    }
  };

  const busy = approve.isPending || cancel.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CommissionStatus | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="approved">Aprovada</SelectItem>
            <SelectItem value="paid">Paga</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : commissions.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Nenhuma comissão encontrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Afiliado</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((c) => {
                  const meta = STATUS_META[c.status];
                  const flagged = c.review_status === 'flagged';
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {c.affiliate_name ?? c.affiliate_id}
                          {flagged && (
                            <Badge
                              variant="outline"
                              className="bg-destructive/10 text-destructive border-destructive/20"
                              title="Marcada para revisão antifraude"
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" /> Revisar
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.order_ref}</TableCell>
                      <TableCell className="text-right">{brl(c.amount_cents)}</TableCell>
                      <TableCell className="text-right">{c.pct_applied ?? 0}%</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.created_at ? format(new Date(c.created_at), 'dd/MM/yy HH:mm', { locale: ptBR }) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Aprovar"
                              disabled={busy}
                              onClick={() => handleApprove(c.id)}
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                          {(c.status === 'pending' || c.status === 'approved') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Cancelar"
                              disabled={busy}
                              onClick={() => handleCancel(c.id)}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
