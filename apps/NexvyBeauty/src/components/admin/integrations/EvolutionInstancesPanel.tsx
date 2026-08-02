import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
// Slot da TRILHA S. Import ESTÁTICO de propósito: import dinâmico de módulo
// ausente quebra o build do Vite, então o arquivo precisa existir dos dois lados
// do merge. Hoje é um stub que retorna null (ver o próprio arquivo); a versão
// real vem da branch claude/priceless-neumann-63c32d e deve vencer no merge.
import { MetaEmbeddedSignupButton } from './meta/MetaEmbeddedSignupButton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Smartphone, Star, Loader2, Info, QrCode, CheckCircle2, Pause, LogOut, Plus, Sparkles, Pencil, Trash2 } from 'lucide-react';
import {
  useEvolutionInstances,
  useSetDefaultEvolutionInstance,
  useConnectEvolutionInstance,
  useDisconnectEvolutionInstance,
  useLogoutEvolutionInstance,
  useCreateEvolutionInstanceSelf,
  useDeleteEvolutionInstanceSelf,
  useRenameEvolutionInstanceSelf,
  type EvolutionInstance,
} from '@/hooks/useEvolutionInstances';
import { useAuth } from '@/hooks/useAuth';
import { useOrgChannelUsage } from '@/hooks/useOrganizationPlan';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PresenceTestButton } from './PresenceTestButton';


