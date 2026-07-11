// Porte 1:1 de `.vendus-src-reference/src/components/admin/products/tabs/PlaybookTab.tsx`
// (aba "Vídeo Aulas" — persistência TODO(table: platform_crm_product_training_videos))
// + aba "Oferta & Playbook": editor REAL dos campos TEXT de platform_crm_products
//   (knowledge_base, guarantee, discount_policy, plans) — fonte da estratégia que o
//   copiloto e a IA de resposta consomem (ver AgentPromptTemplates.ts). Save via
//   useUpdatePlatformCrmProduct (hook existente). Zero backend novo.
import { useState, useEffect } from 'react';
import {
  usePlatformCrmProduct,
  useUpdatePlatformCrmProduct,
} from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import { useProductTrainingVideos, useTodoMutation } from '../hooks/useProductHubStubs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Play, Video, Trash2, ExternalLink, BookOpen, Save, Sparkles, ShieldCheck, Percent, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface PlaybookTabProps {
  productId: string;
}

export function PlaybookTab({ productId }: PlaybookTabProps) {
  const [activeTab, setActiveTab] = useState('offer');
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoForm, setVideoForm] = useState({
    title: '',
    description: '',
    video_url: '',
    thumbnail_url: '',
  });

  // TODO(table: platform_crm_product_training_videos)
  const { data: trainingVideos, isLoading: loadingVideos } = useProductTrainingVideos(productId);
  const createVideo = useTodoMutation('Adicionar vídeo aula do Playbook');
  const deleteVideo = useTodoMutation('Remover vídeo aula do Playbook');

  const handleAddVideo = () => {
    if (!videoForm.title.trim() || !videoForm.video_url.trim()) {
      toast.error('Título e URL do vídeo são obrigatórios');
      return;
    }
    createVideo.mutate(videoForm, {
      onSuccess: () => {
        setVideoDialogOpen(false);
        setVideoForm({ title: '', description: '', video_url: '', thumbnail_url: '' });
      },
    });
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="offer" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Oferta & Playbook
          </TabsTrigger>
          <TabsTrigger value="videos" className="gap-2">
            <Video className="h-4 w-4" />
            Vídeo Aulas
          </TabsTrigger>
        </TabsList>

        {/* Oferta & Playbook — editor real dos campos TEXT que a IA consome */}
        <TabsContent value="offer" className="mt-4">
          <OfferPlaybookEditor productId={productId} />
        </TabsContent>

        {/* Videos Tab */}
        <TabsContent value="videos" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => setVideoDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Vídeo
            </Button>
          </div>

          {loadingVideos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : trainingVideos && trainingVideos.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trainingVideos.map((video) => (
                <Card key={video.id} className="bg-card group">
                  <CardContent className="p-0">
                    {/* Video Thumbnail / Embed Preview */}
                    <div className="aspect-video bg-muted rounded-t-lg overflow-hidden relative">
                      {video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play className="h-12 w-12 text-muted-foreground/50" />
                        </div>
                      )}
                      <a
                        href={video.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Play className="h-12 w-12 text-white" />
                      </a>
                    </div>

                    {/* Video Info */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium text-foreground truncate">
                            {video.title}
                          </h3>
                          {video.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {video.description}
                            </p>
                          )}
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover vídeo?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação irá remover o vídeo "{video.title}" do playbook.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteVideo.mutate(video.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                      <a
                        href={video.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Abrir vídeo
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-card">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Video className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">Nenhum vídeo</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Adicione vídeo aulas para treinar sua equipe
                </p>
                <Button onClick={() => setVideoDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Vídeo
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Video Dialog */}
      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Vídeo Aula</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="videoTitle">Título *</Label>
              <Input
                id="videoTitle"
                value={videoForm.title}
                onChange={(e) => setVideoForm({ ...videoForm, title: e.target.value })}
                placeholder="Ex: Introdução ao Produto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="videoUrl">URL do Vídeo *</Label>
              <Input
                id="videoUrl"
                value={videoForm.video_url}
                onChange={(e) => setVideoForm({ ...videoForm, video_url: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="videoThumbnail">URL da Thumbnail (opcional)</Label>
              <Input
                id="videoThumbnail"
                value={videoForm.thumbnail_url}
                onChange={(e) => setVideoForm({ ...videoForm, thumbnail_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="videoDescription">Descrição (opcional)</Label>
              <Textarea
                id="videoDescription"
                value={videoForm.description}
                onChange={(e) => setVideoForm({ ...videoForm, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVideoDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddVideo} disabled={createVideo.isPending}>
              {createVideo.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── OfferPlaybookEditor ─────────────────────────────────────────────────────
// Editor dos campos TEXT de platform_crm_products que alimentam o copiloto e a
// IA de resposta. Save via useUpdatePlatformCrmProduct (mesmo hook do SettingsTab).
function OfferPlaybookEditor({ productId }: { productId: string }) {
  const { data: product, isLoading } = usePlatformCrmProduct(productId);
  const updateProduct = useUpdatePlatformCrmProduct();
  const [isFormReady, setIsFormReady] = useState(false);

  const [formData, setFormData] = useState({
    knowledge_base: '',
    guarantee: '',
    discount_policy: '',
    plans: '',
  });

  useEffect(() => {
    if (product) {
      setFormData({
        knowledge_base: product.knowledge_base || '',
        guarantee: product.guarantee || '',
        discount_policy: product.discount_policy || '',
        plans: product.plans || '',
      });
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
        knowledge_base: formData.knowledge_base || null,
        guarantee: formData.guarantee || null,
        discount_policy: formData.discount_policy || null,
        plans: formData.plans || null,
      });
      toast.success('Playbook salvo!');
    } catch (e) {
      console.error('[PlaybookTab] salvar falhou:', e);
      toast.error('Erro ao salvar playbook');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Aviso: estes campos alimentam o copiloto e a IA de resposta */}
      <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
        <CardContent className="flex items-start gap-3 p-4">
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Este é o <strong className="text-foreground">hub da estratégia</strong>: o que
            você escreve aqui alimenta o <strong className="text-foreground">copiloto de vendas</strong> e
            a <strong className="text-foreground">IA de resposta</strong>. Mantenha a oferta vigente,
            garantia, política de desconto e planos sempre atualizados — as IAs bebem desta fonte.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProduct.isPending || !isFormReady}>
          {updateProduct.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar Playbook
        </Button>
      </div>

      {/* Playbook de vendas / Oferta vigente */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Playbook de vendas / Oferta vigente
          </CardTitle>
          <CardDescription>
            A oferta completa que a IA deve conhecer: promessa, mecanismo, provas, ancoragem
            de preço e argumentos-chave. Quanto mais completo, melhor a resposta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.knowledge_base}
            onChange={(e) => setFormData({ ...formData, knowledge_base: e.target.value })}
            rows={12}
            placeholder={'Ex: Oferta vigente — Plano Anual com 3 meses grátis...\nMecanismo: automação de recuperação de leads via WhatsApp...\nProvas: 120+ salões usando, ticket médio +32%...'}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Garantia */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              Garantia
            </CardTitle>
            <CardDescription>Termos da garantia que a IA pode oferecer.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.guarantee}
              onChange={(e) => setFormData({ ...formData, guarantee: e.target.value })}
              rows={5}
              placeholder="Ex: Garantia incondicional de 7 dias. Não gostou, devolvemos 100%."
            />
          </CardContent>
        </Card>

        {/* Política de desconto */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Percent className="h-4 w-4 text-yellow-500" />
              Política de desconto
            </CardTitle>
            <CardDescription>
              Limites e regras de desconto — a IA nunca deve ultrapassar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.discount_policy}
              onChange={(e) => setFormData({ ...formData, discount_policy: e.target.value })}
              rows={5}
              placeholder="Ex: Desconto máximo de 10% no plano anual. Acima disso, só com aprovação do gestor."
            />
          </CardContent>
        </Card>
      </div>

      {/* Planos */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Planos (descrição livre)
          </CardTitle>
          <CardDescription>
            Descrição textual dos planos para a IA citar em conversa. Os planos estruturados
            (com preço) ficam na aba <strong>Configurações</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.plans}
            onChange={(e) => setFormData({ ...formData, plans: e.target.value })}
            rows={6}
            placeholder={'Ex: Starter — 1 unidade, até 500 leads/mês.\nPro — multi-unidade, leads ilimitados + automações.\nEnterprise — sob consulta.'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
