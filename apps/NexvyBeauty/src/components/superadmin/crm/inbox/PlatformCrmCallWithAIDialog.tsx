import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Bot, Phone, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { usePlatformCrmProductAgents } from '../data/usePlatformCrmProductAgents';
import { PlatformCrmChannelBadge } from './PlatformCrmChannelBadge';
import { resolveProvider, PROVIDER_LABEL } from './platformCrmConversationProvider';

/**
 * Chamar com IA (follow-up manual autônomo) do CRM de PLATAFORMA — porte fiel
 * A1.3 de `lead/CallWithAIDialog.tsx` (Vendus v5 original), adaptado ao contexto
 * de venda de SaaS. Substitui o um-clique Sparkles anterior.
 *
 * O operador escolhe agente de IA + objetivo + contexto + modo, e a IA assume o
 * atendimento de forma autônoma (reengajamento).
 *
 * Adaptações de dados (regra b/d — plataforma NÃO tem organization_id):
 * - Agentes: `useProductAgents(org, product)` → `usePlatformCrmProductAgents(product)`
 *   (`platform_crm_product_agents`, escopo = produto). Lista REAL.
 * - Disparo: reusa `onReactivate` (mutation `useAiReactivatePlatformCrmConversation`
 *   → edge `platform-webchat-inbox` action `ai-reactivate`). Reengajamento REAL.
 * - "Enviar por": exibe o provedor/canal REAL da conversa (read-only). O v5 escolhia
 *   entre múltiplas conexões WhatsApp por agente (Evolution/Meta) — a plataforma
 *   ainda não materializa esse leque. TODO(A1.3-backend): seletor multi-conexão +
 *   janela 24h + TemplatePicker HSM quando o schema/edge da plataforma existir.
 * - A1.2-FRONT (contrato 6): o disparo repassa `agent_id/objective/mode/extra_context`
 *   via `onReactivate(opts)` — o hook `useAiReactivatePlatformCrmConversation`
 *   inclui os campos opcionais no payload da action `ai-reactivate`.
 */
export interface PlatformCrmCallWithAIOptions {
  agentId?: string;
  objective?: string;
  mode?: 'direct' | 'conversational';
  extraContext?: string;
}
interface PlatformCrmCallWithAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    name: string;
    phone?: string | null;
    product_id?: string | null;
  };
  /** Canal da conversa — usado para exibir a conexão de saída (read-only). */
  channel?: string | null;
  metaConnectionId?: string | null;
  instagramConnectionId?: string | null;
  evolutionInstanceId?: string | null;
  initialObjective?: string;
  /**
   * Aciona o reengajamento REAL pela IA (edge ai-reactivate no nível da conversa).
   * Contrato 6: recebe agent_id/objective/mode/extra_context escolhidos no dialog.
   */
  onReactivate: (opts: PlatformCrmCallWithAIOptions) => void;
  isReactivating?: boolean;
}

const OBJECTIVE_PRESETS = [
  { value: 'agendar', label: 'Agendar demonstração', text: 'Agendar uma demonstração do produto com o lead.' },
  { value: 'retomar', label: 'Retomar conversa', text: 'Retomar a conversa de onde parou e dar continuidade ao atendimento.' },
  { value: 'qualificar', label: 'Qualificar (BANT)', text: 'Qualificar o lead usando BANT (orçamento, autoridade, necessidade, prazo).' },
  { value: 'oferta', label: 'Apresentar oferta', text: 'Apresentar a oferta principal e conduzir para o fechamento.' },
  { value: 'custom', label: 'Outro (escrever)', text: '' },
];

