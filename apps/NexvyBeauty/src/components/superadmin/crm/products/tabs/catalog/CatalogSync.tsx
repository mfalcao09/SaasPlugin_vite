// CatalogSync — sincronização do catálogo do produto com gateway externo.
//
// Stub DESACOPLADO (recuperação do F1a): a fonte
// `admin/products/tabs/catalog/CatalogSync.tsx` (90 linhas) é tenant-coupled
// (`profile.organization_id` + sync org-scoped). Portar 1:1 cruzaria a fronteira
// tenant↔plataforma. Aqui: UI de sincronização sem org; o adaptador real
// (Cakto/Hotmart/etc. por produto) é TODO(edge) — plugado quando o D1(b)/Utmify
// definir os gateways do grupo. Zero organization_id.
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface CatalogSyncProps {
  productId: string;
}

export function CatalogSync({ productId }: CatalogSyncProps) {
  const handleSync = () => {
    // TODO(edge): sincronizar catálogo do produto com o gateway do grupo
    // (adaptador por produto — definido no D1(b)/Utmify). productId=${productId}
    toast.info('Sincronização de catálogo chega junto com a integração de gateways do grupo.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="h-4 w-4 text-primary" />
          Sincronizar catálogo
        </CardTitle>
        <CardDescription>
          Mantém os itens deste produto alinhados com o gateway de venda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={handleSync} className="gap-1.5">
          <RefreshCw className="h-4 w-4" /> Sincronizar agora
        </Button>
      </CardContent>
    </Card>
  );
}
