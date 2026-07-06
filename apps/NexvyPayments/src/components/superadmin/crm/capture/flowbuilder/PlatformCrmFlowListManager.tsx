import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  GitBranch,
  Trash2,
  Copy,
  MoreVertical,
  Pencil,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  usePlatformCrmChatFlows,
  useCreatePlatformCrmChatFlow,
  useTogglePlatformCrmChatFlowActive,
  useDeletePlatformCrmChatFlow,
  useDuplicatePlatformCrmChatFlow,
  PlatformCrmChatFlowParsed,
} from '@/components/superadmin/crm/data/usePlatformCrmChatFlows';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

/**
 * Lista/gestão de fluxos de chatbot do CRM de PLATAFORMA (super_admin) —
 * DESACOPLADO do tenant. Toca APENAS `platform_crm_chat_flows` via hooks de plataforma.
 *
 * Diferenças vs. original (src/components/admin/flowbuilder/FlowListManager.tsx):
 *   - Sem useAuth/organization_id: o hook de plataforma resolve created_by via
 *     supabase.auth.getUser() internamente. Criar recebe apenas { productId?, name }.
 *   - toggle/delete de plataforma são simples ({ flowId, isActive } / { flowId }) —
 *     sem productId (product_id é opcional/nullable, org-agnóstico).
 *   - `productId` é opcional: quando ausente, lista todos os fluxos da plataforma.
 */

interface PlatformCrmFlowListManagerProps {
  /** Filtra os fluxos por produto (opcional; ausente = todos, org-agnóstico). */
  productId?: string;
  onSelectFlow: (flow: PlatformCrmChatFlowParsed) => void;
}

export function PlatformCrmFlowListManager({ productId, onSelectFlow }: PlatformCrmFlowListManagerProps) {
  const [newFlowName, setNewFlowName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<PlatformCrmChatFlowParsed | null>(null);

  const { data: flows, isLoading } = usePlatformCrmChatFlows(productId);
  const createFlow = useCreatePlatformCrmChatFlow();
  const toggleActive = useTogglePlatformCrmChatFlowActive();
  const deleteFlow = useDeletePlatformCrmChatFlow();
  const duplicateFlow = useDuplicatePlatformCrmChatFlow();

  const handleCreateFlow = async () => {
    if (!newFlowName.trim()) {
      toast.error('Digite um nome para o fluxo');
      return;
    }

    try {
      const flow = await createFlow.mutateAsync({
        productId: productId ?? null,
        name: newFlowName.trim(),
      });
      setNewFlowName('');
      setIsCreating(false);
      onSelectFlow(flow);
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleToggleActive = async (flow: PlatformCrmChatFlowParsed) => {
    try {
      await toggleActive.mutateAsync({
        flowId: flow.id,
        isActive: !flow.is_active,
      });
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleDeleteFlow = async () => {
    if (!flowToDelete) return;

    try {
      await deleteFlow.mutateAsync({ flowId: flowToDelete.id });
      setFlowToDelete(null);
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleDuplicateFlow = async (flowId: string) => {
    try {
      const newFlow = await duplicateFlow.mutateAsync(flowId);
      onSelectFlow(newFlow);
    } catch (error) {
      // Error handled by hook
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Carregando fluxos...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Fluxos de Qualificação
          </h3>
          <p className="text-sm text-muted-foreground">
            Crie jornadas de atendimento com IA híbrida
          </p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Fluxo
          </Button>
        )}
      </div>

      {/* Create new flow form */}
      {isCreating && (
        <Card className="border-primary/50">
          <CardContent className="py-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nome do novo fluxo..."
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFlow()}
                autoFocus
              />
              <Button onClick={handleCreateFlow} disabled={createFlow.isPending}>
                Criar
              </Button>
              <Button variant="ghost" onClick={() => setIsCreating(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flow list */}
      {flows && flows.length > 0 ? (
        <div className="grid gap-3">
          {flows.map((flow) => (
            <Card
              key={flow.id}
              className="hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => onSelectFlow(flow)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <GitBranch className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">{flow.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {flow.blocks.length} blocos
                        {flow.updated_at &&
                          ` • Atualizado ${format(new Date(flow.updated_at), "dd/MM 'às' HH:mm", { locale: ptBR })}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <Badge variant={flow.is_active ? "default" : "secondary"}>
                      {flow.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>

                    <Switch
                      checked={flow.is_active}
                      onCheckedChange={() => handleToggleActive(flow)}
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onSelectFlow(flow)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateFlow(flow.id)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setFlowToDelete(flow)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <GitBranch className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">Nenhum fluxo criado</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Crie um fluxo visual para qualificar leads antes da IA assumir
            </p>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Fluxo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!flowToDelete} onOpenChange={() => setFlowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O fluxo será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFlow} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
