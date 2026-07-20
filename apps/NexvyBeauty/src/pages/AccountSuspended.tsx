import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { AlertTriangle, LogOut } from 'lucide-react';

/** Tela mostrada quando a org da pessoa está com plan_status='suspended'
 *  (reembolso/chargeback/cancelamento marcados pelo cakto-webhook). Não é um
 *  bloqueio hostil — orienta a regularizar e falar com o suporte. Renderizada
 *  pelo ProtectedRoute; SÓ para o valor 'suspended' explícito (fail-open). */
export default function AccountSuspended() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Sua assinatura está suspensa</h1>
          <p className="text-muted-foreground text-sm">
            Identificamos uma pendência no pagamento e o acesso ao seu espaço ficou
            pausado. Seus dados estão seguros — assim que a assinatura for
            regularizada, tudo volta exatamente como estava.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Para regularizar, fale com a gente no WhatsApp{' '}
          <a
            href="https://wa.me/5511955021205"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            (11) 95502-1205
          </a>{' '}
          ou responda o e-mail da sua compra.
        </div>
        <Button variant="outline" className="w-full" onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}
