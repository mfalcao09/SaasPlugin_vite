import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useFeatureFlag } from '@/hooks/usePlanGating';

/** Rótulos amigáveis das features pagas (pra mensagem do cadeado). */
export const FEATURE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  campaigns: 'Campanhas de marketing',
  outreach: 'Reativação com IA (AI Growth)',
  capture_funnels: 'Funis de captação',
  internal_chat: 'Chat interno da equipe',
  voice_agents: 'Agentes de voz',
  integrations: 'Integrações',
  external_api: 'API externa',
  webhooks: 'Webhooks',
};

interface UpgradeLockProps {
  feature: string;
  /** mensagem custom; senão usa o rótulo padrão */
  title?: string;
  description?: string;
  className?: string;
  compact?: boolean;
}

/** Cartão de "recurso bloqueado pelo plano" com CTA de upgrade. */
export function UpgradeLock({ feature, title, description, className, compact }: UpgradeLockProps) {
  const navigate = useNavigate();
  const label = FEATURE_LABELS[feature] || 'Este recurso';
  return (
    <Card className={cn('flex flex-col items-center justify-center text-center gap-3 p-6 border-dashed', className)}>
      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{title || `${label} é um recurso de planos superiores`}</p>
        {!compact && (
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {description || 'Faça upgrade do seu plano para liberar este recurso e crescer mais rápido.'}
          </p>
        )}
      </div>
      <Button size="sm" onClick={() => navigate('/plano')} className="gap-1.5">
        <Sparkles className="h-4 w-4" />
        Ver planos
      </Button>
    </Card>
  );
}

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  /** UI alternativa quando bloqueado; default = <UpgradeLock/> */
  fallback?: ReactNode;
}

/**
 * Envolve um recurso pago: renderiza `children` se o plano libera a feature,
 * senão mostra o `fallback` (default = cadeado de upgrade). Fail-open enquanto
 * carrega (não pisca cadeado). Use em página/seção/aba de feature paga.
 */
export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { enabled, loading } = useFeatureFlag(feature);
  if (loading || enabled) return <>{children}</>;
  return <>{fallback ?? <UpgradeLock feature={feature} />}</>;
}
