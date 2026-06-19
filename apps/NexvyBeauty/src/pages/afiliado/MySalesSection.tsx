import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyCommissions, type AffiliateCommission } from '@/hooks/useAffiliatePortal';

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  approved: 'A receber',
  paid: 'Pago',
  cancelled: 'Cancelada',
};

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'paid':
      return 'default';
    case 'approved':
      return 'secondary';
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

function StatusBadge({ commission }: { commission: AffiliateCommission }) {
  return (
    <Badge variant={statusVariant(commission.status)}>
      {STATUS_LABEL[commission.status] ?? commission.status}
    </Badge>
  );
}

export function MySalesSection() {
  const { data: commissions, isLoading } = useMyCommissions();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Minhas Vendas</h2>
        <p className="text-sm text-muted-foreground">
          Histórico de vendas atribuídas aos seus links e a comissão de cada uma.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !commissions || commissions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma venda registrada ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(c.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{c.order_ref ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatBRL(c.amount_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge commission={c} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
