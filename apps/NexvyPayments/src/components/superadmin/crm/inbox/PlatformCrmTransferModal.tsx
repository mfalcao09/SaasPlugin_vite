import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowRightLeft, User, Bot, Info } from 'lucide-react';
import { toast } from 'sonner';

/**
 * "Transferir Conversa" da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 da UX de `seller/inbox/TransferConversationModal.tsx` (CRM Vendus) —
 * mantém os tipos de transferência (usuário / agente IA) e a nota interna.
 *
 * ⚠️ STUB-COM-TODO: a transferência real (seleção de usuário/setor/agente por
 * organização + registro em `conversation_transfers`) depende de organization_id
 * e de tabelas/edge do tenant — PROIBIDO neste porte (só `platform_crm_*`, zero
 * organization_id). O BOTÃO e o dialog permanecem presentes; ao confirmar, exibe
 * toast "em breve". A listagem de destinos virá quando existir o edge/tabela de
 * membros/agentes da plataforma.
 *
 * TODO(edge/platform): wire real de transferência quando existir
 *   `platform_crm_transfers` + membros/agentes da plataforma (sem organization_id).
 */

interface PlatformCrmTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onTransfer?: () => void;
}

export function PlatformCrmTransferModal({
  open,
  onOpenChange,
  conversationId,
  onTransfer,
}: PlatformCrmTransferModalProps) {
  const [transferType, setTransferType] = useState<'user' | 'agent'>('user');
  const [internalNote, setInternalNote] = useState('');

  const handleTransfer = () => {
    // TODO(edge/platform): substituir por wire real (update assigned_to / current_agent_id
    // + registro de transferência) quando existir membros/agentes da plataforma.
    void conversationId;
    void internalNote;
    void transferType;
    toast.info('Transferência disponível em breve', {
      description: 'A seleção de destino depende do módulo de equipe da plataforma.',
    });
    onOpenChange(false);
    onTransfer?.();
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
            onValueChange={(value) => setTransferType(value as 'user' | 'agent')}
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
              <RadioGroupItem value="agent" id="pcrm-transfer-agent" />
              <Label htmlFor="pcrm-transfer-agent" className="flex items-center gap-2 cursor-pointer">
                <Bot className="h-4 w-4" />
                Para Agente IA
              </Label>
            </div>
          </RadioGroup>

          {/* Aviso: destinos disponíveis em breve */}
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              A lista de destinos (equipe / agentes da plataforma) será habilitada em
              breve. Registre uma nota interna para o próximo atendente.
            </p>
          </div>

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
          <Button onClick={handleTransfer}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
