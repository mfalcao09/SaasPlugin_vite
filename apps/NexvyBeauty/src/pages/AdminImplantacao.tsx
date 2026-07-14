// ─── Wizard de implantação (onboarding pós-compra) ──────────────────────────
// Wrapper canônico do ImplantacaoWizard. É usado em 3 pontos:
//   1. Rota /admin/implantacao (página cheia) — sem props;
//   2. CockpitShell (1º acesso, in-shell) — embedded + onComplete/onSkip;
//   3. ConfigurarOnboarding (/configurar, retomada) — embedded + callbacks.
// Concluir o fluxo marca guided_onboarding_completed_at (markCompleted);
// pular marca guided_onboarding_skipped_at (markSkipped) — assim o gate do
// CockpitShell não re-dispara o onboarding.

import { useNavigate } from 'react-router-dom';
import { useImplantacao } from '@/hooks/useImplantacao';
import { useGuidedOnboarding } from '@/hooks/useGuidedOnboarding';
import { ImplantacaoWizard } from '@/components/onboarding/implantacao/ImplantacaoWizard';
import { Loader2 } from 'lucide-react';

const MAX_SKIPS = 3;

interface AdminImplantacaoProps {
  /** true = montado dentro do shell (sem min-h-screen próprio). */
  embedded?: boolean;
  /** Override do fim do fluxo (default: markCompleted + navigate('/')). */
  onComplete?: () => void | Promise<void>;
  /** Override do skip (default: markSkipped + navigate('/')). */
  onSkip?: () => void | Promise<void>;
}

export default function AdminImplantacao({ embedded = false, onComplete, onSkip }: AdminImplantacaoProps = {}) {
  const navigate = useNavigate();
  const { markCompleted, markSkipped } = useGuidedOnboarding();
  const { payload, status, saving, loading, error, organizationId, updateSection, submit, reportStep } = useImplantacao({});

  if (loading) {
    return (
      <div className={embedded ? 'py-16 flex justify-center' : 'min-h-screen flex items-center justify-center'}>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !organizationId) {
    return (
      <div className={`${embedded ? 'py-16' : 'min-h-screen'} flex items-center justify-center p-6 text-center`}>
        <div>
          <p className="text-muted-foreground">{error ?? 'Não foi possível carregar seus dados.'}</p>
          <button onClick={() => navigate('/')} className="mt-4 underline text-primary">Voltar ao início</button>
        </div>
      </div>
    );
  }

  const skipKey = `implantacao_skip_count_${organizationId}`;
  const currentSkips = parseInt(localStorage.getItem(skipKey) || '0', 10) || 0;
  const skipsRemaining = Math.max(0, MAX_SKIPS - currentSkips);

  // Fim do step 9 (Montando seu Espaço) → marca concluído e vai pra Home.
  const handleFinish = async () => {
    if (onComplete) {
      await onComplete();
    } else {
      await markCompleted();
      navigate('/');
    }
  };

  const handleSkip = async () => {
    localStorage.setItem(skipKey, String(currentSkips + 1));
    if (onSkip) {
      await onSkip();
    } else {
      await markSkipped();
      navigate('/');
    }
  };

  return (
    <div className={embedded ? undefined : 'min-h-screen bg-background'}>
      <ImplantacaoWizard
        payload={payload} status={status} saving={saving}
        organizationId={organizationId}
        onChange={updateSection}
        onSubmit={submit}
        onFinish={handleFinish}
        onSkip={handleSkip}
        skipsRemaining={skipsRemaining}
        onStepChange={reportStep}
      />
    </div>
  );
}
