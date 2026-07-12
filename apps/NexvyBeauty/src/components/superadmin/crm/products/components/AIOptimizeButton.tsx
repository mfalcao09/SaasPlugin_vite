// Porte 1:1 de `.vendus-src-reference/src/components/product/AIOptimizeButton.tsx`
// + `hooks/useOptimizeField.ts` (fundidos: só o hub consome).
// Edge religada (P2.A): `optimize` invoca `platform-optimize-product-field`
// (product-scoped, gate super_admin) e trata FunctionsHttpError lendo o corpo real.
import { useState, useCallback } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface OptimizeResult {
  original: string;
  optimized: string;
  improvements: string[];
}

export function useOptimizeField() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  const optimize = useCallback(async (
    field: string,
    value: string,
    productContext?: Record<string, any>,
  ): Promise<OptimizeResult | null> => {
    if (!value.trim()) {
      toast.error('Digite algo antes de otimizar');
      return null;
    }
    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('platform-optimize-product-field', {
        body: { field, value, productContext },
      });
      if (error) {
        // FunctionsHttpError esconde a mensagem real no corpo da Response.
        let msg = error.message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        try {
          const body = await ctx?.json?.();
          if (body?.error) msg = body.error;
        } catch {
          /* mantém error.message */
        }
        throw new Error(msg);
      }
      const payload = (data ?? {}) as { optimized?: string; improvements?: string[]; error?: string };
      if (payload.error) throw new Error(payload.error);
      const optimizeResult: OptimizeResult = {
        original: value,
        optimized: payload.optimized ?? value,
        improvements: payload.improvements ?? [],
      };
      setResult(optimizeResult);
      return optimizeResult;
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao otimizar com IA');
      setResult(null);
      return null;
    } finally {
      setIsOptimizing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setIsOptimizing(false);
  }, []);

  return { isOptimizing, result, optimize, reset };
}

interface AIOptimizeButtonProps {
  onOptimize: () => Promise<void> | void;
  isOptimizing: boolean;
  disabled?: boolean;
  className?: string;
}

export function AIOptimizeButton({
  onOptimize,
  isOptimizing,
  disabled,
  className,
}: AIOptimizeButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onOptimize}
      disabled={disabled || isOptimizing}
      className={cn(
        'gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50',
        className,
      )}
    >
      {isOptimizing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Otimizando...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          Otimizar com IA
        </>
      )}
    </Button>
  );
}
