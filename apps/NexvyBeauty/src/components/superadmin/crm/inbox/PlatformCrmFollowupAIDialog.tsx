import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, RefreshCw, Send, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Follow-up estratégico com IA (rascunho editável) do CRM de PLATAFORMA —
 * porte fiel A1.3 de `chat/FollowupAIDialog.tsx` (Vendus v5 original).
 *
 * A IA lê a conversa e prepara um rascunho editável; o operador revisa e a
 * mensagem é enviada COMO ELE. Substitui o um-clique Wand2 anterior.
 *
 * Adaptações de dados (regra b/d — plataforma NÃO tem organization_id):
 * - Geração do rascunho: reusa `onGenerateDraft` (edge `platform-sales-copilot`
 *   via handleAiSuggest do Inbox), que retorna um texto sugerido. Quando o
 *   copiloto está indisponível, retorna '' e o operador escreve manualmente
 *   (degrade gracioso, sem quebrar o fluxo).
 * - Envio: reusa `onSend` (mutation `useSendPlatformCrmMessage`) — envio real.
 * - TODO(A1.3-backend): resumo/estratégia/warnings estruturados do rascunho
 *   (o `useFollowupAIDraft` do tenant retornava draft.summary/strategy/warnings;
 *   o `platform-sales-copilot` hoje devolve só o texto). Quando o edge de
 *   follow-up da plataforma retornar o objeto rico, exibir os cartões abaixo.
 */
interface PlatformCrmFollowupAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  leadName?: string | null;
  /** Gera o rascunho de follow-up (edge de IA da plataforma). Retorna o texto. */
  onGenerateDraft: () => Promise<string>;
  /** Envia a mensagem COMO o operador (mutation de envio real da plataforma). */
  onSend: (content: string) => Promise<void> | void;
}

const MAX_LEN = 800;

export function PlatformCrmFollowupAIDialog({
  open,
  onOpenChange,
  conversationId,
  leadName,
  onGenerateDraft,
  onSend,
}: PlatformCrmFollowupAIDialogProps) {
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [generatedOnce, setGeneratedOnce] = useState(false);

  // Gera ao abrir (paridade v5: rascunho automático a partir do histórico real).
  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    setText('');
    setGeneratedOnce(false);
    setIsGenerating(true);
    Promise.resolve(onGenerateDraft())
      .then((draft) => {
        if (cancelled) return;
        if (draft) setText(draft.slice(0, MAX_LEN));
      })
      .catch(() => {
        /* erros já tratados dentro de onGenerateDraft (toast informativo) */
      })
      .finally(() => {
        if (cancelled) return;
        setIsGenerating(false);
        setGeneratedOnce(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, onGenerateDraft]);

  const handleRegenerate = async () => {
    if (!conversationId) return;
    setIsGenerating(true);
    try {
      const draft = await onGenerateDraft();
      if (draft) setText(draft.slice(0, MAX_LEN));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId) return;
    setIsSending(true);
    try {
      await onSend(trimmed);
      toast.success('Follow-up enviado');
      onOpenChange(false);
    } catch (e: any) {
      console.error('[PlatformCrmFollowupAIDialog] send', e);
      toast.error(e?.message || 'Falha ao enviar follow-up');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Follow-up estratégico com IA
          </DialogTitle>
          <DialogDescription>
            A IA leu a conversa{leadName ? ` com ${leadName}` : ''} e preparou um rascunho para
            você. <strong>A mensagem será enviada como sua</strong> — revise antes de mandar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isGenerating && !text && (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {(text || generatedOnce) && (
            <>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Rascunho gerado a partir do histórico da conversa. Ajuste o que precisar.
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Mensagem (editável)
                  </label>
                  <span
                    className={cn(
                      'text-[10px] tabular-nums',
                      text.length > MAX_LEN ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {text.length}/{MAX_LEN}
                  </span>
                </div>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                  rows={6}
                  className="resize-none text-sm"
                  placeholder={
                    isGenerating
                      ? 'A IA está escrevendo…'
                      : 'Escreva o follow-up (ou gere um rascunho com a IA)…'
                  }
                  disabled={isGenerating}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={handleRegenerate}
            disabled={isGenerating || !conversationId}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-4 w-4', isGenerating && 'animate-spin')} />
            Gerar outra
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isGenerating || !text.trim() || isSending}
            className="gap-1.5"
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Enviando…' : 'Enviar como meu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
