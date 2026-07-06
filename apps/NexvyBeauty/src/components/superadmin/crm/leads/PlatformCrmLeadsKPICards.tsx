import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { Users, Flame, Thermometer, Snowflake, TrendingUp } from 'lucide-react';

/**
 * KPIs do CRM de PLATAFORMA (super_admin) — pipeline único, desacoplado do tenant.
 * Zero campo de salão / organization. Números derivados de `platform_crm_leads`.
 *
 * Casca "Nexvy Lux" (L3 / F3): cards `surface-card surface-card-hover` com pílula-ícone
 * `h-10 w-10 rounded-xl`, label uppercase 12px tracking, valor 30px tabular. Anatomia
 * FIEL ao exemplar (bloco KPI de `PlatformCrmKanban.tsx`):
 *  - KPI de VALOR (Pipeline R$) = destaque: pílula `brand-gradient brand-glow` + valor `.text-value` (dourado).
 *  - KPIs de temperatura = pílula color-mix do token semântico (--hot/--warm/--cold), mesma
 *    receita da pílula de temperatura do lead card do kanban.
 * Estrutura/dados INTOCADOS — só forma.
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

// ── Config dos cards (Lux) ─────────────────────────────────────────────────
// `accent` = destaque brand (pílula brand-gradient + valor dourado .text-value).
// `tempVar` = token semântico de temperatura (§1.3 lux) → pílula color-mix 14% + ring 30%
// (mesma anatomia da pílula de temperatura do exemplar kanban lead card).
type KpiCard = {
  key: keyof PlatformCrmLeadsStats;
  label: string;
  icon: typeof Users;
  accent?: boolean;
  tempVar?: 'var(--hot)' | 'var(--warm)' | 'var(--cold)';
};

const cards: KpiCard[] = [
  { key: 'total', label: 'Total de Leads', icon: Users },
  { key: 'hot', label: 'Quentes', icon: Flame, tempVar: 'var(--hot)' },
  { key: 'warm', label: 'Mornos', icon: Thermometer, tempVar: 'var(--warm)' },
  { key: 'cold', label: 'Frios', icon: Snowflake, tempVar: 'var(--cold)' },
  { key: 'pipelineValue', label: 'Pipeline (R$)', icon: TrendingUp, accent: true },
];

export function PlatformCrmLeadsKPICards({ stats, isLoading }: PlatformCrmLeadsKPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const raw = stats?.[card.key] ?? 0;
        const isValue = card.key === 'pipelineValue';
        const display = isValue ? brl(raw) : raw.toLocaleString('pt-BR');

        // Pílula de temperatura: color-mix 14% do token + inset ring 30% (REF kanban).
        const tempPill: CSSProperties | undefined = card.tempVar
          ? {
              color: card.tempVar,
              backgroundColor: `color-mix(in oklab, ${card.tempVar} 14%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${card.tempVar} 30%, transparent)`,
            }
          : undefined;

        return (
          <div
            key={card.key}
            className={cn(
              'surface-card surface-card-hover p-5 flex items-start gap-3.5',
              // Total ocupa 2 colunas no grid mais estreito (preserva o layout original).
              card.key === 'total' && 'col-span-2 md:col-span-1',
            )}
          >
            {/* pílula ícone: destaque (valor) = brand-gradient + brand-glow;
               temperatura = color-mix do token; neutro = bg-muted + hairline */}
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                card.accent
                  ? 'brand-gradient brand-glow text-white'
                  : !card.tempVar && 'bg-muted border hairline text-muted-foreground',
              )}
              style={tempPill}
            >
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground truncate">
                {card.label}
              </p>
              {isLoading ? (
                <div className="mt-1 h-[30px] w-20 bg-muted animate-pulse rounded" />
              ) : (
                <p
                  className={cn(
                    'mt-1 text-[30px] font-semibold tracking-[-0.03em] tabular-nums leading-none truncate',
                    // Valor R$ em dourado (.text-value); demais no foreground padrão.
                    isValue && 'text-value',
                  )}
                >
                  {display}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
