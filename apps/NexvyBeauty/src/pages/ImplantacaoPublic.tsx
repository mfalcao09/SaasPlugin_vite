import { useParams, useNavigate } from 'react-router-dom';
import { useImplantacao } from '@/hooks/useImplantacao';
import { ImplantacaoWizard } from '@/components/onboarding/implantacao/ImplantacaoWizard';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: 'Link inválido. Verifique se a URL está completa.',
  expired_token: 'Este link expirou. Solicite um novo ao seu contato.',
  link_revoked: 'Este link foi revogado pelo administrador.',
  link_already_in_use: 'Este link já está sendo usado em outro navegador ou aba. Por segurança, só pode ser aberto em um lugar.',
  already_applied: 'A implantação desta empresa já foi concluída. Para alterar dados, entre em contato com o suporte.',
  org_not_found: 'Empresa não encontrada.',
};

export default function ImplantacaoPublic() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const { payload, status, saving, loading, error, organizationId, updateSection, submit } = useImplantacao({ token });

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (error) {
    const friendly = ERROR_MESSAGES[error] ?? 'Não foi possível carregar a implantação.';
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Não foi possível abrir</h1>
          <p className="text-muted-foreground text-sm">{friendly}</p>
          <Button onClick={() => navigate('/')}>Voltar</Button>
        </div>
      </div>
    );
  }
  if (!organizationId) return null;

  return (
    <div className="min-h-screen bg-background">
      <ImplantacaoWizard
        payload={payload} status={status} saving={saving}
        organizationId={organizationId}
        onChange={updateSection} onSubmit={submit}
      />
    </div>
  );
}
