import { useMemo, useState } from 'react';
import {
  Bot,
  Plus,
  Search,
  Sparkles,
  Upload,
  GitBranch,
  Pencil,
  Trash2,
  Clock,
  ArrowLeftRight,
  Copy,
  Download,
  MoreHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
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
  usePlatformCrmAgentConfigs,
  useCreatePlatformCrmAgentConfig,
  useTogglePlatformCrmAgentConfig,
  useDeletePlatformCrmAgentConfig,
  type PlatformCrmAgentConfig,
} from '@/components/superadmin/crm/data/usePlatformCrmAgentConfigs';
import { PlatformCrmAgentFormDialog } from '@/components/superadmin/crm/agents/PlatformCrmAgentFormDialog';

/**
 * Seção "Agentes de IA" do CRM de PLATAFORMA (super_admin) — porte CORE.
 * Lista + CRUD de config de agentes (persona/typing/handoff) do pipeline único,
 * desacoplado do tenant (só platform_crm_agent_configs, sem organization_id/product_id).
 *
 * TODO(edge): Supervisor multi-agente, Importar e orquestração/tools/routing
 * dependem de Edge Function / canal externo — botões presentes com toast "em breve".
 */
export function PlatformCrmAgentsManager() {
  const { data: agents = [], isLoading } = usePlatformCrmAgentConfigs();
  const createAgent = useCreatePlatformCrmAgentConfig();
  const toggleAgent = useTogglePlatformCrmAgentConfig();
  const deleteAgent = useDeletePlatformCrmAgentConfig();

  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<PlatformCrmAgentConfig | null>(null);
  const [deleting, setDeleting] = useState<PlatformCrmAgentConfig | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.persona_prompt ?? '').toLowerCase().includes(q),
    );
  }, [agents, search]);

  const handleCreate = () => {
    setEditingAgent(null);
    setEditorOpen(true);
  };

  const handleEdit = (agent: PlatformCrmAgentConfig) => {
    setEditingAgent(agent);
    setEditorOpen(true);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteAgent.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  };

  // Duplicar = insert client-only (mesmo padrão do original, sem ids/datas).
  const handleDuplicate = (agent: PlatformCrmAgentConfig) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = agent;
    createAgent.mutate({ ...rest, name: `${agent.name} (cópia)` });
  };

  // Exporta o agente como JSON limpo (sem ids e datas) — client-only.
  const handleExport = (agent: PlatformCrmAgentConfig) => {
    const { id: _id, created_at: _c, updated_at: _u, ...clean } = agent;
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agente-${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // TODO(edge): supervisor multi-agente / roteamento dependem de Edge Function.
  const handleSupervisor = () =>
    toast.info('Supervisor multi-agente em breve', {
      description: 'Roteamento e orquestração serão liberados em uma próxima etapa.',
    });

  // TODO(edge): importar agente exige parsing/canal externo.
  const handleImport = () =>
    toast.info('Importação de agentes em breve');

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
              Configure os agentes do atendimento — persona, ritmo e transferência para humano
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleSupervisor}
            className="flex-1 sm:flex-none sm:h-11 sm:px-6"
          >
            <GitBranch className="h-4 w-4 mr-2" />
            Supervisor
          </Button>
          <Button
            variant="outline"
            onClick={handleImport}
            className="flex-1 sm:flex-none sm:h-11 sm:px-6"
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={handleCreate} className="flex-1 sm:flex-none sm:h-11 sm:px-6">
            <Plus className="h-4 w-4 mr-2" />
            Criar Agente
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou persona..."
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum agente encontrado</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              {agents.length > 0
                ? 'Nenhum agente bate com a busca. Tente outro termo.'
                : 'Crie seu primeiro agente de IA para atender no pipeline.'}
            </p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Agente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((agent) => (
            <Card key={agent.id} className={agent.is_active ? '' : 'opacity-70'}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{agent.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant={agent.is_active ? 'default' : 'secondary'} className="text-[10px]">
                          {agent.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={agent.is_active}
                    onCheckedChange={(checked) =>
                      toggleAgent.mutate({ id: agent.id, isActive: checked })
                    }
                  />
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                  {agent.persona_prompt?.trim() || 'Sem persona definida.'}
                </p>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {(agent.typing_delay_ms / 1000).toFixed(1)}s digitação
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    {agent.handoff_enabled ? 'Handoff on' : 'Handoff off'}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(agent)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Editar
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDuplicate(agent)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport(agent)}>
                        <Download className="h-4 w-4 mr-2" />
                        Exportar JSON
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleting(agent)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor */}
      <PlatformCrmAgentFormDialog
        agent={editingAgent}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente "{deleting?.name}" será removido
              permanentemente.
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
