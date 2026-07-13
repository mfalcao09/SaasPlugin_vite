import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Copy,
  Archive,
  Trash2,
  MessageSquare,
  Users,
  Loader2,
  TrendingUp,
  Clock,
  Play,
  Pause,
  Settings2,
  Save,
  Target,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  usePlatformCrmCaptureFunnels,
  useCreatePlatformCrmCaptureFunnel,
  useUpdatePlatformCrmCaptureFunnel,
  useDeletePlatformCrmCaptureFunnel,
  useTogglePlatformCrmFunnelStatus,
  PlatformCrmCaptureFunnel,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import { useDuplicatePlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureOps';
import { usePlatformCrmSquads } from '@/components/superadmin/crm/data/usePlatformCrmSquads';
import { usePlatformCrmTeamMembers } from '@/components/superadmin/crm/data/usePlatformCrmTeam';
import { usePlatformCrmMetaWAConnections } from '@/components/superadmin/crm/data/usePlatformCrmMetaWhatsApp';
import { usePlatformCrmEvolutionInstances } from '@/components/superadmin/crm/data/usePlatformCrmEvolutionInstances';

/**
 * CRM de PLATAFORMA (super_admin) — CAPTAÇÃO via WHATSAPP (porte 1:1 do
 * `WhatsAppManager` + `WhatsAppSettingsTab` do CRM original), desacoplado do tenant.
 *
 * Fonte: `platform_crm_capture_funnels` (channel_type='whatsapp'), squads em
 * `platform_crm_sales_squads` e time via usePlatformCrmTeamMembers.
 *
 * CANAL ABSTRAÍDO — TODO(whatsapp): a plataforma ainda NÃO tem WhatsApp conectado
 * (decisão Evolution × Meta API em aberto). Este componente NÃO acopla provider:
 * - Removidas as referências a "instância Evolution" / WhatsAppConnectionTab do
 *   original; o vínculo de conexão fica só como flag `channels.whatsapp.enabled`
 *   (configuração persistida no Json `channels` do funil, provider-agnostic).
 * - Nenhum envio/recebimento real: os fluxos criados ficam prontos para quando o
 *   canal for plugado (TODO(whatsapp) — dispatcher/webhook do provider escolhido).
 * - Builder visual do fluxo: TODO(edge), mesmo gap do PlatformCrmCaptureFunnelsTab.
 *
 * Adaptações vs original:
 * - Sem product_id / useProducts (plataforma não tem produtos) — o filtro de produto
 *   do original foi removido; a distribuição usa squads/usuários da plataforma.
 * - `WhatsAppSettingsTab` (produto/distribuição/qualificação) virou o dialog
 *   "Configurações" persistindo em colunas já existentes do funil platform.
 */

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

/** Opção de canal WhatsApp (número/conexão) para atribuir a um fluxo. */
type ChannelOption = {
  key: string; // `${provider}:${id}`
  provider: 'meta' | 'evolution';
  id: string;
  label: string;
};

/** Chave de canal (`provider:id`) de um fluxo, ou null se não atribuído. */
function channelKeyOf(f: PlatformCrmCaptureFunnel): string | null {
  return f.whatsapp_provider && f.whatsapp_connection_id
    ? `${f.whatsapp_provider}:${f.whatsapp_connection_id}`
    : null;
}

/** Decompõe uma chave de canal em provider+id. '' ou inválida → null. */
function parseChannelKey(
  key: string,
): { provider: 'meta' | 'evolution'; id: string } | null {
  const sep = key.indexOf(':');
  if (sep <= 0) return null;
  const provider = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if ((provider !== 'meta' && provider !== 'evolution') || !id) return null;
  return { provider, id };
}

export function PlatformCrmCaptureWhatsAppTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [settingsFunnel, setSettingsFunnel] = useState<PlatformCrmCaptureFunnel | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Canal (número/conexão) do novo fluxo. '' = sem canal (fluxo global).
  const [createChannelKey, setCreateChannelKey] = useState<string>('');

  const { data: funnels, isLoading } = usePlatformCrmCaptureFunnels();
  const createFunnel = useCreatePlatformCrmCaptureFunnel();
  const deleteFunnel = useDeletePlatformCrmCaptureFunnel();
  const duplicateFunnel = useDuplicatePlatformCrmCaptureFunnel();
  const updateStatus = useTogglePlatformCrmFunnelStatus();

  // C6: status REAL do canal WhatsApp da plataforma (antes era um banner hardcoded
  // "não conectado", falso). Conectado = conexão Meta oficial ATIVA OU instância
  // Evolution (QR) pareada. Predicados canônicos do codebase (AgentEditor l.1147/1163;
  // meta='active', evolution='connected'|'paired').
  const { data: metaConnections } = usePlatformCrmMetaWAConnections();
  const { data: evolutionInstances } = usePlatformCrmEvolutionInstances();
  const connectedMeta = (metaConnections ?? []).find((c) => c.status === 'active');
  const connectedEvolution = (evolutionInstances ?? []).find(
    (i) => i.status === 'connected' || i.status === 'paired',
  );
  const isChannelConnected = !!connectedMeta || !!connectedEvolution;
  const connectedChannelLabel = connectedMeta
    ? `${connectedMeta.display_name}${connectedMeta.phone_number ? ` — ${connectedMeta.phone_number}` : ''}`
    : connectedEvolution
      ? `${connectedEvolution.name}${connectedEvolution.phone_number ? ` — ${connectedEvolution.phone_number}` : ''}`
      : '';

  // Canais WhatsApp disponíveis (número/conexão), unificando Meta oficial + Evolution.
  // Cada opção carrega provider+id para o par polimórfico gravado no fluxo.
  const channelOptions: ChannelOption[] = [
    ...(metaConnections ?? []).map((c) => ({
      key: `meta:${c.id}`,
      provider: 'meta' as const,
      id: c.id,
      label: `${c.display_name}${c.phone_number ? ` — ${c.phone_number}` : ''}`,
    })),
    ...(evolutionInstances ?? []).map((i) => ({
      key: `evolution:${i.id}`,
      provider: 'evolution' as const,
      id: i.id,
      label: `${i.name}${i.phone_number ? ` — ${i.phone_number}` : ''}`,
    })),
  ];

  const whatsappFunnels = (funnels ?? []).filter((f) => f.channel_type === 'whatsapp');

  const filtered = whatsappFunnels.filter((f) => {
    const ms = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const mst = statusFilter === 'all' || f.status === statusFilter;
    const fk = channelKeyOf(f);
    const mc =
      channelFilter === 'all' ||
      (channelFilter === 'none' ? !fk : fk === channelFilter);
    return ms && mst && mc;
  });

  const handleCreate = async () => {
    if (!name.trim()) return;
    const parsed = parseChannelKey(createChannelKey);
    await createFunnel.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      channel_type: 'whatsapp',
      whatsapp_provider: parsed?.provider ?? null,
      whatsapp_connection_id: parsed?.id ?? null,
    });
    setIsCreateOpen(false);
    setName('');
    setDescription('');
    setCreateChannelKey('');
  };

  const openBuilder = () => {
    // TODO(edge): builder visual do fluxo WhatsApp (WhatsAppBuilder/FlowCanvas) — porte profundo.
    toast.info('Builder visual do fluxo em breve');
  };

  const rate = (f: PlatformCrmCaptureFunnel) => {
    const views = f.total_views ?? 0;
    const leads = f.total_leads ?? 0;
    return views === 0 ? '--' : `${((leads / views) * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground leading-tight flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-600" />
            WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fluxos disparados quando o lead envia a primeira mensagem no canal WhatsApp da
            plataforma.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Fluxo
        </Button>
      </div>

      {/* C6: status do canal reflete a conexão REAL (Meta oficial / Evolution QR). */}
      {isChannelConnected ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-sm">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            Canal WhatsApp conectado
            {connectedChannelLabel ? ` (${connectedChannelLabel})` : ''}. Os fluxos ativos
            disparam quando o lead enviar a primeira mensagem.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            O canal WhatsApp da plataforma ainda não está conectado. Os fluxos e configurações
            ficam salvos e serão ativados automaticamente quando o canal for plugado.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fluxos..."
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
        {channelOptions.length > 0 && (
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="none">Sem canal</SelectItem>
              {channelOptions.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum fluxo WhatsApp</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {searchQuery || statusFilter !== 'all'
                ? 'Nenhum fluxo corresponde aos filtros.'
                : 'Crie um fluxo automático para qualificar leads e agendar reuniões assim que chegarem pelo WhatsApp.'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Criar primeiro fluxo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((f) => {
            const wa = ((f.channels as Record<string, unknown> | null) ?? {}).whatsapp as
              | { enabled?: boolean }
              | undefined;
            const status = statusConfig[f.status] ?? statusConfig.draft;
            const fk = channelKeyOf(f);
            const channelLabel = fk
              ? (channelOptions.find((o) => o.key === fk)?.label ?? 'Canal removido')
              : null;
            return (
              <Card
                key={f.id}
                className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={openBuilder}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground truncate">{f.name}</h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {channelLabel ? (
                          <Badge
                            variant="outline"
                            className="gap-1 text-emerald-700 border-emerald-500/40"
                          >
                            <MessageSquare className="h-3 w-3" />
                            {channelLabel}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-500/40"
                          >
                            Sem canal
                          </Badge>
                        )}
                        {wa?.enabled === false && (
                          <Badge variant="outline" className="text-amber-600 border-amber-500">
                            Canal desabilitado
                          </Badge>
                        )}
                      </div>
                      {f.description && (
                        <p className="text-sm text-muted-foreground mb-3 truncate">
                          {f.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                          <span>{f.total_views ?? 0} conversas</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{f.total_leads ?? 0} leads</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <TrendingUp className="h-4 w-4" />
                          <span>{rate(f)} conversão</span>
                        </div>
                        {f.updated_at && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>
                              {formatDistanceToNow(new Date(f.updated_at), {
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
                            setSettingsFunnel(f);
                          }}
                        >
                          <Settings2 className="h-4 w-4 mr-2" /> Configurações
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateFunnel.mutate(f.id);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {f.status === 'active' ? (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus.mutate({ id: f.id, status: 'paused' });
                            }}
                          >
                            <Pause className="h-4 w-4 mr-2" /> Pausar
                          </DropdownMenuItem>
                        ) : (
                          f.status !== 'archived' && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatus.mutate({ id: f.id, status: 'active' });
                              }}
                            >
                              <Play className="h-4 w-4 mr-2" /> Ativar
                            </DropdownMenuItem>
                          )
                        )}
                        {f.status !== 'archived' && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus.mutate({ id: f.id, status: 'archived' });
                            }}
                          >
                            <Archive className="h-4 w-4 mr-2" /> Arquivar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(f.id);
                          }}
                          className="text-destructive focus:text-destructive"
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

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo fluxo WhatsApp</DialogTitle>
            <DialogDescription>
              Dispara automaticamente na primeira mensagem do lead (quando o canal estiver
              conectado).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome interno</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Atendimento Pré-Venda"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Canal (número WhatsApp)</Label>
              <Select
                value={createChannelKey || 'none'}
                onValueChange={(v) => setCreateChannelKey(v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem canal (global)</SelectItem>
                  {channelOptions.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {channelOptions.length === 0
                  ? 'Nenhum canal WhatsApp conectado ainda. O fluxo pode ser criado sem canal e atribuído depois.'
                  : 'O fluxo dispara apenas para o número selecionado. Sem canal = não atribuído.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || createFunnel.isPending}>
              {createFunnel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings dialog (porte do WhatsAppSettingsTab) */}
      <Dialog open={!!settingsFunnel} onOpenChange={(o) => !o && setSettingsFunnel(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          {settingsFunnel && (
            <WhatsAppFunnelSettings
              funnel={settingsFunnel}
              channelOptions={channelOptions}
              onClose={() => setSettingsFunnel(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As conversas existentes não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteFunnel.mutate(deleteId);
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

/* ───────────── Configurações do fluxo (porte 1:1 do WhatsAppSettingsTab) ───────────── */

function WhatsAppFunnelSettings({
  funnel,
  channelOptions,
  onClose,
}: {
  funnel: PlatformCrmCaptureFunnel;
  channelOptions: ChannelOption[];
  onClose: () => void;
}) {
  const waChannel = ((funnel.channels as Record<string, unknown> | null) ?? {}).whatsapp as
    | { enabled?: boolean }
    | undefined;

  const [formData, setFormData] = useState({
    name: funnel.name,
    description: funnel.description ?? '',
    distribution_rule: funnel.distribution_rule,
    assigned_squad_id: funnel.assigned_squad_id ?? '',
    assigned_user_id: funnel.assigned_user_id ?? '',
    default_temperature: funnel.default_temperature ?? 'warm',
    default_tags: (funnel.default_tags ?? []).join(', '),
    channel_enabled: waChannel?.enabled !== false,
    // Chave do canal atribuído (`provider:id`) ou '' quando sem canal.
    channel_key: channelKeyOf(funnel) ?? '',
  });

  const updateFunnel = useUpdatePlatformCrmCaptureFunnel();
  const { data: squads } = usePlatformCrmSquads();
  const { data: teamMembers } = usePlatformCrmTeamMembers();

  const handleSave = async () => {
    const channels = {
      ...(((funnel.channels as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >),
      whatsapp: { enabled: formData.channel_enabled },
    };
    const parsedChannel = parseChannelKey(formData.channel_key);
    await updateFunnel.mutateAsync({
      id: funnel.id,
      name: formData.name,
      description: formData.description || null,
      distribution_rule: formData.distribution_rule,
      assigned_squad_id: formData.assigned_squad_id || null,
      assigned_user_id: formData.assigned_user_id || null,
      default_temperature: formData.default_temperature,
      default_tags: formData.default_tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      channels: channels as PlatformCrmCaptureFunnel['channels'],
      // Canal WhatsApp (par polimórfico). '' → limpa a atribuição (ambos NULL).
      whatsapp_provider: parsedChannel?.provider ?? null,
      whatsapp_connection_id: parsedChannel?.id ?? null,
    });
    onClose();
  };

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-emerald-600" />
          Configurações do WhatsApp
        </DialogTitle>
        <DialogDescription>
          Distribuição e qualificação inicial dos leads que entram pelo WhatsApp.
        </DialogDescription>
      </DialogHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidade</CardTitle>
          <CardDescription>Nome interno e status do canal do fluxo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome interno</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição interna</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Canal (número WhatsApp)</Label>
            <Select
              value={formData.channel_key || 'none'}
              onValueChange={(v) =>
                setFormData((p) => ({ ...p, channel_key: v === 'none' ? '' : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem canal (global)</SelectItem>
                {channelOptions.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
                {/* Canal atribuído mas não mais listado (conexão removida): preserva a opção. */}
                {formData.channel_key &&
                  !channelOptions.some((o) => o.key === formData.channel_key) && (
                    <SelectItem value={formData.channel_key}>Canal removido</SelectItem>
                  )}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              O fluxo é atribuído a este número. Cada canal pode ter fluxos próprios.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Canal habilitado</Label>
              <p className="text-xs text-muted-foreground">
                O fluxo só dispara quando o canal WhatsApp da plataforma estiver conectado.
              </p>
            </div>
            <Switch
              checked={formData.channel_enabled}
              onCheckedChange={(v) => setFormData((p) => ({ ...p, channel_enabled: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">Distribuição de leads</CardTitle>
          </div>
          <CardDescription>Para quem vai o lead quando o fluxo capturar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Regra</Label>
            <Select
              value={formData.distribution_rule}
              onValueChange={(v) =>
                setFormData((p) => ({
                  ...p,
                  distribution_rule: v,
                  assigned_squad_id: '',
                  assigned_user_id: '',
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="round_robin">Round Robin</SelectItem>
                <SelectItem value="squad">Squad</SelectItem>
                <SelectItem value="user">Usuário específico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.distribution_rule === 'squad' && (
            <div className="space-y-2">
              <Label>Squad</Label>
              <Select
                value={formData.assigned_squad_id}
                onValueChange={(v) => setFormData((p) => ({ ...p, assigned_squad_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(squads ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.distribution_rule === 'user' && (
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select
                value={formData.assigned_user_id}
                onValueChange={(v) => setFormData((p) => ({ ...p, assigned_user_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(teamMembers ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">Qualificação inicial</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Temperatura padrão</Label>
              <Select
                value={formData.default_temperature}
                onValueChange={(v) => setFormData((p) => ({ ...p, default_temperature: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cold">🥶 Frio</SelectItem>
                  <SelectItem value="warm">😊 Morno</SelectItem>
                  <SelectItem value="hot">🔥 Quente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Etiquetas padrão (separadas por vírgula)</Label>
              <Input
                value={formData.default_tags}
                onChange={(e) => setFormData((p) => ({ ...p, default_tags: e.target.value }))}
                placeholder="whatsapp, inbound"
              />
              <p className="text-[10px] text-muted-foreground">
                Aplicadas automaticamente em todo lead deste fluxo.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={updateFunnel.isPending} className="gap-2">
          {updateFunnel.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}
