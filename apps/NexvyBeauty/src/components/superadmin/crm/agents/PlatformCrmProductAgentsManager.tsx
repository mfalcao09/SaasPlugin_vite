// PORTE de `.vendus-src-reference/src/components/admin/agents/AgentsManager.tsx`
// D3 P1/F1d — MANAGER de AGENTES IA POR PRODUTO (super_admin / plataforma).
// Diferenca da fonte (que era por-organizacao): aqui o escopo e o PRODUTO. O usuario
// escolhe o produto (PlatformCrmProductSelector) e ve/gerencia os agentes daquele
// produto: lista (hierarquia/lista) + editor completo (13 abas) + supervisor + importar.
// Twin: platform_crm_product_agents (zero organization_id/tenant).
import { useMemo, useState } from 'react';
import {
  Bot, Globe, LayoutGrid, Network, Package, Plus, Search, Sparkles, Upload, GitBranch,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

import { useActiveProduct } from '@/components/superadmin/crm/products/ProductContext';
import {
  usePlatformCrmProductAgents,
  useCreatePlatformCrmProductAgent,
  useUpdatePlatformCrmProductAgent,
  useDeletePlatformCrmProductAgent,
  useSetDefaultPlatformCrmProductAgent,
  useTogglePlatformCrmProductAgentStatus,
  useDuplicatePlatformCrmProductAgent,
} from '@/components/superadmin/crm/data/usePlatformCrmProductAgents';
import { AGENT_TYPE_LABELS, type AgentType, type ProductAgent } from './types';
import { AgentCard } from './AgentCard';
import { AgentEditor } from './AgentEditor';
import { AgentHierarchyView } from './AgentHierarchyView';
import { AgentSupervisorPanel } from './AgentSupervisorPanel';
import { AgentImportModal } from './AgentImportModal';

export function PlatformCrmProductAgentsManager() {
  // Produto = produto ativo GLOBAL (D3 F2). Agentes sao por-produto → exige um
  // produto concreto (effectiveProductId). products/isLoading vem do mesmo
  // contexto (fonte unica; react-query dedupa). O switcher vive no topo do CRM.
  const { products, effectiveProductId, isLoading: productsLoading } = useActiveProduct();

  const { data: agents, isLoading: agentsLoading } =
    usePlatformCrmProductAgents(effectiveProductId ?? undefined);
  const createAgent = useCreatePlatformCrmProductAgent();
  const updateAgent = useUpdatePlatformCrmProductAgent();
  const deleteAgent = useDeletePlatformCrmProductAgent();
  const setDefaultAgent = useSetDefaultPlatformCrmProductAgent();
  const toggleStatus = useTogglePlatformCrmProductAgentStatus();
  const duplicateAgent = useDuplicatePlatformCrmProductAgent();

  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ProductAgent | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<ProductAgent | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  const filtered = useMemo(() => {
    if (!agents) return [];
    return agents.filter((a) => {
      if (typeFilter !== 'all' && a.agent_type !== typeFilter) return false;
      if (search.trim() && !a.name.toLowerCase().includes(search.toLowerCase().trim())) return false;
      return true;
    });
  }, [agents, typeFilter, search]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === effectiveProductId) ?? null,
    [products, effectiveProductId],
  );

  const handleCreate = () => {
    setEditingAgent(null);
    setEditorOpen(true);
  };

  const handleEdit = (agent: ProductAgent) => {
    setEditingAgent(agent);
    setEditorOpen(true);
  };

  const handleSave = (data: Partial<ProductAgent>) => {
    const payload = { ...data, product_id: effectiveProductId };
    if (editingAgent && editingAgent.id) {
      updateAgent.mutate(
        { id: editingAgent.id, ...payload },
        { onSuccess: () => setEditorOpen(false) },
      );
    } else {
      createAgent.mutate(payload, { onSuccess: () => setEditorOpen(false) });
    }
  };

  const handleDelete = (agent: ProductAgent) => setDeletingAgent(agent);

  const confirmDelete = () => {
    if (deletingAgent) {
      deleteAgent.mutate(
        { id: deletingAgent.id, productId: deletingAgent.product_id },
        { onSuccess: () => setDeletingAgent(null) },
      );
    }
  };

  const handleSetDefault = (agent: ProductAgent) => {
    if (!agent.product_id) return;
    setDefaultAgent.mutate({ id: agent.id, productId: agent.product_id });
  };

  const handleDuplicate = (agent: ProductAgent) => {
    duplicateAgent.mutate(agent);
  };

  const handleToggleStatus = (agent: ProductAgent, isActive: boolean) => {
    toggleStatus.mutate({ id: agent.id, isActive });
  };

  const isLoading = productsLoading || agentsLoading;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Agentes de IA</h1>
            <p className="text-muted-foreground text-sm">
              Configure os agentes especializados de cada produto
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Seletor de Produto agora é GLOBAL (topo do CRM / PlatformShell, D3 F2). */}
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={
                'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ' +
                (viewMode === 'tree'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              <Network className="h-3.5 w-3.5" />
              Hierarquia
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={
                'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ' +
                (viewMode === 'list'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
          <Button variant="outline" onClick={() => setSupervisorOpen(true)} className="flex-1 sm:flex-none">
            <GitBranch className="h-4 w-4 mr-2" />
            Supervisor
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none" disabled={!effectiveProductId}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={handleCreate} className="flex-1 sm:flex-none" disabled={!effectiveProductId}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Agente
          </Button>
        </div>
      </div>

      {/* Supervisor sheet */}
      <Sheet open={supervisorOpen} onOpenChange={setSupervisorOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Supervisor Multi-agente</SheetTitle>
            <SheetDescription>
              Configure especialistas e regras de roteamento. Quando nenhuma regra bater, o supervisor IA decide.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <AgentSupervisorPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 min-w-0">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {(Object.keys(AGENT_TYPE_LABELS) as AgentType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {AGENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="pl-9"
          />
        </div>
      </div>

      {/* No products */}
      {!productsLoading && products.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum produto cadastrado</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Crie um produto primeiro para configurar seus agentes de IA.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && products.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {/* Empty (product selected, no agents match) */}
      {!isLoading && products.length > 0 && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum agente encontrado</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              {agents && agents.length > 0
                ? 'Nenhum agente bate com os filtros aplicados. Tente ajustar a busca.'
                : `Crie o primeiro agente de IA${selectedProduct ? ` de "${selectedProduct.name}"` : ''}.`}
            </p>
            <Button onClick={handleCreate} disabled={!effectiveProductId}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Agente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Hierarquia (tree) */}
      {!isLoading && filtered.length > 0 && viewMode === 'tree' && (
        <Card className="p-4 sm:p-6 bg-muted/20">
          <AgentHierarchyView
            agents={filtered}
            products={selectedProduct ? [{ id: selectedProduct.id, name: selectedProduct.name }] : []}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSetDefault={handleSetDefault}
            onDuplicate={handleDuplicate}
            onToggleStatus={handleToggleStatus}
          />
        </Card>
      )}

      {/* Lista (cards) */}
      {!isLoading && filtered.length > 0 && viewMode === 'list' && (
        <section className="space-y-3">
          {selectedProduct && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedProduct.name}
              </h2>
              <span className="text-xs text-muted-foreground">· {filtered.length}</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onSetDefault={handleSetDefault}
                onDuplicate={handleDuplicate}
                onToggleStatus={handleToggleStatus}
              />
            ))}
          </div>
        </section>
      )}

      {/* Editor */}
      <AgentEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        agent={editingAgent}
        productId={effectiveProductId}
        onSave={handleSave}
        isLoading={createAgent.isPending || updateAgent.isPending}
      />

      {/* Import */}
      <AgentImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        fixedProductId={effectiveProductId}
        onDraftReady={(draft) => {
          setEditingAgent({ ...(draft as ProductAgent), product_id: effectiveProductId });
          setEditorOpen(true);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingAgent} onOpenChange={() => setDeletingAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita. O agente "{deletingAgent?.name}" sera removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
