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

// Cores de temperatura = literais SÓ da tabela §1.3 (semântica de domínio). Total/Pipeline
// via token de marca (primary). Sem gradiente de fundo (§1.2 pto 2/3).
const cards = [
  {
    key: 'total' as const,
    label: 'Total de Leads',
    icon: Users,
    iconColor: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    key: 'hot' as const,
    label: 'Quentes',
    icon: Flame,
    iconColor: 'text-red-600',
    bgColor: 'bg-red-500/10',
  },
  {
    key: 'warm' as const,
    label: 'Mornos',
    icon: Thermometer,
    iconColor: 'text-orange-600',
    bgColor: 'bg-orange-500/10',
  },
  {
    key: 'cold' as const,
    label: 'Frios',
    icon: Snowflake,
    iconColor: 'text-sky-600',
    bgColor: 'bg-sky-500/10',
  },
  {
    key: 'pipelineValue' as const,
    label: 'Pipeline (R$)',
    icon: DollarSign,
    iconColor: 'text-primary',
    bgColor: 'bg-primary/10',
  },
];

export function PlatformCrmLeadsKPICards({ stats, isLoading }: PlatformCrmLeadsKPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const raw = stats?.[card.key] ?? 0;
        const display = card.key === 'pipelineValue' ? brl(raw) : raw.toLocaleString('pt-BR');

        return (
          <Card
            key={card.key}
            className={cn(
              'transition-shadow hover:shadow-md',
              card.key === 'total' && 'col-span-2 md:col-span-1',
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    {card.label}
                  </p>
                  {isLoading ? (
                    <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                  ) : (
                    <p className="text-2xl font-bold tabular-nums text-foreground truncate">
                      {display}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
                    card.bgColor,
                  )}
                >
                  <Icon className={cn('h-4 w-4', card.iconColor)} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
