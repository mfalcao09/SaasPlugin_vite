import { Skeleton } from '@/components/ui/skeleton';
import { Users, Clock, Send, MessageCircle, Percent, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlatformFollowupPanelStats } from '../data/usePlatformCrmFollowup';

/**
 * KPIs da seção Follow-Up (família F5) na anatomia LUX do exemplar Kanban.
 * Restyle de FORMA sobre o porte 1:1 do CRM Vendus: contrato
 * (`PlatformFollowupPanelStats`) intacto. Cada KPI = `.surface-card` pílula-ícone
 * (`h-10 w-10 rounded-xl`) + label uppercase 12px + valor 30px tabular. O KPI de
 * DESTAQUE é a "Taxa de Recuperação" (sucesso semântico) → pílula `.brand-gradient
 * .brand-glow` (dourado nobre no tema lux). Demais ícones = `bg-muted hairline`.
 * Sem chip de delta: o contrato de stats não expõe variação período-a-período —
 * não fabricamos delta (§5 anti-alucinação). Skeleton reproduz a mesma anatomia.
 */

interface Props {
  stats?: PlatformFollowupPanelStats;
  loading?: boolean;
}

export function FollowupKpiCards({ stats, loading }: Props) {
  const k = stats?.kpis;
  const recoveryRate =
    k && k.sent_in_period > 0 ? ((k.recovered / k.sent_in_period) * 100).toFixed(1) + '%' : '0%';

  const items = [
    {
      icon: Users,
      title: 'Leads em Follow-up',
      value: String(k?.leads_in_followup ?? 0),
      sub: 'Em réguas ativas',
      accent: false,
    },
    {
      icon: Clock,
      title: 'Aguardando Próxima Tentativa',
      value: String(k?.waiting_next ?? 0),
      sub: 'Leads',
      accent: false,
    },
    {
      icon: Send,
      title: 'Follow-ups Enviados Hoje',
      value: String(k?.sent_today ?? 0),
      sub: 'Total de envios',
      accent: false,
    },
    {
      icon: MessageCircle,
      title: 'Respostas Recuperadas',
      value: String(k?.recovered ?? 0),
      sub: 'Após follow-up',
      accent: false,
    },
    {
      // KPI de destaque (§L2 REF): pílula brand-gradient + brand-glow.
      icon: Percent,
      title: 'Taxa de Recuperação',
      value: recoveryRate,
      sub: 'Respostas / Enviados',
      accent: true,
    },
    {
      icon: Flag,
      title: 'Réguas Encerradas',
      value: String(k?.rulers_closed ?? 0),
      sub: 'Esgotaram tentativas',
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div
            key={it.title}
            className="surface-card surface-card-hover p-5 flex items-start gap-3.5"
          >
            {/* pílula ícone: destaque = brand-gradient + brand-glow; demais = bg-muted + hairline */}
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                it.accent
                  ? 'brand-gradient brand-glow text-white'
                  : 'bg-muted border hairline text-muted-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1 flex flex-col">
              {/* SIMETRIA (Marcelo 07-12): zona do título com altura FIXA (3 linhas)
                  → valor e subtítulo alinham na mesma guia em todos os cards. */}
              <p className="text-[12px] font-medium text-muted-foreground leading-snug min-h-[50px]">
                {it.title}
              </p>
              {loading ? (
                <Skeleton className="mt-1 h-[30px] w-16" />
              ) : (
                <p className="mt-1 text-[30px] font-semibold tracking-[-0.03em] tabular-nums leading-none truncate">
                  {it.value}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground truncate">{it.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
