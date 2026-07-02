import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Mail,
  Phone,
  MessageCircle,
  MoreVertical,
  Flame,
  Snowflake,
  Thermometer,
  Building2,
  User,
  Pencil,
  LayoutDashboard,
  ClipboardCheck,
  Clock,
  Route,
  Globe,
  Wallet,
  FileText,
  CalendarClock,
  Loader2,
  DollarSign,
  Target,
  TrendingUp,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  ArrowRight,
  Circle,
  Send,
  Save,
  Tag,
  ListTodo,
  Plus,
  X,
  CheckCircle2 as CheckCircleAlt,
  Shield,
  AlertCircle,
  Users,
  UserX,
  RefreshCw,
  Link2,
  Megaphone,
  Hash,
  MousePointer,
  ExternalLink,
  StopCircle,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import {
  usePlatformCrmLead,
  useUpdatePlatformCrmLead,
} from '../data/usePlatformCrmLeads';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';
import {
  usePlatformCrmLeadNotes,
  useCreatePlatformCrmLeadNote,
} from '../data/usePlatformCrmLeadNotes';
import {
  usePlatformCrmLeadTasks,
  useCreatePlatformCrmTask,
  useTogglePlatformCrmTask,
} from '../data/usePlatformCrmTasks';
import { usePlatformCrmLeadStageHistory } from '../data/usePlatformCrmLeadStageHistory';
import { usePlatformCrmSellers } from '../data/usePlatformCrmSellers';
import { PlatformCrmLeadTagsBlock } from './detail/PlatformCrmLeadTagsBlock';
import { PlatformCrmLeadKeyResponses } from './detail/PlatformCrmLeadKeyResponses';
import { PlatformCrmLeadCustomFields } from './detail/PlatformCrmLeadCustomFields';
import { PlatformCrmLeadConversationPreview } from './detail/PlatformCrmLeadConversationPreview';
import { PlatformCrmLeadSquadCard } from './detail/PlatformCrmLeadSquadCard';

/**
 * DETALHE DO LEAD do CRM de PLATAFORMA (super_admin) — porte fiel do `LeadDetailPage`
 * do CRM Vendus Remix original. Mantém as 8 abas (Resumo, BANT, Timeline, Jornada,
 * Origem, Carteira, Notas, Cadências). Toca APENAS `platform_crm_*`:
 *   leads, lead_notes, tasks, deals, lead_stage_history, pipeline_stages.
 *
 * Desacoplamento do tenant: SEM organization_id / product_id no código. Onde o
 * original dependia de produto/pricing/interações/transferências que não existem no
 * schema da plataforma, o comportamento é preservado como stub-com-TODO (nunca
 * removido) — ver comentários "// DROP:" / "// TODO:".
 *
 * Compartilhado: o módulo Contatos reusa este mesmo detalhe.
 */

interface PlatformCrmLeadDetailProps {
  leadId: string;
  onBack: () => void;
}

// -------------------------------------------------------------------------------------
// Helpers de formatação (idênticos ao original)
// -------------------------------------------------------------------------------------
function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// LEAD_ORIGINS / LEAD_CHANNELS — portados 1:1 do useLeadTracking original.
const LEAD_ORIGINS = [
  { value: 'website', label: 'Website' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'evento', label: 'Evento' },
  { value: 'importacao', label: 'Importação' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'redes_sociais', label: 'Redes Sociais' },
  { value: 'parceiro', label: 'Parceiro' },
  { value: 'outro', label: 'Outro' },
];
const LEAD_CHANNELS = [
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'form', label: 'Formulário' },
  { value: 'chat', label: 'Chat' },
  { value: 'manual', label: 'Cadastro Manual' },
  { value: 'api', label: 'API/Integração' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
];

