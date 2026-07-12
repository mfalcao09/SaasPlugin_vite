import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Megaphone, Plug, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { integrationsCatalog, type IntegrationItem } from '@/config/integrationsCatalog';
import { IntegrationCard } from '@/components/admin/integrations/IntegrationCard';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { PlatformAdsConnectCard } from './PlatformAdsConnectCard';

/**
 * PlatformCrmIntegrationsManager — versão PRODUCT-SCOPED (plataforma) da tela de
 * Integrações do gestao.*.
 *
 * ⚠️ ESQUELETO / PORT PENDENTE (2026-07-12)
 * ------------------------------------------------------------------
 * A tela de Integrações original (`@/components/admin/integrations/
 * IntegrationsManager`) é ORG-SCOPED: lê status de configuração da tabela
 * `integration_settings` filtrando por `organization_id` (do tenant/salão).
 * No painel da plataforma (gestao.*) o eixo é PRODUTO, não organização — logo
 * aquele componente NÃO pode ser reusado cru aqui (leria o org_id errado do
 * super-admin).
 *
 * Este componente é o esqueleto product-aware da reintegração:
 *   • Consome `useActivePlatformProduct()` (seletor GLOBAL de produto da shell).
 *   • Reusa o CATÁLOGO estático `integrationsCatalog` (lista real de integrações
 *     disponíveis — IA, Pagamentos, E-mail, ERP, etc.) apenas para exibição.
 *   • NÃO inventa tabela. O status real por-produto (chaves xAI/OpenAI da Voz,
 *     Cakto, etc.) depende de uma camada de persistência product-scoped que
 *     AINDA NÃO EXISTE — hoje só há `integration_settings` (org-scoped). Por isso
 *     os cards são exibidos como "não configurado" e o clique abre um aviso, em
 *     vez de fabricar um status "ativo" falso.
 *
 * Próximo passo do port (fora do escopo desta entrega): definir a fonte de
 * verdade product-scoped (ex.: coluna/tabela por product_id) e então plugar a
 * leitura de status + os configuradores do IntegrationConfigDrawer.
 */
export function PlatformCrmIntegrationsManager() {
  const { activeProduct, activeProductId, isLoading } = useActivePlatformProduct();
  const [search, setSearch] = useState('');

  const productLabel = activeProduct?.name ?? 'Todos os produtos';
  const isAllProducts = activeProductId === null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return integrationsCatalog;
    return integrationsCatalog
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          const haystack = [item.name, item.description, cat.label, ...(item.keywords ?? [])]
            .join(' ')
            .toLowerCase();
          return haystack.includes(term);
        }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [search]);

  const totalItems = useMemo(
    () => integrationsCatalog.reduce((acc, cat) => acc + cat.items.length, 0),
    [],
  );

  const handleClick = (item: IntegrationItem) => {
    if (item.comingSoon) {
      toast.info(`${item.name} estará disponível em breve!`);
      return;
    }
    toast.info(`Configuração de ${item.name} — port pendente`, {
      description: isAllProducts
        ? 'Selecione um produto no seletor da plataforma. A persistência product-scoped das chaves ainda será implementada.'
        : `As chaves/status por produto ("${productLabel}") dependem da camada product-scoped, ainda não implementada (hoje só existe integration_settings org-scoped).`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Plug className="h-6 w-6 text-primary" />
            Integrações
          </h2>
          <p className="text-muted-foreground">
            Conecte ferramentas e serviços ao produto ativo da plataforma
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {isLoading ? 'Carregando produtos…' : productLabel}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {totalItems} integrações
          </Badge>
        </div>
      </div>

      {/* Aviso honesto: reintegração de nav + esqueleto product-aware pronta; a
          leitura de status/chaves por produto é port pendente (sem tabela nova). */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-300/40 bg-amber-50/50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            Esqueleto product-scoped — status por produto pendente
          </p>
          <p className="text-amber-800/90 dark:text-amber-200/80">
            Catálogo de integrações reexibido para a plataforma. O status real de
            configuração (chaves de IA da Voz, Cakto, etc.) é gravado hoje apenas
            por organização (<code>integration_settings</code>, org-scoped). A
            persistência product-scoped ainda será implementada — até lá os cards
            não mostram status "ativo".
          </p>
        </div>
      </div>

      {/* Anúncios — integração PRODUCT-scoped já FUNCIONAL (não é catálogo
          estático): conecta o Meta Ads do produto ativo via OAuth e sincroniza
          campanhas/métricas. Fica acima da busca por ser a única com status real. */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
            <Megaphone className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Anúncios</h3>
            <p className="text-xs text-muted-foreground">
              Conecte plataformas de mídia paga ao produto ativo.
            </p>
          </div>
        </div>
        <PlatformAdsConnectCard />
      </section>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar integração... (ex: stripe, gpt, whatsapp)"
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-medium">Nenhuma integração encontrada</h3>
          <p className="mt-1 text-sm text-muted-foreground">Tente outro termo.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {filtered.map((cat) => {
            const Icon = cat.icon;
            return (
              <section key={cat.id}>
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{cat.label}</h3>
                    {cat.description && (
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {cat.items.length}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {cat.items.map((item) => (
                    <IntegrationCard
                      key={item.id}
                      item={item}
                      isActive={false}
                      locked={false}
                      onClick={() => handleClick(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
