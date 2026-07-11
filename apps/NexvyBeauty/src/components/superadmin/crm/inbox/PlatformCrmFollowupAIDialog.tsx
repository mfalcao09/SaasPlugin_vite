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
import { Sparkles, RefreshCw, Send, Wand2, AlertTriangle } from 'lucide-react';
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
 * - Geração do rascunho — A1.2-FRONT (contrato 5): `onGenerateDraft` chama a
 *   action `followup-ai-draft` do edge `platform-webchat-inbox` e retorna
 *   `{ draft, summary?, strategy? }`; quando o edge está indisponível, o
 *   chamador degrada para o copiloto genérico e, sem nada, retorna draft ''
 *   (o operador escreve manualmente — degrade gracioso, sem quebrar o fluxo).
 * - Envio: reusa `onSend` (mutation `useSendPlatformCrmMessage`) — envio real.
 * - summary/strategy: exibidos como cartões informativos quando o edge
 *   devolve o objeto rico (paridade com o useFollowupAIDraft do tenant).
 */
export interface PlatformCrmFollowupDraft {
  draft: string;
  summary?: string | null;
  strategy?: string | null;
  /** Avisos da IA (ex.: falta de contexto, dado sensível) — exibidos em âmbar. */
  warnings?: string[] | null;
  /** Modelo que gerou o rascunho — exibido como label discreto. */
  model?: string | null;
}

interface PlatformCrmFollowupAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  leadName?: string | null;
  /** Gera o rascunho de follow-up (edge de IA da plataforma). Retorna draft + extras. */
  onGenerateDraft: () => Promise<PlatformCrmFollowupDraft>;
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
  const [summary, setSummary] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [generatedOnce, setGeneratedOnce] = useState(false);

  const applyDraft = (result: PlatformCrmFollowupDraft | null | undefined) => {
    if (result?.draft) setText(result.draft.slice(0, MAX_LEN));
    setSummary(result?.summary || null);
    setStrategy(result?.strategy || null);
    setWarnings(Array.isArray(result?.warnings) ? result!.warnings! : []);
    setModel(result?.model || null);
  };

  // Gera ao abrir (paridade v5: rascunho automático a partir do histórico real).
  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    setText('');
    setSummary(null);
    setStrategy(null);
    setWarnings([]);
    setModel(null);
    setGeneratedOnce(false);
    setIsGenerating(true);
    Promise.resolve(onGenerateDraft())
      .then((result) => {
        if (cancelled) return;
        applyDraft(result);
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
      applyDraft(await onGenerateDraft());
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

              {/* Cartões ricos do contrato 5 (summary/strategy) — só quando o edge devolve */}
              {(summary || strategy) && (
                <div className="space-y-2">
                  {summary && (
                    <div className="rounded-md border bg-muted/30 p-2 text-xs">
                      <p className="font-medium text-muted-foreground mb-0.5">Resumo da conversa</p>
                      <p className="text-foreground/90">{summary}</p>
                    </div>
                  )}
                  {strategy && (
                    <div className="rounded-md border bg-primary/5 border-primary/20 p-2 text-xs">
                      <p className="font-medium text-muted-foreground mb-0.5">Estratégia sugerida</p>
                      <p className="text-foreground/90">{strategy}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Avisos da IA (contrato 5) — caixa âmbar */}
              {warnings.length > 0 && (
                <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-2 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Atenção</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-amber-800/90 dark:text-amber-200/90">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

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
          {model && (
            <span className="self-center text-[10px] text-muted-foreground/70 tabular-nums">
              {model}
            </span>
          )}
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
