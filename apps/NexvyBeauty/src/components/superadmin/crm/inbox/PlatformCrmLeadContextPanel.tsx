import { useState } from 'react';
import {
  User, Phone, Mail, MapPin, Building,
  ExternalLink, Plus, Calendar, CalendarPlus, X,
  MessageCircle, Clock, DollarSign, Edit, Ban, Volume2,
  Tag, Route, Sparkles, History, Info, Bot, Users2, Plug,
  ShieldCheck, Loader2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatMessageTime } from '@/lib/messageFormat';
import { PlatformCrmInternalNotes } from './PlatformCrmInternalNotes';
import { PlatformCrmJourneyTimeline } from './PlatformCrmJourneyTimeline';
import { PlatformCrmConversationHistoryList } from './PlatformCrmConversationHistoryList';
import { PlatformCrmAISummaryTab } from './PlatformCrmAISummaryTab';
import {
  usePlatformCrmTagsForLead,
  usePlatformCrmTags,
  useAssignPlatformCrmTag,
  useRemovePlatformCrmTag,
  useCreatePlatformCrmTag,
} from '../data/usePlatformCrmTags';
import { usePlatformCrmSectors } from '../data/usePlatformCrmSectors';
import { toast } from '@/hooks/use-toast';
import { PlatformCrmSendTemplateDialog } from './PlatformCrmSendTemplateDialog';
import { resolveVisitorIdentity, visitorInitials } from './platformCrmIdentity';
import { FileText } from 'lucide-react';

/**
 * Painel de CONTEXTO DO LEAD (painel direito) da inbox do CRM de PLATAFORMA —
 * cópia fiel do `LeadContextPanel.tsx` do Vendus v5 (954 linhas), adaptada:
 *   (a) prefixo PlatformCrm* nos componentes;
 *   (b) dados → hooks/tabelas `platform_crm_*` (tags, setores, janela 24h);
 *   (c) tokens/lib UI da casa (mesma base shadcn do fork);
 *   (d) zero tenant — sem useAuth/organization_id.
 * Extras de compat com o host (não-v5): `mode` ('docked'|'sheet') e `onOpenLead`.
 * Identidade exibida usa `platformCrmIdentity` (fix preservado), layout v5 intacto.
 */

const PLATFORM_CRM_KEY = 'platform-crm';

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  current_stage_id: string | null;
  deal_value: number | null;
  temperature: string | null;
  landing_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  last_contact_at: string | null;
  pipeline_stage?: { id: string; name: string; color: string | null };
}

interface PipelineStage {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
}

interface PlatformCrmLeadContextPanelProps {
  lead: Lead | null;
  conversationId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  visitorAvatarUrl?: string | null;
  channel: string;
  conversationStartedAt: string | null;
  messageCount: number;
  stages?: PipelineStage[];
  /** Agente IA atualmente vinculado (current_agent_id) */
  currentAgent?: { id: string; name: string; avatar_url: string | null } | null;
  /** Setor responsável pela conversa */
  currentSectorId?: string | null;
  /** Conexão de origem (ex.: nome da instância WhatsApp) — somente leitura */
  connectionLabel?: string | null;
  /** Para envio manual de template HSM (Meta Cloud API) */
  metaConnectionId?: string | null;
  /** ID do lead vinculado (para janela 24h + template manual) */
  leadId?: string | null;
  onViewLead?: () => void;
  onMoveStage?: (stageId: string) => void;
  onCreateTask?: () => void;
  onCreateEvent?: () => void;
  onEdit?: () => void;
  onClose?: () => void;
  /** COMPAT (extra, não-v5): docked = coluna fixa; sheet = dentro de <SheetContent> (X próprio). */
  mode?: 'docked' | 'sheet';
  /** COMPAT (extra, não-v5): navega para a tela de leads com o id ("Ver Lead Completo"). */
  onOpenLead?: (leadId: string) => void;
}

/**
 * Atualiza o setor responsável da conversa de plataforma.
 * Port do `useSetConversationSector` (useWebChat) do v5 → platform_crm_conversations.
 * TODO(A1.2-backend): coluna `sector_id` pende migration em `platform_crm_conversations`
 * (não existe no types.ts) — cast `as any` até a migration referenciar platform_crm_sectors.
 */
