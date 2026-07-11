import { useState } from 'react';
import { Search, ArrowRightLeft, Layers, User, Loader2, Bot, Lock, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { usePlatformCrmTeamMembers } from '../data/usePlatformCrmTeam';
import { usePlatformCrmSectors } from '../data/usePlatformCrmSectors';
import { usePlatformCrmEvolutionInstances } from '../data/usePlatformCrmEvolutionInstances';
import { parsePlatformCrmFnError } from '../data/usePlatformCrmConversations';

/**
 * "Transferir Conversa" da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 (cópia fiel) de `oficial-vendus-v5/src/components/seller/inbox/TransferConversationModal.tsx`.
 * Substituições de dados (zero organization_id / tenant / useAuth):
 *   - profiles (equipe da org)      -> usePlatformCrmTeamMembers()
 *   - sectors                       -> usePlatformCrmSectors()
 *   - product_agents                -> platform_crm_product_agents (+ embed platform_crm_products)
 *   - evolution_instances           -> usePlatformCrmEvolutionInstances()
 *   - webchat_conversations         -> platform_crm_conversations (assigned_to / current_agent_id / status)
 *   - conversation_transfers        -> platform_crm_lead_transfer_history (best-effort, via lead_id da conversa)
 *   - useAuth (user/profile)        -> supabase.auth.getUser() + profiles
 */

interface PlatformCrmTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentAssignedUserId?: string;
  /** Canal da conversa — usado para mostrar o seletor de conexão só em WhatsApp */
  currentChannel?: string;
  /** ID da instância Evolution atualmente vinculada à conversa (se houver) */
  currentEvolutionInstanceId?: string | null;
  onTransfer?: () => void;
}

