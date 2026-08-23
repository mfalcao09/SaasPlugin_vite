import { useState } from 'react';
import { Loader2, Package, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  leadPartyId,
  usePlatformCrmPartyGraph,
  type PartyGraphLead,
} from '../../data/usePlatformCrmPartyGraph';

/**
 * Cross-sell no detalhe do lead/contato: vê e liga o mesmo party a outro
 * produto SaaS do catálogo. Sem lente CNPJ. Sem F5 (invalidate + onOpenLead).
 */
export function PlatformCrmLeadPartyProductsCard({
  lead,
  onOpenLead,
}: {
  lead: PartyGraphLead;
  onOpenLead?: (leadId: string) => void;
}) {
  const { products } = useActivePlatformProduct();
  const graph = usePlatformCrmPartyGraph(lead);
  const [selectedProductId, setSelectedProductId] = useState('');

  const nameOf = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? 'Produto';

  const handleLink = async () => {
    try {
      await graph.linkToProduct(selectedProductId);
      setSelectedProductId('');
      toast.success('Contato ligado a outro produto');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao ligar produto';
      toast.error(msg);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          Produtos SaaS
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Mesmo contato em outras linhas da casa
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {graph.isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : graph.missingRelation ? (
          <p className="text-sm text-muted-foreground">
            Grafo ainda não aplicado no banco. Sem recorte por CNPJ — só produtos SaaS.
          </p>
        ) : graph.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar os produtos deste contato.</p>
        ) : (
          <>
            {graph.links.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este lead ainda não tem produto. Ao ligar, o party passa a existir na casa.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {graph.links.map((link) => {
                  const isCurrent = link.lead_id === lead.id;
                  const canOpen = !isCurrent && !!link.lead_id && !!onOpenLead;
                  return (
                    <Badge
                      key={link.id}
                      variant={isCurrent ? 'default' : 'outline'}
                      className={canOpen ? 'cursor-pointer' : undefined}
                      onClick={
                        canOpen ? () => onOpenLead?.(link.lead_id as string) : undefined
                      }
                    >
                      {nameOf(link.product_id)}
                      {isCurrent ? ' · neste lead' : ''}
                    </Badge>
                  );
                })}
              </div>
            )}

            {graph.linkable.length > 0 ? (
              <div className="space-y-2">
                <Label>Ligar a outro produto</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select
                    value={selectedProductId || undefined}
                    onValueChange={setSelectedProductId}
                  >
                    <SelectTrigger className="sm:flex-1">
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {graph.linkable.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={!selectedProductId || graph.isLinking}
                    onClick={handleLink}
                  >
                    {graph.isLinking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Ligar
                  </Button>
                </div>
              </div>
            ) : products.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Já ligado a todos os produtos do catálogo.
              </p>
            ) : null}

            {leadPartyId(lead) ? (
              <p className="text-[11px] text-muted-foreground">Party da casa ativo</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
