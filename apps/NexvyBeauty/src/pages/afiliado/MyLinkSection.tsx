import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, Link2, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicAppUrl } from '@/lib/publicUrl';
import { useMyAffiliateLinks, type AffiliateLink } from '@/hooks/useAffiliatePortal';

function buildPublicUrl(refCode: string): string {
  return `${getPublicAppUrl()}/vendas?ref=${encodeURIComponent(refCode)}`;
}

export function MyLinkSection() {
  const { data: links, isLoading } = useMyAffiliateLinks();

  const copyUrl = async (link: AffiliateLink) => {
    const url = buildPublicUrl(link.ref_code);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copiada');
    } catch {
      toast.error('Não foi possível copiar a URL');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Meu Link</h2>
        <p className="text-sm text-muted-foreground">
          Compartilhe seus links de divulgação. Cada venda originada por eles gera comissão.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !links || links.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem links de divulgação. Solicite um ao administrador.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {links.map((link) => {
            const url = buildPublicUrl(link.ref_code);
            return (
              <Card key={link.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link2 className="h-4 w-4 text-primary" />
                    {link.label || link.ref_code}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs">
                      {url}
                    </code>
                    <Button size="sm" variant="outline" onClick={() => copyUrl(link)}>
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copiar
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="gap-1">
                      <MousePointerClick className="h-3 w-3" />
                      {link.clicks} {link.clicks === 1 ? 'clique' : 'cliques'}
                    </Badge>
                    {link.default_utm_source && (
                      <span>utm_source: {link.default_utm_source}</span>
                    )}
                    {link.default_utm_campaign && (
                      <span>· campanha: {link.default_utm_campaign}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
