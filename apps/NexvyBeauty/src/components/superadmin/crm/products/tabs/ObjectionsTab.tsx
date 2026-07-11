// Porte de `.vendus-src-reference/src/components/admin/products/tabs/ObjectionsTab.tsx`
// + ObjectionsView (385 l.) e ManualObjectionForm (306 l.) de components/objections/,
// embutidos aqui (hub-local). Dados relacionais: TODO(table: platform_crm_objections).
// Ações IA: TODO(edge: generate-objections / handle-objection) — botões presentes.
// TOPO: editor REAL do campo TEXT `objections` de platform_crm_products (playbook de
//   objeções em texto livre) — save via useUpdatePlatformCrmProduct (hook existente).
//   Esse campo alimenta o copiloto e a IA de resposta.
import { useState, useEffect } from 'react';
import {
  usePlatformCrmProduct,
  useUpdatePlatformCrmProduct,
} from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import { useProductObjections, useCreateProductObjection, todoBackend, type ProductObjection } from '../hooks/useProductHubStubs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Search,
  MessageCircle,
  Brain,
  Reply,
  HelpCircle,
  Copy,
  Check,
  DollarSign,
  Clock,
  Shield,
  Users,
  Swords,
  AlertCircle,
  Sparkles,
  PenLine,
  Save,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

interface ObjectionsTabProps {
  productId: string;
}

