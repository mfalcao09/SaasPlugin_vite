import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignsList } from './CampaignsList';
import { CampaignWizard } from './CampaignWizard';
import { CampaignDetail } from './CampaignDetail';
import { CampaignReports } from './CampaignReports';
import { ContextLibrary } from './ContextLibrary';
import { usePlatformCrmCampaigns } from '../data/usePlatformCrmCampaigns';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';

/**
 * CRM de PLATAFORMA (super_admin) — Campanhas Inteligentes. Porte 1:1 do
 * `CampaignsManager` do CRM de tenant, tocando APENAS `platform_crm_*` e sem
 * organization_id / product_id (a RLS super_admin-only isola os dados).
 *
 * TODO(migration): o CRM de tenant tem uma 4ª aba "Throughput"
 * (`CampaignThroughputPanel`), visível só ao super_admin, que lê a infraestrutura
 * de fila de disparo do tenant (`outreach_queue` / instâncias). Essa infra é
 * cross-módulo e não existe no schema de plataforma — removida aqui; retorna
 * quando o motor de disparo for portado para `platform_crm_*`.
 */

type View =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'detail'; id: string };

export function PlatformCrmCampaignsManager() {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [tab, setTab] = useState('campaigns');
  const { campaigns, stats, preparations, refresh } = usePlatformCrmCampaigns();
  // Filtro ATIVO pelo produto global (migration 20260710_platform_crm_campaigns_product_id,
  // ordem Marcelo "campanha por produto"). product_id NULL = campanha do grupo todo —
  // aparece em qualquer produto selecionado (acesso defensivo: types.ts pode não ter
  // a coluna regenerada ainda).
  const { activeProductId } = useActivePlatformProduct();
  const visibleCampaigns = activeProductId
    ? campaigns.filter((c: any) => !c.product_id || c.product_id === activeProductId)
    : campaigns;

  if (view.kind === 'new' || view.kind === 'edit') {
    return (
      <CampaignWizard
        campaignId={view.kind === 'edit' ? view.id : null}
        onClose={() => { setView({ kind: 'list' }); refresh(); }}
      />
    );
  }

  if (view.kind === 'detail') {
    return (
      <CampaignDetail
        campaignId={view.id}
        onBack={() => setView({ kind: 'list' })}
        onEdit={() => setView({ kind: 'edit', id: view.id })}
      />
    );
  }

  return (
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
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          <CampaignsList
            campaigns={visibleCampaigns}
            stats={stats}
            preparations={preparations}
            onNew={() => setView({ kind: 'new' })}
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
      </Tabs>
    </div>
  );
}
