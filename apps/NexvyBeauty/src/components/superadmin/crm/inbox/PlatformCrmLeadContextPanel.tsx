import { useState } from 'react';
import {
  User, Phone, Mail, Building, Copy, ExternalLink, DollarSign,
  MapPin, Megaphone, StickyNote, Loader2, PanelRightClose, Route,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { usePlatformCrmLead } from '../data/usePlatformCrmLeads';
import {
  usePlatformCrmLeadNotes,
  useCreatePlatformCrmLeadNote,
} from '../data/usePlatformCrmLeadNotes';
import type { PlatformCrmConversation } from '../data/usePlatformCrmConversations';
import {
  resolveVisitorIdentity,
  formatVisitorPhone,
  visitorInitials,
} from './platformCrmIdentity';

/**
 * Painel de CONTEXTO DO LEAD (painel DIREITO, U1b) da inbox do CRM de
 * PLATAFORMA — modelo 3 painéis do REF-VENDUS-INBOX (`LeadContextPanel` do
 * Vendus / ContactInfoPanel da FIC como referência de padrões visuais).
 *
 * Dados: `conversation.lead_id` → `platform_crm_leads` (via usePlatformCrmLead,
 * que já embute o estágio `current_stage_id` → platform_crm_pipeline_stages) +
 * `platform_crm_lead_notes` (listar/adicionar). DESACOPLADO do tenant — zero
 * organization_id / setor / etiquetas do CRM tenant.
 *
 * Tokens da casa (tema claro + azul institucional do gestao via `primary`).
 * O host decide docked (aside w-80, ≥lg) vs sheet (drawer mobile): `mode`.
 */

interface PlatformCrmLeadContextPanelProps {
  conversation: PlatformCrmConversation | null;
  /** docked = coluna fixa com botão de fechar; sheet = dentro de <SheetContent> (X próprio). */
  mode?: 'docked' | 'sheet';
  /** Fecha/colapsa o painel (docked). */
  onClose?: () => void;
  /** Navega para a tela de leads existente ("Abrir lead completo"). */
  onOpenLead?: (leadId: string) => void;
}

const TEMPERATURE_META: Record<string, { label: string; className: string }> = {
  hot: { label: 'Quente', className: 'bg-red-500/10 text-red-600 border-red-500/30' },
  warm: { label: 'Morno', className: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  cold: { label: 'Frio', className: 'bg-sky-500/10 text-sky-600 border-sky-500/30' },
};

const CHANNEL_LABEL: Record<string, string> = {
  webchat: 'Site',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
      {children}
    </h5>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-xs min-w-0">
      <span className="mt-0.5 text-muted-foreground flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="truncate text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function PlatformCrmLeadContextPanel({
  conversation,
  mode = 'docked',
  onClose,
  onOpenLead,
}: PlatformCrmLeadContextPanelProps) {
  const leadId = conversation?.lead_id ?? undefined;
  const { data: lead, isLoading: loadingLead } = usePlatformCrmLead(leadId);
  const { data: notes = [], isLoading: loadingNotes } = usePlatformCrmLeadNotes(leadId);
  const createNote = useCreatePlatformCrmLeadNote();
  const [noteDraft, setNoteDraft] = useState('');

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error(`Não foi possível copiar o ${label.toLowerCase()}`);
    }
  };

  const handleAddNote = () => {
    const content = noteDraft.trim();
    if (!content || !leadId || createNote.isPending) return;
    createNote.mutate(
      { lead_id: leadId, content, role_label: 'Atendimento' },
      {
        onSuccess: () => {
          setNoteDraft('');
          toast.success('Nota adicionada');
        },
        onError: () => toast.error('Erro ao adicionar nota'),
      },
    );
  };

  const closeButton =
    mode === 'docked' && onClose ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={onClose}
            aria-label="Fechar painel de contexto"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fechar painel</TooltipContent>
      </Tooltip>
    ) : null;

  // ── Estado vazio: nenhuma conversa selecionada ─────────────────────────────
  if (!conversation) {
    return (
      <div className="w-full h-full flex flex-col bg-background overflow-hidden">
        <div className="h-14 px-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-sm">Contexto do lead</h3>
          {closeButton}
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="px-6 text-center">
            <User className="h-7 w-7 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Selecione uma conversa para ver o contexto do lead</p>
          </div>
        </div>
      </div>
    );
  }

  const identity = resolveVisitorIdentity(
    lead?.name ?? conversation.visitor_name,
    lead?.phone ?? (conversation.visitor_phone || conversation.visitor_whatsapp),
  );
  const rawPhone =
    lead?.phone ?? conversation.visitor_phone ?? conversation.visitor_whatsapp ?? null;
  const displayPhone = formatVisitorPhone(rawPhone);
  const channelKey = (conversation.channel || '').toLowerCase();
  const channelLabel = CHANNEL_LABEL[channelKey] ?? conversation.channel;
  const temperature = lead?.temperature ? TEMPERATURE_META[lead.temperature] : null;
  const utms: { label: string; value: string }[] = lead
    ? (
        [
          ['Source', lead.utm_source],
          ['Medium', lead.utm_medium],
          ['Campaign', lead.utm_campaign],
          ['Term', lead.utm_term],
          ['Content', lead.utm_content],
        ] as const
      )
        .filter(([, v]) => !!v)
        .map(([label, value]) => ({ label, value: value as string }))
    : [];
  const origin = lead?.source || lead?.lead_origin || lead?.lead_channel || null;

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-background overflow-hidden">
      {/* Header do painel */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-sm">Contexto do lead</h3>
        {closeButton}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-5">
          {/* Identidade */}
          <div className="text-center space-y-2">
            <Avatar className="h-16 w-16 mx-auto ring-2 ring-background shadow-md">
              <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">
                {visitorInitials(
                  lead?.name ?? conversation.visitor_name,
                  rawPhone,
                )}
              </AvatarFallback>
            </Avatar>
            <div>
              <h4 className="font-semibold text-base leading-tight">{identity.primary}</h4>
              {identity.secondary && (
                <p className="text-[11px] text-muted-foreground">{identity.secondary}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">{channelLabel}</p>
            </div>
          </div>

          <Separator />

          {/* Contato */}
          <div className="space-y-2.5">
            <SectionTitle>Contato</SectionTitle>
            {displayPhone ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefone">
                    {displayPhone}
                  </InfoRow>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => rawPhone && handleCopy(rawPhone, 'Telefone')}
                      aria-label="Copiar telefone"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copiar telefone</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefone">
                <span className="text-muted-foreground">—</span>
              </InfoRow>
            )}
            {lead?.email && (
              <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="E-mail">
                <a href={`mailto:${lead.email}`} className="hover:text-primary">
                  {lead.email}
                </a>
              </InfoRow>
            )}
            {lead?.company && (
              <InfoRow icon={<Building className="h-3.5 w-3.5" />} label="Empresa">
                {lead.company}
              </InfoRow>
            )}
          </div>

          <Separator />

          {/* Pipeline / negócio */}
          {leadId ? (
            loadingLead ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-7 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : lead ? (
              <div className="space-y-2.5">
                <SectionTitle>Pipeline</SectionTitle>

                <InfoRow icon={<Route className="h-3.5 w-3.5" />} label="Estágio">
                  {lead.stage ? (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: lead.stage.color || 'hsl(var(--primary))' }}
                      />
                      {lead.stage.name}
                    </span>
                  ) : (
                    <span className="italic text-muted-foreground">Sem estágio</span>
                  )}
                </InfoRow>

                <div className="flex items-center gap-2">
                  {temperature ? (
                    <Badge
                      variant="outline"
                      className={cn('text-[11px] font-medium', temperature.className)}
                    >
                      {temperature.label}
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">
                      Temperatura não definida
                    </span>
                  )}
                </div>

                {typeof lead.deal_value === 'number' && lead.deal_value > 0 && (
                  <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Valor do negócio</p>
                      <p className="text-sm font-semibold">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(lead.deal_value)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Lead não encontrado.</p>
            )
          ) : (
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <User className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                Esta conversa ainda não está vinculada a um lead.
              </p>
            </div>
          )}

          {/* Origem + UTMs */}
          {lead && (origin || lead.landing_page || utms.length > 0) && (
            <>
              <Separator />
              <div className="space-y-2.5">
                <SectionTitle>Origem</SectionTitle>
                {origin && (
                  <InfoRow icon={<Megaphone className="h-3.5 w-3.5" />} label="Fonte">
                    {origin}
                  </InfoRow>
                )}
                {lead.landing_page && (
                  <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Landing page">
                    <span className="text-[11px]" title={lead.landing_page}>
                      {lead.landing_page}
                    </span>
                  </InfoRow>
                )}
                {utms.length > 0 && (
                  <div className="p-2.5 bg-muted/30 rounded-lg text-[11px] space-y-0.5">
                    {utms.map((u) => (
                      <p key={u.label} className="truncate" title={`${u.label}: ${u.value}`}>
                        <span className="text-muted-foreground">{u.label}:</span> {u.value}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Notas internas do lead */}
          <div className="space-y-2.5">
            <SectionTitle>
              <span className="inline-flex items-center gap-1">
                <StickyNote className="h-3 w-3" /> Notas
              </span>
            </SectionTitle>

            {!leadId ? (
              <p className="text-[11px] text-muted-foreground">
                Vincule um lead para registrar notas.
              </p>
            ) : (
              <>
                {loadingNotes ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                ) : notes.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Nenhuma nota ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div key={note.id} className="p-2.5 bg-muted/40 rounded-lg space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                          <span className="truncate font-medium">
                            {note.profiles?.full_name || 'Equipe'}
                            {note.role_label ? ` · ${note.role_label}` : ''}
                          </span>
                          <span className="flex-shrink-0 tabular-nums">
                            {format(new Date(note.created_at), "dd/MM/yy 'às' HH:mm")}
                          </span>
                        </div>
                        <p className="text-xs whitespace-pre-wrap break-words">{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Adicionar nota interna..."
                    rows={2}
                    className="text-xs resize-none bg-muted/40 border-0"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs gap-1.5"
                    onClick={handleAddNote}
                    disabled={!noteDraft.trim() || createNote.isPending}
                  >
                    {createNote.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <StickyNote className="h-3.5 w-3.5" />
                    )}
                    Adicionar nota
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* CTA — abre a tela de leads existente */}
          {lead && onOpenLead && (
            <>
              <Separator />
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => onOpenLead(lead.id)}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                Abrir lead completo
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default PlatformCrmLeadContextPanel;
