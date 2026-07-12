import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Code,
  BarChart3,
  FileText,
  LayoutTemplate,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  usePlatformCrmForms,
  usePlatformCrmFormTemplates,
  useCreatePlatformCrmForm,
  useDeletePlatformCrmForm,
  useTogglePlatformCrmFormStatus,
  type PlatformCrmForm,
} from '@/components/superadmin/crm/data/usePlatformCrmForms';
import {
  useDuplicatePlatformCrmForm,
  useCreatePlatformCrmFormFromTemplate,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureOps';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { usePublicAppUrl } from '@/lib/publicUrl';
import { PlatformCrmCaptureProductField } from './PlatformCrmCaptureProductField';
import { PlatformCrmFormBuilder } from './form';
import { PlatformCrmFormResponses } from './form/PlatformCrmFormResponses';

/**
 * CRM de PLATAFORMA (super_admin) — FORMULÁRIOS (porte FIEL do visual Vendus v5).
 *
 * Espelha `src/components/admin/forms/FormsManager.tsx` (grid de cards com caixa de
 * stats Visualizações/Respostas/Conversão, dialog de criação com métodos, share por
 * link/embed) — mas sobre HOOKS de PLATAFORMA (platform_crm_forms) + product-scoped
 * pelo produto ativo GLOBAL (D3 F2) + PlatformCrmCaptureProductField no create.
 * Sem organization_id / sem tenant. Substitui o `PlatformCrmCaptureFormsTab` genérico
 * (lista vertical) que Marcelo apontou como "não igual ao Vendus".
 */

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

export function PlatformCrmFormsManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [builderFormId, setBuilderFormId] = useState<string | null>(null);
  const [responsesFormId, setResponsesFormId] = useState<string | null>(null);

  // Create form state
  const [newFormName, setNewFormName] = useState('');
  const [newFormDescription, setNewFormDescription] = useState('');
  const [newFormProductId, setNewFormProductId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [createMethod, setCreateMethod] = useState<'manual' | 'template'>('manual');

  const { data: forms, isLoading } = usePlatformCrmForms();
  const { data: templates } = usePlatformCrmFormTemplates();
  // Produto ativo GLOBAL (D3 F2): lista filtra pelo ativo e novo form nasce nele.
  const { products, activeProductId, effectiveProductId } = useActivePlatformProduct();
  const { data: baseUrl } = usePublicAppUrl();
  const createForm = useCreatePlatformCrmForm();
  const createFromTemplate = useCreatePlatformCrmFormFromTemplate();
  const deleteForm = useDeletePlatformCrmForm();
  const duplicateForm = useDuplicatePlatformCrmForm();
  const toggleStatus = useTogglePlatformCrmFormStatus();

  // Obrigatório quando há produtos; sem produtos o backend aplica o default.
  const productReady = products.length === 0 || !!newFormProductId;
  const isCreating = createForm.isPending || createFromTemplate.isPending;

  const productName = (productId: string | null | undefined) =>
    products.find((p) => p.id === productId)?.name ?? 'Produto';

  // Filtra: busca + status + recorte pelo produto ativo GLOBAL (D3 F2). "Todos"
  // mostra tudo; concreto mostra os do produto + os sem produto (nunca somem).
  const filteredForms = (forms ?? []).filter((form) => {
    const matchesSearch =
      form.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || form.status === statusFilter;
    const matchesProduct =
      !activeProductId || form.product_id === activeProductId || form.product_id == null;
    return matchesSearch && matchesStatus && matchesProduct;
  });

  const openCreate = () => {
    setNewFormName('');
    setNewFormDescription('');
    setSelectedTemplateId(null);
    setCreateMethod('manual');
    // Novo form nasce no produto ativo (concreto). Com 1 produto, é ele mesmo.
    setNewFormProductId(effectiveProductId ?? '');
    setIsCreateDialogOpen(true);
  };

  const handleCreateForm = async () => {
    if (!newFormName.trim() || !productReady) return;

    if (createMethod === 'template') {
      const template = templates?.find((t) => t.id === selectedTemplateId);
      if (!template) {
        toast.error('Selecione um template');
        return;
      }
      await createFromTemplate.mutateAsync({
        name: newFormName.trim(),
        description: newFormDescription.trim() || undefined,
        product_id: newFormProductId || null,
        template,
      });
    } else {
      await createForm.mutateAsync({
        name: newFormName.trim(),
        description: newFormDescription.trim() || undefined,
        product_id: newFormProductId || null,
      });
    }

    setNewFormName('');
    setNewFormDescription('');
    setNewFormProductId('');
    setSelectedTemplateId(null);
    setCreateMethod('manual');
    setIsCreateDialogOpen(false);
  };

  const getConversionRate = (form: PlatformCrmForm) => {
    const views = form.views_count ?? 0;
    const subs = form.submissions_count ?? 0;
    if (views === 0) return '0%';
    return `${((subs / views) * 100).toFixed(1)}%`;
  };

  const getPublicUrl = (form: PlatformCrmForm) => `${baseUrl}/f/${form.slug}`;

  const openPublicLink = (form: PlatformCrmForm) => {
    window.open(getPublicUrl(form), '_blank', 'noopener,noreferrer');
  };

  const copyLink = (form: PlatformCrmForm) => {
    navigator.clipboard.writeText(getPublicUrl(form));
    toast.success('Link copiado!');
  };

  const copyEmbedCode = (form: PlatformCrmForm) => {
    const embedCode = `<iframe src="${getPublicUrl(form)}" width="100%" height="600" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(embedCode);
    toast.success('Código de incorporação copiado!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Formulários
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Capture leads qualificados com formulários inteligentes.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Formulário
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar formulários..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="draft">Rascunhos</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
            <SelectItem value="archived">Arquivados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid de formulários */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredForms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileEdit className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum formulário encontrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Crie seu primeiro formulário para começar a captar leads'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Formulário
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredForms.map((form) => {
            const status = statusConfig[form.status ?? 'draft'] ?? statusConfig.draft;
            return (
              <Card key={form.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{form.name}</CardTitle>
                      <CardDescription className="truncate">
                        {productName(form.product_id)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setBuilderFormId(form.id)}>
                            <FileEdit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setResponsesFormId(form.id)}>
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Respostas
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPublicLink(form)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateForm.mutate(form.id)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => copyLink(form)}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Copiar Link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyEmbedCode(form)}>
                            <Code className="h-4 w-4 mr-2" />
                            Copiar Embed
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {form.status === 'active' ? (
                            <DropdownMenuItem
                              onClick={() => toggleStatus.mutate({ id: form.id, status: 'paused' })}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pausar
                            </DropdownMenuItem>
                          ) : form.status !== 'archived' ? (
                            <DropdownMenuItem
                              onClick={() => toggleStatus.mutate({ id: form.id, status: 'active' })}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Ativar
                            </DropdownMenuItem>
                          ) : null}
                          {form.status !== 'archived' && (
                            <DropdownMenuItem
                              onClick={() =>
                                toggleStatus.mutate({ id: form.id, status: 'archived' })
                              }
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Arquivar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteId(form.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {form.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {form.description}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center py-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-lg font-semibold">{form.views_count ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Visualizações</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{form.submissions_count ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Respostas</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{getConversionRate(form)}</p>
                      <p className="text-xs text-muted-foreground">Conversão</p>
                    </div>
                  </div>

                  {form.updated_at && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Atualizado{' '}
                      {format(new Date(form.updated_at), "d 'de' MMM", { locale: ptBR })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Builder visual do formulário — dialog fullscreen (abordagem de plataforma). */}
      <Dialog open={!!builderFormId} onOpenChange={(o) => !o && setBuilderFormId(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Construtor de Formulário</DialogTitle>
            <DialogDescription>
              Monte os campos, o design e a publicação do formulário.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {builderFormId && (
              <PlatformCrmFormBuilder
                formId={builderFormId}
                onClose={() => setBuilderFormId(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Respostas do formulário — dialog fullscreen. */}
      <Dialog open={!!responsesFormId} onOpenChange={(o) => !o && setResponsesFormId(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Respostas do Formulário</DialogTitle>
            <DialogDescription>
              Veja e filtre as respostas recebidas e abra o detalhe de cada lead.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {responsesFormId && <PlatformCrmFormResponses formId={responsesFormId} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de criação (espelha o Vendus: produto + método + template + detalhes). */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Novo Formulário</DialogTitle>
            <DialogDescription>Crie um formulário para captar leads qualificados</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Produto (platform) */}
            <PlatformCrmCaptureProductField
              products={products}
              value={newFormProductId}
              onChange={setNewFormProductId}
            />

            {/* Método de criação */}
            <div className="space-y-2">
              <Label>Como você quer criar?</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={createMethod === 'manual' ? 'default' : 'outline'}
                  className="h-auto py-4 flex-col"
                  onClick={() => setCreateMethod('manual')}
                >
                  <FileEdit className="h-5 w-5 mb-1" />
                  <span className="text-xs">Do Zero</span>
                </Button>
                <Button
                  type="button"
                  variant={createMethod === 'template' ? 'default' : 'outline'}
                  className="h-auto py-4 flex-col"
                  onClick={() => setCreateMethod('template')}
                >
                  <LayoutTemplate className="h-5 w-5 mb-1" />
                  <span className="text-xs">Template</span>
                </Button>
              </div>
            </div>

            {/* Seleção de template */}
            {createMethod === 'template' && (
              <div className="space-y-2">
                <Label>Escolha um template</Label>
                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
                  {(templates ?? []).map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        selectedTemplateId === template.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{template.name}</span>
                        {template.category && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {template.category}
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {template.description}
                        </p>
                      )}
                    </button>
                  ))}
                  {templates?.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum template cadastrado ainda.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Detalhes do formulário */}
            <div className="space-y-2">
              <Label htmlFor="form-name">Nome do formulário *</Label>
              <Input
                id="form-name"
                value={newFormName}
                onChange={(e) => setNewFormName(e.target.value)}
                placeholder="Ex: Qualificação de Leads"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="form-description">Descrição (opcional)</Label>
              <Textarea
                id="form-description"
                value={newFormDescription}
                onChange={(e) => setNewFormDescription(e.target.value)}
                placeholder="Descreva o objetivo do formulário..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateForm}
              disabled={
                !newFormName.trim() ||
                !productReady ||
                isCreating ||
                (createMethod === 'template' && !selectedTemplateId)
              }
            >
              {isCreating ? 'Criando...' : 'Criar Formulário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão (AlertDialog de plataforma no lugar do confirm() do Vendus). */}
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
