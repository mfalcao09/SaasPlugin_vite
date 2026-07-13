import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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
  Trash2,
  Code2,
  Copy,
  KeyRound,
  Loader2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  usePlatformCrmWebchatWidgets,
  useCreatePlatformCrmWebchatWidget,
  useUpdatePlatformCrmWebchatWidget,
  useTogglePlatformCrmWebchatWidget,
  useDeletePlatformCrmWebchatWidget,
  PlatformCrmWebchatWidget,
} from '@/components/superadmin/crm/data/usePlatformCrmWebchatWidgets';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { PlatformCrmCaptureProductField } from './PlatformCrmCaptureProductField';
import { usePublicAppUrl } from '@/lib/publicUrl';

export function PlatformCrmCaptureWidgetsTab() {
  // Aba única de widgets de webchat (platform_crm_webchat_widgets). O builder
  // visual de funis de canal 'widget' vive na aba Funis (FlowBuilder), então o
  // antigo botão "Abrir builder" (caminho duplicado/circular) foi removido.
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlatformCrmWebchatWidget | null>(null);
  const { data: baseUrl } = usePublicAppUrl();

  const [name, setName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  // Dimensão PRODUTO (D3 F1c) — fonte WidgetManager l.50 `useState('')`.
  const [productId, setProductId] = useState('');

  const { data: widgets, isLoading } = usePlatformCrmWebchatWidgets();
  // Produto ativo GLOBAL (D3 F2): novo widget nasce no ativo. A LISTA usa o filtro
  // local abaixo (parity Vendus "Widget de Site": seletor "Todos os produtos").
  const { products, activeProductId, effectiveProductId } = useActivePlatformProduct();
  const createWidget = useCreatePlatformCrmWebchatWidget();
  const updateWidget = useUpdatePlatformCrmWebchatWidget();
  const toggleWidget = useTogglePlatformCrmWebchatWidget();
  const deleteWidget = useDeletePlatformCrmWebchatWidget();

  // Filtro de PRODUTO local (parity FIEL do WidgetManager tenant + PlatformCrmFormsManager).
  // Seed = produto ativo GLOBAL para abrir já recortado no D3 F2; a partir daí é um
  // filtro local independente, como no Vendus. 'all' = "Todos os produtos".
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>(
    () => activeProductId ?? 'all',
  );

  // O produto é obrigatório para gravar, EXCETO quando ainda não há produtos
  // cadastrados (aí o backend aplica o default) — espelha a fonte, que só exige
  // o select quando há produtos para escolher.
  const productReady = products.length === 0 || !!productId;

  const productName = (id: string | null | undefined) =>
    products.find((p) => p.id === id)?.name ?? 'Produto não definido';

  // Filtra: busca + produto (filtro local, parity Vendus) + status. "Todos os
  // produtos" mostra tudo; concreto mostra os do produto + os sem produto (nunca
  // somem — recorte de plataforma preservado). O webchat só tem is_active (bool),
  // então o "status" do funil Vendus vira Ativo/Inativo — honesto ao modelo.
  const filtered = (widgets || []).filter((w) => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProduct =
      selectedProductFilter === 'all' ||
      w.product_id === selectedProductFilter ||
      w.product_id == null;
    const matchesStatus =
      statusFilter === 'all' || (statusFilter === 'active' ? w.is_active : !w.is_active);
    return matchesSearch && matchesProduct && matchesStatus;
  });

  const resetForm = () => {
    setName('');
    setWelcomeMessage('');
    setProductId('');
  };

  const openCreate = () => {
    resetForm();
    // Novo widget nasce no produto ativo (concreto). Com 1 produto, é ele mesmo.
    if (effectiveProductId) setProductId(effectiveProductId);
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !productReady) return;
    await createWidget.mutateAsync({
      name: name.trim(),
      welcome_message: welcomeMessage.trim() || null,
      product_id: productId || null,
    });
    setIsCreateOpen(false);
    resetForm();
  };

  const openEdit = (widget: PlatformCrmWebchatWidget) => {
    setEditing(widget);
    setName(widget.name);
    setWelcomeMessage(widget.welcome_message ?? '');
    // Edição herda o produto atual; fallback = produto ativo (D3 F2).
    setProductId(widget.product_id ?? effectiveProductId ?? '');
  };

  const handleUpdate = async () => {
    if (!editing || !name.trim() || !productReady) return;
    await updateWidget.mutateAsync({
      id: editing.id,
      name: name.trim(),
      welcome_message: welcomeMessage.trim() || null,
      product_id: productId || null,
    });
    setEditing(null);
    resetForm();
  };

  const copyPublicKey = (widget: PlatformCrmWebchatWidget) => {
    navigator.clipboard.writeText(widget.public_key);
    toast.success('Chave pública copiada!');
  };

  // Embed snippet real do webchat (espelha WidgetShareTab: carrega o loader JS
  // com a chave pública do widget). Cole antes de </body> em qualquer página.
  const buildSnippet = (widget: PlatformCrmWebchatWidget) =>
    `<script src="${baseUrl}/webchat-widget.js" data-widget-key="${widget.public_key}" async></script>`;

  const copySnippet = (widget: PlatformCrmWebchatWidget) => {
    navigator.clipboard.writeText(buildSnippet(widget));
    toast.success('Snippet de instalação copiado!');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Code2 className="h-5 w-5 text-primary" />
            Widget de Site
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Bolha de chat embutida em sites externos via snippet{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;script&gt;</code>.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Widget
        </Button>
      </div>

      {/* Filtros — parity FIEL do Vendus "Widget de Site": busca + "Todos os
          produtos" + status. Mesmo padrão do PlatformCrmFormsManager (sibling).
          Status: o webchat só tem is_active (bool) → Ativos/Inativos. */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar widgets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedProductFilter} onValueChange={setSelectedProductFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
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
              <Code2 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum Widget encontrado</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {searchQuery || selectedProductFilter !== 'all' || statusFilter !== 'all'
                ? 'Nenhum widget corresponde aos filtros.'
                : 'Crie seu primeiro widget para instalar a bolha de chat em qualquer site.'}
            </p>
            {!searchQuery && selectedProductFilter === 'all' && statusFilter === 'all' && (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" /> Criar primeiro Widget
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((w) => (
            <Card key={w.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-foreground truncate">{w.name}</h3>
                      <Badge variant={w.is_active ? 'default' : 'secondary'}>
                        {w.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    {/* Produto do widget — parity Vendus (card mostra o produto sob o nome). */}
                    <p className="text-sm text-muted-foreground mb-1 truncate">
                      {productName(w.product_id)}
                    </p>
                    {w.welcome_message && (
                      <p className="text-sm text-muted-foreground mb-3 truncate">
                        “{w.welcome_message}”
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => copyPublicKey(w)}
                        title="Copiar chave pública"
                      >
                        <KeyRound className="h-4 w-4" />
                        <span className="font-mono text-xs truncate max-w-[220px]">
                          {w.public_key}
                        </span>
                      </button>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {formatDistanceToNow(new Date(w.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={w.is_active}
                      onCheckedChange={(checked) =>
                        toggleWidget.mutate({ id: w.id, is_active: checked })
                      }
                      aria-label="Ativar widget"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(w)}>
                          <Edit className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyPublicKey(w)}>
                          <KeyRound className="h-4 w-4 mr-2" /> Copiar chave pública
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copySnippet(w)}>
                          <Copy className="h-4 w-4 mr-2" /> Copiar snippet
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(w.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Criar */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(o) => {
          setIsCreateOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Widget</DialogTitle>
            <DialogDescription>
              Crie um widget de webchat. A chave pública é gerada automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <PlatformCrmCaptureProductField
              products={products}
              value={productId}
              onChange={setProductId}
            />
            <div className="space-y-2">
              <Label>Nome do Widget *</Label>
              <Input
                placeholder="Ex: Bolha do site principal"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem de boas-vindas (opcional)</Label>
              <Textarea
                placeholder="Ex: Olá! Como posso ajudar?"
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
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
              disabled={!name.trim() || !productReady || createWidget.isPending}
            >
              {createWidget.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Widget'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Widget</DialogTitle>
            <DialogDescription>Altere o nome e a mensagem de boas-vindas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <PlatformCrmCaptureProductField
              products={products}
              value={productId}
              onChange={setProductId}
            />
            <div className="space-y-2">
              <Label>Nome do Widget *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mensagem de boas-vindas (opcional)</Label>
              <Textarea
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!name.trim() || !productReady || updateWidget.isPending}
            >
              {updateWidget.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Widget?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O snippet instalado em sites externos deixará de
              funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteWidget.mutate(deleteId);
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
