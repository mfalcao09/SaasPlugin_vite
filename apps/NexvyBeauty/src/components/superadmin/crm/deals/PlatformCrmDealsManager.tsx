import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Handshake, TrophyIcon, XCircle, TrendingUp } from 'lucide-react';
import {
  usePlatformCrmDeals,
  type PlatformCrmDealStatus,
  type PlatformCrmDealWithLead,
} from '../data/usePlatformCrmDeals';

/**
 * NEGÓCIOS do CRM de PLATAFORMA (super_admin) — lista de deals fechados do pipeline
 * ÚNICO, desacoplado do tenant. Usa EXCLUSIVAMENTE `platform_crm_deals` via
 * `usePlatformCrmDeals` + componentes @/components/ui. Sem organization/product,
 * sem cockpit do salão.
 *
 * Composição: KPIs (total ganho, nº ganhos/perdidos, ticket médio) + filtro por
 * status + tabela.
 */

const STATUS_LABEL: Record<PlatformCrmDealStatus, string> = {
  won: 'Ganho',
  lost: 'Perdido',
  cancelled: 'Cancelado',
};

const STATUS_ALL = 'all';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  // YYYY-MM-DD direto (evita shift de timezone do new Date()).
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'won') return <Badge className="bg-green-500 hover:bg-green-500/90">Ganho</Badge>;
  if (status === 'lost') return <Badge variant="destructive">Perdido</Badge>;
  if (status === 'cancelled') return <Badge variant="outline">Cancelado</Badge>;
  return <Badge variant="secondary">{status ?? '—'}</Badge>;
}

interface DealsStats {
  totalWonValue: number;
  wonCount: number;
  lostCount: number;
  avgTicket: number;
}

export function PlatformCrmDealsManager() {
  const [statusFilter, setStatusFilter] = useState<PlatformCrmDealStatus | typeof STATUS_ALL>(
    STATUS_ALL,
  );

  const { data: deals = [], isLoading } = usePlatformCrmDeals(
    statusFilter === STATUS_ALL ? undefined : { status: statusFilter },
  );

  // KPIs sempre calculados sobre TODOS os deals (independente do filtro de tabela).
  const { data: allDeals = [] } = usePlatformCrmDeals();

  const stats: DealsStats = useMemo(() => {
    const won = allDeals.filter((d) => d.status === 'won');
    const totalWonValue = won.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);
    return {
      totalWonValue,
      wonCount: won.length,
      lostCount: allDeals.filter((d) => d.status === 'lost').length,
      avgTicket: won.length > 0 ? totalWonValue / won.length : 0,
    };
  }, [allDeals]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Handshake className="h-7 w-7 text-primary" />
            Negócios
          </h1>
          <p className="text-muted-foreground mt-1">
            Deals fechados do pipeline único da plataforma.
          </p>
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as PlatformCrmDealStatus | typeof STATUS_ALL)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>Todos os status</SelectItem>
            <SelectItem value="won">{STATUS_LABEL.won}</SelectItem>
            <SelectItem value="lost">{STATUS_LABEL.lost}</SelectItem>
            <SelectItem value="cancelled">{STATUS_LABEL.cancelled}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total ganho"
          value={formatCurrency(stats.totalWonValue)}
          icon={<TrophyIcon className="h-5 w-5 text-green-500" />}
        />
        <KpiCard
          title="Negócios ganhos"
          value={String(stats.wonCount)}
          icon={<TrendingUp className="h-5 w-5 text-green-500" />}
        />
        <KpiCard
          title="Negócios perdidos"
          value={String(stats.lostCount)}
          icon={<XCircle className="h-5 w-5 text-destructive" />}
        />
        <KpiCard
          title="Ticket médio"
          value={formatCurrency(stats.avgTicket)}
          icon={<Handshake className="h-5 w-5 text-primary" />}
        />
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Handshake className="h-14 w-14 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Nenhum negócio encontrado
              </h3>
              <p className="text-muted-foreground max-w-md">
                Negócios fechados no funil aparecem aqui.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fechado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal: PlatformCrmDealWithLead) => (
                  <TableRow key={deal.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{deal.lead?.name ?? '—'}</span>
                        {deal.lead?.company && (
                          <span className="text-xs text-muted-foreground">
                            {deal.lead.company}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{deal.plan_name ?? '—'}</TableCell>
                    <TableCell>{formatCurrency(deal.deal_value ?? 0)}</TableCell>
                    <TableCell>
                      <StatusBadge status={deal.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(deal.closed_at)}
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

function KpiCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

export default PlatformCrmDealsManager;
