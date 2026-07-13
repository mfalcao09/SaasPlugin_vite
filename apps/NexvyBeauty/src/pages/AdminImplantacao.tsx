import { useNavigate } from 'react-router-dom';
import { useImplantacao } from '@/hooks/useImplantacao';
import { ImplantacaoWizard } from '@/components/onboarding/implantacao/ImplantacaoWizard';
import { Loader2 } from 'lucide-react';

const MAX_SKIPS = 3;

export default function AdminImplantacao() {
  const navigate = useNavigate();
  const { payload, status, saving, loading, error, organizationId, updateSection, submit } = useImplantacao({});

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (error || !organizationId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted-foreground">{error ?? 'Não foi possível carregar a implantação.'}</p>
          <button onClick={() => navigate('/')} className="mt-4 underline text-primary">Voltar ao painel</button>
        </div>
      </div>
    );
  }

  const skipKey = `implantacao_skip_count_${organizationId}`;
  const currentSkips = parseInt(localStorage.getItem(skipKey) || '0', 10) || 0;
  const skipsRemaining = Math.max(0, MAX_SKIPS - currentSkips);

  const handleSkip = () => {
    localStorage.setItem(skipKey, String(currentSkips + 1));
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <ImplantacaoWizard
        payload={payload} status={status} saving={saving}
        organizationId={organizationId}
        onChange={updateSection}
        onSubmit={async () => { const ok = await submit(); if (ok) setTimeout(() => navigate('/'), 1500); return ok; }}
        onSkip={handleSkip}
        skipsRemaining={skipsRemaining}
      />
    </div>
  );
}
