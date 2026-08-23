import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MousePointerClick, Users, CreditCard, CheckCircle2, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useMyAffiliateFunnel, useMyAffiliateLeadStages } from '@/hooks/useAffiliatePortal';

const STAGE_LABEL: Record<string, string> = {
  captured: 'Capturado',
  in_conversation: 'Em conversa',
  checkout: 'Checkout',
  paid: 'Pago',
};

export function FunnelSection() {
  const { data, isLoading } = useMyAffiliateFunnel();
  const stages = useMyAffiliateLeadStages();
  const cards = [
    { label: 'Cliques', value: data?.clicks ?? 0, icon: MousePointerClick, hint: 'Visitas com ?ref=' },
    { label: 'Leads', value: data?.leads ?? 0, icon: Users, hint: 'Formulários com seu afiliado' },
    { label: 'Checkouts', value: data?.checkouts ?? 0, icon: CreditCard, hint: 'Pedidos atribuídos (pago ou estorno)' },
    { label: 'Pagos', value: data?.paid ?? 0, icon: CheckCircle2, hint: 'Comissões ativas (pending/aprovada/paga)' },
    { label: 'Reembolsos', value: data?.refunds ?? 0, icon: Undo2, hint: 'Clawback por reembolso/chargeback' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Funil</h2>
        <p className="text-sm text-muted-foreground">
          Cliques, leads, checkouts, pagos e reembolsos. Sem dado pessoal do comprador.
        </p>
      </div>
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((c) => <Skeleton key={c.label} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <CardTitle className="text-base">Estágio por indicado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">Sem nome, e-mail, telefone ou CPF do comprador.</p>
          {stages.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !stages.data?.length ? (
            <p className="text-muted-foreground">Nenhum indicado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {stages.data.map((s, i) => (
                <li key={`${s.updated_at}-${i}`} className="flex items-center justify-between">
                  <Badge variant="secondary">{STAGE_LABEL[s.stage] ?? s.stage}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {s.co_sell ? 'co-sell · ' : ''}
                    {s.updated_at ? new Date(s.updated_at).toLocaleDateString('pt-BR') : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
