import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CadenceList } from './CadenceList';
import { CadenceWizard } from './CadenceWizard';
import { CadenceDetail } from './CadenceDetail';
import { CadenceReports } from './CadenceReports';
import { ContextLibrary } from '../campaigns/ContextLibrary';
import { usePlatformCrmCadences } from '../data/usePlatformCrmCadences';
import { usePlatformCrmProduct } from '@/components/superadmin/crm/data/usePlatformCrmProducts';

/**
 * CRM de PLATAFORMA (super_admin) — Cadências Inteligentes. Porte 1:1 do
 * `CadencesManager` do CRM de tenant, tocando APENAS `platform_crm_*` e sem
 * organization_id (a RLS super_admin-only isola os dados).
 *
 * `product_id` (Fase 0, espinha F1/F4/F6) chegou depois neste porte: as
 * cadências SÃO product-scoped no banco. `productId`/`cadenceId` (deep-link do
 * hub do produto — CadenceTab) são opcionais: sem eles o comportamento
 * standalone (seção "Cadências" do CRM, todas as cadências, uso em
 * registry.tsx) não muda.
 *
 * TODO(migration): o CRM de tenant tem uma 4ª aba "Biblioteca de Contextos"
 * (`ContextLibrary` de campaigns) que depende de tabelas de contexto/campanha
 * cross-módulo, inexistentes no escopo de plataforma. Removida aqui; será
 * reintroduzida se/quando a biblioteca for portada para `platform_crm_*`.
 */

type View =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'detail'; id: string };

interface PlatformCrmCadencesManagerProps {
  /** Escopo por produto (deep-link do CadenceTab): filtra a lista e pré-preenche
   *  o product_id das cadências criadas a partir daqui. */
  productId?: string;
  /** Abre direto no editor desta cadência ao montar (botão "Abrir editor" do CadenceTab). */
  cadenceId?: string;
}

export function PlatformCrmCadencesManager({ productId, cadenceId }: PlatformCrmCadencesManagerProps = {}) {
  const [view, setView] = useState<View>(() => (cadenceId ? { kind: 'edit', id: cadenceId } : { kind: 'list' }));
  const [tab, setTab] = useState('cadences');
  const { cadences, stats, refresh } = usePlatformCrmCadences();
  const { data: scopedProduct } = usePlatformCrmProduct(productId ?? '');

  const scopedCadences = productId ? cadences.filter((c) => c.product_id === productId) : cadences;
  const scopedStats = productId
    ? Object.fromEntries(Object.entries(stats).filter(([id]) => scopedCadences.some((c) => c.id === id)))
    : stats;

  const wizardOpen = view.kind === 'new' || view.kind === 'edit';

  if (view.kind === 'detail') {
    return (
      <CadenceDetail
        cadenceId={view.id}
        onBack={() => setView({ kind: 'list' })}
        onEdit={() => setView({ kind: 'edit', id: view.id })}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {productId ? `Cadências de ${scopedProduct?.name || 'Produto'}` : 'Cadências Inteligentes'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {productId
            ? 'Sequências de follow-up automático dos leads deste produto.'
            : 'Jornadas automatizadas em que a IA recebe contexto e cria uma abordagem única para cada lead — nunca mensagens prontas.'}
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cadences">Cadências</TabsTrigger>
          {!productId && <TabsTrigger value="library">Biblioteca de Contextos</TabsTrigger>}
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="cadences" className="mt-4">
          <CadenceList
            cadences={scopedCadences}
            stats={scopedStats}
            onNew={() => setView({ kind: 'new' })}
            onOpen={(id) => setView({ kind: 'detail', id })}
            onRefresh={refresh}
          />
        </TabsContent>

        {!productId && (
          <TabsContent value="library" className="mt-4">
            <ContextLibrary />
          </TabsContent>
        )}

        <TabsContent value="reports" className="mt-4">
          <CadenceReports cadences={scopedCadences} stats={scopedStats} />
        </TabsContent>
      </Tabs>

      {/* Editor de cadência em Dialog SOBRE a lista (não substitui a árvore). Montado
          apenas quando aberto → cada abertura recebe uma instância nova (estado limpo). */}
      {wizardOpen && (
        <CadenceWizard
          open
          onOpenChange={(o) => { if (!o) { setView({ kind: 'list' }); refresh(); } }}
          cadenceId={view.kind === 'edit' ? view.id : null}
          productId={productId}
        />
      )}
    </div>
  );
}