export function PlatformCrmTransferModal({
  open,
  onOpenChange,
  conversationId,
  currentAssignedUserId,
  currentChannel,
  currentEvolutionInstanceId,
  onTransfer,
}: PlatformCrmTransferModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [transferType, setTransferType] = useState<'user' | 'sector' | 'agent'>('user');
  const [searchUser, setSearchUser] = useState('');
  const [searchAgent, setSearchAgent] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  // Conexão Evolution: 'keep' = manter atual, ou ID da nova instância
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('keep');
  const [internalNote, setInternalNote] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Usuário logado (substitui useAuth do tenant: id + full_name via profiles)
  const { data: currentUser } = useQuery({
    queryKey: ['platform-crm', 'inbox', 'transfer-current-user'],
    enabled: open,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (!uid) return { id: null as string | null, full_name: null as string | null };
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', uid)
        .maybeSingle();
      return { id: uid, full_name: prof?.full_name ?? null };
    },
  });

  // Fetch team members (fonte: profiles da org is_active=true; plataforma: reps
  // do hook compartilhado, filtros equivalentes aplicados em memória)
  const teamQuery = usePlatformCrmTeamMembers();
  const teamMembers = (teamQuery.data ?? []).filter(
    (member) => member.is_active && member.id !== (currentAssignedUserId || ''),
  );
  const loadingTeam = teamQuery.isLoading;

  // Fetch sectors (atendimento usa setores, não squads de venda)
  const sectorsQuery = usePlatformCrmSectors();
  const sectors = (sectorsQuery.data ?? []).filter((s) => s.is_active !== false);
  const loadingSectors = sectorsQuery.isLoading;

  // Verifica se o usuário pode transferir para Agente Admin (privado)
  const { data: canTransferToAdmin = false } = useQuery({
    queryKey: ['platform-crm', 'inbox', 'can-transfer-admin', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return false;

      // TODO(A1.2-backend): Match #1 da fonte (auto_notification_settings.admin_user_id)
      // é per-organization e não existe no schema platform_crm_* — pende equivalente.

      // Match #2: usuário tem role 'admin' (fallback da fonte). Na plataforma o
      // gestor é o super_admin (CRM é super_admin-only), então ele também conta.
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id);

      return (roles ?? []).some((r) => r.role === 'admin' || r.role === 'super_admin');
    },
    enabled: !!currentUser?.id && open,
  });

  // Fetch AI agents (filtra admin no client conforme permissão)
  const { data: aiAgents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ['platform-crm', 'inbox', 'ai-agents-transfer'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .select('id, name, description, agent_type, avatar_url, is_active, is_default, product_id, product:platform_crm_products(id, name)')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Array<{
        id: string;
        name: string;
        description: string | null;
        agent_type: string;
        avatar_url: string | null;
        is_active: boolean;
        is_default: boolean;
        product_id: string | null;
        product: { id: string; name: string } | null;
      }>;
    },
    enabled: open,
  });

  // Fetch Evolution instances (somente para conversas WhatsApp). Fonte ordenava
  // is_default desc + name asc no servidor; o hook platform ordena por
  // created_at — reordenação equivalente aplicada em memória.
  const isWhatsApp = (currentChannel || '').toLowerCase() === 'whatsapp';
  const evolutionInstancesQuery = usePlatformCrmEvolutionInstances();
  const evolutionInstances = isWhatsApp
    ? [...(evolutionInstancesQuery.data ?? [])].sort(
        (a, b) =>
          Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name),
      )
    : [];

  // Filter team by search
  const filteredTeam = teamMembers.filter(member =>
    member.full_name.toLowerCase().includes(searchUser.toLowerCase()) ||
    (member.email ?? '').toLowerCase().includes(searchUser.toLowerCase())
  );

  // Filter agents by search + esconde admin se não houver permissão
  const filteredAgents = aiAgents
    .filter((a) => canTransferToAdmin || a.agent_type !== 'admin')
    .filter((a) => {
      const q = searchAgent.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        (a.product?.name ?? '').toLowerCase().includes(q)
      );
    });

  const hasAdminInList = filteredAgents.some((a) => a.agent_type === 'admin');

  const handleTransfer = async () => {
    if (transferType === 'user' && !selectedUserId) {
      toast({
        title: 'Selecione um usuário',
        description: 'Escolha para quem deseja transferir a conversa.',
        variant: 'destructive',
      });
      return;
    }

    if (transferType === 'sector' && !selectedSectorId) {
      toast({
        title: 'Selecione um setor',
        description: 'Escolha para qual setor deseja transferir a conversa.',
        variant: 'destructive',
      });
      return;
    }

    if (transferType === 'agent' && !selectedAgentId) {
      toast({
        title: 'Selecione um agente de IA',
        description: 'Escolha qual agente deve assumir a conversa.',
        variant: 'destructive',
      });
      return;
    }

    setIsTransferring(true);

    try {
      // A1.2-FRONT (contrato 7, "idem no caminho de setor"): tenta a action do
      // edge com `sector_id` no payload — enforcement de membership devolve 403
      // { error, sector_name }. Qualquer outra falha (action ainda não deployada,
      // rede) cai no FALLBACK = update direto abaixo (comportamento atual).
      if (transferType === 'sector' && selectedSectorId) {
        const { error: fnError } = await supabase.functions.invoke('platform-webchat-inbox', {
          body: {
            action: 'transfer',
            conversation_id: conversationId,
            sector_id: selectedSectorId,
            ...(internalNote.trim() ? { note: internalNote.trim() } : {}),
          },
        });
        if (fnError) {
          const { status, body } = await parsePlatformCrmFnError(fnError);
          if (status === 403) {
            toast({
              title: 'Setor sem acesso',
              description: body?.sector_name
                ? `Você não faz parte do setor "${body.sector_name}" — escolha outro setor ou peça acesso.`
                : body?.error || 'Você não tem acesso ao setor escolhido.',
              variant: 'destructive',
            });
            setIsTransferring(false);
            return;
          }
          console.warn(
            '[PlatformCrmTransferModal] action transfer indisponível — fallback update direto:',
            fnError,
          );
        }
      }

      // Detect admin takeover ahead of update so we can flag metadata.
      const adminTargetAgent =
        transferType === 'agent' && selectedAgentId
          ? aiAgents.find((a) => a.id === selectedAgentId && a.agent_type === 'admin')
          : null;

      // Update conversation assignment
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (transferType === 'user') {
        updateData.assigned_to = selectedUserId;
        updateData.status = 'human_active';
      } else if (transferType === 'sector') {
        updateData.assigned_to = null;
        // A1.3/FRENTE 4: coluna sector_id materializada (migration 07-09) —
        // grava o setor de destino na conversa (paridade com a fonte v5). O
        // registro em nota/histórico abaixo é mantido como trilha.
        updateData.sector_id = selectedSectorId;
        updateData.status = 'waiting_human';
      } else {
        // agent: devolve a conversa para a IA com agente específico
        updateData.assigned_to = null;
        updateData.current_agent_id = selectedAgentId;
        updateData.status = 'bot_active';
        // Marca o estado do orquestrador para não re-rotear (paridade com a fonte v5).
        updateData.orchestrator_state = 'em_atendimento';
      }

      // Troca opcional de conexão (instância Evolution / WhatsApp).
      // Não substitui as outras opções — funciona em conjunto.
      const willChangeInstance =
        isWhatsApp &&
        selectedInstanceId !== 'keep' &&
        selectedInstanceId !== (currentEvolutionInstanceId || '');
      const newInstance = willChangeInstance
        ? evolutionInstances.find((i) => i.id === selectedInstanceId)
        : null;
      if (willChangeInstance && newInstance) {
        // Grava a nova conexão Evolution na conversa (paridade com a fonte v5) —
        // a nota/histórico abaixo permanece como trilha legível.
        updateData.evolution_instance_id = newInstance.id;
      }

      // Admin takeover: mescla os flags no metadata (jsonb) da conversa, sem
      // sobrescrever o que já existe (paridade com a fonte v5).
      if (adminTargetAgent) {
        const { data: metaRow } = await supabase
          .from('platform_crm_conversations')
          .select('metadata')
          .eq('id', conversationId)
          .maybeSingle();
        const existingMeta =
          metaRow?.metadata && typeof metaRow.metadata === 'object' ? metaRow.metadata : {};
        updateData.metadata = {
          ...(existingMeta as Record<string, unknown>),
          manual_admin_takeover: true,
          manual_admin_takeover_by: currentUser?.id ?? null,
          manual_admin_takeover_at: new Date().toISOString(),
        };
      }

      const { error: updateError } = await supabase
        .from('platform_crm_conversations')
        .update(updateData)
        .eq('id', conversationId);

      if (updateError) throw updateError;

      // Create transfer record. Fonte gravava em conversation_transfers (com
      // to_queue_id reaproveitado p/ setor); plataforma registra best-effort em
      // platform_crm_lead_transfer_history via lead_id da conversa.
      const targetAgent =
        transferType === 'agent' && selectedAgentId
          ? aiAgents.find((a) => a.id === selectedAgentId)
          : null;

      const targetSector =
        transferType === 'sector' && selectedSectorId
          ? sectors.find((s) => s.id === selectedSectorId)
          : null;

      const baseNote =
        transferType === 'agent'
          ? targetAgent?.agent_type === 'admin'
            ? `🔒 Transferido para Agente Admin: ${targetAgent?.name} — teste/intervenção manual por ${currentUser?.full_name ?? 'gestor'}${
                internalNote ? ` — ${internalNote}` : ''
              }`
            : `🤖 Transferido para Agente IA: ${targetAgent?.name ?? selectedAgentId}${
                internalNote ? ` — ${internalNote}` : ''
              }`
          : transferType === 'sector'
          ? `📂 Transferido para o setor: ${targetSector?.name ?? ''}${internalNote ? ` — ${internalNote}` : ''}`
          : internalNote || null;

      const connectionNote = newInstance
        ? `🔌 Conexão alterada para: ${newInstance.name}${newInstance.phone_number ? ` (${newInstance.phone_number})` : ''}`
        : null;

      const composedNote = [baseNote, connectionNote].filter(Boolean).join(' • ') || null;

      // Best-effort: platform_crm_lead_transfer_history exige lead_id (NOT NULL);
      // sem lead vinculado à conversa não há como registrar — segue sem bloquear.
      try {
        const { data: convRow } = await supabase
          .from('platform_crm_conversations')
          .select('lead_id')
          .eq('id', conversationId)
          .maybeSingle();

        if (convRow?.lead_id) {
          const { error: transferError } = await supabase
            .from('platform_crm_lead_transfer_history')
            .insert({
              lead_id: convRow.lead_id,
              from_user_id: currentAssignedUserId || currentUser?.id || null,
              to_user_id: transferType === 'user' ? selectedUserId : null,
              // TODO(A1.2-backend): não há coluna para setor de destino (o to_queue_id
              // da fonte) — o setor fica registrado no reason acima.
              reason: composedNote,
              transferred_by: currentUser?.id ?? null,
            });
          if (transferError) throw transferError;
        } else {
          console.warn(
            '[PlatformCrmTransferModal] Conversa sem lead_id — transferência não registrada em platform_crm_lead_transfer_history.',
          );
        }
      } catch (historyError) {
        // TODO(A1.2-backend): histórico de transferência de CONVERSA (equivalente a
        // conversation_transfers) pende tabela própria na plataforma.
        console.warn('[PlatformCrmTransferModal] Falha ao registrar histórico de transferência:', historyError);
      }

      queryClient.invalidateQueries({ queryKey: ['platform-crm', 'inbox', 'conversations'] });

      const baseDesc =
        transferType === 'user'
          ? 'A conversa foi transferida com sucesso.'
          : transferType === 'sector'
          ? `A conversa foi enviada para o setor "${targetSector?.name ?? ''}".`
          : `Agente IA "${targetAgent?.name ?? ''}" agora está atendendo.`;
      const fullDesc = newInstance
        ? `${baseDesc} Conexão alterada para ${newInstance.name}.`
        : baseDesc;
      toast({ title: 'Conversa transferida', description: fullDesc });

      onOpenChange(false);
      onTransfer?.();

      // Reset state
      setSelectedUserId(null);
      setSelectedSectorId(null);
      setSelectedAgentId(null);
      setSelectedInstanceId('keep');
      setInternalNote('');
      setSearchUser('');
      setSearchAgent('');
    } catch (error) {
      console.error('Error transferring conversation:', error);
      toast({
        title: 'Erro ao transferir',
        description: 'Não foi possível transferir a conversa.',
        variant: 'destructive',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transferir Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transfer Type */}
          <RadioGroup
            value={transferType}
            onValueChange={(value) => setTransferType(value as 'user' | 'sector' | 'agent')}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="user" id="pcrm-transfer-user" />
              <Label htmlFor="pcrm-transfer-user" className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4" />
                Para usuário
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sector" id="pcrm-transfer-sector" />
              <Label htmlFor="pcrm-transfer-sector" className="flex items-center gap-2 cursor-pointer">
                <Layers className="h-4 w-4" />
                Para setor
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="agent" id="pcrm-transfer-agent" />
              <Label htmlFor="pcrm-transfer-agent" className="flex items-center gap-2 cursor-pointer">
                <Bot className="h-4 w-4" />
                Para Agente IA
              </Label>
            </div>
          </RadioGroup>

          {/* User Selection */}
          {transferType === 'user' && (
            <div className="space-y-3">
              <Label>Selecionar usuário</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-48 border rounded-md">
                {loadingTeam ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredTeam.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nenhum usuário encontrado
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredTeam.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => setSelectedUserId(member.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-2 rounded-lg transition-colors",
                          selectedUserId === member.id
                            ? "bg-primary/10 border border-primary"
                            : "hover:bg-accent"
                        )}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {member.full_name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium">{member.full_name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Sector Selection */}
          {transferType === 'sector' && (
            <div className="space-y-3">
              <Label>Selecionar setor</Label>
              <Select value={selectedSectorId || ''} onValueChange={setSelectedSectorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um setor..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingSectors ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : sectors.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      Nenhum setor disponível
                    </div>
                  ) : (
                    sectors.map((sector) => (
                      <SelectItem key={sector.id} value={sector.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: sector.color || 'hsl(var(--muted-foreground))' }}
                          />
                          {sector.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A conversa entrará na fila do setor escolhido e ficará disponível para qualquer atendente do setor assumir.
              </p>
            </div>
          )}

          {/* AI Agent Selection */}
          {transferType === 'agent' && (
            <div className="space-y-3">
              <Label>Selecionar agente de IA</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar agente por nome, descrição ou produto..."
                  value={searchAgent}
                  onChange={(e) => setSearchAgent(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-56 border rounded-md">
                {loadingAgents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredAgents.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nenhum agente disponível
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredAgents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAgentId(a.id)}
                        className={cn(
                          'w-full flex items-start gap-3 p-2 rounded-lg transition-colors text-left',
                          selectedAgentId === a.id
                            ? 'bg-primary/10 border border-primary'
                            : 'hover:bg-accent border border-transparent'
                        )}
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className={cn(
                            "text-xs",
                            a.agent_type === 'admin'
                              ? "bg-warning/10 text-warning"
                              : "bg-primary/10 text-primary"
                          )}>
                            {a.agent_type === 'admin' ? <Lock className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{a.name}</p>
                            {a.agent_type === 'admin' && (
                              <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-warning/40 text-warning shrink-0">
                                Admin
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {a.product?.name ?? 'Global'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {hasAdminInList
                  ? 'Agentes 🔒 Admin são privados do gestor — use apenas para teste ou intervenção. A conversa volta ao modo IA com o agente escolhido.'
                  : 'A conversa volta ao modo IA com este agente assumindo o atendimento.'}
              </p>
            </div>
          )}

          {/* Connection (Evolution) Selection — só para WhatsApp */}
          {isWhatsApp && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Transferir para conexão
              </Label>
              <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Manter conexão atual" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter conexão atual</SelectItem>
                  {evolutionInstances
                    .filter((i) => i.id !== (currentEvolutionInstanceId || ''))
                    .map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              i.status === 'connected' ? 'bg-success' : 'bg-muted-foreground/50',
                            )}
                          />
                          {i.name}
                          {i.phone_number ? ` (${i.phone_number})` : ''}
                          {i.status !== 'connected' && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                              {i.status}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Mude o número/conexão WhatsApp pelo qual essa conversa será atendida. O histórico é
                preservado.
              </p>
            </div>
          )}

          {/* Internal Note */}
          <div className="space-y-2">
            <Label>Observações internas (opcional)</Label>
            <Textarea
              placeholder="Adicione uma nota para o próximo atendente..."
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Esta mensagem é interna e não será visível para o cliente.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleTransfer} disabled={isTransferring}>
            {isTransferring ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Transferindo...
              </>
            ) : (
              <>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transferir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
