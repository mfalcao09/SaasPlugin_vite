import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Instagram, Plus, MessageCircle, MessageSquare, AtSign, Image, Loader2, Trash2, Play, Pause, Plug, Sparkles, RefreshCcw,
} from 'lucide-react';
import { useInstagramFlows, useCreateInstagramFlow, useDeleteInstagramFlow, useUpdateInstagramFlow, type IGTriggerType, type InstagramFlow } from './useInstagramFlows';
import { usePlatformCrmInstagramConnections } from '../data/usePlatformCrmInstagram';
import { useReSubscribeInstagram } from './useInstagramFlowAI';
import { InstagramFlowBuilder } from './InstagramFlowBuilder';
import { NewInstagramFlowDialog } from './NewInstagramFlowDialog';
import { AIFlowGeneratorDialog } from './AIFlowGeneratorDialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const triggerLabels: Record<IGTriggerType, { label: string; icon: any; color: string }> = {
  comment_keyword: { label: 'Comentário → DM', icon: MessageCircle, color: 'text-pink-500' },
  dm_keyword:      { label: 'Palavra-chave na DM', icon: MessageSquare, color: 'text-purple-500' },
  story_reply:     { label: 'Resposta ao Story', icon: Image, color: 'text-orange-500' },
  mention:         { label: 'Menção', icon: AtSign, color: 'text-blue-500' },
  manual:          { label: 'Manual', icon: Play, color: 'text-muted-foreground' },
  new_follower:    { label: 'Novo seguidor', icon: Plus, color: 'text-emerald-500' },
};

export function InstagramAutomationsSection() {
  const { data: flows, isLoading } = useInstagramFlows();
  const { data: connections } = usePlatformCrmInstagramConnections();
  const createFlow = useCreateInstagramFlow();
  const updateFlow = useUpdateInstagramFlow();
  const deleteFlow = useDeleteInstagramFlow();
  const reSubscribe = useReSubscribeInstagram();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstagramFlow | null>(null);

  const activeConnections = (connections ?? []).filter(c => c.status === 'active');
  const hasConnection = activeConnections.length > 0;
  const needsResubscribe = activeConnections.filter(c => !((c as any).subscribed_fields ?? []).includes('comments'));

  if (selectedFlowId) {
    return <InstagramFlowBuilder flowId={selectedFlowId} onBack={() => setSelectedFlowId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600">
            <Instagram className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Automações do Instagram</h1>
            <p className="text-sm text-muted-foreground">
              Builder visual para DMs, comentários e stories — estilo ManyChat
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAiOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" /> Gerar com IA
          </Button>
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova automação
          </Button>
        </div>
      </div>

      {!hasConnection && (
        <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between gap-4 p-4 flex-wrap">
            <div className="flex items-start gap-3">
              <Plug className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200">Conecte uma conta do Instagram para ativar</p>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Você pode montar, gerar com IA e testar fluxos sem conexão — mas eles só começam a disparar quando uma conta IG estiver vinculada em Conexões.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasConnection && needsResubscribe.length > 0 && (
        <Card className="border-orange-500/40 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="flex items-center justify-between gap-4 p-4 flex-wrap">
            <div className="flex items-start gap-3">
              <RefreshCcw className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <p className="font-medium text-orange-900 dark:text-orange-200">Reassine os campos do webhook</p>
                <p className="text-sm text-orange-800 dark:text-orange-300">
                  Suas conexões IG ainda não recebem eventos de <strong>comentários</strong> e <strong>menções</strong>. Reassine agora para ativar as automações desses gatilhos.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {needsResubscribe.map(c => (
                <Button key={c.id} size="sm" variant="outline" disabled={reSubscribe.isPending} onClick={() => reSubscribe.mutate(c.id)} className="gap-2">
                  {reSubscribe.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                  @{c.ig_username ?? c.display_name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !flows || flows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Instagram className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhuma automação ainda</p>
              <p className="text-sm text-muted-foreground">Descreva o que você quer e a IA monta o fluxo — ou crie manualmente.</p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button onClick={() => setAiOpen(true)} className="gap-2">
                <Sparkles className="h-4 w-4" /> Gerar com IA
              </Button>
              <Button variant="outline" onClick={() => setNewOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Criar manualmente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map(flow => {
            const tt = triggerLabels[flow.trigger_type];
            const conn = activeConnections.find(c => c.id === flow.connection_id);
            const Icon = tt.icon;
            return (
              <Card key={flow.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setSelectedFlowId(flow.id)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Icon className={`h-4 w-4 shrink-0 ${tt.color}`} />
                      <CardTitle className="text-base truncate">{flow.name}</CardTitle>
                    </div>
                    <Badge variant={flow.status === 'active' ? 'default' : flow.status === 'paused' ? 'outline' : 'secondary'}>
                      {flow.status === 'active' ? 'Ativo' : flow.status === 'paused' ? 'Pausado' : 'Rascunho'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Gatilho: <span className="text-foreground">{tt.label}</span></div>
                    {conn && <div>Conta: <span className="text-foreground">@{conn.ig_username}</span></div>}
                    <div>Atualizado {formatDistanceToNow(new Date(flow.updated_at), { addSuffix: true, locale: ptBR })}</div>
                  </div>
                  <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    {flow.status === 'active' ? (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => updateFlow.mutate({ id: flow.id, status: 'paused' })}>
                        <Pause className="h-3.5 w-3.5" /> Pausar
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => updateFlow.mutate({ id: flow.id, status: 'active' })}>
                        <Play className="h-3.5 w-3.5" /> Ativar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-destructive gap-1 ml-auto" onClick={() => setDeleteTarget(flow)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewInstagramFlowDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        connections={activeConnections}
        onCreated={(id) => { setNewOpen(false); setSelectedFlowId(id); }}
      />

      <AIFlowGeneratorDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        connectionId={activeConnections[0]?.id ?? null}
        onGenerated={(id) => { setAiOpen(false); setSelectedFlowId(id); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover automação?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" será removida permanentemente junto com seu histórico de execuções.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteFlow.mutate(deleteTarget.id); setDeleteTarget(null); } }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
