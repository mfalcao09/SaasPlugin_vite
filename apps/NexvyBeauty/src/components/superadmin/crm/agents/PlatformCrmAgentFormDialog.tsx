import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Loader2, Bot, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  type PlatformCrmAgentConfig,
  useCreatePlatformCrmAgentConfig,
  useUpdatePlatformCrmAgentConfig,
} from '@/components/superadmin/crm/data/usePlatformCrmAgentConfigs';

interface PlatformCrmAgentFormDialogProps {
  agent: PlatformCrmAgentConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_TYPING_DELAY = 1200;

/**
 * Editor CORE de um agente de IA da PLATAFORMA — persona/typing/handoff.
 * Grava só em platform_crm_agent_configs (desacoplado do tenant).
 */
export function PlatformCrmAgentFormDialog({
  agent,
  open,
  onOpenChange,
}: PlatformCrmAgentFormDialogProps) {
  const create = useCreatePlatformCrmAgentConfig();
  const update = useUpdatePlatformCrmAgentConfig();
  const isSaving = create.isPending || update.isPending;

  const [name, setName] = useState('');
  const [personaPrompt, setPersonaPrompt] = useState('');
  const [typingDelayMs, setTypingDelayMs] = useState(DEFAULT_TYPING_DELAY);
  const [handoffEnabled, setHandoffEnabled] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(agent?.name ?? '');
      setPersonaPrompt(agent?.persona_prompt ?? '');
      setTypingDelayMs(agent?.typing_delay_ms ?? DEFAULT_TYPING_DELAY);
      setHandoffEnabled(agent?.handoff_enabled ?? true);
      setIsActive(agent?.is_active ?? true);
    }
  }, [open, agent]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Dê um nome ao agente');
      return;
    }

    const payload = {
      name: trimmed,
      persona_prompt: personaPrompt.trim() || null,
      typing_delay_ms: typingDelayMs,
      handoff_enabled: handoffEnabled,
      is_active: isActive,
    };

    if (agent) {
      update.mutate(
        { id: agent.id, ...payload },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {agent ? 'Editar agente' : 'Novo agente de IA'}
          </DialogTitle>
          <DialogDescription>
            Configuração do agente do pipeline: persona, ritmo de digitação e
            transferência para humano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Nome</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Assistente de Vendas"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-persona" className="flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
              Persona (prompt)
            </Label>
            <Textarea
              id="agent-persona"
              value={personaPrompt}
              onChange={(e) => setPersonaPrompt(e.target.value)}
              placeholder="Descreva o tom, o papel e as regras de conduta do agente..."
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Define como o agente se apresenta e responde no atendimento.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="agent-typing">Atraso de digitação</Label>
              <span className="text-sm font-medium tabular-nums text-muted-foreground">
                {(typingDelayMs / 1000).toFixed(1)}s
              </span>
            </div>
            <Slider
              id="agent-typing"
              min={0}
              max={5000}
              step={100}
              value={[typingDelayMs]}
              onValueChange={([v]) => setTypingDelayMs(v)}
            />
            <p className="text-xs text-muted-foreground">
              Simula o tempo que o agente "digita" antes de enviar a resposta.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="agent-handoff">Transferência para humano</Label>
              <p className="text-xs text-muted-foreground">
                Permite passar a conversa para um atendente quando necessário.
              </p>
            </div>
            <Switch
              id="agent-handoff"
              checked={handoffEnabled}
              onCheckedChange={setHandoffEnabled}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="agent-active">Ativo</Label>
              <p className="text-xs text-muted-foreground">
                Agentes inativos não entram no atendimento.
              </p>
            </div>
            <Switch
              id="agent-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {agent ? 'Salvar' : 'Criar agente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
