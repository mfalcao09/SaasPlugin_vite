import { Shield, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  usePlatformCrmPartyGraph,
  type PartyGraphLead,
} from '../../data/usePlatformCrmPartyGraph';
import {
  buildHouseMiaPartyContext,
  listHouseAuthoritySnapshot,
  type HouseAuthorityDecision,
} from '../../../../../../supabase/functions/_shared/house-agents.ts';

const ACTION_LABEL: Record<string, string> = {
  discount: 'Desconto',
  impersonate: 'Impersonation',
  publish_agent: 'Publicar agente',
  cold: 'Cold',
};

const DECISION_LABEL: Record<HouseAuthorityDecision, string> = {
  allow: 'Liberado',
  require_approval: 'Aprovar na casa',
  deny: 'Recusado',
};

function decisionVariant(decision: HouseAuthorityDecision): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (decision === 'allow') return 'default';
  if (decision === 'deny') return 'destructive';
  return 'outline';
}

/**
 * Fase 4 — Mia + alçada da casa no detalhe do lead.
 * Reusa o grafo party (sem F5). Sem lente CNPJ. Gate é da casa, não do tenant.
 */
export function PlatformCrmLeadHouseAgentsCard({ lead }: { lead: PartyGraphLead }) {
  const { products } = useActivePlatformProduct();
  const graph = usePlatformCrmPartyGraph(lead);

  const memberships = graph.missingRelation
    ? lead.product_id
      ? [{ product_id: lead.product_id, lead_id: lead.id }]
      : []
    : graph.links.map((l) => ({ product_id: l.product_id, lead_id: l.lead_id }));

  const partyContext = buildHouseMiaPartyContext({
    partyId: lead.party_id ?? null,
    currentLeadId: lead.id,
    currentProductId: lead.product_id,
    memberships,
    catalog: products.map((p) => ({ id: p.id, name: p.name })),
  });
  const alcada = listHouseAuthoritySnapshot(partyContext);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Mia e alçada da casa
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Contexto cross-produto do mesmo contato · gate da casa, não do cliente
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mia vê</p>
          {partyContext.products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem produto neste contato. Mia não inventa linha do catálogo.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {partyContext.products.map((p) => (
                <Badge key={p.productId} variant={p.isCurrent ? 'default' : 'outline'}>
                  {p.name}
                  {p.isCurrent ? ' · neste lead' : ''}
                </Badge>
              ))}
            </div>
          )}
          {partyContext.seesMultipleProducts ? (
            <p className="text-xs text-muted-foreground">{partyContext.crossSellHint}</p>
          ) : partyContext.crossSellHint ? (
            <p className="text-xs text-muted-foreground">{partyContext.crossSellHint}</p>
          ) : null}
          {graph.missingRelation ? (
            <p className="text-xs text-muted-foreground">
              Grafo ainda não aplicado no banco — só o produto deste lead. Sem recorte por CNPJ.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            Alçada da casa
          </p>
          <div className="space-y-1">
            {alcada.gates.map((g) => (
              <div key={g.action} className="flex items-center justify-between gap-2 text-sm">
                <span>{ACTION_LABEL[g.action] ?? g.action}</span>
                <Badge variant={decisionVariant(g.decision)} className="text-[10px]">
                  {DECISION_LABEL[g.decision]}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {alcada.partyProductIds.length > 1
              ? `${alcada.partyProductIds.length} produtos do mesmo party`
              : 'Escopo casa · não é alçada do salão'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
