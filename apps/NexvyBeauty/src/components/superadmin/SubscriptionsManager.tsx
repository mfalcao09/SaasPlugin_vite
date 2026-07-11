import { useState } from 'react';
import {
  CreditCard,
  Search,
  AlertTriangle,
  Mail,
  Ban,
  CheckCircle,
  Clock,
  Gift
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAllSubscriptions, useUpdateSubscription } from '@/hooks/useSuperAdmin';
import { useActivePlans } from '@/hooks/usePlatformPlans';
import { Skeleton } from '@/components/ui/skeleton';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export function SubscriptionsManager() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');

  const { data: subscriptions, isLoading } = useAllSubscriptions();
  // TODO(A1.3-produto): entidade sem product_id — filtro inerte. Assinaturas ligam a
  // organizations + plan_type (slug do plano), não a platform_crm_products. Sem
  // product_id por onde o filtro GLOBAL agir; mostra tudo.
  const { data: activePlans } = useActivePlans();
  const updateSubscription = useUpdateSubscription();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Contagem de assinaturas por slug de plano (plan_type unificado para os
  // slugs do catálogo). Computada das subscriptions já carregadas, sem
  // depender de números hardcoded.
  const countByPlan = (slug: string) =>
    subscriptions?.filter((sub: any) => sub.plan_type === slug).length || 0;

  const filteredSubs = subscriptions?.filter((sub: any) => {
    const matchesSearch = sub.organizations?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    const matchesPlan = planFilter === 'all' || sub.plan_type === planFilter;
    
    return matchesSearch && matchesStatus && matchesPlan;
  }) || [];

  const overdueSubs = subscriptions?.filter((sub: any) => 
    sub.status === 'past_due' || 
    (sub.current_period_end && new Date(sub.current_period_end) < new Date())
  ) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Ativo</Badge>;
      case 'past_due':
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Em Atraso</Badge>;
      case 'canceled':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Cancelado</Badge>;
      case 'suspended':
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Suspenso</Badge>;
      case 'trialing':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Trial</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Cor do indicador (dot) por slug do tier — espelha o esquema visual antigo.
  const getPlanDotColor = (slug: string) => {
    switch (slug) {
      case 'trial':
        return 'bg-gray-400';
      case 'starter':
        return 'bg-blue-500';
      case 'pro':
        return 'bg-primary';
      case 'premium':
        return 'bg-violet-500';
      default:
        return 'bg-muted-foreground';
    }
  };

  const getPlanBadge = (planType: string) => {
    // Nome de exibição vem do catálogo quando disponível; cai no slug cru
    // se o plano não estiver mais listado em platform_plans.
    const planName =
      activePlans?.find((p) => p.slug === planType)?.name || planType;

    switch (planType) {
      case 'trial':
        return <Badge variant="outline">{planName}</Badge>;
      case 'starter':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">{planName}</Badge>;
      case 'pro':
        return <Badge className="bg-primary/10 text-primary border-primary/20">{planName}</Badge>;
      case 'premium':
        return <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/20">{planName}</Badge>;
      default:
        return <Badge variant="secondary">{planName}</Badge>;
    }
  };

  const handleSendReminder = async (sub: any) => {
    toast.success(`Lembrete enviado para ${sub.organizations?.name}`);
  };

  const handleSuspend = async (sub: any) => {
    try {
      await updateSubscription.mutateAsync({
        id: sub.id,
        status: 'suspended',
      });
      toast.success('Assinatura suspensa');
    } catch (error) {
      toast.error('Erro ao suspender assinatura');
    }
  };

  const handleMarkPaid = async (sub: any) => {
    try {
      await updateSubscription.mutateAsync({
        id: sub.id,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      toast.success('Assinatura marcada como paga');
    } catch (error) {
      toast.error('Erro ao atualizar assinatura');
    }
  };

  // Bonificar / Isentar: alterna is_complimentary. Quando bonificada, a
  // assinatura continua ativa mas conta como R$0 de receita (excluída do MRR).
  const handleToggleComplimentary = async (sub: any) => {
    const next = !sub.is_complimentary;
    try {
      await updateSubscription.mutateAsync({
        id: sub.id,
        is_complimentary: next,
        complimentary_reason: next ? 'Cortesia concedida pelo super admin' : null,
        complimentary_since: next ? new Date().toISOString() : null,
      });
      toast.success(next ? 'Assinatura bonificada (cortesia)' : 'Bonificação removida');
    } catch (error) {
      toast.error('Erro ao atualizar bonificação');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinaturas</h1>
        <p className="text-muted-foreground">Gerencie planos e assinaturas das empresas</p>
      </div>

      {/* Plan Summary — gerado do catálogo (platform_plans), sem preço hardcoded */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(activePlans || []).map((plan) => (
          <Card key={plan.id}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${getPlanDotColor(plan.slug)}`} />
                <span className="font-medium">{plan.name}</span>
              </div>
              <p className="text-2xl font-bold mt-2 tabular-nums">{countByPlan(plan.slug)}</p>
              <p className="text-xs text-muted-foreground">
                {Number(plan.price_monthly) > 0
                  ? `${formatCurrency(Number(plan.price_monthly))}/mês`
                  : 'Gratuito'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overdue Subscriptions Alert */}
      {overdueSubs.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              Assinaturas em Atraso ({overdueSubs.length})
            </CardTitle>
            <CardDescription>
              Empresas com pagamento pendente que precisam de atenção
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overdueSubs.slice(0, 3).map((sub: any) => {
                const daysOverdue = sub.current_period_end 
                  ? differenceInDays(new Date(), new Date(sub.current_period_end))
                  : 0;
                
                return (
                  <div 
                    key={sub.id}
                    className="flex items-center justify-between p-3 bg-background rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{sub.organizations?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(sub.price_monthly || 0)} - Vencido há {daysOverdue} dias
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleSendReminder(sub)}>
                        <Mail className="h-4 w-4 mr-1" />
                        Lembrete
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSuspend(sub)}>
                        <Ban className="h-4 w-4 mr-1" />
                        Suspender
                      </Button>
                      <Button size="sm" onClick={() => handleMarkPaid(sub)}>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Pago
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="past_due">Em Atraso</SelectItem>
                <SelectItem value="suspended">Suspenso</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
                <SelectItem value="trialing">Trial</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(activePlans || []).map((plan) => (
                  <SelectItem key={plan.id} value={plan.slug}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredSubs.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma assinatura encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Empresa</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Plano</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Valor</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground">Renovação</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubs.map((sub: any) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">
                      {sub.organizations?.name || 'N/A'}
                    </TableCell>
                    <TableCell>{getPlanBadge(sub.plan_type)}</TableCell>
                    <TableCell className="tabular-nums">
                      {sub.is_complimentary ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          <Gift className="h-3 w-3 mr-1" />
                          Cortesia
                        </Badge>
                      ) : (
                        formatCurrency(sub.price_monthly || 0)
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(sub.status)}</TableCell>
                    <TableCell className="tabular-nums">
                      {sub.current_period_end
                        ? format(new Date(sub.current_period_end), "dd/MM/yyyy", { locale: ptBR })
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={sub.is_complimentary ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => handleToggleComplimentary(sub)}
                        disabled={updateSubscription.isPending}
                        title={sub.is_complimentary ? 'Remover bonificação' : 'Bonificar / Isentar'}
                      >
                        <Gift className="h-4 w-4 mr-1" />
                        {sub.is_complimentary ? 'Isenta' : 'Bonificar'}
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Clock className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
