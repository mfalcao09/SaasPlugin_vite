import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CadenceList } from './CadenceList';
import { CadenceWizard } from './CadenceWizard';
import { CadenceDetail } from './CadenceDetail';
import { CadenceReports } from './CadenceReports';
import { CadenceApiKeys } from './CadenceApiKeys';
import { ContextLibrary } from '../campaigns/ContextLibrary';
import { usePlatformCrmCadences } from '../data/usePlatformCrmCadences';

/**
 * CRM de PLATAFORMA (super_admin) — Cadências Inteligentes. Porte 1:1 do
 * `CadencesManager` do CRM de tenant, tocando APENAS `platform_crm_*` e sem
 * organization_id / product_id (a RLS super_admin-only isola os dados).
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

export function PlatformCrmCadencesManager() {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [tab, setTab] = useState('cadences');
  const { cadences, stats, refresh } = usePlatformCrmCadences();

  if (view.kind === 'new' || view.kind === 'edit') {
    return (
      <CadenceWizard
        cadenceId={view.kind === 'edit' ? view.id : null}
        onClose={() => { setView({ kind: 'list' }); refresh(); }}
      />
    );
  }

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
        <h1 className="text-2xl font-semibold tracking-tight">Cadências Inteligentes</h1>
        <p className="text-sm text-muted-foreground">
          Jornadas automatizadas em que a IA recebe contexto e cria uma abordagem única para cada lead — nunca mensagens prontas.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cadences">Cadências</TabsTrigger>
          <TabsTrigger value="library">Biblioteca de Contextos</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
        </TabsList>

        <TabsContent value="cadences" className="mt-4">
          <CadenceList
            cadences={cadences}
            stats={stats}
            onNew={() => setView({ kind: 'new' })}
            onOpen={(id) => setView({ kind: 'detail', id })}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="library" className="mt-4">
          <ContextLibrary />
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <CadenceReports cadences={cadences} stats={stats} />
        </TabsContent>

        <TabsContent value="api" className="mt-4">
          <CadenceApiKeys />
        </TabsContent>
      </Tabs>
    </div>
  );
}
