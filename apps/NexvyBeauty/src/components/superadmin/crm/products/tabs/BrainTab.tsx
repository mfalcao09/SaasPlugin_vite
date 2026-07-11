// Porte de `.vendus-src-reference/src/components/admin/products/tabs/BrainTab.tsx` (shell 1:1).
// Os widgets profundos da fonte (components/brain/: FileUploader, WebsiteCrawler,
// YouTubeTranscriber, FAQBuilder, AITrainingWidget) dependem de
// TODO(table: platform_crm_product_knowledge_sources) + TODO(edge: process-training-material,
// catalog-sync-website, transcrição) — aqui cada sub-aba mantém a UI de entrada completa
// com o envio marcado como pendente (padrão da onda: botão + TODO, zero dado fake).
import { useState } from 'react';
import {
  Brain,
  FileText,
  Globe,
  Youtube,
  MessageSquare,
  Database,
  Sparkles,
  ChevronRight,
  Loader2,
  Package,
  Upload,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useProductKnowledgeSources,
  useProductKnowledgeSourceStats,
  useCreateProductKnowledgeSource,
  todoBackend,
} from '../hooks/useProductHubStubs';
import { CatalogManager } from './catalog/CatalogManager';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface BrainTabProps {
  productId: string;
}

const SOURCE_TYPES = [
  {
    id: 'file',
    label: 'Arquivos',
    icon: FileText,
    description: 'PDFs, DOCs, apresentações',
    color: 'text-blue-500',
  },
  {
    id: 'website',
    label: 'Websites',
    icon: Globe,
    description: 'URLs para crawling',
    color: 'text-green-500',
  },
  {
    id: 'youtube',
    label: 'Vídeos',
    icon: Youtube,
    description: 'Transcrição automática',
    color: 'text-red-500',
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: MessageSquare,
    description: 'Perguntas e respostas',
    color: 'text-purple-500',
  },
  {
    id: 'data',
    label: 'Dados',
    icon: Database,
    description: 'Tabelas e comparativos',
    color: 'text-orange-500',
  },
  {
    id: 'training',
    label: 'Treinamento',
    icon: Sparkles,
    description: 'Ensine a IA diretamente',
    color: 'text-primary',
  },
  {
    id: 'catalog',
    label: 'Catálogo',
    icon: Package,
    description: 'Itens que a IA pode buscar e enviar',
    color: 'text-primary',
  },
];

