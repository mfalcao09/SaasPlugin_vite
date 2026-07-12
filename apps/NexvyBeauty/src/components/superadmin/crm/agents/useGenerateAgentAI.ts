// Religado (P2.A-1) — twin de `useGenerateAgentAI` da fonte, agora chamando a
// Edge Function `platform-generate-agent-ai` (product-scoped, ver
// supabase/functions/platform-generate-agent-ai/index.ts). Mesma API
// (isGenerating/generateAgent/optimizeField) da UI; payload/erro no padrão dos
// demais consumidores já religados (ex.: ObjectionsTab handleOpenGenerator).
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AgentType } from './types';

interface GeneratedAgent {
  name: string;
  description: string;
  primary_objective: string;
  additional_prompt?: string;
  can_do: string[];
  cannot_do: string[];
  handoff_triggers: string[];
  end_conversation_triggers?: string[];
  tone_style: 'formal' | 'consultive' | 'friendly' | 'technical';
  message_style: 'short' | 'balanced' | 'detailed';
  required_phrases?: string[];
  prohibited_phrases?: string[];
  humanization?: unknown;
}

interface OptimizeResult {
  field: string;
  optimized: string | string[];
  reasoning: string;
}

export function useGenerateAgentAI() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAgent, setGeneratedAgent] = useState<GeneratedAgent | null>(null);

  const generateAgent = useCallback(
    async (
      productId: string | null,
      agentType: AgentType,
      customContext?: string,
    ): Promise<GeneratedAgent | null> => {
      setIsGenerating(true);
      setGeneratedAgent(null);
      try {
        const { data, error } = await supabase.functions.invoke('platform-generate-agent-ai', {
          body: {
            product_id: productId,
            agent_type: agentType,
            custom_context: customContext,
            scope: productId ? 'product' : 'organization',
          },
        });
        if (error) {
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
        if (data?.agent) {
          setGeneratedAgent(data.agent);
          toast.success('Agente gerado com sucesso!');
          return data.agent as GeneratedAgent;
        }
        throw new Error('Falha ao gerar agente');
      } catch (e) {
        console.error('[useGenerateAgentAI] generateAgent falhou:', e);
        toast.error((e as Error).message || 'Erro ao gerar agente com IA');
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  const optimizeField = useCallback(
    async (
      productId: string,
      agentType: AgentType,
      field: string,
      currentValue: string | string[],
    ): Promise<OptimizeResult | null> => {
      try {
        const { data, error } = await supabase.functions.invoke('platform-generate-agent-ai', {
          body: {
            product_id: productId || null,
            agent_type: agentType,
            optimize_field: field,
            current_value: Array.isArray(currentValue) ? currentValue.join('\n') : currentValue,
          },
        });
        if (error) {
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
        if (data?.optimized) {
          return data as OptimizeResult;
        }
        throw new Error('Falha ao otimizar campo');
      } catch (e) {
        console.error('[useGenerateAgentAI] optimizeField falhou:', e);
        toast.error((e as Error).message || 'Erro ao otimizar com IA');
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setGeneratedAgent(null);
    setIsGenerating(false);
  }, []);

  return {
    isGenerating,
    generatedAgent,
    generateAgent,
    optimizeField,
    reset,
  };
}
