import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Copy,
  Archive,
  Trash2,
  Play,
  Pause,
  Eye,
  Users,
  Loader2,
  TrendingUp,
  Clock,
  Filter as FunnelIcon,
  MessageCircle,
  Bot,
  FileQuestion,
  MousePointerClick,
  FormInput,
} from 'lucide-react';
import {
  usePlatformCrmCaptureFunnels,
  useCreatePlatformCrmCaptureFunnel,
  useDeletePlatformCrmCaptureFunnel,
  useTogglePlatformCrmFunnelStatus,
  PlatformCrmCaptureFunnel,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import { useDuplicatePlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureOps';
import { usePlatformCrmProducts } from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import { PlatformCrmCaptureProductField } from './PlatformCrmCaptureProductField';
import { PlatformCrmFlowTab } from './flowbuilder';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

const channelConfig: Record<string, { label: string; icon: typeof MessageCircle }> = {
  chat: { label: 'Chat', icon: MessageCircle },
  chatbot: { label: 'ChatBot', icon: Bot },
  quiz: { label: 'Quiz', icon: FileQuestion },
  widget: { label: 'Widget', icon: MousePointerClick },
  form: { label: 'Formulário', icon: FormInput },
};

interface PlatformCrmCaptureFunnelsTabProps {
  /** Pré-filtra a lista por canal (ex.: 'chatbot' quando aberto pelo menu ChatBot). */
  initialChannel?: string;
}

export function PlatformCrmCaptureFunnelsTab({
  initialChannel,
}: PlatformCrmCaptureFunnelsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>(initialChannel ?? 'all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Builder visual de fluxo (FlowBuilder de plataforma) aberto em dialog fullscreen.
  const [builderFunnel, setBuilderFunnel] = useState<PlatformCrmCaptureFunnel | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState(initialChannel ?? 'chat');
  // Dimensão PRODUTO (D3 F1c) — fonte WidgetManager/ChatBotManager l.50.
  const [productId, setProductId] = useState('');

  const { data: funnels, isLoading } = usePlatformCrmCaptureFunnels();
  const { data: products = [] } = usePlatformCrmProducts();
  const createFunnel = useCreatePlatformCrmCaptureFunnel();
  const deleteFunnel = useDeletePlatformCrmCaptureFunnel();
  const duplicateFunnel = useDuplicatePlatformCrmCaptureFunnel();
  const toggleStatus = useTogglePlatformCrmFunnelStatus();

  // 1 produto → auto-seleciona e trava (label estática no campo).
  const singleProductId = products.length === 1 ? products[0].id : '';
  // Obrigatório quando há produtos; sem produtos o backend aplica o default.
  const productReady = products.length === 0 || !!productId;

  const filtered = (funnels || []).filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || f.status === statusFilter;
    const matchesChannel = channelFilter === 'all' || f.channel_type === channelFilter;
    return matchesSearch && matchesStatus && matchesChannel;
  });

  const openCreate = () => {
    setName('');
    setDescription('');
    setChannelType(initialChannel ?? 'chat');
    setProductId(singleProductId);
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !productReady) return;
    await createFunnel.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      channel_type: channelType,
      product_id: productId || null,
    });
    setIsCreateOpen(false);
    setName('');
    setDescription('');
    setProductId('');
  };

  const openBuilder = (funnel: PlatformCrmCaptureFunnel) => {
    // Abre o FlowBuilder de plataforma (lista ↔ builder visual) em dialog fullscreen.
    // Filtra os fluxos pelo produto do funil quando houver (org-agnóstico se null).
    setBuilderFunnel(funnel);
  };

  const formatViews = (v: number | null) => {
    const views = v ?? 0;
    return views >= 1000 ? `${(views / 1000).toFixed(1)}k` : String(views);
  };

  const rate = (f: PlatformCrmCaptureFunnel) => {
    const views = f.total_views ?? 0;
    const leads = f.total_leads ?? 0;
    return views === 0 ? '--' : `${((leads / views) * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FunnelIcon className="h-5 w-5 text-primary" />
            Funis de Captação
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Funis multicanal (chat, chatbot, quiz e widget) da plataforma.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Funil
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar funis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {Object.entries(channelConfig).map(([value, cfg]) => (
              <SelectItem key={value} value={value}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FunnelIcon className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum funil encontrado</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {searchQuery || statusFilter !== 'all' || channelFilter !== 'all'
                ? 'Nenhum funil corresponde aos filtros.'
                : 'Crie seu primeiro funil para começar a captar leads.'}
            </p>
            {!searchQuery && statusFilter === 'all' && channelFilter === 'all' && (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" /> Criar primeiro Funil
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((f) => {
            const status = statusConfig[f.status] ?? statusConfig.draft;
            const channel = channelConfig[f.channel_type] ?? channelConfig.chat;
            const ChannelIcon = channel.icon;
            return (
              <Card
                key={f.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => openBuilder(f)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground truncate">{f.name}</h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <Badge variant="outline" className="gap-1">
                          <ChannelIcon className="h-3 w-3" />
                          {channel.label}
                        </Badge>
                      </div>
                      {f.description && (
                        <p className="text-sm text-muted-foreground mb-3 truncate">
                          {f.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Eye className="h-4 w-4" />
                          <span>{formatViews(f.total_views)} visualizações</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{f.total_leads ?? 0} leads</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <TrendingUp className="h-4 w-4" />
                          <span>{rate(f)} conversão</span>
                        </div>
                        {f.updated_at && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>
                              {formatDistanceToNow(new Date(f.updated_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openBuilder(f);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" /> Editar fluxo
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateFunnel.mutate(f.id);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {f.status === 'active' ? (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus.mutate({ id: f.id, status: 'paused' });
                            }}
                          >
                            <Pause className="h-4 w-4 mr-2" /> Pausar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus.mutate({ id: f.id, status: 'active' });
                            }}
                          >
                            <Play className="h-4 w-4 mr-2" /> Ativar
                          </DropdownMenuItem>
                        )}
                        {f.status !== 'archived' && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus.mutate({ id: f.id, status: 'archived' });
                            }}
                          >
                            <Archive className="h-4 w-4 mr-2" /> Arquivar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(f.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Funil</DialogTitle>
            <DialogDescription>
              Crie um funil de captação multicanal. O fluxo pode ser configurado depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Canal *</Label>
              <Select value={channelType} onValueChange={setChannelType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o canal" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(channelConfig).map(([value, cfg]) => (
                    <SelectItem key={value} value={value}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <PlatformCrmCaptureProductField
              products={products}
              value={productId}
              onChange={setProductId}
            />
            <div className="space-y-2">
              <Label>Nome do Funil *</Label>
              <Input
                placeholder="Ex: Captação site principal"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Descreva o objetivo..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !productReady || createFunnel.isPending}
            >
              {createFunnel.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Funil'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Builder visual de fluxo (FlowBuilder de plataforma) — dialog fullscreen. */}
      <Dialog open={!!builderFunnel} onOpenChange={(o) => !o && setBuilderFunnel(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Builder de Fluxo — {builderFunnel?.name}</DialogTitle>
            <DialogDescription>
              Monte a jornada de qualificação (chatbot híbrido) do funil.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-6">
            {builderFunnel && (
              <PlatformCrmFlowTab productId={builderFunnel.product_id ?? undefined} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Funil?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados do fluxo serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteFunnel.mutate(deleteId);
                setDeleteId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
