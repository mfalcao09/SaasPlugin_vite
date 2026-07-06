import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, Smartphone, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePlatformPushNotifications } from '@/hooks/usePlatformPushNotifications';
import { toast } from 'sonner';

/**
 * Push notifications card for the PLATFORM CRM (super_admin).
 * Decoupled port of the Vendus `PushNotificationsCard`, SIMPLIFIED for v1:
 * no granular preference toggles (dispatch broadcasts to all subscribed
 * super-admins). Just enable/disable push on THIS device.
 */
export function PlatformPushNotificationsCard() {
  const {
    supported, permission, subscribed, localSubscribed, backendRegistered,
    needsIosInstall, loading, enable, disable,
  } = usePlatformPushNotifications();

  const handleEnable = async () => {
    const r = await enable();
    if (r.ok) {
      toast.success('Notificações ativadas neste dispositivo');
    } else if (r.reason === 'ios_needs_install') {
      toast.error('No iPhone, instale o app na tela inicial antes de ativar', {
        description: 'No Safari: Compartilhar → Adicionar à Tela de Início. Ou use o Telegram no celular.',
      });
    } else if (r.reason === 'denied') {
      toast.error('Permissão negada nas configurações do navegador');
    } else if (r.reason === 'unsupported') {
      toast.error('Este navegador não suporta notificações push');
    } else if (r.reason === 'no_vapid_key') {
      toast.error('Chave VAPID não configurada no build');
    } else {
      toast.error('Falha ao ativar notificações', { description: r.reason || 'backend_failed' });
    }
  };

  const handleDisable = async () => {
    await disable();
    toast.success('Notificações desativadas neste dispositivo');
  };

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell size={20} />
            Notificações push
          </CardTitle>
          <CardDescription>
            Este navegador não suporta notificações push. Acesse pelo Chrome ou Safari atualizado —
            ou receba os alertas pelo Telegram.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell size={20} />
          Notificações push
        </CardTitle>
        <CardDescription>
          Receba alertas da plataforma neste dispositivo mesmo com a aba fechada.
          No celular, os alertas também chegam pelo Telegram.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsIosInstall && (
          <div className="flex gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <Smartphone className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                No iPhone, instale o app primeiro
              </p>
              <p className="text-amber-800 dark:text-amber-300">
                Toque em <strong>Compartilhar</strong> no Safari → <strong>Adicionar à Tela de Início</strong>,
                depois abra pelo ícone. Ou simplesmente use o Telegram no celular.
              </p>
            </div>
          </div>
        )}

        {permission === 'denied' && (
          <div className="flex gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">
              Você bloqueou notificações para este site. Libere nas configurações do navegador para ativar.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex items-center gap-3">
            {subscribed ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">
                {subscribed ? 'Ativado neste dispositivo' : 'Desativado neste dispositivo'}
              </p>
              <p className="text-xs text-muted-foreground">
                {subscribed
                  ? 'Você receberá pushes aqui'
                  : localSubscribed && !backendRegistered
                    ? 'Permissão concedida; falta registrar no backend'
                    : 'Toque em ativar para começar a receber'}
              </p>
            </div>
          </div>
          {subscribed ? (
            <Button variant="outline" size="sm" onClick={handleDisable} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Desativar'}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={loading || needsIosInstall || permission === 'denied'}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : localSubscribed ? 'Concluir' : 'Ativar'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default PlatformPushNotificationsCard;