function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    connected: { label: 'Conectado', variant: 'default' },
    qr_pending: { label: 'Aguardando QR', variant: 'secondary' },
    paired: { label: 'Pareado', variant: 'default' },
    disconnected: { label: 'Desconectado', variant: 'outline' },
  };
  const cfg = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function ConnectDialog({ instance, onClose }: { instance: EvolutionInstance; onClose: () => void }) {
  const connectMut = useConnectEvolutionInstance();
  const [qr, setQr] = useState<string | null>(instance.qr_code);
  const [status, setStatus] = useState(instance.status);
  const [elapsed, setElapsed] = useState(0);

  const triggerConnect = () => {
    setQr(null);
    setElapsed(0);
    connectMut.mutate(instance.id, {
      onSuccess: (data: any) => {
        if (data?.already_connected) {
          setStatus('connected');
          toast.success('Já conectado!');
          setTimeout(onClose, 1200);
          return;
        }
        if (data?.qr_code) setQr(data.qr_code);
      },
    });
  };

  useEffect(() => {
    triggerConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll DB for QR/status updates pushed by webhook
  useEffect(() => {
    if (status === 'connected') return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('evolution_instances')
        .select('status, qr_code')
        .eq('id', instance.id)
        .maybeSingle();
      if (data) {
        if (data.qr_code && data.qr_code !== qr) setQr(data.qr_code);
        if (data.status !== status) {
          setStatus(data.status);
          if (data.status === 'connected') {
            toast.success('WhatsApp conectado com sucesso!');
            setTimeout(onClose, 1500);
          }
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, qr, instance.id, onClose]);

  // Elapsed timer (used to decide "loading" vs "error" state)
  useEffect(() => {
    if (qr || status === 'connected') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [qr, status]);

  const isQrBase64 = qr?.startsWith('data:image') || qr?.startsWith('iVBOR');
  const showError = !qr && status !== 'connected' && elapsed >= 45;
  const showLoading = !qr && status !== 'connected' && !showError;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar {instance.name}</DialogTitle>
          <DialogDescription>
            Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar aparelho → escaneie o código abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 min-h-[280px]">
          {status === 'connected' ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              <p className="font-medium">Conectado!</p>
            </div>
          ) : qr ? (
            <div className="bg-white p-3 rounded-lg">
              <img
                src={isQrBase64 ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`) : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qr)}`}
                alt="QR Code"
                className="w-60 h-60"
              />
            </div>
          ) : showLoading ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                {elapsed < 10 ? 'Gerando QR Code…' : 'Ainda aguardando o servidor gerar o QR…'}
              </p>
              <p className="text-xs text-muted-foreground">
                Isso pode levar até 45 segundos. Mantenha esta janela aberta.
              </p>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <QrCode className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Não foi possível gerar o QR Code.</p>
              <Button size="sm" variant="outline" onClick={triggerConnect} disabled={connectMut.isPending}>
                {connectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tentar novamente'}
              </Button>
            </div>
          )}
        </div>

        <div className="text-xs text-center text-muted-foreground">
          Status: <StatusBadge status={status} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateInstanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const createMut = useCreateEvolutionInstanceSelf();

  const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const valid = /^[a-z0-9-]{3,40}$/.test(sanitized);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    createMut.mutate({ name: sanitized }, { onSuccess: () => { setName(''); onClose(); } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setName(''); onClose(); } }}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova conexão de WhatsApp</DialogTitle>
            <DialogDescription>
              Dê um nome simples para identificar essa conexão (ex: <code>vendas</code>, <code>atendimento</code>).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="instance-name">Nome da conexão</Label>
            <Input
              id="instance-name"
              autoFocus
              placeholder="ex: vendas-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={createMut.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Apenas letras minúsculas, números e hífens. Mínimo 3 caracteres.
            </p>
            {name && !valid && (
              <p className="text-xs text-destructive">
                Nome inválido. Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createMut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar conexão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ instance, onClose }: { instance: EvolutionInstance; onClose: () => void }) {
  const initial = (instance.metadata as any)?.display_name || instance.name;
  const [name, setName] = useState<string>(initial);
  const renameMut = useRenameEvolutionInstanceSelf();

  const valid = name.trim().length >= 2 && name.trim().length <= 60;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    renameMut.mutate({ id: instance.id, name: name.trim() }, { onSuccess: () => onClose() });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Renomear conexão</DialogTitle>
            <DialogDescription>
              Atualize o nome de exibição desta conexão. O identificador interno permanece o mesmo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="rename-instance">Nome de exibição</Label>
            <Input
              id="rename-instance"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={renameMut.isPending}
            />
            <p className="text-xs text-muted-foreground">Entre 2 e 60 caracteres.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={renameMut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || renameMut.isPending}>
              {renameMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Aba "QR Code (Evolution)" — o painel que já existia, com o conteúdo intacto.
 *  Virou sub-componente quando a aba "WhatsApp Oficial (Meta)" entrou ao lado.
 *  O export público `EvolutionInstancesPanel` continua abaixo com a MESMA
 *  assinatura: App.tsx:62, Admin.tsx:34 e WhatsAppConfig.tsx:3 o importam por
 *  nome — dois deles via lazy `.then(m => m.EvolutionInstancesPanel)`, que
 *  quebraria em runtime, não no build, se o nome mudasse. */
function EvolutionQrTab() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: instances, isLoading } = useEvolutionInstances();
  const { data: usage } = useOrgChannelUsage(profile?.organization_id);
  const setDefaultMut = useSetDefaultEvolutionInstance();
  const disconnectMut = useDisconnectEvolutionInstance();
  const logoutMut = useLogoutEvolutionInstance();
  const deleteMut = useDeleteEvolutionInstanceSelf();
  const [connecting, setConnecting] = useState<EvolutionInstance | null>(null);
  const [pausing, setPausing] = useState<EvolutionInstance | null>(null);
  const [unlinking, setUnlinking] = useState<EvolutionInstance | null>(null);
  const [renaming, setRenaming] = useState<EvolutionInstance | null>(null);
  const [deleting, setDeleting] = useState<EvolutionInstance | null>(null);
  const [creating, setCreating] = useState(false);

  const displayName = (inst: EvolutionInstance) =>
    (inst.metadata as any)?.display_name || inst.name;

  const isLinked = (s: string) => s === 'connected' || s === 'paired';

  // USO E LIMITE VÊM DO MESMO RESOLVEDOR QUE OS GATES DO SERVIDOR
  // (`get_org_channel_usage`), não de `instances.length`.
  //
  // Com slot compartilhado (decisão Marcelo 2026-08-01, verbatim: "Consome o
  // mesmo slot"), uma conexão via WhatsApp Oficial ocupa vaga e NÃO aparece
  // nesta lista — ela vive na aba ao lado. Derivar `used` do tamanho da lista
  // faria a tela dizer "1 / 4" para uma org que já usa 2 canais, e o botão
  // "Nova conexão" convidaria para uma criação que o servidor vai recusar.
  // Tela e gate lendo a mesma função é o que impede essa divergência.
  const used = usage?.used;
  const byType = usage?.by_type;

  // O `?? 1` que estava aqui AFIRMAVA um limite que não tinha sido carregado.
  // Duas formas de errar, as duas na cara do cliente:
  //
  //   * enquanto a query do plano está em voo — e ela resolve independente da
  //     query de instâncias — um cliente Ultra com 4 conexões via badge
  //     vermelho "4 / 1 usadas", o aviso "Você atingiu o limite de 1
  //     conexão(ões) do seu plano" e o botão "Nova conexão" substituído por
  //     "Fazer upgrade". Fato comercial fabricado a partir de "ainda não sei",
  //     que se conserta sozinho um instante depois e que ninguém reproduz.
  //
  //   * a RPC devolve NULL tanto para "org sem limite" quanto para RECUSA DE
  //     LEITURA (o gate `auth.role()=... is not true` no topo da função). NULL
  //     não é `error`, então o hook não lança: a recusa chegava aqui como se
  //     fosse dado, e o `?? 1` a traduzia para política de negócio.
  //
  // Gatear em "eu tenho o número?" cobre os dois casos. Gatear em `isLoading`
  // cobriria só o primeiro — por isso a checagem é de valor, não de estado da
  // requisição. Enquanto é desconhecido nada é afirmado: o badge mostra "—" e
  // o caminho de criar conexão continua aberto, que é o fail-open correto aqui
  // (o gate de verdade é server-side, em evolution-proxy e onboarding-evolution).
  const rawLimit = usage?.limit;
  const usageKnown = typeof used === 'number' && typeof rawLimit === 'number';
  const limitReached = usageKnown && used >= rawLimit;

  const handleUpgrade = () => navigate('/plano');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Suas Instâncias de WhatsApp</h3>
          <p className="text-sm text-muted-foreground">
            Conecte seus números de WhatsApp escaneando o QR Code com o aparelho.
          </p>
          {/* Sem esta linha o cliente vê "2 / 4 canais" sobre uma lista com 1
              item e conclui que a tela está errada. O canal que falta está na
              outra aba — o contador é de canais, não de instâncias. */}
          {!!byType?.meta && (
            <p className="text-sm text-muted-foreground mt-1">
              Inclui {byType.meta} conexão(ões) via <strong>WhatsApp Oficial</strong>, na aba ao lado.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={limitReached ? 'destructive' : 'secondary'} className="text-sm">
            {usageKnown ? `${used} / ${rawLimit}` : '—'} canais
          </Badge>
          {limitReached ? (
            <Button onClick={handleUpgrade} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Fazer upgrade
            </Button>
          ) : (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova conexão
            </Button>
          )}
        </div>
      </div>

      {limitReached && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-foreground">
            Seu plano inclui <strong>{rawLimit}</strong> conexão(ões) de WhatsApp
            {!!byType && (byType.evolution > 0 || byType.meta > 0) && (
              <> e você já usa{byType.evolution > 0 && <> {byType.evolution} via QR Code</>}
                {byType.evolution > 0 && byType.meta > 0 && <> e</>}
                {byType.meta > 0 && <> {byType.meta} via WhatsApp Oficial</>}</>
            )}. Para conectar outro número, desconecte uma das conexões atuais ou faça upgrade do plano.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !instances?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma conexão criada ainda.</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Clique em <strong>Nova conexão</strong> para criar sua primeira instância de WhatsApp.
            </p>
          </CardContent>
        </Card>

      ) : (
        <div className="grid gap-3">
          {instances.map((inst) => (
            <Card key={inst.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                      <Smartphone className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{displayName(inst)}</p>
                        {inst.is_default && (
                          <Badge variant="outline" className="gap-1">
                            <Star className="h-3 w-3" /> Padrão
                          </Badge>
                        )}
                        <StatusBadge status={inst.status} />
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {inst.phone_number ? `+${inst.phone_number}` : 'Não conectado ainda'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {!isLinked(inst.status) && (
                      <Button size="sm" onClick={() => setConnecting(inst)}>
                        <QrCode className="h-4 w-4 mr-2" />
                        Conectar
                      </Button>
                    )}
                    {isLinked(inst.status) && (
                      <>
                        <PresenceTestButton instanceId={inst.id} instanceName={displayName(inst)} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPausing(inst)}
                          title="Pausar sessão (mantém o número pareado)"
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Pausar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setUnlinking(inst)}
                          className="text-destructive hover:text-destructive"
                          title="Desvincular número (exige novo QR)"
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          Desvincular
                        </Button>
                      </>
                    )}
                    {!inst.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultMut.mutate(inst.id)}
                        disabled={setDefaultMut.isPending}
                        title="Definir como padrão"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRenaming(inst)}
                      title="Editar nome"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(inst)}
                      className="text-destructive hover:text-destructive"
                      title="Excluir conexão"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {connecting && (
        <ConnectDialog instance={connecting} onClose={() => setConnecting(null)} />
      )}

      {/* Pausar sessão */}
      <AlertDialog open={!!pausing} onOpenChange={(o) => !o && setPausing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar a sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              O pareamento com o número{' '}
              <strong>{pausing?.phone_number ? `+${pausing.phone_number}` : 'atual'}</strong>{' '}
              é mantido. Ao clicar em <strong>Conectar</strong> novamente, a sessão volta automaticamente
              sem precisar de novo QR Code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pausing) disconnectMut.mutate(pausing.id);
                setPausing(null);
              }}
              disabled={disconnectMut.isPending}
            >
              {disconnectMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pausar sessão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Desvincular número */}
      <AlertDialog open={!!unlinking} onOpenChange={(o) => !o && setUnlinking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular este WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              O número{' '}
              <strong>{unlinking?.phone_number ? `+${unlinking.phone_number}` : 'atual'}</strong>{' '}
              será removido desta instância e desaparecerá da lista de "Aparelhos conectados" no celular.
              Para reconectar (este ou outro número) será necessário escanear um novo QR Code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinking) logoutMut.mutate(unlinking.id);
                setUnlinking(null);
              }}
              disabled={logoutMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {logoutMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desvincular número
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir conexão (apaga local + Evolution Go) */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              A conexão <strong>{deleting ? displayName(deleting) : ''}</strong> será removida
              permanentemente, junto com a instância no servidor Evolution Go. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) deleteMut.mutate(deleting.id);
                setDeleting(null);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir conexão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renaming && <RenameDialog instance={renaming} onClose={() => setRenaming(null)} />}

      <CreateInstanceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** Aba "WhatsApp Oficial (Meta)" — Cloud API org-scoped.
 *
 *  Dois caminhos coexistem por desenho, não por dívida:
 *   • self-service — o botão da Trilha S (`MetaEmbeddedSignupButton`), em que o
 *     salão conecta o próprio número sem ver credencial nenhuma;
 *   • manual — operação cadastra a conexão pelas edge functions org-scoped
 *     (`meta-whatsapp-connect`), para números nossos alocados a um tenant.
 *
 *  ⚠️ ESTE PARÁGRAFO DESCREVIA O MUNDO ANTERIOR AO MERGE d4860fa. Ele dizia
 *  "enquanto o componente da Trilha S for o stub, ele retorna null e esta aba
 *  mostra só o caminho manual". O stub morreu no merge — o componente real
 *  entrou (181 linhas, sentinela ausente).
 *
 *  O QUE VALE AGORA: `MetaEmbeddedSignupButton` retorna null quando
 *  VITE_META_WHATSAPP_APP_ID ou VITE_META_EMBEDDED_SIGNUP_CONFIG_ID faltam no
 *  build. Ele lê `import.meta.env`, que o Vite inlina em BUILD-TIME — e o build
 *  roda DENTRO do container: variável exportada no shell do VPS não chega lá.
 *  O caminho é `apps/NexvyBeauty/.env.production`, versionado de propósito
 *  (`.gitignore` des-ignora) e copiado pelo `Dockerfile.app`.
 *
 *  ACOPLAMENTO QUE EXISTIU E FOI MORTO — fica registrado porque a solução é o
 *  que impede a recaída, não a ausência do problema.
 *  Durante algumas horas esta aba afirmou duas coisas ao mesmo tempo: um botão
 *  de auto-conexão e, um card abaixo, "para conectar, fale com o suporte". Cada
 *  metade estava certa isolada; o merge as tornou simultâneas. Nenhum autor
 *  podia ver, porque nenhum autor tinha as duas.
 *  A saída NÃO foi regra de sequência ("mesmo commit", "card nunca antes") —
 *  regra de sequência é coisa que alguém erra. Foi tirar a decisão daqui:
 *  quem sabe se o self-service está habilitado é o `MetaEmbeddedSignupButton`,
 *  e desde 6562225 é ele que renderiza o estado indisponível em vez de sumir.
 *  INVARIANTE A PRESERVAR: um estado, um dono. Se você sentir vontade de
 *  condicionar texto DESTE arquivo às VITE_META_*, pare — é a causa raiz
 *  voltando com outra roupa. */
function MetaCloudTab() {
  const queryClient = useQueryClient();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">WhatsApp Oficial (Meta)</h3>
        <p className="text-sm text-muted-foreground">
          Conexão pela API oficial da Meta. Mais estável que o QR Code e sem risco de
          desconectar sozinho — o número não fica preso a um aparelho.
        </p>
      </div>

      <MetaEmbeddedSignupButton
        onConnected={() => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp-meta-connections'] });
        }}
      />

      <Card>
        <CardContent className="py-8 text-center space-y-2">
          {/* Empty-state e SÓ isto. A segunda linha daqui dizia "para conectar um
              número oficial, fale com o suporte" — verdade enquanto o botão acima
              não existia, contradição direta depois que ele passou a renderizar.
              Quem sabe se o self-service está habilitado é o próprio
              `MetaEmbeddedSignupButton`, e desde 6562225 é ELE que informa o
              estado indisponível. Não replique essa decisão aqui: dois
              componentes afirmando sobre o mesmo estado foi a causa raiz. */}
          <p className="text-sm text-muted-foreground">
            Nenhum número oficial conectado nesta conta ainda.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Export público — assinatura preservada de propósito (ver EvolutionQrTab). */
export function EvolutionInstancesPanel() {
  return (
    <Tabs defaultValue="qr" className="space-y-4">
      <TabsList>
        <TabsTrigger value="qr">QR Code</TabsTrigger>
        <TabsTrigger value="meta">WhatsApp Oficial</TabsTrigger>
      </TabsList>
      <TabsContent value="qr">
        <EvolutionQrTab />
      </TabsContent>
      <TabsContent value="meta">
        <MetaCloudTab />
      </TabsContent>
    </Tabs>
  );
}
