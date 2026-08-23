import { useMemo } from 'react';
import { 
  Building2, 
  Users, 
  CreditCard, 
  TrendingUp,
  DollarSign,
  Target,
  Activity,
  CheckCircle,
  Package
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSuperAdminStats, useAuditLogs, useAllOrganizations } from '@/hooks/useSuperAdmin';
import { useActivePlans } from '@/hooks/usePlatformPlans';
import {
  usePlatformCrmProducts,
  usePlatformCrmProductsStats,
} from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { buildHouseProductRecorte } from '@/components/superadmin/house/buildHouseProductRecorte';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SuperAdminDashboardProps {
  onNavigate?: (section: string) => void;
}

// Cor do indicador (dot) por slug do tier — continuidade visual; o NOME vem do catálogo.
const PLAN_DOT: Record<string, string> = {
  trial: 'bg-gray-400',
  starter: 'bg-blue-500',
  pro: 'bg-primary',
  premium: 'bg-violet-500',
};

export function SuperAdminDashboard({ onNavigate }: SuperAdminDashboardProps = {}) {
  const { data: stats, isLoading: statsLoading } = useSuperAdminStats();
  const { data: logs, isLoading: logsLoading } = useAuditLogs(10);
  const { data: orgs, isLoading: orgsLoading } = useAllOrganizations();
  const { data: activePlans } = useActivePlans();
  const { data: catalogProducts, isLoading: catalogLoading } = usePlatformCrmProducts();
  const { data: productStats, isLoading: productStatsLoading } = usePlatformCrmProductsStats();
  const { activeProductId } = useActivePlatformProduct();

  const houseRecorte = useMemo(
    () =>
      buildHouseProductRecorte(
        (catalogProducts ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
        })),
        productStats,
        activeProductId,
      ),
    [catalogProducts, productStats, activeProductId],
  );
  const houseRecorteLoading = catalogLoading || productStatsLoading;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const recentOrgs = orgs?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard da casa SaaS</h1>
        <p className="text-muted-foreground">
          Assinaturas dos clientes e recorte por linha de produto
        </p>
      </div>

      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MRR Total</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(stats?.mrr || 0)}</div>
                <p className="text-xs text-muted-foreground">Assinaturas dos clientes</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ARR Total</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(stats?.arr || 0)}</div>
                <p className="text-xs text-muted-foreground">Assinaturas × 12</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Volume de Deals</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Target className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(stats?.totalDealsValue || 0)}</div>
                <p className="text-xs text-muted-foreground">Total processado</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads na Plataforma</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums">{stats?.leads?.toLocaleString('pt-BR') || 0}</div>
                <p className="text-xs text-muted-foreground">Total de leads</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Empresas</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums">{stats?.organizations || 0}</div>
                <p className="text-xs text-muted-foreground">Clientes que compram o SaaS</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Usuários</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums">{stats?.users || 0}</div>
                <p className="text-xs text-muted-foreground">Cadastrados</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assinaturas</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <CreditCard className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold tabular-nums">{stats?.activeSubscriptions || 0}</div>
                <p className="text-xs text-muted-foreground">Ativas</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saúde</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <span className="text-lg font-semibold text-emerald-500">Operacional</span>
            </div>
            <p className="text-xs text-muted-foreground">Todos os serviços ok</p>
          </CardContent>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Planos</CardTitle>
            <CardDescription>Assinaturas por tipo de plano</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {activePlans?.map((plan) => (
                  <div key={plan.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${PLAN_DOT[plan.slug] ?? 'bg-muted-foreground'}`} />
                      <span className="font-medium">{plan.name}</span>
                    </div>
                    <Badge variant="secondary">{stats?.planCounts?.[plan.slug] ?? 0}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent client tenants */}
        <Card>
          <CardHeader>
            <CardTitle>Clientes recentes</CardTitle>
            <CardDescription>Empresas que compram o SaaS — não a Nexvy</CardDescription>
          </CardHeader>
          <CardContent>
            {orgsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentOrgs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum cliente cadastrado ainda
              </p>
            ) : (
              <div className="space-y-3">
                {recentOrgs.map((org: any) => (
                  <div 
                    key={org.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(org.created_at), "dd MMM yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      variant={org.status === 'active' ? 'default' : 'secondary'}
                      className={org.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}
                    >
                      {org.status === 'active' ? 'Ativo' : org.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recorte por produto — catálogo + pipeline real (sem MRR inventado) */}
      <Card>
        <CardHeader>
          <CardTitle>Por produto</CardTitle>
          <CardDescription>
            Linhas SaaS do catálogo
            {activeProductId ? ' · recorte do produto ativo' : ' · todos os produtos'}
            {' · '}
            {houseRecorte.totals.products} {houseRecorte.totals.products === 1 ? 'linha' : 'linhas'}
            {', '}
            {houseRecorte.totals.leadCount.toLocaleString('pt-BR')} leads
            {', '}
            {houseRecorte.totals.wonCount.toLocaleString('pt-BR')} ganhos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {houseRecorteLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : houseRecorte.rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {activeProductId
                ? 'Produto ativo não está no catálogo'
                : 'Nenhum produto no catálogo ainda'}
            </p>
          ) : (
            <div className="space-y-3">
              {houseRecorte.rows.map((row) => (
                <div
                  key={row.productId}
                  className="flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {row.name}
                        {row.status ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {row.status}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.leadCount.toLocaleString('pt-BR')} leads
                        {' · '}
                        {row.wonCount.toLocaleString('pt-BR')} ganhos
                        {' · '}
                        {row.sellersCount.toLocaleString('pt-BR')} vendedores
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tabular-nums">{formatCurrency(row.wonValue)}</p>
                    <p className="text-xs text-muted-foreground">ganhos fechados</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Atividade Recente</CardTitle>
          <CardDescription>Últimas ações na plataforma</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs?.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma atividade registrada ainda
            </p>
          ) : (
            <div className="space-y-3">
              {logs?.map((log: any) => (
                <div 
                  key={log.id}
                  className="flex items-center justify-between p-3 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <div>
                      <p className="text-sm">{log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.profiles?.full_name || 'Sistema'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
