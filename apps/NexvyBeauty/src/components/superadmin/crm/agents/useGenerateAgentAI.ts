// STUB de geracao/otimizacao por IA (Edge ausente) — twin de `useGenerateAgentAI` da fonte.
// D3 P1/F1d — a geracao "Gerar com IA" e "Otimizar campo" chamam a Edge Function
// `generate-agent-ai`, que NAO existe no ambiente da plataforma nesta onda.
// Mantemos a MESMA API (isGenerating/generateAgent/optimizeField) para a UI ficar
// completa; a acao real avisa e retorna null. // TODO(edge)
import { useState, useCallback } from 'react';
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
      _productId: string | null,
      _agentType: AgentType,
      _customContext?: string,
    ): Promise<GeneratedAgent | null> => {
      // TODO(edge): invocar Edge Function `generate-agent-ai` (inexistente na plataforma).
      toast.info('Geracao com IA em breve', {
        description: 'A geracao automatica de agente sera liberada quando a Edge Function estiver disponivel.',
      });
      return null;
    },
    [],
  );

  const optimizeField = useCallback(
    async (
      _productId: string,
      _agentType: AgentType,
      _field: string,
      _currentValue: string | string[],
    ): Promise<OptimizeResult | null> => {
      // TODO(edge): invocar Edge Function `generate-agent-ai` (optimize_field).
      toast.info('Otimizacao com IA em breve');
      return null;
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
