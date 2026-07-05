import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Clock, Send, MessageCircle, Percent, Flag } from 'lucide-react';
import type { PlatformFollowupPanelStats } from '../data/usePlatformCrmFollowup';

/**
 * KPIs da seção Follow-Up (família F3 do TEMPLATE-UI-GESTAO). Restyle de FORMA
 * sobre o porte 1:1 do CRM Vendus: contrato (`PlatformFollowupPanelStats`)
 * intacto; ícone padronizado em `bg-primary/10 text-primary` (§F3 — sem cores
 * decorativas fora dos tokens/§1.3), valor `text-2xl font-bold tabular-nums`,
 * label `text-[11px] uppercase`. Cor de SIGNIFICADO (§1.3) só na "Taxa de
 * Recuperação", que é um KPI de sucesso semântico (verde).
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
      value: k?.leads_in_followup ?? 0,
      sub: 'Em réguas ativas',
      accent: false,
    },
    {
      icon: Clock,
      title: 'Aguardando Próxima Tentativa',
      value: k?.waiting_next ?? 0,
      sub: 'Leads',
      accent: false,
    },
    {
      icon: Send,
      title: 'Follow-ups Enviados Hoje',
      value: k?.sent_today ?? 0,
      sub: 'Total de envios',
      accent: false,
    },
    {
      icon: MessageCircle,
      title: 'Respostas Recuperadas',
      value: k?.recovered ?? 0,
      sub: 'Após follow-up',
      accent: false,
    },
    {
      // Sucesso semântico (§1.3): destaque verde no ícone e no valor.
      icon: Percent,
      title: 'Taxa de Recuperação',
      value: recoveryRate,
      sub: 'Respostas / Enviados',
      accent: true,
    },
    {
      icon: Flag,
      title: 'Réguas Encerradas',
      value: k?.rulers_closed ?? 0,
      sub: 'Esgotaram tentativas',
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.title}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div
                  className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    it.accent
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-snug">
                  {it.title}
                </div>
              </div>
              <div
                className={`text-2xl font-bold tracking-tight tabular-nums ${
                  it.accent ? 'text-emerald-600' : ''
                }`}
              >
                {loading ? <Skeleton className="h-8 w-16" /> : it.value}
              </div>
              <div className="text-[11px] text-muted-foreground">{it.sub}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
