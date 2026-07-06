import { useState } from 'react';
import { PlatformCrmFormBuilder } from './form';
import { PlatformCrmFormResponses } from './form/PlatformCrmFormResponses';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  MoreVertical,
  FileEdit,
  Eye,
  Copy,
  Trash2,
  Play,
  Pause,
  Archive,
  ExternalLink,
  BarChart3,
  FileText,
  LayoutTemplate,
  Loader2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  usePlatformCrmForms,
  usePlatformCrmFormTemplates,
  useCreatePlatformCrmForm,
  useDeletePlatformCrmForm,
  useTogglePlatformCrmFormStatus,
} from '@/components/superadmin/crm/data/usePlatformCrmForms';
import {
  useDuplicatePlatformCrmForm,
  useCreatePlatformCrmFormFromTemplate,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureOps';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useActiveProduct } from '@/components/superadmin/crm/products/ProductContext';
import { PlatformCrmCaptureProductField } from './PlatformCrmCaptureProductField';

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

export function PlatformCrmCaptureFormsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [builderFormId, setBuilderFormId] = useState<string | null>(null);
  const [responsesFormId, setResponsesFormId] = useState<string | null>(null);

  const [createMethod, setCreateMethod] = useState<'manual' | 'template'>('manual');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  // Dimensão PRODUTO (D3 F1c) — fonte FormsManager l.73 `newFormProductId`.
  const [productId, setProductId] = useState('');

  const { data: forms, isLoading } = usePlatformCrmForms();
  const { data: templates } = usePlatformCrmFormTemplates();
  // Produto ativo GLOBAL (D3 F2): lista filtra pelo ativo e novo form nasce nele.
  const { products, activeProductId, effectiveProductId } = useActiveProduct();
  const createForm = useCreatePlatformCrmForm();
  const createFromTemplate = useCreatePlatformCrmFormFromTemplate();
  const deleteForm = useDeletePlatformCrmForm();
  const duplicateForm = useDuplicatePlatformCrmForm();
  const toggleStatus = useTogglePlatformCrmFormStatus();

  // Obrigatório quando há produtos; sem produtos o backend aplica o default.
  const productReady = products.length === 0 || !!productId;

  const filtered = (forms || []).filter((form) => {
    const matchesSearch =
      form.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || form.status === statusFilter;
    // Recorte pelo produto ativo GLOBAL (D3 F2): "Todos" mostra tudo; concreto
    // mostra os do produto + os sem produto (nunca somem).
    const matchesProduct =
      !activeProductId || form.product_id === activeProductId || form.product_id == null;
    return matchesSearch && matchesStatus && matchesProduct;
  });

  const isCreating = createForm.isPending || createFromTemplate.isPending;

  const openCreate = () => {
    setName('');
    setDescription('');
    setSelectedTemplateId('');
    setCreateMethod('manual');
    // Novo form nasce no produto ativo (concreto). Com 1 produto, é ele mesmo.
    setProductId(effectiveProductId ?? '');
    setIsCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !productReady) return;

    if (createMethod === 'template') {
      const template = templates?.find((t) => t.id === selectedTemplateId);
      if (!template) {
        toast.error('Selecione um template');
        return;
      }
      await createFromTemplate.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        product_id: productId || null,
        template,
      });
    } else {
      await createForm.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        product_id: productId || null,
      });
    }

    setIsCreateOpen(false);
    setName('');
    setDescription('');
    setSelectedTemplateId('');
    setCreateMethod('manual');
    setProductId('');
  };

  const openBuilder = (formId: string) => {
    setBuilderFormId(formId);
  };

  const openPublicLink = () => {
    // TODO(edge): runtime público do formulário (página /f/:slug) depende de Edge/rota pública.
    toast.info('Link público do formulário em breve');
  };

  const openResponses = (formId: string) => {
    setResponsesFormId(formId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Formulários
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Formulários de captação de leads da plataforma.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Formulário
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar formulários..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
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
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum formulário encontrado</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {searchQuery || statusFilter !== 'all'
                ? 'Nenhum formulário corresponde aos filtros.'
                : 'Crie seu primeiro formulário para captar leads.'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" /> Criar primeiro Formulário
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((form) => {
            const status = statusConfig[form.status ?? 'draft'] ?? statusConfig.draft;
            return (
              <Card
                key={form.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => openBuilder(form.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground truncate">{form.name}</h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      {form.description && (
                        <p className="text-sm text-muted-foreground mb-3 truncate">
                          {form.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Eye className="h-4 w-4" />
                          <span>{form.views_count ?? 0} visualizações</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <BarChart3 className="h-4 w-4" />
                          <span>{form.submissions_count ?? 0} respostas</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <ExternalLink className="h-4 w-4" />
                          <span className="truncate">/{form.slug}</span>
                        </div>
                        {form.updated_at && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>
                              {formatDistanceToNow(new Date(form.updated_at), {
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
                            openBuilder(form.id);
                          }}
                        >
                          <FileEdit className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openResponses(form.id);
                          }}
                        >
                          <BarChart3 className="h-4 w-4 mr-2" /> Respostas
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openPublicLink();
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" /> Link público
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateForm.mutate(form.id);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {form.status === 'active' ? (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus.mutate({ id: form.id, status: 'paused' });
                            }}
                          >
                            <Pause className="h-4 w-4 mr-2" /> Pausar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus.mutate({ id: form.id, status: 'active' });
                            }}
                          >
                            <Play className="h-4 w-4 mr-2" /> Ativar
                          </DropdownMenuItem>
                        )}
                        {form.status !== 'archived' && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatus.mutate({ id: form.id, status: 'archived' });
                            }}
                          >
                            <Archive className="h-4 w-4 mr-2" /> Arquivar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(form.id);
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

      {/* Builder visual do formulário (FormBuilder de plataforma) — dialog fullscreen. */}
      <Dialog open={!!builderFormId} onOpenChange={(o) => !o && setBuilderFormId(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Construtor de Formulário</DialogTitle>
            <DialogDescription>Monte os campos, o design e a publicação do formulário.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {builderFormId && (
              <PlatformCrmFormBuilder formId={builderFormId} onClose={() => setBuilderFormId(null)} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Respostas do formulário (FormResponses de plataforma) — dialog fullscreen. */}
      <Dialog open={!!responsesFormId} onOpenChange={(o) => !o && setResponsesFormId(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Respostas do Formulário</DialogTitle>
            <DialogDescription>Veja e filtre as respostas recebidas e abra o detalhe de cada lead.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {responsesFormId && <PlatformCrmFormResponses formId={responsesFormId} />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Formulário</DialogTitle>
            <DialogDescription>
              Crie do zero ou a partir de um template pronto.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={createMethod}
            onValueChange={(v) => setCreateMethod(v as 'manual' | 'template')}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" className="gap-2">
                <FileText className="h-4 w-4" /> Do zero
              </TabsTrigger>
              <TabsTrigger value="template" className="gap-2">
                <LayoutTemplate className="h-4 w-4" /> Template
              </TabsTrigger>
            </TabsList>
            <TabsContent value="manual" className="mt-0" />
            <TabsContent value="template" className="mt-4">
              <div className="space-y-2">
                <Label>Template *</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {t.category ? ` — ${t.category}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templates?.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum template cadastrado ainda.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
          <div className="space-y-4 py-2">
            <PlatformCrmCaptureProductField
              products={products}
              value={productId}
              onChange={setProductId}
            />
            <div className="space-y-2">
              <Label>Nome do Formulário *</Label>
              <Input
                placeholder="Ex: Cadastro de interessados"
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
              disabled={
                !name.trim() ||
                !productReady ||
                isCreating ||
                (createMethod === 'template' && !selectedTemplateId)
              }
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Formulário'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Formulário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Blocos e respostas do formulário serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteForm.mutate(deleteId);
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
