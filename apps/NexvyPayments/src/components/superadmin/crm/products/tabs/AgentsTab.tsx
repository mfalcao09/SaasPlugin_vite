// Porte de `.vendus-src-reference/src/components/admin/products/tabs/AgentsTab.tsx`
// D3 P1/F1d — RELIGADO ao subsistema real de agentes (`crm/agents/`): esta aba lista os
// agentes de `platform_crm_product_agents` do produto e agora abre o EDITOR COMPLETO
// (13 abas) + IMPORTAR reais, alem de toggle/padrao/duplicar/excluir funcionais.
// Fonte de dados: `crm/data/usePlatformCrmProductAgents` (CRUD, zero organization_id).
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Bot, Plus, Sparkles, Upload, MoreHorizontal, Pencil, Copy, Trash2, Star,
  MessageSquare, MessageCircle, Zap, Globe, Inbox, Headphones, Instagram, Facebook,
} from 'lucide-react';
import {
  usePlatformCrmProductAgents,
  useTogglePlatformCrmProductAgentStatus,
  useSetDefaultPlatformCrmProductAgent,
  useDeletePlatformCrmProductAgent,
  useDuplicatePlatformCrmProductAgent,
  useCreatePlatformCrmProductAgent,
  useUpdatePlatformCrmProductAgent,
} from '@/components/superadmin/crm/data/usePlatformCrmProductAgents';
import type { ProductAgent } from '@/components/superadmin/crm/agents/types';
import { AgentEditor } from '@/components/superadmin/crm/agents/AgentEditor';
import { AgentImportModal } from '@/components/superadmin/crm/agents/AgentImportModal';

interface AgentsTabProps {
  productId: string;
}

const AGENT_TYPE_LABELS: Record<string, string> = {
  sdr: 'SDR',
  closer: 'Closer',
  support: 'Suporte',
  financial: 'Financeiro',
  admin: 'Admin',
  orchestrator: 'Orquestrador',
  custom: 'Personalizado',
};

const CHANNEL_ICONS: Record<string, any> = {
  active_in_chat: MessageSquare,
  active_in_funnels: Zap,
  active_in_widget: Globe,
  active_in_inbox: Inbox,
  active_in_copilot: Headphones,
  active_in_whatsapp: MessageCircle,
  active_in_instagram: Instagram,
  active_in_facebook: Facebook,
};

const CHANNEL_LABELS: Record<string, string> = {
  active_in_chat: 'Chat',
  active_in_funnels: 'Funis',
  active_in_widget: 'Widget',
  active_in_inbox: 'Inbox',
  active_in_copilot: 'Copilot',
  active_in_whatsapp: 'WhatsApp',
  active_in_instagram: 'Instagram',
  active_in_facebook: 'Facebook',
};

export function AgentsTab({ productId }: AgentsTabProps) {
  const { data: agents, isLoading } = usePlatformCrmProductAgents(productId);
  const deleteAgent = useDeletePlatformCrmProductAgent();
  const setDefaultAgent = useSetDefaultPlatformCrmProductAgent();
  const toggleStatus = useTogglePlatformCrmProductAgentStatus();
  const duplicateAgent = useDuplicatePlatformCrmProductAgent();
  const createAgent = useCreatePlatformCrmProductAgent();
  const updateAgent = useUpdatePlatformCrmProductAgent();

  const [deletingAgent, setDeletingAgent] = useState<ProductAgent | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ProductAgent | null>(null);

  // Editor completo (13 abas) + Importar reais — subsistema `crm/agents/`.
  const handleCreate = () => { setEditingAgent(null); setEditorOpen(true); };
  const handleImport = () => setImportOpen(true);
  const handleEdit = (agent: ProductAgent) => { setEditingAgent(agent); setEditorOpen(true); };

  const handleSave = (data: Partial<ProductAgent>) => {
    const payload = { ...data, product_id: productId };
    if (editingAgent && editingAgent.id) {
      updateAgent.mutate({ id: editingAgent.id, ...payload }, { onSuccess: () => setEditorOpen(false) });
    } else {
      createAgent.mutate(payload, { onSuccess: () => setEditorOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (deletingAgent) {
      deleteAgent.mutate(
        { id: deletingAgent.id, productId },
        { onSuccess: () => setDeletingAgent(null) }
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const hasAgents = agents && agents.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agentes de IA
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os agentes especializados deste produto
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleImport}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Agente
          </Button>
        </div>
      </div>

      {/* Agents Grid or Empty State */}
      {hasAgents ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => {
            const activeChannels = Object.keys(CHANNEL_ICONS).filter(
              (key) => (agent as any)[key]
            );
            return (
              <Card key={agent.id} className={agent.is_default ? 'border-primary/40' : ''}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{agent.name}</p>
                          {agent.is_default && (
                            <Badge variant="default" className="text-xs gap-1">
                              <Star className="h-3 w-3" /> Padrão
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {AGENT_TYPE_LABELS[agent.agent_type || 'custom'] || agent.agent_type}
                          </Badge>
                        </div>
                        {agent.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {agent.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={!!agent.is_active}
                        onCheckedChange={(checked) =>
                          toggleStatus.mutate({ id: agent.id, isActive: checked })
                        }
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          <DropdownMenuItem onClick={() => handleEdit(agent)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateAgent.mutate(agent)}>
                            <Copy className="mr-2 h-4 w-4" /> Duplicar
                          </DropdownMenuItem>
                          {!agent.is_default && (
                            <DropdownMenuItem
                              onClick={() => setDefaultAgent.mutate({ id: agent.id, productId })}
                            >
                              <Star className="mr-2 h-4 w-4" /> Definir como padrão
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeletingAgent(agent)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Canais ativos */}
                  {activeChannels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                      {activeChannels.map((key) => {
                        const Icon = CHANNEL_ICONS[key];
                        return (
                          <Badge key={key} variant="secondary" className="text-[10px] gap-1">
                            <Icon className="h-2.5 w-2.5" />
                            {CHANNEL_LABELS[key]}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-lg mb-2">Nenhum agente configurado</CardTitle>
            <CardDescription className="text-center max-w-sm mb-4">
              Crie agentes especializados para atender seus leads de forma automatizada.
              Cada agente usa o Cérebro do Produto com comportamentos específicos.
            </CardDescription>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Agente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      {hasAgents && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Como funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              • Todos os agentes usam o mesmo <strong>Cérebro do Produto</strong> como base de conhecimento
            </p>
            <p>
              • Cada agente tem seu próprio <strong>papel, tom de voz e regras</strong>
            </p>
            <p>
              • O agente <strong>Padrão</strong> é usado automaticamente quando nenhum outro é especificado
            </p>
            <p>
              • Use o bloco <strong>"Trocar Agente"</strong> nos fluxos para alternar entre agentes
            </p>
          </CardContent>
        </Card>
      )}

      {/* Editor completo (13 abas) */}
      <AgentEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        agent={editingAgent}
        productId={productId}
        onSave={handleSave}
        isLoading={createAgent.isPending || updateAgent.isPending}
      />

      {/* Importar (JSON funcional; documento = TODO(edge)) */}
      <AgentImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        fixedProductId={productId}
        onDraftReady={(draft) => {
          setEditingAgent({ ...(draft as ProductAgent), product_id: productId });
          setEditorOpen(true);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingAgent} onOpenChange={() => setDeletingAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente "{deletingAgent?.name}" será
              removido permanentemente.
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
