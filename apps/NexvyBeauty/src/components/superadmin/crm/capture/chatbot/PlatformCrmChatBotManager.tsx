import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, MoreVertical, Edit, Copy, Archive, Trash2, MessageCircle,
  Eye, Users, Loader2, TrendingUp, Clock,
} from 'lucide-react';
import {
  usePlatformCrmCaptureFunnels,
  useCreatePlatformCrmCaptureFunnel,
  useDeletePlatformCrmCaptureFunnel,
  useTogglePlatformCrmFunnelStatus,
  PlatformCrmCaptureFunnel,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import { useDuplicatePlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureOps';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { PlatformCrmCaptureProductField } from '../PlatformCrmCaptureProductField';
import type { FunnelStatus } from '@/types/funnel';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlatformCrmChatBotBuilder } from './PlatformCrmChatBotBuilder';

const statusConfig: Record<FunnelStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

/**
 * CRM de PLATAFORMA (super_admin) — CHATBOT: superfície própria, porte 1:1 do
 * `admin/capture/chatbot/ChatBotManager`. Só funis de `channel_type === 'chatbot'`.
 * Data-layer 100% platform (`usePlatformCrmCaptureFunnels` + Ops) — sem organization_id.
 * Produto ativo GLOBAL via `useActivePlatformProduct/effectiveProductId` (D3 F2):
 * a lista filtra pelo produto ativo e o novo ChatBot nasce nele.
 */
export function PlatformCrmChatBotManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [productId, setProductId] = useState('');

  const { data: funnels, isLoading } = usePlatformCrmCaptureFunnels();
  // Produto ativo GLOBAL (D3 F2): recorte da lista + carimbo do novo funil.
  const { products, activeProductId, effectiveProductId } = useActivePlatformProduct();
  const createFunnel = useCreatePlatformCrmCaptureFunnel();
  const deleteFunnel = useDeletePlatformCrmCaptureFunnel();
  const duplicateFunnel = useDuplicatePlatformCrmCaptureFunnel();
  const updateStatus = useTogglePlatformCrmFunnelStatus();

  // Produto obrigatório para gravar, EXCETO quando não há produtos (backend aplica default).
  const productReady = products.length === 0 || !!productId;

  const productName = (id: string | null) => products.find(p => p.id === id)?.name;
  // Só funis do canal chatbot (fonte: useFunnels({ channelType: 'chatbot' })).
  const filtered = (funnels || []).filter(f => {
    if (f.channel_type !== 'chatbot') return false;
    const ms = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const mst = statusFilter === 'all' || f.status === statusFilter;
    // Recorte pelo produto ativo GLOBAL: "Todos" mostra tudo; concreto mostra os
    // do produto + os sem produto (nunca somem).
    const mp = !activeProductId || f.product_id === activeProductId || f.product_id == null;
    return ms && mst && mp;
  });

  const openCreate = () => {
    setName(''); setDescription('');
    // Novo ChatBot nasce no produto ativo (concreto). Com 1 produto, é ele mesmo.
    setProductId(effectiveProductId ?? '');
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !productReady) return;
    const result = await createFunnel.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      product_id: productId || null,
      channel_type: 'chatbot',
    });
    setIsCreateOpen(false);
    setName(''); setDescription(''); setProductId('');
    setSelectedId(result.id);
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

  if (selectedId) {
    return <PlatformCrmChatBotBuilder funnelId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-primary" />
            ChatBot
          </h1>
          <p className="text-muted-foreground mt-1">
            Fluxos conversacionais para capturar leads via chat público.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo ChatBot
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar chatbots..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum ChatBot encontrado</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {searchQuery || statusFilter !== 'all'
                ? 'Nenhum chatbot corresponde aos filtros.'
                : 'Crie seu primeiro fluxo conversacional para começar a capturar leads.'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" /> Criar primeiro ChatBot
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map(f => (
            <Card key={f.id} className="hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setSelectedId(f.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-foreground truncate">{f.name}</h3>
                      <Badge variant={(statusConfig[f.status as FunnelStatus] ?? statusConfig.draft).variant}>
                        {(statusConfig[f.status as FunnelStatus] ?? statusConfig.draft).label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {productName(f.product_id) || 'Produto não definido'}
                    </p>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Eye className="h-4 w-4" /><span>{formatViews(f.total_views)} sessões</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-4 w-4" /><span>{f.total_leads ?? 0} leads</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp className="h-4 w-4" /><span>{rate(f)} conversão</span>
                      </div>
                      {f.updated_at && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{formatDistanceToNow(new Date(f.updated_at), { addSuffix: true, locale: ptBR })}</span>
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
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedId(f.id); }}>
                        <Edit className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateFunnel.mutate(f.id); }}>
                        <Copy className="h-4 w-4 mr-2" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {f.status !== 'archived' && (
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          updateStatus.mutate({ id: f.id, status: 'archived' });
                        }}>
                          <Archive className="h-4 w-4 mr-2" /> Arquivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(f.id); }}>
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo ChatBot</DialogTitle>
            <DialogDescription>
              Crie um fluxo conversacional. O canal Chat será ativado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <PlatformCrmCaptureProductField
              products={products}
              value={productId}
              onChange={setProductId}
            />
            <div className="space-y-2">
              <Label>Nome do ChatBot *</Label>
              <Input placeholder="Ex: Qualificação de Leads" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea placeholder="Descreva o objetivo..." value={description}
                onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}
              disabled={!name.trim() || !productReady || createFunnel.isPending}>
              {createFunnel.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</>
                : 'Criar ChatBot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ChatBot?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados do fluxo serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteFunnel.mutate(deleteId); setDeleteId(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
