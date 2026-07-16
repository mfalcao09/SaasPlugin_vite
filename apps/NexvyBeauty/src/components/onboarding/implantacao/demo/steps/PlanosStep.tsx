// ─── Tela 4 do wizard demo — `planos` (Esteira E2.2 / E2.3) ─────────────────
// Âncora de valor: o relatório vira o argumento ("você está perdendo R$ X/mês —
// o plano custa R$ Y"). Preços vêm da view public_plans (fonte única, nunca
// hardcoded): list_price_monthly = "de R$383" → price_monthly = "por R$275".
// CTA → checkout Cakto com ?src=demo-wizard (a atribuição sai de graça pelo
// pipeline extractSellerRef). Aviso de retenção 72h visível.

import type { FC } from 'react';
import { Check, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePublicPlans, type PublicPlan } from '@/hooks/usePlatformPlans';
import { formatBRLWhole } from '@/cockpit/home/format';

// Anexa ?src=demo-wizard preservando query existente do checkout.
function checkoutWithSrc(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'src=demo-wizard';
}

export const PlanosStep: FC<{
  /** total recuperável do relatório (R$) — vira a âncora de valor. */
  lostAmount?: number;
}> = ({ lostAmount }) => {
  const { data: allPlans, isLoading } = usePublicPlans();
  const planos = (allPlans ?? []).filter((p) => p.is_public);

  const goToCheckout = (plan: PublicPlan) => {
    if (plan.checkout_url) window.location.href = checkoutWithSrc(plan.checkout_url);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Recupere esse dinheiro todo mês</h2>
        {lostAmount && lostAmount > 0 ? (
          <p className="text-muted-foreground max-w-lg mx-auto text-sm">
            Você tem <span className="font-semibold text-foreground">{formatBRLWhole(lostAmount)}</span>{' '}
            parados em clientes que sumiram. A partir de{' '}
            <span className="font-semibold text-foreground">
              {planos.length ? formatBRLWhole(Math.min(...planos.map((p) => p.price_monthly))) : '—'}/mês
            </span>{' '}
            sua EquipIA trabalha pra trazer elas de volta — todo dia, no automático.
          </p>
        ) : (
          <p className="text-muted-foreground max-w-lg mx-auto text-sm">
            Sua EquipIA acha e reconquista clientes no automático. Escolha seu plano e comece agora.
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : planos.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Os planos não puderam ser carregados agora. Recarregue a página em instantes.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {planos.map((plan) => {
            const hasAnchor = plan.list_price_monthly != null && plan.list_price_monthly > plan.price_monthly;
            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col p-6 ${plan.highlight_label ? 'border-primary shadow-lg shadow-primary/10' : ''}`}
              >
                {plan.highlight_label && (
                  <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    {plan.highlight_label}
                  </Badge>
                )}
                <h3 className="text-lg font-bold">{plan.name}</h3>
                {plan.description && (
                  <p className="text-xs text-muted-foreground mt-1 min-h-[2.5rem]">{plan.description}</p>
                )}

                <div className="mt-4">
                  {hasAnchor && (
                    <span className="block text-sm text-muted-foreground line-through">
                      de {formatBRLWhole(plan.list_price_monthly as number)}
                    </span>
                  )}
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight text-foreground">
                      {formatBRLWhole(plan.price_monthly)}
                    </span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                  {hasAnchor && (
                    <span className="text-xs font-semibold text-primary">preço de lançamento</span>
                  )}
                </div>

                <ul className="mt-4 space-y-1.5 text-sm flex-1">
                  {planFeatures(plan).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-muted-foreground">
                      <Check className="h-4 w-4 text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => goToCheckout(plan)}
                  disabled={!plan.checkout_url}
                  className="mt-5 w-full gap-1.5"
                  variant={plan.highlight_label ? 'default' : 'outline'}
                >
                  Assinar {plan.name} <ArrowRight className="h-4 w-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Não contratou? Tudo que importamos é apagado em até 72h, com confirmação. Sem pegadinha.
      </p>
    </div>
  );
};

// Lista curta de features "ligadas" no plano (só as que a dona entende).
function planFeatures(plan: PublicPlan): string[] {
  const feats: string[] = [];
  if (plan.feature_whatsapp) feats.push('WhatsApp integrado');
  if (plan.feature_scheduling) feats.push('Agenda inteligente');
  if (plan.feature_ai_agents) feats.push('EquipIA (agentes de IA)');
  if (plan.feature_campaigns) feats.push('Campanhas e reativação');
  if (plan.feature_pipeline) feats.push('CRM de vendas');
  if (plan.feature_instagram) feats.push('Instagram integrado');
  return feats.slice(0, 5);
}

export default PlanosStep;