export function PlatformCrmLeadDetail({ leadId, onBack }: PlatformCrmLeadDetailProps) {
  const [activeTab, setActiveTab] = useState('summary');

  const { data: lead, isLoading, refetch } = usePlatformCrmLead(leadId);
  const { data: stages } = usePlatformCrmStages();
  const updateLead = useUpdatePlatformCrmLead();
  const { data: sellers = [] } = usePlatformCrmSellers();

  const handleUpdateLead = useCallback(
    async (updates: Record<string, unknown>) => {
      await updateLead.mutateAsync({ id: leadId, ...updates });
      refetch();
    },
    [updateLead, leadId, refetch],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>Lead não encontrado</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="flex-shrink-0">
        <LeadDetailHeader lead={lead} sellers={sellers} onBack={onBack} />
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b border-border px-4 md:px-6 overflow-x-auto">
            <TabsList className="h-12 bg-transparent gap-2 w-max md:w-auto">
              <TabsTrigger value="summary" className="gap-2 data-[state=active]:bg-primary/10">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Resumo</span>
              </TabsTrigger>
              <TabsTrigger value="bant" className="gap-2 data-[state=active]:bg-primary/10">
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden sm:inline">BANT</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-2 data-[state=active]:bg-primary/10">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Timeline</span>
              </TabsTrigger>
              <TabsTrigger value="journey" className="gap-2 data-[state=active]:bg-primary/10">
                <Route className="h-4 w-4" />
                <span className="hidden sm:inline">Jornada</span>
              </TabsTrigger>
              <TabsTrigger value="origin" className="gap-2 data-[state=active]:bg-primary/10">
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">Origem</span>
              </TabsTrigger>
              <TabsTrigger value="wallet" className="gap-2 data-[state=active]:bg-primary/10">
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">Carteira</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-2 data-[state=active]:bg-primary/10">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Notas</span>
              </TabsTrigger>
              <TabsTrigger value="cadences" className="gap-2 data-[state=active]:bg-primary/10">
                <CalendarClock className="h-4 w-4" />
                <span className="hidden sm:inline">Cadências</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <TabsContent value="summary" className="mt-0">
              <LeadSummaryTab
                lead={lead}
                stagesCount={stages?.length || 7}
                onUpdateLead={handleUpdateLead}
                onNavigateTab={setActiveTab}
              />
            </TabsContent>
            <TabsContent value="bant" className="mt-0">
              <LeadBANTTab lead={lead} onUpdateLead={handleUpdateLead} />
            </TabsContent>
            <TabsContent value="timeline" className="mt-0">
              <LeadTimelineTab leadId={leadId} stages={stages || []} />
            </TabsContent>
            <TabsContent value="journey" className="mt-0">
              <LeadJourneyTab
                leadId={leadId}
                currentStageId={lead.current_stage_id}
                stages={stages || []}
              />
            </TabsContent>
            <TabsContent value="origin" className="mt-0">
              <LeadOriginTab lead={lead} />
            </TabsContent>
            <TabsContent value="wallet" className="mt-0">
              <LeadWalletTab lead={lead} sellers={sellers} onUpdateLead={handleUpdateLead} />
            </TabsContent>
            <TabsContent value="notes" className="mt-0">
              <LeadNotesTab lead={lead} sellers={sellers} />
            </TabsContent>
            <TabsContent value="cadences" className="mt-0">
              <LeadCadencesTab leadId={leadId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// =====================================================================================
// HEADER — porte fiel do LeadHeader (drop: CallWithAIDialog do original; sem edge de IA
// no contexto plataforma → botão "Chamar com IA" mantido com toast "em breve").
// =====================================================================================
type LeadRow = NonNullable<ReturnType<typeof usePlatformCrmLead>['data']>;

function initials(name?: string | null) {
  return (name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);
}

function LeadDetailHeader({
  lead,
  sellers,
  onBack,
}: {
  lead: LeadRow;
  sellers: { id: string; full_name: string; avatar_url: string | null }[];
  onBack: () => void;
}) {
  const assignee = lead.assigned_to
    ? sellers.find((s) => s.id === lead.assigned_to) ?? lead.profiles ?? null
    : null;

  const getTemperatureIcon = () => {
    switch (lead.temperature) {
      case 'hot':
        return <Flame className="h-5 w-5 text-red-500" />;
      case 'warm':
        return <Thermometer className="h-5 w-5 text-amber-500" />;
      case 'cold':
        return <Snowflake className="h-5 w-5 text-blue-500" />;
      default:
        return <Thermometer className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getTemperatureLabel = () => {
    switch (lead.temperature) {
      case 'hot':
        return 'Quente';
      case 'warm':
        return 'Morno';
      case 'cold':
        return 'Frio';
      default:
        return 'Não definido';
    }
  };

  return (
    <div
      className="border-b border-border bg-card"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
    >
      <div className="p-3 md:p-6">
        {/* Back button and actions */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* TODO: edição inline de informações (modal) — em breve */}
              <DropdownMenuItem onClick={() => toast.info('Edição de informações em breve')}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar Informações
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Lead info */}
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {getTemperatureIcon()}
              <h1 className="text-lg md:text-2xl font-bold text-foreground">{lead.name}</h1>
              <Badge variant="outline" className="text-xs">
                {getTemperatureLabel()}
              </Badge>
            </div>

            {(lead.position || lead.company) && (
              <p className="text-muted-foreground mb-3">
                {lead.position && <span>{lead.position}</span>}
                {lead.position && lead.company && <span> @ </span>}
                {lead.company && <span className="font-medium">{lead.company}</span>}
              </p>
            )}

            {/* Contact info */}
            <div className="flex flex-wrap gap-2 md:gap-4 text-sm">
              {lead.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.company && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{lead.company}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {lead.email && (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={`mailto:${lead.email}`}>
                  <Mail className="h-4 w-4" />
                  <span className="hidden sm:inline">Email</span>
                </a>
              </Button>
            )}
            {lead.phone && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => toast.info('Integração WhatsApp em breve')}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">WhatsApp</span>
              </Button>
            )}
          </div>
        </div>

        {/* Assigned info */}
        <div className="mt-4 pt-4 border-t border-border flex items-center gap-4">
          {assignee ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={assignee.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {initials(assignee.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                {assignee.full_name}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-500">
              <User className="h-4 w-4" />
              <span className="text-sm">Sem atendimento</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================================
// RESUMO — porte fiel do LeadSummaryTab.
// DROP: seletor de Plano/pricing (dependia de products/pricing do tenant — inexistente
// na plataforma). Edição manual de valor da negociação mantida 1:1.
// =====================================================================================
function LeadSummaryTab({
  lead,
  stagesCount = 7,
  onUpdateLead,
  onNavigateTab,
}: {
  lead: LeadRow;
  stagesCount?: number;
  onUpdateLead: (updates: Record<string, unknown>) => Promise<void>;
  onNavigateTab: (tab: string) => void;
}) {
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [dealValueInput, setDealValueInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: recentNotes = [] } = usePlatformCrmLeadNotes(lead.id);

  const stats = useMemo(() => {
    const now = new Date();
    const createdAt = parseISO(lead.created_at);
    const daysInFunnel = differenceInDays(now, createdAt);
    const lastContact = lead.last_contact_at ? parseISO(lead.last_contact_at) : null;
    const daysSinceContact = lastContact ? differenceInDays(now, lastContact) : null;
    const stageProgress = lead.stage?.order_index
      ? Math.round(((lead.stage.order_index + 1) / stagesCount) * 100)
      : 0;
    const isStale = daysSinceContact !== null && daysSinceContact > 3;
    return { daysInFunnel, daysSinceContact, lastContact, stageProgress, isStale };
  }, [lead, stagesCount]);

  const handleStartEdit = () => {
    setDealValueInput((lead.deal_value || 0).toString());
    setIsEditingValue(true);
  };

  const handleSaveValue = async () => {
    const cleanValue = dealValueInput.replace(/[^\d,.-]/g, '').replace(',', '.');
    const numericValue = parseFloat(cleanValue) || 0;
    setIsSaving(true);
    try {
      await onUpdateLead({ deal_value: numericValue });
      toast.success('Valor atualizado com sucesso');
      setIsEditingValue(false);
    } catch {
      toast.error('Erro ao atualizar valor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        {/* TODO: EventModal/agenda — sem calendário na plataforma ainda */}
        <Button
          onClick={() => toast.info('Agenda de eventos em breve')}
          className="gap-2"
          size="sm"
        >
          <Calendar className="h-4 w-4" />
          Agendar Evento
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => onNavigateTab('notes')}
        >
          <Pencil className="h-4 w-4" />
          Adicionar nota
        </Button>
      </div>

      {/* Alerts */}
      {stats.isStale && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-amber-500">
                Lead sem contato há {stats.daysSinceContact} dias
              </p>
              <p className="text-sm text-muted-foreground">
                Considere entrar em contato para não perder o timing
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deal Value */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Valor da Negociação
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* DROP: seletor de Plano/pricing por produto — pipeline único na plataforma,
              sem catálogo de produtos. Edição manual de valor preservada. */}
          {isEditingValue ? (
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
                  R$
                </span>
                <Input
                  type="text"
                  value={dealValueInput}
                  onChange={(e) => setDealValueInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveValue();
                    if (e.key === 'Escape') setIsEditingValue(false);
                  }}
                  className="pl-12 text-2xl font-bold h-14"
                  placeholder="0"
                  autoFocus
                  disabled={isSaving}
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSaveValue}
                disabled={isSaving}
                className="h-10 w-10 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
              >
                <CheckCircleAlt className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsEditingValue(false)}
                disabled={isSaving}
                className="h-10 w-10"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleStartEdit}
                className="text-3xl font-bold text-emerald-600 hover:text-emerald-500 transition-colors cursor-pointer bg-transparent border-none p-0"
              >
                {formatCurrency(lead.deal_value || 0)}
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStartEdit}
                className="h-8 w-8 opacity-60 hover:opacity-100"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Estágio Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lead.stage ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: lead.stage.color || '#888' }}
                  />
                  <span className="font-semibold">{lead.stage.name}</span>
                </div>
                <Progress value={stats.stageProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.stageProgress}% do funil
                </p>
              </>
            ) : (
              <span className="text-muted-foreground">Sem estágio definido</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Tempo no Funil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.daysInFunnel} dias</p>
            <p className="text-xs text-muted-foreground">
              Desde {format(parseISO(lead.created_at), "dd 'de' MMM", { locale: ptBR })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Último Contato
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.lastContact ? (
              <>
                <p className="text-2xl font-bold">
                  {stats.daysSinceContact === 0 ? 'Hoje' : `${stats.daysSinceContact} dias`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(stats.lastContact, "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              </>
            ) : (
              <span className="text-muted-foreground">Nenhum contato</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Etiquetas — platform_crm_lead_tags / platform_crm_lead_tag_assignments */}
      <PlatformCrmLeadTagsBlock leadId={lead.id} />

      {/* Notas recentes */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Notas recentes
          </CardTitle>
          {recentNotes.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1"
              onClick={() => onNavigateTab('notes')}
            >
              Ver todas <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {recentNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma nota registrada ainda</p>
          ) : (
            recentNotes.slice(0, 3).map((n) => (
              <div key={n.id} className="flex gap-2.5">
                <Avatar className="h-7 w-7 mt-0.5">
                  <AvatarFallback className="text-[10px]">
                    {initials(n.profiles?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground truncate">
                      {n.profiles?.full_name || 'Usuário'}
                    </span>
                    <span>·</span>
                    <span>
                      {format(parseISO(n.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5 line-clamp-3 whitespace-pre-wrap">
                    {n.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Respostas do formulário — lidas de platform_crm_leads.metadata (Json) */}
      <PlatformCrmLeadKeyResponses metadata={lead.metadata} />

      {/* Campos personalizados — metadata.custom_fields + platform_crm_custom_fields */}
      <PlatformCrmLeadCustomFields metadata={lead.metadata} />

      {/* Conversa recente — última conversa do lead em platform_crm_conversations */}
      <PlatformCrmLeadConversationPreview leadId={lead.id} />

      {/* Cadência + Próxima ação */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Cadência
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lead.cadence_day ? (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xl font-bold text-primary">D{lead.cadence_day}</span>
                </div>
                <div>
                  <p className="font-medium">Dia {lead.cadence_day}</p>
                  <p className="text-sm text-muted-foreground">da cadência de vendas</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                <span>Cadência não iniciada</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Próxima Ação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lead.next_action ? (
              <p className="text-sm">{lead.next_action}</p>
            ) : (
              <span className="text-muted-foreground">Nenhuma ação definida</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================================
// BANT — porte fiel do LeadBANTTab, wired a platform_crm_leads.bant_* (JSON por questão).
// =====================================================================================
const BANT_CATEGORIES = [
  {
    key: 'bant_budget' as const,
    label: 'Budget (Orçamento)',
    icon: DollarSign,
    weight: 25,
    questions: [
      'Existe orçamento aprovado para este tipo de investimento?',
      'Qual a faixa de investimento prevista?',
      'Já investiram em soluções parecidas antes? Quanto?',
      'Quem controla e libera o orçamento?',
    ],
  },
  {
    key: 'bant_authority' as const,
    label: 'Authority (Autoridade)',
    icon: Shield,
    weight: 25,
    questions: [
      'Você é o decisor final desta compra?',
      'Quem mais participa do processo de decisão?',
      'O decisor já conhece nossa solução?',
      'Existe algum comitê ou processo de aprovação?',
    ],
  },
  {
    key: 'bant_need' as const,
    label: 'Need (Necessidade)',
    icon: Target,
    weight: 30,
    questions: [
      'Qual o principal problema que quer resolver?',
      'Há quanto tempo convive com esse problema?',
      'O que acontece se nada for feito nos próximos meses?',
      'Já tentaram resolver de outra forma? Como foi?',
      'Isso é prioridade para a empresa agora?',
    ],
  },
  {
    key: 'bant_timing' as const,
    label: 'Timing (Tempo)',
    icon: Clock,
    weight: 20,
    questions: [
      'Quando pretendem tomar a decisão?',
      'Existe um prazo ou evento que define a urgência?',
      'Já estão avaliando outras soluções?',
      'O que precisa acontecer para fechar nos próximos 30 dias?',
    ],
  },
];

type CategoryKey = (typeof BANT_CATEGORIES)[number]['key'];
type AnswersMap = Record<CategoryKey, Record<string, string>>;

function parseField(value: string | null | undefined, questionCount: number): Record<string, string> {
  if (!value) {
    const empty: Record<string, string> = {};
    for (let i = 1; i <= questionCount; i++) empty[`q${i}`] = '';
    return empty;
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      for (let i = 1; i <= questionCount; i++) {
        if (!parsed[`q${i}`]) parsed[`q${i}`] = '';
      }
      return parsed;
    }
  } catch {
    // Legacy plain text — put into q1
  }
  const migrated: Record<string, string> = {};
  for (let i = 1; i <= questionCount; i++) migrated[`q${i}`] = i === 1 ? value || '' : '';
  return migrated;
}

function serializeAnswers(answers: Record<string, string>): string | null {
  const hasContent = Object.values(answers).some((v) => v.trim());
  return hasContent ? JSON.stringify(answers) : null;
}

function getFilledCount(answers: Record<string, string>): number {
  return Object.values(answers).filter((v) => v.trim()).length;
}

function getScoreColor(score: number): string {
  if (score >= 76) return 'text-emerald-600';
  if (score >= 51) return 'text-amber-600';
  if (score >= 26) return 'text-orange-500';
  return 'text-destructive';
}

function getProgressColor(score: number): string {
  if (score >= 76) return '[&>div]:bg-emerald-500';
  if (score >= 51) return '[&>div]:bg-amber-500';
  if (score >= 26) return '[&>div]:bg-orange-500';
  return '[&>div]:bg-destructive';
}

function getSummary(score: number): { text: string; icon: typeof AlertCircle } {
  if (score >= 76)
    return {
      text: 'Lead altamente qualificado. Forte indicação de fechamento. Priorizar atendimento.',
      icon: TrendingUp,
    };
  if (score >= 51)
    return {
      text: 'Lead com bom potencial. Maioria dos critérios atendidos. Avançar com proposta.',
      icon: TrendingUp,
    };
  if (score >= 26)
    return {
      text: 'Lead parcialmente qualificado. Aprofundar nas áreas pendentes antes de avançar.',
      icon: AlertCircle,
    };
  return {
    text: 'Lead em fase inicial. Poucas informações coletadas. Necessita mais qualificação.',
    icon: AlertCircle,
  };
}

function LeadBANTTab({
  lead,
  onUpdateLead,
}: {
  lead: LeadRow;
  onUpdateLead: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<AnswersMap>(() => {
    const init = {} as AnswersMap;
    for (const cat of BANT_CATEGORIES) {
      init[cat.key] = parseField(lead[cat.key], cat.questions.length);
    }
    return init;
  });

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const next = {} as AnswersMap;
    for (const cat of BANT_CATEGORIES) {
      next[cat.key] = parseField(lead[cat.key], cat.questions.length);
    }
    setAnswers(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.bant_budget, lead.bant_authority, lead.bant_need, lead.bant_timing]);

  const handleChange = useCallback(
    (catKey: CategoryKey, qKey: string, value: string) => {
      setAnswers((prev) => {
        const updated = { ...prev, [catKey]: { ...prev[catKey], [qKey]: value } };
        if (debounceTimers.current[catKey]) clearTimeout(debounceTimers.current[catKey]);
        debounceTimers.current[catKey] = setTimeout(() => {
          onUpdateLead({ [catKey]: serializeAnswers(updated[catKey]) });
        }, 1000);
        return updated;
      });
    },
    [onUpdateLead],
  );

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const { score, categoryStats } = useMemo(() => {
    let total = 0;
    const stats: Record<string, { filled: number; total: number; complete: boolean }> = {};
    for (const cat of BANT_CATEGORIES) {
      const filled = getFilledCount(answers[cat.key]);
      const qTotal = cat.questions.length;
      total += cat.weight * (filled / qTotal);
      stats[cat.key] = { filled, total: qTotal, complete: filled === qTotal };
    }
    return { score: Math.round(total), categoryStats: stats };
  }, [answers]);

  const summary = getSummary(score);
  const completeCats = BANT_CATEGORIES.filter((c) => categoryStats[c.key].complete).map(
    (c) => c.label,
  );
  const pendingCats = BANT_CATEGORIES.filter((c) => !categoryStats[c.key].complete).map(
    (c) => c.label,
  );

  return (
    <div className="space-y-4">
      {/* Score Card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Score BANT</span>
            <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}/100</span>
          </div>
          <Progress value={score} className={`h-3 ${getProgressColor(score)}`} />
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="space-y-2">
              <p className="text-sm">{summary.text}</p>
              {completeCats.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="text-emerald-600 font-medium">✓ Completos:</span>{' '}
                  {completeCats.join(', ')}
                </p>
              )}
              {pendingCats.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="text-orange-500 font-medium">○ Pendentes:</span>{' '}
                  {pendingCats.join(', ')}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accordion Categories */}
      <Accordion type="multiple" defaultValue={[BANT_CATEGORIES[0].key]}>
        {BANT_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const stats = categoryStats[cat.key];
          return (
            <AccordionItem key={cat.key} value={cat.key}>
              <AccordionTrigger className="hover:no-underline px-1">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" />
                    {cat.label}
                  </span>
                  <Badge
                    variant={stats.complete ? 'default' : 'secondary'}
                    className={
                      stats.complete
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : ''
                    }
                  >
                    {stats.complete && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {stats.filled}/{stats.total}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {cat.questions.map((question, idx) => {
                    const qKey = `q${idx + 1}`;
                    return (
                      <div key={qKey} className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">
                          {idx + 1}. {question}
                        </label>
                        <Textarea
                          value={answers[cat.key][qKey] || ''}
                          onChange={(e) => handleChange(cat.key, qKey, e.target.value)}
                          placeholder="Resposta do cliente..."
                          className="min-h-[60px] resize-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

// =====================================================================================
// TIMELINE — porte fiel do LeadTimeline.
// DROP: tabela de interações (platform_crm_interactions) não existe na plataforma. A
// timeline é reconstruída de lead_stage_history (mudanças de etapa) + lead_notes.
// =====================================================================================
function LeadTimelineTab({
  leadId,
  stages,
}: {
  leadId: string;
  stages: { id: string; name: string; color: string | null }[];
}) {
  const { data: history = [], isLoading: histLoading } = usePlatformCrmLeadStageHistory(leadId);
  const { data: notes = [], isLoading: notesLoading } = usePlatformCrmLeadNotes(leadId);

  const stageById = useMemo(() => {
    const m: Record<string, { name: string; color: string | null }> = {};
    stages.forEach((s) => (m[s.id] = { name: s.name, color: s.color }));
    return m;
  }, [stages]);

  const timeline = useMemo(() => {
    const items: Array<{
      id: string;
      kind: 'stage_change' | 'note';
      timestamp: string;
      stageName?: string;
      stageColor?: string | null;
      daysInStage?: number | null;
      content?: string;
      author?: string | null;
    }> = [];

    history.forEach((h) => {
      const st = h.stage_id ? stageById[h.stage_id] : undefined;
      items.push({
        id: `stage-${h.id}`,
        kind: 'stage_change',
        timestamp: h.entered_at,
        stageName: st?.name ?? 'Etapa',
        stageColor: st?.color ?? null,
        daysInStage: h.days_in_stage,
      });
    });

    notes.forEach((n) => {
      items.push({
        id: `note-${n.id}`,
        kind: 'note',
        timestamp: n.created_at,
        content: n.content,
        author: n.profiles?.full_name ?? 'Usuário',
      });
    });

    return items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [history, notes, stageById]);

  if (histLoading || notesLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <MessageSquare className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Nenhuma interação registrada</p>
        <p className="text-xs mt-1">Adicione notas ou mova o lead pelo funil</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
      <div className="space-y-4">
        {timeline.map((item) => (
          <div key={item.id} className="relative flex gap-4 pl-10">
            <div
              className={`absolute left-2 top-2 h-4 w-4 rounded-full border-2 border-background ${
                item.kind === 'stage_change' ? 'bg-primary' : 'bg-muted'
              }`}
              style={
                item.kind === 'stage_change'
                  ? { backgroundColor: item.stageColor || undefined }
                  : undefined
              }
            />
            <div className="flex-1 min-w-0">
              {item.kind === 'stage_change' ? (
                <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="text-foreground font-medium">Movido para</span>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: `${item.stageColor}20`,
                        color: item.stageColor || undefined,
                        borderColor: item.stageColor || undefined,
                      }}
                      className="border"
                    >
                      {item.stageName}
                    </Badge>
                  </div>
                  {item.daysInStage ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Ficou {item.daysInStage} dia(s) no stage anterior
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="bg-card rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-full flex items-center justify-center bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {item.author}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      Nota
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {item.content}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(item.timestamp), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================================
// JORNADA — porte fiel do LeadJourneyTab, wired a platform_crm_lead_stage_history.
// =====================================================================================
function LeadJourneyTab({
  leadId,
  currentStageId,
  stages,
}: {
  leadId: string;
  currentStageId?: string | null;
  stages: Array<{
    id: string;
    name: string;
    color: string | null;
    order_index: number;
    is_won: boolean | null;
    is_lost: boolean | null;
  }>;
}) {
  const { data: stageHistory, isLoading } = usePlatformCrmLeadStageHistory(leadId);

  const journeyData = useMemo(() => {
    if (!stages || stages.length === 0) return [];
    const sorted = [...stages].sort((a, b) => a.order_index - b.order_index);
    const currentStageIndex = sorted.findIndex((s) => s.id === currentStageId);

    return sorted.map((stage, index) => {
      const historyEntry = stageHistory?.find((h) => h.stage_id === stage.id);
      const isPast = index < currentStageIndex;
      const isCurrent = stage.id === currentStageId;
      const isFuture = index > currentStageIndex;

      let daysInStage = 0;
      if (historyEntry) {
        if (historyEntry.exited_at) {
          daysInStage = differenceInDays(
            parseISO(historyEntry.exited_at),
            parseISO(historyEntry.entered_at),
          );
        } else if (isCurrent) {
          daysInStage = differenceInDays(new Date(), parseISO(historyEntry.entered_at));
        }
      }

      return {
        ...stage,
        isPast,
        isCurrent,
        isFuture,
        enteredAt: historyEntry?.entered_at,
        daysInStage: historyEntry?.days_in_stage || daysInStage,
      };
    });
  }, [stages, stageHistory, currentStageId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Nenhum estágio configurado no pipeline
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visual funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Progresso no Funil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {journeyData.map((stage, index) => (
              <div key={stage.id} className="flex items-center">
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                    stage.isCurrent
                      ? 'border-primary bg-primary/10'
                      : stage.isPast
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-muted bg-muted/30'
                  }`}
                >
                  {stage.isPast ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : stage.isCurrent ? (
                    <div
                      className="h-4 w-4 rounded-full animate-pulse"
                      style={{ backgroundColor: stage.color || 'hsl(var(--primary))' }}
                    />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span
                    className={`text-sm font-medium whitespace-nowrap ${
                      stage.isFuture ? 'text-muted-foreground' : ''
                    }`}
                  >
                    {stage.name}
                  </span>
                </div>
                {index < journeyData.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground mx-1 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stage details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Detalhes da Jornada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {journeyData.map((stage, index) => (
            <div
              key={stage.id}
              className={`relative pl-8 pb-4 ${
                index < journeyData.length - 1 ? 'border-l-2 border-border ml-2' : 'ml-2'
              }`}
            >
              <div
                className={`absolute left-0 -translate-x-1/2 h-4 w-4 rounded-full border-2 ${
                  stage.isPast
                    ? 'bg-green-500 border-green-500'
                    : stage.isCurrent
                      ? 'bg-primary border-primary'
                      : 'bg-background border-muted'
                }`}
                style={stage.isCurrent ? { backgroundColor: stage.color || undefined } : undefined}
              />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`font-medium ${stage.isFuture ? 'text-muted-foreground' : ''}`}>
                      {stage.name}
                    </h4>
                    {stage.is_won && <Badge className="bg-green-500">Ganho</Badge>}
                    {stage.is_lost && <Badge variant="destructive">Perdido</Badge>}
                    {stage.isCurrent && <Badge variant="outline">Atual</Badge>}
                  </div>
                  {stage.enteredAt && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Entrou em{' '}
                      {format(parseISO(stage.enteredAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
                {(stage.isPast || stage.isCurrent) && stage.daysInStage > 0 && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{stage.daysInStage} dias</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-500">
              {journeyData.filter((s) => s.isPast).length}
            </p>
            <p className="text-xs text-muted-foreground">Estágios concluídos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-primary">
              {journeyData.find((s) => s.isCurrent)?.daysInStage || 0}
            </p>
            <p className="text-xs text-muted-foreground">Dias no estágio atual</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">
              {journeyData.reduce((acc, s) => acc + (s.daysInStage || 0), 0)}
            </p>
            <p className="text-xs text-muted-foreground">Total de dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">
              {journeyData.filter((s) => s.isFuture).length}
            </p>
            <p className="text-xs text-muted-foreground">Estágios restantes</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================================
// ORIGEM — porte fiel do LeadOriginTab. Origem/UTM vivem direto em platform_crm_leads.
// =====================================================================================
function LeadOriginTab({ lead }: { lead: LeadRow }) {
  const getOriginLabel = (value: string | null) => {
    if (!value) return 'Não informado';
    return LEAD_ORIGINS.find((o) => o.value === value)?.label || value;
  };
  const getChannelLabel = (value: string | null) => {
    if (!value) return 'Não informado';
    return LEAD_CHANNELS.find((c) => c.value === value)?.label || value;
  };

  const hasUtmParams =
    lead.utm_source ||
    lead.utm_medium ||
    lead.utm_campaign ||
    lead.utm_term ||
    lead.utm_content;

  return (
    <div className="space-y-4">
      {/* Main origin info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Origem do Lead
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Fonte</p>
              <Badge variant="secondary" className="text-sm">
                {getOriginLabel(lead.lead_origin)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Canal de Entrada</p>
              <Badge variant="outline" className="text-sm">
                {getChannelLabel(lead.lead_channel)}
              </Badge>
            </div>
          </div>
          {lead.created_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t border-border">
              <Calendar className="h-4 w-4" />
              <span>
                Criado em{' '}
                {format(parseISO(lead.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* UTM Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Parâmetros UTM
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasUtmParams ? (
            <div className="space-y-3">
              {lead.utm_source && (
                <UtmRow icon={<Globe className="h-4 w-4 text-primary" />} bg="bg-primary/10" label="utm_source" value={lead.utm_source} />
              )}
              {lead.utm_medium && (
                <UtmRow icon={<Megaphone className="h-4 w-4 text-secondary-foreground" />} bg="bg-secondary" label="utm_medium" value={lead.utm_medium} />
              )}
              {lead.utm_campaign && (
                <UtmRow icon={<Hash className="h-4 w-4 text-accent-foreground" />} bg="bg-accent" label="utm_campaign" value={lead.utm_campaign} />
              )}
              {lead.utm_term && (
                <UtmRow icon={<MousePointer className="h-4 w-4 text-muted-foreground" />} bg="bg-muted" label="utm_term" value={lead.utm_term} />
              )}
              {lead.utm_content && (
                <UtmRow icon={<FileText className="h-4 w-4 text-muted-foreground" />} bg="bg-muted" label="utm_content" value={lead.utm_content} />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum parâmetro UTM registrado
            </p>
          )}
        </CardContent>
      </Card>

      {/* Referrer info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Referência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lead.landing_page && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Landing Page</p>
              <code className="text-sm bg-muted px-2 py-1 rounded flex-1 overflow-x-auto block">
                {lead.landing_page}
              </code>
            </div>
          )}
          {lead.referrer_url && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Referrer URL</p>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 overflow-x-auto">
                  {lead.referrer_url}
                </code>
                <a
                  href={lead.referrer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}
          {!lead.landing_page && !lead.referrer_url && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma informação de referência registrada
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UtmRow({
  icon,
  bg,
  label,
  value,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`h-8 w-8 rounded ${bg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

// =====================================================================================
// CARTEIRA — porte fiel do LeadWalletTab (responsável + squad + SDR/Closer).
// DROP: histórico de transferências (tabela platform_crm_lead_transfers inexistente) →
// card stub-com-TODO. Transferência via modal também é stub (botão + toast "em breve").
// =====================================================================================
function LeadWalletTab({
  lead,
  sellers,
  onUpdateLead,
}: {
  lead: LeadRow;
  sellers: { id: string; full_name: string; avatar_url: string | null; email: string | null }[];
  onUpdateLead: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const assignee = lead.assigned_to ? sellers.find((s) => s.id === lead.assigned_to) : null;
  const sdr = lead.sdr_id ? sellers.find((s) => s.id === lead.sdr_id) : null;
  const closer = lead.closer_id ? sellers.find((s) => s.id === lead.closer_id) : null;

  return (
    <div className="space-y-4">
      {/* Responsável atual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Responsável Atual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {assignee ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={assignee.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {initials(assignee.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{assignee.full_name}</p>
                  {assignee.email && (
                    <p className="text-sm text-muted-foreground">{assignee.email}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-amber-500">
                <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <UserX className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">Sem Atendimento</p>
                  <p className="text-sm text-muted-foreground">Lead aguardando distribuição</p>
                </div>
              </div>
            )}
            {/* TODO: modal de transferência de carteira — em breve */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.info('Transferência de carteira em breve')}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Transferir
            </Button>
          </div>
          {lead.transferred_at && (
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Desde{' '}
                {format(parseISO(lead.transferred_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Squad — platform_crm_sales_squads via squad_id (nome/cor + Alterar) */}
      <PlatformCrmLeadSquadCard squadId={lead.squad_id} />

      {/* SDR */}
      <RoleAssignmentCard
        label="SDR"
        current={sdr}
        sellers={sellers}
        onAssign={(userId) => onUpdateLead({ sdr_id: userId })}
      />
      {/* Closer */}
      <RoleAssignmentCard
        label="Closer"
        current={closer}
        sellers={sellers}
        onAssign={(userId) => onUpdateLead({ closer_id: userId })}
      />

      {/* Histórico de transferências — DROP: sem tabela na plataforma (stub-com-TODO). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Histórico de Transferências</CardTitle>
        </CardHeader>
        <CardContent>
          {/* TODO: implementar platform_crm_lead_transfers + hook. */}
          <p className="text-sm text-muted-foreground text-center py-4">
            Histórico de transferências em breve
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function RoleAssignmentCard({
  label,
  current,
  sellers,
  onAssign,
}: {
  label: string;
  current?: { id: string; full_name: string; avatar_url: string | null } | null;
  sellers: { id: string; full_name: string; avatar_url: string | null }[];
  onAssign: (userId: string | null) => void;
}) {
  const NONE = '__none__';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={current?.avatar_url || undefined} />
              <AvatarFallback className="text-xs bg-muted">
                {current ? initials(current.full_name) : '—'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm">
              {current ? current.full_name : <span className="text-muted-foreground">Não atribuído</span>}
            </span>
          </div>
          <Select
            value={current?.id ?? NONE}
            onValueChange={(v) => onAssign(v === NONE ? null : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Atribuir" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ninguém</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================================
// NOTAS — porte fiel do LeadNotesTab (notas + tarefas). Tags: platform_crm_lead_tags.
// =====================================================================================
function LeadNotesTab({
  lead,
  sellers,
}: {
  lead: LeadRow;
  sellers: { id: string; full_name: string }[];
}) {
  const [noteContent, setNoteContent] = useState('');
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<string>('medium');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');

  const { data: notes, isLoading: notesLoading } = usePlatformCrmLeadNotes(lead.id);
  const createNote = useCreatePlatformCrmLeadNote();
  const { data: leadTasks, isLoading: tasksLoading } = usePlatformCrmLeadTasks(lead.id);
  const createTask = useCreatePlatformCrmTask();
  const toggleTask = useTogglePlatformCrmTask();

  const handleSubmitNote = async () => {
    if (!noteContent.trim()) return;
    try {
      await createNote.mutateAsync({
        lead_id: lead.id,
        content: noteContent.trim(),
        role_label: 'Vendedor',
      });
      setNoteContent('');
      toast.success('Nota registrada com sucesso');
    } catch {
      toast.error('Erro ao registrar nota');
    }
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await createTask.mutateAsync({
        title: taskTitle.trim(),
        description: taskDescription.trim() || null,
        priority: taskPriority as 'low' | 'medium' | 'high' | 'urgent',
        due_date: taskDueDate || null,
        user_id: taskAssignee || user.id,
        lead_id: lead.id,
        status: 'pending',
        created_by: user.id,
      });
      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('medium');
      setTaskDueDate('');
      setTaskAssignee('');
      setIsTaskDialogOpen(false);
      toast.success('Tarefa criada com sucesso');
    } catch {
      toast.error('Erro ao criar tarefa');
    }
  };

  const handleToggleTask = async (taskId: string, isCompleted: boolean) => {
    try {
      await toggleTask.mutateAsync({ taskId, completed: !isCompleted, leadId: lead.id });
    } catch {
      toast.error('Erro ao atualizar tarefa');
    }
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-primary/10 text-primary',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    urgent: 'bg-destructive/10 text-destructive',
  };
  const priorityLabels: Record<string, string> = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    urgent: 'Urgente',
  };

  return (
    <div className="space-y-4">
      {/* Nova Nota */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Send className="h-4 w-4" />
            Nova Nota de Atendimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Resuma o atendimento com este lead..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <div className="flex justify-between items-center">
            <Badge variant="outline" className="text-xs">
              Vendedor
            </Badge>
            <Button
              size="sm"
              onClick={handleSubmitNote}
              disabled={!noteContent.trim() || createNote.isPending}
              className="gap-2"
            >
              {createNote.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Registrar Nota
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Atendimento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Histórico de Atendimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !notes?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma nota registrada ainda. Seja o primeiro a documentar o atendimento.
            </p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={note.profiles?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {initials(note.profiles?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {note.profiles?.full_name || 'Usuário'}
                      </span>
                      {note.role_label && (
                        <Badge variant="secondary" className="text-xs">
                          {note.role_label}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(note.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tarefas do Lead */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Tarefas deste Lead
          </CardTitle>
          <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Plus className="h-4 w-4" /> Nova Tarefa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Tarefa para este Lead</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input
                    placeholder="Ex: Follow-up por WhatsApp"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    placeholder="Detalhes da tarefa..."
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select value={taskPriority} onValueChange={setTaskPriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input
                      type="datetime-local"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Atribuir a</Label>
                  <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Eu mesmo" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreateTask}
                  disabled={!taskTitle.trim() || createTask.isPending}
                >
                  {createTask.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Criar Tarefa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {tasksLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !leadTasks?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma tarefa vinculada a este lead.
            </p>
          ) : (
            <div className="space-y-2">
              {leadTasks.map((task) => {
                const isCompleted = task.status === 'completed';
                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border border-border ${
                      isCompleted ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleToggleTask(task.id, isCompleted)}
                      className="mt-0.5 shrink-0"
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isCompleted ? 'line-through' : ''}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {format(new Date(task.due_date), 'dd/MM', { locale: ptBR })}
                          </span>
                        )}
                        {task.profiles?.full_name && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.profiles.full_name}
                          </span>
                        )}
                        <Badge
                          className={`text-[10px] px-1.5 py-0 ${
                            priorityColors[task.priority || 'medium']
                          }`}
                        >
                          {priorityLabels[task.priority || 'medium']}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================================
// CADÊNCIAS — porte fiel do LeadCadencesTab. Enrollments via platform_crm_cadence_*.
// TODO: enroll/stop dependem de edge functions (cadence-enroll/cadence-stop) que ainda
// não existem no contexto plataforma → botões mantidos com toast "em breve".
// =====================================================================================
interface PlatformEnrollment {
  id: string;
  cadence_id: string;
  status: string;
  current_step_index: number;
  enrolled_at: string;
  stopped_at: string | null;
  stop_reason: string | null;
  source: string | null;
  cadence_name?: string;
}

const cadenceStatusMeta: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CalendarClock }
> = {
  active: { label: 'Ativo', variant: 'default', icon: CalendarClock },
  completed: { label: 'Concluído', variant: 'secondary', icon: CheckCircle2 },
  stopped: { label: 'Parado', variant: 'destructive', icon: StopCircle },
  paused: { label: 'Pausado', variant: 'outline', icon: X },
};

function LeadCadencesTab({ leadId }: { leadId: string }) {
  const [enrollments, setEnrollments] = useState<PlatformEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_crm_cadence_enrollments')
      .select('*, platform_crm_cadences(name)')
      .eq('lead_id', leadId)
      .order('enrolled_at', { ascending: false });

    const rows = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((r) => ({
      ...(r as unknown as PlatformEnrollment),
      cadence_name: (r.platform_crm_cadences as { name?: string } | null)?.name,
    }));
    setEnrollments(rows);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Cadências do Lead</h3>
          <p className="text-xs text-muted-foreground">
            Jornadas automatizadas inscritas ou já encerradas.
          </p>
        </div>
        {/* TODO: edge function cadence-enroll — em breve na plataforma */}
        <Button size="sm" onClick={() => toast.info('Inscrição em cadência em breve')}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </div>

      {enrollments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Lead não está em nenhuma cadência.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {enrollments.map((e) => {
            const meta = cadenceStatusMeta[e.status] ?? cadenceStatusMeta.active;
            const Icon = meta.icon;
            return (
              <Card key={e.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{e.cadence_name ?? 'Cadência'}</p>
                        <Badge variant={meta.variant} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                        {e.source && (
                          <Badge variant="outline" className="text-xs">
                            via {e.source}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Etapa atual: {e.current_step_index + 1} · Inscrito em{' '}
                        {new Date(e.enrolled_at).toLocaleString('pt-BR')}
                      </p>
                      {e.status === 'stopped' && e.stop_reason && (
                        <p className="text-xs text-destructive mt-1">Motivo: {e.stop_reason}</p>
                      )}
                    </div>
                    {e.status === 'active' && (
                      // TODO: edge function cadence-stop — em breve na plataforma
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toast.info('Remoção de cadência em breve')}
                      >
                        <StopCircle className="h-4 w-4 mr-1" />
                        Remover
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PlatformCrmLeadDetail;
