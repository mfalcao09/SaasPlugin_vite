import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Users, Flame, Thermometer, Snowflake, DollarSign } from 'lucide-react';

/**
 * KPIs do CRM de PLATAFORMA (super_admin) — pipeline único, desacoplado do tenant.
 * Zero campo de salão / organization. Números derivados de `platform_crm_leads`.
 */
export interface PlatformCrmLeadsStats {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  /** Soma de deal_value dos leads (pipeline em R$). */
  pipelineValue: number;
}

interface PlatformCrmLeadsKPICardsProps {
  stats: PlatformCrmLeadsStats | null | undefined;
  isLoading?: boolean;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });

const cards = [
  {
    key: 'total' as const,
    label: 'Total de Leads',
    icon: Users,
    color: 'from-primary to-primary/70',
    iconColor: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    key: 'hot' as const,
    label: 'Quentes',
    icon: Flame,
    color: 'from-red-500 to-orange-500',
    iconColor: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    key: 'warm' as const,
    label: 'Mornos',
    icon: Thermometer,
    color: 'from-amber-500 to-yellow-500',
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    key: 'cold' as const,
    label: 'Frios',
    icon: Snowflake,
    color: 'from-blue-500 to-cyan-500',
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    key: 'pipelineValue' as const,
    label: 'Pipeline (R$)',
    icon: DollarSign,
    color: 'from-emerald-500 to-teal-500',
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
];

export function PlatformCrmLeadsKPICards({ stats, isLoading }: PlatformCrmLeadsKPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const raw = stats?.[card.key] ?? 0;
        const display =
          card.key === 'pipelineValue' ? brl(raw) : raw.toLocaleString('pt-BR');

        return (
          <Card
            key={card.key}
            className={cn(
              'relative overflow-hidden group hover:shadow-lg transition-all duration-300',
              'border-0 bg-gradient-to-br',
              card.key === 'total' && 'col-span-2 md:col-span-1',
            )}
          >
            <div className={cn('absolute inset-0 opacity-5 bg-gradient-to-br', card.color)} />
            <CardContent className="p-4 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {card.label}
                  </p>
                  {isLoading ? (
                    <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                  ) : (
                    <p className="text-2xl md:text-3xl font-bold text-foreground truncate">
                      {display}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    'p-2 rounded-xl transition-transform group-hover:scale-110 shrink-0',
                    card.bgColor,
                  )}
                >
                  <Icon className={cn('h-5 w-5', card.iconColor)} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
