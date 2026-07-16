import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BarChart3, Megaphone, Route, Sparkles } from 'lucide-react';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { AdsAttributionTab } from './AdsAttributionTab';
import { AdsCampaignsTab } from './AdsCampaignsTab';
import { AdsRecommendationsTab } from './AdsRecommendationsTab';

/**
 * PlatformAdsSection — seção "Anúncios" (NexvyAds) do super-admin, PRODUCT-scoped.
 *
 * 3 abas, na ordem de prioridade pedida:
 *   1. Atribuição (camada B) — CTWA → lead → conversões CAPI (read-only).
 *   2. Campanhas (camada A1) — hierarquia conta→campanha→adset→ad + métricas.
 *   3. Recomendações (camada A2) — fila HITL do agente + histórico de mutações.
 *
 * O produto ativo vem do seletor GLOBAL da shell (useActivePlatformProduct);
 * cada aba consome effectiveProductId e trava/mostra empty state sozinha.
 */
export function PlatformAdsSection() {
  const { activeProduct, effectiveProductId, isLoading } = useActivePlatformProduct();
  const [tab, setTab] = useState('atribuicao');

  const productLabel = activeProduct?.name ?? (effectiveProductId ? 'produto ativo' : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-primary" />
            Anúncios
          </h1>
          <p className="text-muted-foreground">
            Gestão de campanhas, recomendações do agente e atribuição inbound (Meta Ads),
            por produto da plataforma.
          </p>
        </div>
        {!isLoading && (
          <Badge variant="secondary" className="h-fit gap-1">
            <Sparkles className="h-3 w-3" />
            {productLabel ?? 'Nenhum produto'}
          </Badge>
        )}
      </div>

      {!isLoading && !effectiveProductId && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50/50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-800/90 dark:text-amber-200/80">
            Cadastre um produto na plataforma para ver os anúncios — a seção é product-scoped.
          </span>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="atribuicao" className="gap-1.5">
            <Route className="h-4 w-4" /> Atribuição
          </TabsTrigger>
          <TabsTrigger value="campanhas" className="gap-1.5">
            <Megaphone className="h-4 w-4" /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="recomendacoes" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Recomendações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="atribuicao" className="mt-4">
          <AdsAttributionTab />
        </TabsContent>
        <TabsContent value="campanhas" className="mt-4">
          <AdsCampaignsTab />
        </TabsContent>
        <TabsContent value="recomendacoes" className="mt-4">
          <AdsRecommendationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PlatformAdsSection;
