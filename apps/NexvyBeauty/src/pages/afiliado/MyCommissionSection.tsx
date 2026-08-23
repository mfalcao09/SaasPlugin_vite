import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CircleDollarSign, Clock, CheckCircle2, Hash } from 'lucide-react';
import { useCurrentAffiliate, useMyCommissionSummary } from '@/hooks/useAffiliatePortal';

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function MyCommissionSection() {
  const { data: affiliate } = useCurrentAffiliate();
  const { data: summary, isLoading } = useMyCommissionSummary();

  const cards = [
    {
      label: 'A receber',
      value: formatBRL(summary?.approved_cents ?? 0),
      icon: CircleDollarSign,
      hint: 'Aprovado, aguardando pagamento',
    },
    {
      label: 'Pendente',
      value: formatBRL(summary?.pending_cents ?? 0),
      icon: Clock,
      hint: 'Em validação',
    },
    {
      label: 'Pago',
      value: formatBRL(summary?.paid_cents ?? 0),
      icon: CheckCircle2,
      hint: 'Já transferido',
    },
    {
      label: 'Total de comissões',
      value: String(summary?.commissions_count ?? 0),
      icon: Hash,
      hint: 'Quantidade de vendas atribuídas',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Minha Comissão</h2>
        <p className="text-sm text-muted-foreground">
          Acompanhe seus ganhos. O pagamento é feito via PIX.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Skeleton key={c.label} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {c.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{c.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dados de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {affiliate?.pix_key ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Chave PIX:</span>
              <code className="rounded-md bg-muted px-2 py-1 text-xs">{affiliate.pix_key}</code>
              <Badge variant="secondary">payout via PIX</Badge>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Nenhuma chave PIX cadastrada. Solicite ao administrador para receber seus pagamentos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
