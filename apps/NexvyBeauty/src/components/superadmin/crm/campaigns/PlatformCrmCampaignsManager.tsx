import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignsList } from './CampaignsList';
import { CampaignWizard } from './CampaignWizard';
import { CampaignDetail } from './CampaignDetail';
import { CampaignReports } from './CampaignReports';
import { ContextLibrary } from './ContextLibrary';
import { PlatformCrmCampaignThroughputPanel } from './PlatformCrmCampaignThroughputPanel';
import { usePlatformCrmCampaigns } from '../data/usePlatformCrmCampaigns';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';

/**
 * CRM de PLATAFORMA (super_admin) — Campanhas Inteligentes. Porte 1:1 do
 * `CampaignsManager` do CRM de tenant, tocando APENAS `platform_crm_*` e sem
 * organization_id / product_id (a RLS super_admin-only isola os dados).
 *
 * Abas: Campanhas · Biblioteca de Contextos · Relatórios · Throughput. A aba
 * Throughput (`PlatformCrmCampaignThroughputPanel`) lê a infra de fila de disparo
 * já portada para `platform_crm_*` (`platform_crm_campaign_targets` + conexões
 * `_evolution_instances` / `_whatsapp_meta_connections`), agregada client-side e
 * escopada por produto via `effectiveProductId`. Sem gate condicional — o CRM
 * inteiro já é super_admin-only.
 *
 * O assistente de campanha abre em Dialog SOBRE a lista (padrão do CRM): não
 * substitui a árvore, a lista continua visível atrás.
 */

type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string };

export function PlatformCrmCampaignsManager() {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [tab, setTab] = useState('campaigns');
  // Assistente em Dialog (id null = nova campanha). Fica montado só enquanto
  // aberto e é remontado por `key` a cada abertura → estado do form sempre limpo.
  const [wizard, setWizard] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const { campaigns, stats, preparations, refresh } = usePlatformCrmCampaigns();
  // Filtro ATIVO pelo produto global (migration 20260710_platform_crm_campaigns_product_id,
  // ordem Marcelo "campanha por produto"). product_id NULL = campanha do grupo todo —
  // aparece em qualquer produto selecionado (acesso defensivo: types.ts pode não ter
  // a coluna regenerada ainda).
  const { activeProductId } = useActivePlatformProduct();
  const visibleCampaigns = activeProductId
    ? campaigns.filter((c: any) => !c.product_id || c.product_id === activeProductId)
    : campaigns;

  const openWizard = (id: string | null) => setWizard({ open: true, id });
  const closeWizard = () => { setWizard({ open: false, id: null }); refresh(); };

  return (
    <>
      {view.kind === 'detail' ? (
        <CampaignDetail
          campaignId={view.id}
          onBack={() => setView({ kind: 'list' })}
          onEdit={() => openWizard(view.id)}
        />
      ) : (
        <div className="p-4 md:p-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Campanhas Inteligentes</h1>
            <p className="text-sm text-muted-foreground">
              Transforme listas em conversas reais. O agente IA recebe contexto e cria uma abordagem única para cada lead.
            </p>
          </header>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
              <TabsTrigger value="library">Biblioteca de Contextos</TabsTrigger>
              <TabsTrigger value="reports">Relatórios</TabsTrigger>
              <TabsTrigger value="throughput">Throughput</TabsTrigger>
            </TabsList>

            <TabsContent value="campaigns" className="mt-4">
              <CampaignsList
                campaigns={visibleCampaigns}
                stats={stats}
                preparations={preparations}
                onNew={() => openWizard(null)}
                onOpen={(id) => setView({ kind: 'detail', id })}
                onRefresh={refresh}
              />
            </TabsContent>

            <TabsContent value="library" className="mt-4">
              <ContextLibrary />
            </TabsContent>

            <TabsContent value="reports" className="mt-4">
              <CampaignReports campaigns={visibleCampaigns} />
            </TabsContent>

            <TabsContent value="throughput" className="mt-4">
              <PlatformCrmCampaignThroughputPanel />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {wizard.open && (
        <CampaignWizard
          key={wizard.id ?? 'new'}
          open
          campaignId={wizard.id}
          onOpenChange={(v) => { if (!v) closeWizard(); }}
          onClose={closeWizard}
        />
      )}
    </>
  );
}
