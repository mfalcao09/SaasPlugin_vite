import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, Sparkles, UserPlus, ListTodo } from 'lucide-react';
import { CreateRadarTaskDialog } from './CreateRadarTaskDialog';
import type { PlatformScanItem } from '../data/usePlatformCrmRadar';
import { toast } from 'sonner';

/**
 * Ações rápidas por lead classificado no Radar IA.
 * PORTE 1:1 de `admin/radar/RadarLeadActions.tsx` do CRM Vendus — mesmos 4
 * botões (Abrir conversa / Chamar com IA / Atribuir / Criar tarefa).
 *
 * Trocas de desacoplamento (imports de tenant proibidos):
 *   - "Chamar com IA": o CallWithAIDialog do tenant depende de edge LLM que
 *     não existe no platform CRM → botão presente + toast "em breve".
 *     TODO(edge): dialog de chamada com IA da plataforma.
 *   - "Atribuir": o LeadTransferModal é componente de tenant → botão presente
 *     + toast "em breve". TODO(port): modal de transferência de lead platform.
 *   - "Criar tarefa": funcional via platform_crm_tasks (CreateRadarTaskDialog).
 */

interface Props {
  item: PlatformScanItem;
  compact?: boolean;
  onOpenConversation?: (conversationId: string) => void;
}

export function RadarLeadActions({ item, compact, onOpenConversation }: Props) {
  const [taskOpen, setTaskOpen] = useState(false);

  const snap = item.lead_snapshot || {};
  const leadName = snap.name || 'Lead';
  const leadPhone = snap.phone || null;

  const contextText = [
    item.reason && `Análise: ${item.reason}`,
    item.suggested_action && `Sugestão: ${item.suggested_action}`,
    item.signals?.length && `Sinais: ${item.signals.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');

  function handleOpenConversation() {
    if (item.conversation_id && onOpenConversation) {
      onOpenConversation(item.conversation_id);
      return;
    }
    toast.error('Conversa não disponível');
  }

  function handleCallWithAI() {
    // TODO(edge): "Chamar com IA" — edge de outreach LLM da plataforma.
    toast.info('Chamar com IA em breve — motor de outreach da plataforma em construção.');
  }

  function handleOpenTransfer() {
    // TODO(port): modal de transferência de lead do platform CRM.
    toast.info('Atribuição de lead em breve.');
  }

  const btnSize = compact ? 'sm' : 'sm';

  return (
    <>
      <div className={compact ? 'grid grid-cols-2 gap-1.5' : 'flex flex-wrap gap-1.5'}>
        <Button
          size={btnSize}
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={handleOpenConversation}
          disabled={!item.conversation_id && !item.lead_id}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Abrir conversa
        </Button>

        <Button
          size={btnSize}
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={handleCallWithAI}
          disabled={!item.lead_id || !leadPhone}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Chamar com IA
        </Button>

        <Button
          size={btnSize}
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={handleOpenTransfer}
          disabled={!item.lead_id}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Atribuir
        </Button>

        <Button
          size={btnSize}
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={() => setTaskOpen(true)}
          disabled={!item.lead_id}
        >
          <ListTodo className="h-3.5 w-3.5" />
          Criar tarefa
        </Button>
      </div>

      {item.lead_id && (
        <CreateRadarTaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          lead={{ id: item.lead_id, name: leadName }}
          defaultTitle={`Follow-up Radar IA — ${leadName}`}
          defaultDescription={[
            contextText,
            item.followup_message ? `\nMensagem sugerida:\n"${item.followup_message}"` : '',
          ]
            .filter(Boolean)
            .join('\n')}
        />
      )}
    </>
  );
}