function useSetPlatformCrmConversationSector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, sectorId }: { conversationId: string; sectorId: string | null }) => {
      const { error } = await (supabase as any)
        .from('platform_crm_conversations')
        .update({ sector_id: sectorId })
        .eq('id', conversationId);
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'conversations'] });
    },
  });
}

/**
 * Janela 24h da Meta para o lead — port do `useLeadWAWindow` do v5.
 * Sem a RPC `is_within_24h_window` no schema de plataforma, a janela é computada
 * pela última mensagem do visitante (mesma semântica Meta: inbound < 24h).
 */
function usePlatformLeadWAWindow(leadId: string | null | undefined) {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'lead-wa-window', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!leadId) return { withinWindow: false, hasConversation: false };
      const { data: conv } = await supabase
        .from('platform_crm_conversations')
        .select('id')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conv?.id) return { withinWindow: false, hasConversation: false };
      const { data: lastInbound } = await supabase
        .from('platform_crm_messages')
        .select('created_at')
        .eq('conversation_id', conv.id)
        .eq('sender_type', 'visitor')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const withinWindow =
        !!lastInbound?.created_at &&
        Date.now() - new Date(lastInbound.created_at).getTime() < 24 * 60 * 60 * 1000;
      return { withinWindow, hasConversation: true };
    },
  });
}

/** Resultado da verificação de número — interface copiada do v5 (useCheckWhatsAppNumber). */
interface CheckWhatsAppResult {
  ok: boolean;
  exists: boolean;
  reliable?: boolean;
  diagnosis?: 'ok' | 'number_not_found' | 'provider_false_negative_or_session_issue' | string;
  original_phone: string;
  normalized_phone: string | null;
  jid: string | null;
  checked_variants: Array<{ number: string; exists: boolean; jid: string | null }>;
  updated: boolean;
  has_recent_inbound?: boolean;
  has_existing_conversation?: boolean;
  last_inbound_at?: string | null;
  session_warning?: boolean;
  wa_lid?: string | null;
  instance?: { id: string; name: string; status: string; remote_connected?: boolean | null };
  error?: string;
  message?: string;
}

/**
 * Port do `useCheckWhatsAppNumber` do v5 (sem organization_id — adaptação d).
 * A1.2-FRONT (contrato 2): edge `platform-check-whatsapp-number` POST { phone }
 * → { supported, exists, checked_via }. O resultado do contrato (mais enxuto que
 * o CheckWhatsAppResult do tenant) é mapeado para a mesma interface, preservando
 * a UI do v5: verificado ✓ / não existe ✗ / indisponível (supported=false ou erro).
 */