const categoryConfig = {
  price: { label: 'Preço', icon: DollarSign, color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  timing: { label: 'Timing', icon: Clock, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  trust: { label: 'Confiança', icon: Shield, color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  thinking: { label: 'Vou pensar', icon: Brain, color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  partner: { label: 'Sócio/Diretor', icon: Users, color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  competitor: { label: 'Concorrência', icon: Swords, color: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

export function ObjectionsTab({ productId }: ObjectionsTabProps) {
  const { data: objections, isLoading } = useProductObjections(productId);
  const { data: product } = usePlatformCrmProduct(productId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Editor do campo TEXT `objections` — playbook de objeções que a IA consome */}
      <ObjectionsPlaybookEditor productId={productId} />

      <ObjectionsView
        objections={objections || []}
        productId={productId}
        productName={product?.name}
        showAdminActions
      />
    </div>
  );
}

// ─── ObjectionsPlaybookEditor ────────────────────────────────────────────────
// Editor do campo TEXT `objections` de platform_crm_products (texto livre no
// formato "objeção" → resposta). Alimenta o copiloto e a IA de resposta.
// Save via useUpdatePlatformCrmProduct (mesmo hook do SettingsTab).
function ObjectionsPlaybookEditor({ productId }: { productId: string }) {
  const { data: product } = usePlatformCrmProduct(productId);
  const updateProduct = useUpdatePlatformCrmProduct();
  const [isFormReady, setIsFormReady] = useState(false);
  const [objectionsText, setObjectionsText] = useState('');

  useEffect(() => {
    if (product) {
      setObjectionsText(product.objections || '');
      setIsFormReady(true);
    }
  }, [product]);

  const handleSave = async () => {
    if (!isFormReady) {
      toast.error('Aguarde os dados carregarem');
      return;
    }
    try {
      await updateProduct.mutateAsync({
        id: productId,
        objections: objectionsText || null,
      });
      toast.success('Playbook de objeções salvo!');
    } catch (e) {
      console.error('[ObjectionsTab] salvar falhou:', e);
      toast.error('Erro ao salvar objeções');
    }
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              Playbook de objeções (texto livre)
            </CardTitle>
            <CardDescription>
              Objeções comuns e as respostas padrão da equipe. Este campo alimenta o
              copiloto e a IA de resposta. Um bloco por objeção.
            </CardDescription>
          </div>
          <Button onClick={handleSave} disabled={updateProduct.isPending || !isFormReady} size="sm">
            {updateProduct.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={objectionsText}
          onChange={(e) => setObjectionsText(e.target.value)}
          rows={10}
          placeholder={
            'Objeção: "Está caro demais"\nResposta: Entendo! Vamos olhar juntos o retorno...\n\nObjeção: "Preciso pensar / falar com meu sócio"\nResposta: Claro. Que informação ajudaria a decisão de vocês?\n\nObjeção: "Não é o momento"\nResposta: Faz sentido. O que precisaria mudar para ser o momento certo?'
          }
        />
      </CardContent>
    </Card>
  );
}

// ─── ObjectionsView (porte 1:1 de components/objections/ObjectionsView.tsx) ──
interface ObjectionsViewProps {
  objections: ProductObjection[];
  productId?: string;
  productName?: string;
  showAdminActions?: boolean;
}

function ObjectionsView({ objections, productId, productName, showAdminActions }: ObjectionsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const filteredObjections = objections.filter(obj => {
    const matchesSearch = searchQuery === '' ||
      obj.whatTheySay.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.suggestedResponse.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || obj.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Resposta copiada!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // TODO(edge: generate-objections) — geração em lote com IA
  const handleOpenGenerator = () => todoBackend('Geração de objeções em lote com IA');
  // TODO(edge: handle-objection) — refino individual com IA
  const handleRefineObjection = (_objection: ProductObjection) => todoBackend('Refino de objeção com IA');

  const categories = Object.entries(categoryConfig);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className={cn('font-bold text-foreground', isMobile ? 'text-xl' : 'text-2xl')}>Central de Objeções</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Respostas prontas para as objeções mais comuns
          </p>
        </div>
        {showAdminActions && productId && productName && (
          <Button onClick={handleOpenGenerator} className="gap-2" size={isMobile ? 'sm' : 'default'}>
            <Sparkles className="h-4 w-4" />
            {isMobile ? 'Gerar IA' : 'Gerar em Lote com IA'}
          </Button>
        )}
      </div>

      {/* Tabs for AI Assistant and Manual Form */}
      {showAdminActions && productId && (
        <Tabs defaultValue="assistant" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assistant" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Assistente IA
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <PenLine className="h-4 w-4" />
              Adicionar Manual
            </TabsTrigger>
          </TabsList>
          <TabsContent value="assistant" className="mt-4">
            {/* Porte compacto do ObjectionAssistant — TODO(edge: handle-objection) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Assistente de Objeções
                </CardTitle>
                <CardDescription>
                  Cole a objeção do cliente e a IA sugere resposta usando o Cérebro do Produto.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea rows={3} placeholder={'Ex: "Achei caro demais pra começar agora..."'} />
                <Button onClick={() => todoBackend('Assistente IA de objeções')}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Gerar resposta
                </Button>
                {/* TODO(edge: handle-objection) */}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="manual" className="mt-4">
            <ManualObjectionForm productId={productId} />
          </TabsContent>
        </Tabs>
      )}

      {/* Empty state when no objections */}
      {objections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={48} className="text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma objeção cadastrada</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {showAdminActions
              ? 'Use a IA para gerar objeções ou adicione manualmente acima'
              : 'Peça ao administrador para cadastrar objeções deste produto'}
          </p>
          {showAdminActions && productId && productName && (
            <Button onClick={handleOpenGenerator} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Gerar Objeções com IA
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={isMobile ? 'Buscar objeção...' : "Buscar objeção... ex: 'caro', 'não é o momento', 'vou pensar'"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn('pl-12 text-base bg-card border-border', isMobile ? 'h-11' : 'h-12')}
            />
          </div>

          {/* Category Filters */}
          <div className={cn(
            'flex gap-2',
            isMobile ? 'overflow-x-auto -mx-4 px-4 pb-2 hide-scrollbar snap-x snap-mandatory' : 'flex-wrap'
          )}>
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className={cn(isMobile && 'flex-shrink-0 snap-start')}
            >
              Todas
            </Button>
            {categories.map(([key, config]) => {
              const Icon = config.icon;
              return (
                <Button
                  key={key}
                  variant={selectedCategory === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
                  className={cn('gap-2', isMobile && 'flex-shrink-0 snap-start')}
                >
                  <Icon size={14} />
                  {config.label}
                </Button>
              );
            })}
          </div>

          {/* Objections List */}
          <div className="space-y-4">
            {filteredObjections.map((objection, index) => {
              const config = categoryConfig[objection.category];
              const Icon = config.icon;
              const isExpanded = expandedId === objection.id;
              const isCopied = copiedId === objection.id;

              return (
                <div
                  key={objection.id}
                  className={cn(
                    'rounded-xl border border-border bg-card overflow-hidden transition-all duration-200',
                    'hover:border-primary/30',
                    isExpanded && 'border-primary/50'
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  {/* Header - Always visible */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : objection.id)}
                    className="w-full p-5 flex items-start gap-4 text-left"
                  >
                    <div className={cn(
                      'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      config.color.split(' ')[0]
                    )}>
                      <Icon size={20} className={config.color.split(' ')[1]} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn('text-xs', config.color)}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="font-medium text-foreground">
                        <MessageCircle size={14} className="inline mr-2 text-muted-foreground" />
                        "{objection.whatTheySay}"
                      </p>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 animate-fade-in">
                      {/* What they mean */}
                      <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain size={16} className="text-muted-foreground" />
                          <span className="text-sm font-medium text-muted-foreground">
                            O que ele quer dizer:
                          </span>
                        </div>
                        <p className="text-foreground text-sm">{objection.whatTheyMean || 'Não definido'}</p>
                      </div>

                      {/* Suggested Response */}
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                        <div className={cn(
                          'flex items-center justify-between mb-2',
                          isMobile && 'flex-col items-start gap-2'
                        )}>
                          <div className="flex items-center gap-2">
                            <Reply size={16} className="text-primary" />
                            <span className="text-sm font-medium text-primary">
                              Resposta sugerida:
                            </span>
                          </div>
                          <div className={cn('flex gap-2', isMobile && 'w-full')}>
                            {showAdminActions && productId && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRefineObjection(objection);
                                }}
                                className={cn('gap-2', isMobile && 'flex-1')}
                              >
                                <Sparkles size={14} />
                                Refinar com IA
                              </Button>
                            )}
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(objection.suggestedResponse, objection.id);
                              }}
                              className={cn('gap-2', isMobile && 'flex-1')}
                            >
                              {isCopied ? (
                                <>
                                  <Check size={14} />
                                  Copiado
                                </>
                              ) : (
                                <>
                                  <Copy size={14} />
                                  Copiar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        <p className="text-foreground leading-relaxed text-sm">
                          {objection.suggestedResponse}
                        </p>
                      </div>

                      {/* Follow-up Question */}
                      <div className="p-4 rounded-lg bg-success/5 border border-success/20">
                        <div className="flex items-center gap-2 mb-2">
                          <HelpCircle size={16} className="text-success" />
                          <span className="text-sm font-medium text-success">
                            Pergunta de retorno:
                          </span>
                        </div>
                        <p className="text-foreground italic text-sm">
                          {objection.followUpQuestion ? `"${objection.followUpQuestion}"` : 'Não definida'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredObjections.length === 0 && (
              <div className="text-center py-12">
                <Search size={48} className="mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhuma objeção encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tente buscar por outras palavras-chave
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── ManualObjectionForm (porte de components/objections/ManualObjectionForm.tsx) ──
const manualCategories = [
  { value: 'price', label: 'Preço' },
  { value: 'timing', label: 'Timing' },
  { value: 'trust', label: 'Confiança' },
  { value: 'thinking', label: 'Vou Pensar' },
  { value: 'partner', label: 'Sócio/Diretor' },
  { value: 'competitor', label: 'Concorrência' },
];

function ManualObjectionForm({ productId }: { productId: string }) {
  const [category, setCategory] = useState<string>('thinking');
  const [whatTheySay, setWhatTheySay] = useState('');
  const [whatTheyMean, setWhatTheyMean] = useState('');
  const [suggestedResponse, setSuggestedResponse] = useState('');
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const createObjection = useCreateProductObjection();

  const handleRefineAll = () => {
    if (!whatTheySay.trim()) {
      toast.error('Digite a objeção do cliente primeiro');
      return;
    }
    // TODO(edge: handle-objection)
    todoBackend('Geração dos campos com IA');
  };

  const handleSave = async () => {
    if (!whatTheySay.trim()) {
      toast.error('Digite a objeção do cliente');
      return;
    }
    if (!suggestedResponse.trim()) {
      toast.error('Digite a resposta sugerida');
      return;
    }
    try {
      await createObjection.mutateAsync({
        product_id: productId,
        category,
        whatTheySay: whatTheySay.trim(),
        whatTheyMean: whatTheyMean.trim(),
        suggestedResponse: suggestedResponse.trim(),
        followUpQuestion: followUpQuestion.trim(),
      });
      toast.success('Objeção salva!');
      setWhatTheySay('');
      setWhatTheyMean('');
      setSuggestedResponse('');
      setFollowUpQuestion('');
      setCategory('thinking');
    } catch (e) {
      console.error('[ObjectionsTab] salvar objeção falhou:', e);
      toast.error('Erro ao salvar objeção');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PenLine className="h-4 w-4 text-primary" />
          Nova objeção manual
        </CardTitle>
        <CardDescription>Cadastre a objeção e a resposta padrão da equipe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {manualCategories.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="gap-2 w-full" onClick={handleRefineAll}>
              <Sparkles className="h-4 w-4" />
              Preencher tudo com IA
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>O que o cliente diz *</Label>
          <Textarea
            rows={2}
            value={whatTheySay}
            onChange={(e) => setWhatTheySay(e.target.value)}
            placeholder='Ex: "Está caro demais..."'
          />
        </div>

        <div className="space-y-2">
          <Label>O que ele quer dizer</Label>
          <Textarea
            rows={2}
            value={whatTheyMean}
            onChange={(e) => setWhatTheyMean(e.target.value)}
            placeholder="Ex: Não enxergou valor suficiente ainda..."
          />
        </div>

        <div className="space-y-2">
          <Label>Resposta sugerida *</Label>
          <Textarea
            rows={3}
            value={suggestedResponse}
            onChange={(e) => setSuggestedResponse(e.target.value)}
            placeholder="Ex: Entendo! Vamos olhar juntos o retorno que você teria..."
          />
        </div>

        <div className="space-y-2">
          <Label>Pergunta de retorno</Label>
          <Textarea
            rows={2}
            value={followUpQuestion}
            onChange={(e) => setFollowUpQuestion(e.target.value)}
            placeholder='Ex: "Se o valor coubesse no orçamento, faria sentido começar este mês?"'
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} className="gap-2" disabled={createObjection.isPending}>
            {createObjection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar objeção
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