export function PlatformCrmCallWithAIDialog({
  open,
  onOpenChange,
  lead,
  channel,
  metaConnectionId,
  instagramConnectionId,
  evolutionInstanceId,
  initialObjective,
  onReactivate,
  isReactivating,
}: PlatformCrmCallWithAIDialogProps) {
  const agentsQuery = usePlatformCrmProductAgents(lead.product_id || undefined);
  const agents = agentsQuery.data;
  const loadingAgents = agentsQuery.isLoading;

  const [agentId, setAgentId] = useState<string>('');
  const [objectivePreset, setObjectivePreset] = useState<string>('retomar');
  const [customObjective, setCustomObjective] = useState(initialObjective || '');
  const [extraContext, setExtraContext] = useState('');
  const [mode, setMode] = useState<'direct' | 'conversational'>('direct');

  // Pré-seleciona agente padrão / primeiro ativo (paridade v5).
  useEffect(() => {
    if (!agents?.length) return;
    if (agentId && agents.some((a: any) => a.id === agentId)) return;
    const def =
      agents.find((a: any) => a.is_default && a.is_active) ||
      agents.find((a: any) => a.is_active) ||
      agents[0];
    if (def) setAgentId(def.id);
  }, [agents, agentId]);

  useEffect(() => {
    if (open && initialObjective) {
      setObjectivePreset('custom');
      setCustomObjective(initialObjective);
    }
  }, [open, initialObjective]);

  const provider = useMemo(
    () =>
      resolveProvider({
        channel,
        meta_connection_id: metaConnectionId,
        instagram_connection_id: instagramConnectionId,
        evolution_instance_id: evolutionInstanceId,
      }),
    [channel, metaConnectionId, instagramConnectionId, evolutionInstanceId],
  );

  const formattedPhone = useMemo(() => {
    if (!lead.phone) return '';
    const digits = lead.phone.replace(/\D/g, '');
    if (digits.length >= 12) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    return lead.phone;
  }, [lead.phone]);

  const initials = lead.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const handleSubmit = () => {
    // A1.2-FRONT (contrato 6): repassa os campos do dialog no payload do
    // ai-reactivate (agent_id/objective/mode/extra_context, todos opcionais).
    const preset = OBJECTIVE_PRESETS.find((p) => p.value === objectivePreset);
    const objective =
      (objectivePreset === 'custom' ? customObjective.trim() : preset?.text) || undefined;
    onReactivate({
      agentId: agentId || undefined,
      objective,
      mode,
      extraContext: extraContext.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Chamar com IA
          </DialogTitle>
          <DialogDescription>
            A IA assumirá e conduzirá o atendimento de forma autônoma.
          </DialogDescription>
        </DialogHeader>

        {/* Lead info */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {initials || 'L'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{lead.name}</p>
            {formattedPhone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {formattedPhone}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Agente */}
          <div className="space-y-2">
            <Label>Agente de IA</Label>
            <Select value={agentId} onValueChange={setAgentId} disabled={loadingAgents || !agents?.length}>
              <SelectTrigger>
                <SelectValue placeholder={loadingAgents ? 'Carregando...' : 'Selecione um agente'} />
              </SelectTrigger>
              <SelectContent>
                {agents?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{a.name}</span>
                      {a.agent_type && (
                        <span className="text-xs text-muted-foreground capitalize">· {a.agent_type}</span>
                      )}
                      {a.is_default && <span className="text-xs text-primary">· padrão</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingAgents && !agents?.length && (
              <p className="text-xs text-muted-foreground">
                {lead.product_id
                  ? 'Nenhum agente de IA configurado para este produto.'
                  : 'Conversa sem produto vinculado — a IA usará o agente padrão da conversa.'}
              </p>
            )}
          </div>

          {/* Enviar por (conexão de saída) — read-only por ora */}
          <div className="space-y-2">
            <Label>Enviar por</Label>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <PlatformCrmChannelBadge provider={provider} size="sm" />
              <span>{PROVIDER_LABEL[provider]}</span>
            </div>
            {/* TODO(A1.3-backend): seletor multi-conexão (Evolution/Meta) + janela 24h. */}
          </div>

          {/* Objetivo */}
          <div className="space-y-2">
            <Label>Objetivo</Label>
            <Select value={objectivePreset} onValueChange={setObjectivePreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {objectivePreset === 'custom' && (
              <Input
                value={customObjective}
                onChange={(e) => setCustomObjective(e.target.value)}
                placeholder="Ex: Convidar para o webinar de quinta-feira."
              />
            )}
          </div>

          {/* Contexto */}
          <div className="space-y-2">
            <Label>Contexto adicional (opcional)</Label>
            <Textarea
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="Ex: Lead pediu para retornar amanhã sobre o plano anual com desconto."
              rows={3}
            />
          </div>

          {/* Modo */}
          <div className="space-y-2">
            <Label>Modo de contato</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as 'direct' | 'conversational')}
              className="grid grid-cols-2 gap-2"
            >
              <label
                className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                  mode === 'direct' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="direct" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Direto</p>
                  <p className="text-xs text-muted-foreground">Já dispara a abordagem inicial.</p>
                </div>
              </label>
              <label
                className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                  mode === 'conversational'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="conversational" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Conversacional</p>
                  <p className="text-xs text-muted-foreground">Conduz com perguntas exploratórias.</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            A IA continuará o atendimento e fará follow-ups automáticos respeitando o horário
            comercial. A conversa segue aparecendo no Inbox.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isReactivating}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isReactivating} className="gap-2">
            {isReactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Iniciar atendimento com IA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