function useCheckPlatformWhatsAppNumber() {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<CheckWhatsAppResult | null>(null);

  async function check(params: {
    phone: string;
    instance_id?: string;
    conversation_id?: string;
    apply?: boolean;
    silent?: boolean;
  }): Promise<CheckWhatsAppResult | null> {
    if (!params.phone) {
      toast({ title: 'Número não informado', variant: 'destructive' });
      return null;
    }
    const digits = params.phone.replace(/\D/g, '');
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('platform-check-whatsapp-number', {
        body: { phone: params.phone },
      });
      if (error) throw error;
      const resp = data as { supported?: boolean; exists?: boolean; checked_via?: string } | null;

      const unsupported = resp?.supported === false;
      const exists = !!resp?.exists;
      const result: CheckWhatsAppResult = {
        ok: !unsupported,
        exists,
        reliable: !unsupported,
        diagnosis: unsupported
          ? 'provider_false_negative_or_session_issue'
          : exists
          ? 'ok'
          : 'number_not_found',
        original_phone: params.phone,
        normalized_phone: digits || null,
        jid: null,
        checked_variants: unsupported ? [] : [{ number: digits, exists, jid: null }],
        updated: false,
        ...(unsupported ? { error: 'unsupported' } : {}),
        message: resp?.checked_via ? `Verificado via ${resp.checked_via}` : undefined,
      };
      setLastResult(result);
      return result;
    } catch (e: any) {
      setLastResult(null);
      if (!params.silent) {
        toast({
          title: 'Verificação indisponível',
          description:
            e?.message || 'O edge platform-check-whatsapp-number ainda não respondeu.',
          variant: 'destructive',
        });
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { check, loading, lastResult, setLoading, setLastResult };
}

export function PlatformCrmLeadContextPanel({
  lead,
  conversationId,
  visitorName,
  visitorEmail,
  visitorPhone,
  visitorAvatarUrl,
  channel,
  conversationStartedAt,
  messageCount,
  stages = [],
  currentAgent,
  currentSectorId,
  connectionLabel,
  metaConnectionId,
  leadId,
  onViewLead,
  onMoveStage,
  onCreateTask,
  onCreateEvent,
  onEdit,
  onClose,
  mode = 'docked',
  onOpenLead,
}: PlatformCrmLeadContextPanelProps) {
  const [acceptAudio, setAcceptAudio] = useState(true);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [sendTplOpen, setSendTplOpen] = useState(false);

  const isMetaOfficial = channel === 'meta_whatsapp' && !!metaConnectionId;
  const { data: waWindow } = usePlatformLeadWAWindow(isMetaOfficial ? leadId ?? null : null);

  const setSector = useSetPlatformCrmConversationSector();
  const { data: sectors = [] } = usePlatformCrmSectors();
  const { data: orgTags = [] } = usePlatformCrmTags();
  const assignTag = useAssignPlatformCrmTag();
  const removeTag = useRemovePlatformCrmTag();
  const createTag = useCreatePlatformCrmTag();

  const temperatureColors: Record<string, string> = {
    hot: 'bg-red-500',
    warm: 'bg-orange-500',
    cold: 'bg-blue-500',
  };

  const displayPhone = lead?.phone || visitorPhone;
  const displayEmail = lead?.email || visitorEmail;
  // Identidade exibida via platformCrmIdentity (fix preservado) — layout do v5 intacto.
  const identity = resolveVisitorIdentity(lead?.name || visitorName, displayPhone);
  const displayName = identity.primary;
  const initials = visitorInitials(lead?.name || visitorName, displayPhone);

  // Lead tags (only if a lead is linked)
  const { data: leadTagAssignments = [] } = usePlatformCrmTagsForLead(lead?.id || undefined);
  const leadTags = leadTagAssignments.map((a) => a.tag).filter(Boolean);

  return (
    <div className="w-full h-full min-h-0 md:w-80 md:flex-shrink-0 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div
        className="px-4 border-b border-border flex items-center justify-between flex-shrink-0 min-h-14"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)', paddingBottom: '0.5rem' }}
      >
        <h3 className="font-semibold text-sm truncate">Dados do Contato</h3>
        {onClose && mode !== 'sheet' && (
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-5 w-full rounded-none bg-muted/30 h-10 flex-shrink-0">
          <TabsTrigger value="overview" className="text-[10px] gap-1">
            <Info className="h-3 w-3" />
            <span className="hidden sm:inline">Visão</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-[10px] gap-1">
            <History className="h-3 w-3" />
            <span className="hidden sm:inline">Histórico</span>
          </TabsTrigger>
          <TabsTrigger value="tags" className="text-[10px] gap-1">
            <Tag className="h-3 w-3" />
            <span className="hidden sm:inline">Etiquetas</span>
          </TabsTrigger>
          <TabsTrigger value="journey" className="text-[10px] gap-1">
            <Route className="h-3 w-3" />
            <span className="hidden sm:inline">Jornada</span>
          </TabsTrigger>
          <TabsTrigger value="summary" className="text-[10px] gap-1">
            <Sparkles className="h-3 w-3" />
            <span className="hidden sm:inline">Resumo</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-5">
              {/* Identity */}
              <div className="text-center space-y-2">
                <Avatar className="h-20 w-20 mx-auto ring-2 ring-background shadow-md">
                  {visitorAvatarUrl && <AvatarImage src={visitorAvatarUrl} alt={displayName} />}
                  <AvatarFallback className="text-xl bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <h4 className="font-semibold text-base leading-tight">{displayName}</h4>
                {lead?.company && (
                  <p className="text-xs text-muted-foreground">{lead.company}</p>
                )}
                {displayPhone && (
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    <a
                      href={`https://wa.me/${displayPhone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-emerald-600"
                    >
                      <Phone className="h-3 w-3" />
                      {displayPhone}
                    </a>
                    <VerifyWhatsAppButton
                      phone={displayPhone}
                      conversationId={conversationId}
                    />
                  </div>
                )}
              </div>

              {/* Tags do lead (chips inline) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Etiquetas
                  </Label>
                  {lead && (
                    <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1">
                          <Plus className="h-3 w-3" /> Etiqueta
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 p-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Aplicar existente
                          </Label>
                          {orgTags.filter((t) => !leadTags.some((lt: any) => lt.id === t.id)).length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Todas já aplicadas.</p>
                          ) : (
                            <div className="max-h-40 overflow-auto space-y-0.5">
                              {orgTags
                                .filter((t) => !leadTags.some((lt: any) => lt.id === t.id))
                                .map((t) => (
                                  <button
                                    key={t.id}
                                    onClick={() => assignTag.mutate({ leadId: lead.id, tagId: t.id })}
                                    className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-muted text-left"
                                  >
                                    <span
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: t.color }}
                                    />
                                    <span className="truncate">{t.name}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5 pt-2 border-t">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Criar nova
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              placeholder="Nome"
                              className="h-7 text-xs"
                            />
                            <input
                              type="color"
                              value={newTagColor}
                              onChange={(e) => setNewTagColor(e.target.value)}
                              className="h-7 w-9 rounded border border-border cursor-pointer"
                              aria-label="Cor"
                            />
                          </div>
                          <Button
                            size="sm"
                            className="w-full h-7 text-xs"
                            disabled={!newTagName.trim() || createTag.isPending}
                            onClick={async () => {
                              const created = await createTag.mutateAsync({
                                name: newTagName.trim(),
                                color: newTagColor,
                              });
                              if (created?.id && lead?.id) {
                                await assignTag.mutateAsync({ leadId: lead.id, tagId: created.id });
                              }
                              setNewTagName('');
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Criar e aplicar
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {!lead ? (
                  <p className="text-[11px] text-muted-foreground">
                    Vincule um lead para gerenciar etiquetas.
                  </p>
                ) : leadTags.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Nenhuma etiqueta.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {leadTags.map((t: any) => (
                      <Badge
                        key={t.id}
                        variant="outline"
                        className="text-[11px] gap-1 pr-1 font-normal"
                        style={{ borderColor: t.color || undefined, color: t.color || undefined }}
                      >
                        {t.name}
                        <button
                          onClick={() => removeTag.mutate({ leadId: lead.id, tagId: t.id })}
                          className="ml-0.5 hover:text-destructive"
                          aria-label="Remover etiqueta"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Current AI agent badge */}
              {currentAgent && (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Avatar className="h-7 w-7">
                    {currentAgent.avatar_url && (
                      <AvatarImage src={currentAgent.avatar_url} alt={currentAgent.name} />
                    )}
                    <AvatarFallback className="bg-secondary text-[10px]">
                      <Bot className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Atendendo agora
                    </p>
                    <p className="text-xs font-medium truncate">{currentAgent.name} · IA</p>
                  </div>
                </div>
              )}

              {/* Setor responsável */}
              {sectors.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Users2 className="h-3 w-3" /> Setor responsável
                  </Label>
                  <Select
                    value={currentSectorId || 'none'}
                    onValueChange={(val) => {
                      setSector.mutate(
                        { conversationId, sectorId: val === 'none' ? null : val },
                        {
                          onSuccess: () => toast({ title: 'Setor atualizado' }),
                          onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
                        },
                      );
                    }}
                    disabled={setSector.isPending}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Sem setor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem setor</SelectItem>
                      {sectors.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-2">
                            {s.color && (
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: s.color }}
                              />
                            )}
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Conexão de origem (read-only) */}
              {connectionLabel && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Plug className="h-3 w-3" /> Conexão
                  </Label>
                  <div className="text-xs px-2.5 py-1.5 rounded-md bg-muted/50 border border-border truncate">
                    {connectionLabel}
                  </div>
                </div>
              )}

              {/* Envio manual de template (Meta Cloud API) */}
              {isMetaOfficial && metaConnectionId && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Template HSM
                  </Label>
                  <div className={cn(
                    "text-[10px] px-2 py-1 rounded border",
                    waWindow?.withinWindow
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-700 border-amber-500/30",
                  )}>
                    {waWindow?.withinWindow
                      ? '✓ Dentro da janela 24h — envio livre liberado'
                      : '⚠ Fora da janela 24h — exige template HSM'}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={() => setSendTplOpen(true)}
                    disabled={!visitorPhone}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Enviar template
                  </Button>
                </div>
              )}

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="h-9" onClick={onEdit}>
                  <Edit className="h-3.5 w-3.5 mr-1.5" />
                  Editar
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-destructive hover:text-destructive">
                  <Ban className="h-3.5 w-3.5 mr-1.5" />
                  Bloquear
                </Button>
              </div>

              {/* Audio Toggle */}
              <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="accept-audio" className="text-xs cursor-pointer">Aceitar áudios</Label>
                </div>
                <Switch id="accept-audio" checked={acceptAudio} onCheckedChange={setAcceptAudio} />
              </div>

              <Separator />

              {/* Contact info */}
              <div className="space-y-2.5">
                <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Informações
                </h5>
                {displayEmail && (
                  <div className="flex items-center gap-2.5 text-xs">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <a href={`mailto:${displayEmail}`} className="hover:text-primary truncate">
                      {displayEmail}
                    </a>
                  </div>
                )}
                {lead?.company && (
                  <div className="flex items-center gap-2.5 text-xs">
                    <Building className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{lead.company}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Funnel */}
              {lead ? (
                <div className="space-y-2.5">
                  <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Funil de Vendas
                  </h5>

                  {lead.temperature && (
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        temperatureColors[lead.temperature] || 'bg-muted',
                      )} />
                      <span className="text-xs capitalize">{lead.temperature}</span>
                    </div>
                  )}

                  {stages.length > 0 && (
                    <Select onValueChange={onMoveStage} value={lead.current_stage_id || undefined}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar estágio..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: stage.color || '#888' }}
                              />
                              {stage.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {lead.deal_value && (
                    <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Valor do negócio</p>
                        <p className="text-sm font-semibold">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency', currency: 'BRL',
                          }).format(lead.deal_value)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <User className="h-7 w-7 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      Carregando dados do lead…
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              {/* Origin */}
              <div className="space-y-2.5">
                <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Origem
                </h5>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="capitalize">{channel}</span>
                  </div>
                  {conversationStartedAt && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span title={formatMessageTime(conversationStartedAt, 'full')}>
                        Iniciado {formatDistanceToNow(new Date(conversationStartedAt), {
                          addSuffix: true, locale: ptBR,
                        })}
                      </span>
                    </div>
                  )}
                  {lead?.landing_page && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate text-[11px]">{lead.landing_page}</span>
                    </div>
                  )}
                </div>

                {(lead?.utm_source || lead?.utm_medium || lead?.utm_campaign) && (
                  <div className="p-2.5 bg-muted/30 rounded-lg text-[11px] space-y-0.5">
                    {lead.utm_source && (<p><span className="text-muted-foreground">Source:</span> {lead.utm_source}</p>)}
                    {lead.utm_medium && (<p><span className="text-muted-foreground">Medium:</span> {lead.utm_medium}</p>)}
                    {lead.utm_campaign && (<p><span className="text-muted-foreground">Campaign:</span> {lead.utm_campaign}</p>)}
                  </div>
                )}
              </div>

              <Separator />

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-muted/50 rounded-lg text-center">
                  <p className="text-xl font-bold">{messageCount}</p>
                  <p className="text-[10px] text-muted-foreground">Mensagens</p>
                </div>
                <div className="p-2.5 bg-muted/50 rounded-lg text-center">
                  <p className="text-sm font-bold leading-tight pt-1">
                    {lead?.last_contact_at
                      ? formatDistanceToNow(new Date(lead.last_contact_at), { locale: ptBR })
                      : '-'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Último contato</p>
                </div>
              </div>

              <Separator />

              {/* Internal notes */}
              <PlatformCrmInternalNotes conversationId={conversationId} />

              <Separator />

              {/* Quick actions */}
              <div className="space-y-1.5">
                <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Ações Rápidas
                </h5>
                {lead && (onViewLead || onOpenLead) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (onViewLead ? onViewLead() : onOpenLead?.(lead.id))}
                    className="w-full justify-start"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Ver Lead Completo
                  </Button>
                )}
                {onCreateEvent && (
                  <Button variant="outline" size="sm" onClick={onCreateEvent} className="w-full justify-start">
                    <CalendarPlus className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                    Novo Evento na Agenda
                  </Button>
                )}
                {onCreateTask && (
                  <Button variant="outline" size="sm" onClick={onCreateTask} className="w-full justify-start">
                    <Calendar className="h-3.5 w-3.5 mr-2" />
                    Agendar Tarefa
                  </Button>
                )}
                {displayPhone && (
                  <Button
                    variant="outline" size="sm"
                    className="w-full justify-start text-emerald-600 hover:text-emerald-700"
                    asChild
                  >
                    <a href={`https://wa.me/${displayPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-3.5 w-3.5 mr-2" />
                      Abrir no WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              <PlatformCrmConversationHistoryList
                currentConversationId={conversationId}
                leadId={lead?.id || null}
                visitorPhone={visitorPhone}
              />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Tags */}
        <TabsContent value="tags" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {!lead ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Vincule um lead para gerenciar etiquetas.
                </p>
              ) : (
                <>
                  {/* Atribuídas */}
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Etiquetas atribuídas
                    </Label>
                    {leadTags.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma etiqueta.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {leadTags.map((t: any) => (
                          <Badge
                            key={t.id}
                            variant="outline"
                            className="text-[11px] gap-1 pr-1"
                            style={{ borderColor: t.color || undefined, color: t.color || undefined }}
                          >
                            {t.name}
                            <button
                              onClick={() => removeTag.mutate({ leadId: lead.id, tagId: t.id })}
                              className="ml-0.5 hover:text-destructive"
                              aria-label="Remover etiqueta"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Aplicar existente */}
                  {orgTags.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Aplicar etiqueta existente
                      </Label>
                      <Select
                        onValueChange={(tagId) => assignTag.mutate({ leadId: lead.id, tagId })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Escolher etiqueta..." />
                        </SelectTrigger>
                        <SelectContent>
                          {orgTags
                            .filter((t) => !leadTags.some((lt: any) => lt.id === t.id))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: t.color }}
                                  />
                                  {t.name}
                                </span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Criar nova */}
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Criar nova etiqueta
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Nome"
                        className="h-8 text-xs"
                      />
                      <input
                        type="color"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="h-8 w-10 rounded border border-border cursor-pointer"
                        aria-label="Cor"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8"
                      disabled={!newTagName.trim() || createTag.isPending}
                      onClick={async () => {
                        const created = await createTag.mutateAsync({
                          name: newTagName.trim(),
                          color: newTagColor,
                        });
                        if (created?.id && lead?.id) {
                          await assignTag.mutateAsync({ leadId: lead.id, tagId: created.id });
                        }
                        setNewTagName('');
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Criar e aplicar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Journey */}
        <TabsContent value="journey" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              {/* Handoffs (paridade canônica) = conversa; jornada no funil = lead. */}
              <PlatformCrmJourneyTimeline
                conversationId={conversationId}
                leadId={lead?.id ?? leadId ?? null}
              />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* AI Summary */}
        <TabsContent value="summary" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              <PlatformCrmAISummaryTab conversationId={conversationId} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {isMetaOfficial && metaConnectionId && (
        <PlatformCrmSendTemplateDialog
          open={sendTplOpen}
          onOpenChange={setSendTplOpen}
          metaConnectionId={metaConnectionId}
          conversationId={conversationId}
          leadId={leadId ?? null}
          to={visitorPhone || ''}
        />
      )}
    </div>
  );
}

function VerifyWhatsAppButton({
  phone,
  conversationId,
}: {
  phone: string;
  conversationId?: string | null;
}) {
  const { check, loading, lastResult } = useCheckPlatformWhatsAppNumber();
  const [open, setOpen] = useState(false);

  async function handleCheck(apply: boolean) {
    await check({
      phone,
      conversation_id: conversationId ?? undefined,
      apply,
    });
    setOpen(true);
  }

  const needsFix =
    !!lastResult?.exists &&
    !!lastResult.normalized_phone &&
    lastResult.normalized_phone !== phone.replace(/\D/g, '');
  const inconclusive =
    !!lastResult &&
    !lastResult.exists &&
    (lastResult.reliable === false || lastResult.diagnosis === 'provider_false_negative_or_session_issue');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px] gap-1"
          onClick={(e) => {
            e.preventDefault();
            handleCheck(false);
          }}
          disabled={loading}
          title="Verificar se o número está no WhatsApp"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ShieldCheck className="h-3 w-3" />
          )}
          Verificar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-2 text-xs">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando WhatsApp…
          </div>
        )}
        {!loading && !lastResult && (
          <p className="text-muted-foreground">Clique em Verificar para consultar.</p>
        )}
        {!loading && lastResult && lastResult.error === 'no_instance' && (
          <p className="text-destructive">
            Nenhuma instância WhatsApp conectada nesta empresa.
          </p>
        )}
        {!loading && lastResult && lastResult.error === 'unsupported' && (
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-medium">Verificação indisponível para esta conexão</span>
          </div>
        )}
        {!loading && lastResult && !lastResult.error && (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-block h-2 w-2 rounded-full',
                  lastResult.exists ? 'bg-emerald-500' : inconclusive ? 'bg-amber-500' : 'bg-destructive'
                )}
              />
              <span className="font-medium">
                {lastResult.exists
                  ? 'Número está no WhatsApp'
                  : inconclusive
                  ? 'Validação inconclusiva pela conexão'
                  : 'Número não encontrado no WhatsApp'}
              </span>
            </div>
            {inconclusive && (
              <div className="space-y-1 text-muted-foreground">
                <p>
                  {lastResult.wa_lid
                    ? 'O lead já respondeu e possui LID WhatsApp. A conexão recusou o envio/validação, então o problema é sessão/provedor — não o telefone cadastrado.'
                    : 'Há histórico com este número. A falha parece ser da sessão WhatsApp/Evolution, não do telefone do lead.'}
                </p>
                {lastResult.wa_lid && (
                  <p className="font-mono text-[10px] break-all">LID: {lastResult.wa_lid}</p>
                )}
              </div>
            )}
            {lastResult.session_warning && (
              <p className="text-amber-600">
                A conexão está marcada como ativa, mas a sessão remota sinalizou desconexão. Reautorize a instância antes de concluir que o telefone é inválido.
              </p>
            )}
            {lastResult.normalized_phone && (
              <div className="text-muted-foreground">
                Formato correto:{' '}
                <span className="font-mono">{lastResult.normalized_phone}</span>
              </div>
            )}
            {needsFix && (
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => handleCheck(true)}
              >
                Atualizar telefone do lead
              </Button>
            )}
            {!lastResult.exists && !inconclusive && (
              <p className="text-muted-foreground">
                Confirme o número com o lead ou peça o WhatsApp atual antes de reenviar.
              </p>
            )}
            <div className="pt-1 border-t border-border/60 text-[10px] text-muted-foreground space-y-0.5">
              {lastResult.message && <p>{lastResult.message}</p>}
              {lastResult.checked_variants.map((v) => (
                <div key={v.number} className="flex justify-between gap-2">
                  <span className="font-mono">{v.number}</span>
                  <span>{v.exists ? '✓' : '—'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default PlatformCrmLeadContextPanel;
