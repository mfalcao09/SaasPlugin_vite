import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2, Megaphone, RefreshCw } from 'lucide-react';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  usePlatformAdsConnection,
  useStartAdsOAuth,
  useSyncAds,
  type AdsPlatformConnection,
} from '@/components/superadmin/crm/data/usePlatformAdsConnection';

/**
 * PlatformAdsConnectCard — cartão "Meta Ads" (super_admin, PRODUCT-scoped).
 *
 * Espelha a linguagem visual do card de conexão do Instagram (StatusBadge +
 * Card + ações), trocando o eixo: Ads é POR PRODUTO, então lê
 * `effectiveProductId` do seletor global da shell e trava o botão "Conectar"
 * enquanto o produto ainda não resolveu (null/isLoading).
 *
 * Fluxo:
 *   • Sem conexão / pending / error / revoked → botão "Conectar Meta Ads"
 *     (ads-oauth-start → redireciona pra Meta).
 *   • active → badge "Conectada" + botão "Sincronizar agora" (ads-sync).
 */

function StatusBadge({ status }: { status: AdsPlatformConnection['status'] }) {
  if (status === 'active')
    return (
      <Badge className="gap-1 border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300">
        <CheckCircle2 className="h-3 w-3" />
        Conectada
      </Badge>
    );
  if (status === 'error') return <Badge variant="destructive">Erro</Badge>;
  if (status === 'revoked') return <Badge variant="outline">Revogada</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

export function PlatformAdsConnectCard() {
  const { effectiveProductId, activeProduct, isLoading: productLoading } = useActivePlatformProduct();
  const {
    data: conn,
    isLoading: connLoading,
    isError: connError,
    error: connErr,
  } = usePlatformAdsConnection(effectiveProductId);
  const startOAuth = useStartAdsOAuth();
  const syncAds = useSyncAds();

  const productLabel = activeProduct?.name ?? 'produto ativo';
  const noProduct = !effectiveProductId;
  const isActive = conn?.status === 'active';

  const handleConnect = () => {
    if (!effectiveProductId) return;
    startOAuth.mutate(effectiveProductId);
  };

  const handleSync = () => {
    if (!effectiveProductId) return;
    syncAds.mutate(effectiveProductId);
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Megaphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">Meta Ads</span>
              {conn && <StatusBadge status={conn.status} />}
            </div>
            <p className="text-xs text-muted-foreground">
              Conecte o Gerenciador de Anúncios da Meta para importar campanhas e métricas do{' '}
              <span className="font-medium">{productLabel}</span>.
            </p>

            {noProduct && !productLoading && (
              <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Selecione um produto no seletor da plataforma para conectar.</span>
              </div>
            )}

            {connError && (
              <div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-all">
                  {(connErr as any)?.message ?? 'Falha ao ler status da conexão.'}
                </span>
              </div>
            )}

            {conn?.status === 'error' && conn.last_error && (
              <div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-all">{conn.last_error}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {(productLoading || connLoading) && !noProduct ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : isActive ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={syncAds.isPending}
              className="gap-2"
            >
              {syncAds.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sincronizar agora
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={noProduct || startOAuth.isPending}
              className="gap-2"
            >
              {startOAuth.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Megaphone className="h-3.5 w-3.5" />
              )}
              {conn ? 'Reconectar Meta Ads' : 'Conectar Meta Ads'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
