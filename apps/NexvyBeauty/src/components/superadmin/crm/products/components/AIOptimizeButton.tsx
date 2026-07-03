// Porte 1:1 de `.vendus-src-reference/src/components/product/AIOptimizeButton.tsx`
// + `hooks/useOptimizeField.ts` (fundidos: só o hub consome).
// TODO(edge): `platform-optimize-product-field` não existe ainda — botão presente
// (UI completa, decisão da onda), clique informa pendência e não chama edge.
import { useState, useCallback } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OptimizeResult {
  original: string;
  optimized: string;
  improvements: string[];
}

export function useOptimizeField() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  const optimize = useCallback(async (
    _field: string,
    value: string,
    _productContext?: Record<string, any>,
  ): Promise<OptimizeResult | null> => {
    if (!value.trim()) {
      toast.error('Digite algo antes de otimizar');
      return null;
    }
    // TODO(edge): invocar `platform-optimize-product-field` quando a edge existir:
    // const { data, error } = await supabase.functions.invoke('platform-optimize-product-field',
    //   { body: { field, value, productContext } });
    toast.info('Otimização com IA: edge ainda não portada nesta fase (TODO(edge)).');
    setIsOptimizing(false);
    setResult(null);
    return null;
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
