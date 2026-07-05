import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, BarChart3, ThumbsUp, AlertTriangle, Lightbulb, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * "Análise da Conversa" (IA) da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 da UX de `seller/inbox/ConversationAnalysisPanel.tsx` (CRM Vendus) —
 * mesmo cabeçalho + CTA + score/métricas/pontos fortes/melhorias/sugestões.
 *
 * Religado ao edge `platform-analyze-conversation` (LLM-as-Judge da plataforma),
 * que lê `platform_crm_messages` da conversa (SEM organization_id) e retorna
 * score/pontos fortes/sugestões no MESMO formato do original tenant.
 */

interface AnalysisResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  metrics: {
    avgResponseTime: string;
    tone: string;
    salesTechniques: string[];
    objectionsHandled: number;
  };
}

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
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'platform-analyze-conversation',
        { body: { conversationId } },
      );
      if (invokeError) throw invokeError;
      // O edge devolve `{ error }` em cenários de negócio (ex.: sem mensagens) —
      // trata como estado de erro, não como análise válida.
      if (!data || (data as { error?: string }).error) {
        throw new Error((data as { error?: string })?.error || 'Análise indisponível');
      }
      setAnalysis(data as AnalysisResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao analisar conversa';
      setError(msg);
      toast.error('Erro ao analisar conversa', { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-500';
    if (score >= 5) return 'text-yellow-500';
    return 'text-destructive';
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

        {isLoading ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analisando conversa com IA...</p>
          </div>
        ) : analysis ? (
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-6 pr-4">
              {/* Score */}
              <div className="text-center">
                <span className={`text-5xl font-bold ${getScoreColor(analysis.score)}`}>
                  {analysis.score}
                </span>
                <span className="text-2xl text-muted-foreground">/10</span>
                <Progress value={analysis.score * 10} className="mt-3" />
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Tempo médio resposta</p>
                  <p className="text-sm font-medium">{analysis.metrics.avgResponseTime}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Tom</p>
                  <p className="text-sm font-medium">{analysis.metrics.tone}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Objeções tratadas</p>
                  <p className="text-sm font-medium">{analysis.metrics.objectionsHandled}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Técnicas de vendas</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {analysis.metrics.salesTechniques.map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Strengths */}
              {analysis.strengths.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                    <ThumbsUp className="h-4 w-4 text-green-500" />
                    Pontos Fortes
                  </h4>
                  <ul className="space-y-1">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground pl-5 relative before:content-['✓'] before:absolute before:left-0 before:text-green-500">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {analysis.weaknesses.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Pontos de Melhoria
                  </h4>
                  <ul className="space-y-1">
                    {analysis.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm text-muted-foreground pl-5 relative before:content-['!'] before:absolute before:left-0 before:text-yellow-500">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {analysis.suggestions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    Sugestões
                  </h4>
                  <ul className="space-y-1">
                    {analysis.suggestions.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground pl-5 relative before:content-['→'] before:absolute before:left-0 before:text-primary">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Re-analyze */}
              <Button variant="outline" size="sm" onClick={runAnalysis} className="w-full">
                Analisar Novamente
              </Button>
            </div>
          </ScrollArea>
        ) : (
          // Estado inicial / erro: CTA para (re)disparar a análise.
          <div className="text-center py-8 space-y-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                A IA irá analisar toda a conversa e avaliar a qualidade do atendimento.
              </p>
            )}
            <Button onClick={runAnalysis}>
              <BarChart3 className="h-4 w-4 mr-2" />
              {error ? 'Tentar Novamente' : 'Analisar Conversa'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
