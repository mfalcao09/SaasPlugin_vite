// Porte 1:1 de `.vendus-src-reference/src/components/admin/products/tabs/PlaybookTab.tsx`
// UI completa; persistência: TODO(table: platform_crm_product_training_videos).
import { useState } from 'react';
import { useProductTrainingVideos, useTodoMutation } from '../hooks/useProductHubStubs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Play, Video, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface PlaybookTabProps {
  productId: string;
}

export function PlaybookTab({ productId }: PlaybookTabProps) {
  const [activeTab, setActiveTab] = useState('videos');
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
          <TabsTrigger value="videos" className="gap-2">
            <Video className="h-4 w-4" />
            Vídeo Aulas
          </TabsTrigger>
        </TabsList>

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