export function BrainTab({ productId }: BrainTabProps) {
  const { data: sources, isLoading: sourcesLoading } = useProductKnowledgeSources(productId);
  const { data: stats } = useProductKnowledgeSourceStats(productId);
  const createSource = useCreateProductKnowledgeSource();
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSource, setActiveSource] = useState<string | null>(null);

  // FAQ e Treinamento direto: conteúdo textual → insere fonte de conhecimento real.
  // (Arquivos/website/youtube exigem storage/crawl/transcrição — P2.A-2.)
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [trainingText, setTrainingText] = useState('');

  // Website/YouTube: a edge `platform-process-knowledge-source` extrai o conteúdo
  // (é stateless — só website/youtube) e devolve; a persistência fica com o chamador,
  // via useCreateProductKnowledgeSource (mesmo contrato da org-scoped).
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [processingSource, setProcessingSource] = useState<'website' | 'youtube' | null>(null);

  const handleProcessSource = async (
    sourceType: 'website' | 'youtube',
    url: string,
    reset: () => void,
  ) => {
    if (!url.trim()) {
      toast.error('Informe a URL');
      return;
    }
    setProcessingSource(sourceType);
    try {
      const { data, error } = await supabase.functions.invoke('platform-process-knowledge-source', {
        body: { sourceType, url: url.trim(), productId },
      });
      if (error) {
        // FunctionsHttpError esconde a mensagem real no corpo da Response.
        let msg = error.message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        try {
          const body = await ctx?.json?.();
          if (body?.error) msg = body.error;
        } catch {
          /* mantém error.message */
        }
        throw new Error(msg);
      }
      const result = (data ?? {}) as {
        success?: boolean;
        error?: string;
        data?: { title?: string; content?: string; description?: string };
      };
      if (!result.success) throw new Error(result.error ?? 'Falha ao processar a fonte');
      const extracted = result.data ?? {};
      await createSource.mutateAsync({
        product_id: productId,
        source_type: sourceType,
        title: extracted.title || url.trim(),
        source_url: url.trim(),
        raw_content: extracted.content ?? null,
        extracted_content: extracted.content ?? null,
      });
      toast.success(
        sourceType === 'youtube'
          ? 'Vídeo processado e adicionado ao Cérebro!'
          : 'Site lido e adicionado ao Cérebro!',
      );
      reset();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao processar a fonte');
    } finally {
      setProcessingSource(null);
    }
  };

  const handleAddFaq = () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      toast.error('Preencha a pergunta e a resposta');
      return;
    }
    createSource.mutate(
      {
        product_id: productId,
        source_type: 'faq',
        title: faqQuestion.trim(),
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
      },
      {
        onSuccess: () => {
          toast.success('FAQ adicionado ao Cérebro!');
          setFaqQuestion('');
          setFaqAnswer('');
        },
        onError: () => toast.error('Erro ao adicionar FAQ'),
      },
    );
  };

  const handleTeachAI = () => {
    if (!trainingText.trim()) {
      toast.error('Escreva o que a IA deve aprender');
      return;
    }
    const firstLine = trainingText.trim().split('\n')[0].slice(0, 80);
    createSource.mutate(
      {
        product_id: productId,
        source_type: 'training',
        title: firstLine || 'Treinamento direto',
        raw_content: trainingText.trim(),
        extracted_content: trainingText.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Conhecimento adicionado ao Cérebro!');
          setTrainingText('');
        },
        onError: () => toast.error('Erro ao ensinar a IA'),
      },
    );
  };

  if (sourcesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const healthScore = stats ? Math.round((stats.completed / Math.max(stats.total, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header with Health Score */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Cérebro do Produto</h2>
              <p className="text-sm text-muted-foreground">
                Alimente a IA com conhecimento para respostas mais precisas
              </p>
            </div>
          </div>
        </div>
        {/* BrainHealthScore (porte compacto) */}
        <div className="text-right">
          <div className="text-2xl font-bold text-primary">{healthScore}%</div>
          <p className="text-xs text-muted-foreground">
            {stats?.completed ?? 0}/{stats?.total ?? 0} fontes prontas
          </p>
        </div>
      </div>

      {/* Description Card */}
      <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Adicione conhecimento através de diferentes fontes. Quanto mais dados, mais inteligente
            a IA ficará para ajudar com objeções, cadências e respostas contextualizadas.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Precisa editar a <strong className="text-foreground">oferta vigente, garantia,
            política de desconto e planos</strong> agora? Isso já é editável na aba{' '}
            <strong className="text-foreground">Playbook</strong> — as IAs bebem daqueles campos
            diretamente. As fontes abaixo (arquivos, sites, vídeos) entram quando a indexação for ligada.
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="files">Arquivos</TabsTrigger>
          <TabsTrigger value="websites">Websites</TabsTrigger>
          <TabsTrigger value="youtube">YouTube</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="training">Treinamento IA</TabsTrigger>
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Source Type Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {SOURCE_TYPES.map((type) => {
              const Icon = type.icon;
              const count = (stats?.[type.id as keyof typeof stats] as number) || 0;

              return (
                <Card
                  key={type.id}
                  className={cn(
                    'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md',
                    activeSource === type.id && 'border-primary ring-1 ring-primary/20'
                  )}
                  onClick={() => {
                    if (type.id === 'file') setActiveTab('files');
                    else if (type.id === 'website') setActiveTab('websites');
                    else if (type.id === 'youtube') setActiveTab('youtube');
                    else if (type.id === 'faq') setActiveTab('faq');
                    else if (type.id === 'training') setActiveTab('training');
                    else if (type.id === 'catalog') setActiveTab('catalog');
                    else setActiveSource(type.id);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className={cn('p-2 rounded-lg bg-muted', type.color)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {count} {count === 1 ? 'item' : 'itens'}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <h3 className="font-medium">{type.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mt-3" />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent Sources */}
          {sources && sources.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Fontes Recentes</h3>
              <div className="space-y-3">
                {sources.slice(0, 5).map((source) => (
                  <Card key={source.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{source.title}</span>
                      <Badge variant="outline" className="text-xs">{source.processing_status}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {(!sources || sources.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">Comece a treinar o cérebro</h3>
                <p className="text-muted-foreground mb-4">
                  Adicione arquivos, FAQs ou treine a IA diretamente para melhorar as respostas.
                </p>
                <div className="flex justify-center gap-3">
                  <Button onClick={() => setActiveTab('files')}>
                    <FileText className="h-4 w-4 mr-2" />
                    Adicionar Arquivo
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('faq')}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Criar FAQ
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Arquivos — porte compacto do FileUploader (envio TODO) */}
        <TabsContent value="files" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Arquivos
              </CardTitle>
              <CardDescription>PDFs, DOCs e apresentações viram conhecimento pesquisável para a IA.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer border-muted-foreground/25 hover:border-primary/50 transition-colors"
                onClick={() => todoBackend('Upload de arquivos do Cérebro')}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Arraste arquivos ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOC, PPT (máx. 10MB)</p>
              </div>
              {/* TODO(edge): process-training-material · TODO(table: platform_crm_product_knowledge_sources) */}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Websites — porte compacto do WebsiteCrawler (crawl TODO) */}
        <TabsContent value="websites" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-green-500" /> Websites
              </CardTitle>
              <CardDescription>A IA lê páginas do seu site e aprende o conteúdo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>URL do site</Label>
                <Input
                  placeholder="https://seusite.com.br"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                />
              </div>
              <Button
                onClick={() => handleProcessSource('website', websiteUrl, () => setWebsiteUrl(''))}
                disabled={processingSource === 'website'}
              >
                {processingSource === 'website' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4 mr-2" />
                )}
                Iniciar crawling
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* YouTube — porte compacto do YouTubeTranscriber (transcrição TODO) */}
        <TabsContent value="youtube" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-500" /> Vídeos do YouTube
              </CardTitle>
              <CardDescription>Transcrição automática do vídeo vira conhecimento da IA.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>URL do vídeo</Label>
                <Input
                  placeholder="https://youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
              </div>
              <Button
                onClick={() => handleProcessSource('youtube', youtubeUrl, () => setYoutubeUrl(''))}
                disabled={processingSource === 'youtube'}
              >
                {processingSource === 'youtube' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Youtube className="h-4 w-4 mr-2" />
                )}
                Transcrever vídeo
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQ — porte compacto do FAQBuilder (salvar TODO) */}
        <TabsContent value="faq" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-purple-500" /> FAQ
              </CardTitle>
              <CardDescription>Perguntas e respostas prontas que a IA usa com prioridade.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Pergunta</Label>
                <Input
                  placeholder="Ex: Qual o prazo de implantação?"
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Resposta</Label>
                <Textarea
                  rows={3}
                  placeholder="Ex: A implantação leva em média 7 dias úteis..."
                  value={faqAnswer}
                  onChange={(e) => setFaqAnswer(e.target.value)}
                />
              </div>
              <Button onClick={handleAddFaq} disabled={createSource.isPending}>
                {createSource.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Adicionar FAQ
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Treinamento — porte compacto do AITrainingWidget (treino TODO) */}
        <TabsContent value="training" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Treinamento direto
              </CardTitle>
              <CardDescription>Escreva instruções e fatos que a IA deve saber sobre o produto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={5}
                placeholder={'Ex: Nosso diferencial nº 1 é o suporte via WhatsApp em até 5 minutos.\nNunca prometa desconto acima de 10% sem aprovação.'}
                value={trainingText}
                onChange={(e) => setTrainingText(e.target.value)}
              />
              <Button onClick={handleTeachAI} disabled={createSource.isPending}>
                {createSource.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Ensinar a IA
              </Button>
              {/* Embedding/indexação da fonte → P2.A-2 */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog" className="mt-6">
          <CatalogManager productId={productId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
