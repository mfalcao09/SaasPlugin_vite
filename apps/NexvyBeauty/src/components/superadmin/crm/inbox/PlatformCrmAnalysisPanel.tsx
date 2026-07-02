import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BarChart3, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

/**
 * "Análise da Conversa" (IA) da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 da UX de `seller/inbox/ConversationAnalysisPanel.tsx` (CRM Vendus) —
 * mesmo cabeçalho + CTA "Analisar Conversa".
 *
 * ⚠️ STUB-COM-TODO: a análise real chama o edge `analyze-conversation` (LLM-as-Judge),
 * que ainda NÃO existe para o platform CRM. O BOTÃO e o dialog permanecem presentes;
 * ao clicar em "Analisar Conversa", exibe toast "em breve".
 *
 * TODO(edge): wire real quando existir o edge `platform-analyze-conversation`
 *   (lê `platform_crm_messages` da conversa e retorna score/pontos fortes/sugestões).
 */

interface PlatformCrmAnalysisPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

export function PlatformCrmAnalysisPanel({
  open,
  onOpenChange,
  conversationId,
}: PlatformCrmAnalysisPanelProps) {
  const runAnalysis = () => {
    // TODO(edge): invocar o edge de análise quando existir.
    void conversationId;
    toast.info('Análise por IA disponível em breve', {
      description: 'O avaliador de conversas da plataforma ainda será conectado.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Análise da Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="text-center py-8 space-y-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            A IA irá analisar toda a conversa e avaliar a qualidade do atendimento.
          </p>
          <Button onClick={runAnalysis}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Analisar Conversa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
