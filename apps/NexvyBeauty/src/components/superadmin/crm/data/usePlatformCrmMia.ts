import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * CRM de PLATAFORMA (super_admin) — dados da Mia (copiloto executivo).
 *
 * Porte do lado de dados do `AdminMia` do CRM Vendus, adaptado à plataforma:
 *   * O original chamava o edge `mia-tools` via fetch direto (tool, args) e a
 *     conversa acontecia por voz (useMiaSession / WebRTC). Na plataforma tudo
 *     passa pelo edge ÚNICO `platform-mia` via supabase.functions.invoke:
 *       - `{ tool, args }`      → consulta direta (briefing/resumo operacional);
 *       - `{ messages: [...] }` → chat com tool-calling → `{ reply, tool_events }`.
 *   * Voz/wake word (useMiaSession/useMiaWakeWord) → fora do escopo v1; o chat é
 *     textual e NÃO streama (o original só "streamava" áudio via WebRTC).
 *   * mia_logs (métricas de uso) → tabela inexistente na plataforma; o contador
 *     de consultas é local da sessão.
 */

const PLATFORM_CRM_KEY = 'platform-crm';

export interface PlatformMiaToolEvent {
  tool: string;
  args: Record<string, unknown>;
  result: any;
}

export interface PlatformMiaTurn {
  role: 'user' | 'assistant';
  text: string;
}

export type PlatformMiaChatStatus = 'idle' | 'thinking' | 'error';

/** Consulta direta a uma tool da Mia (contrato 1:1 do `mia-tools` original). */
export async function callPlatformMiaTool<T = any>(
  tool: string,
  args: Record<string, unknown> = {},
): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke('platform-mia', {
    body: { tool, args },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return ((data as any)?.data ?? null) as T | null;
}

export interface PlatformMiaOperationSummary {
  conversas_abertas: number;
  conversas_sem_resposta: number;
  leads_quentes: number;
  leads_sem_responsavel: number;
  tarefas_atrasadas: number;
  reunioes_hoje: number;
}

/** Resumo operacional (painel lateral) — atualiza a cada 60s como o original. */
export function usePlatformMiaOperationSummary() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'mia', 'operation-summary'],
    queryFn: () => callPlatformMiaTool<PlatformMiaOperationSummary>('get_operation_summary'),
    refetchInterval: 60_000,
  });
}

export interface PlatformMiaBriefing {
  gerado_em?: string;
  operacao?: PlatformMiaOperationSummary;
  leads_quentes?: Array<{ lead: string; responsavel: string; proxima_acao: string | null }>;
  oportunidades_em_risco?: Array<{ lead_id: string; lead: string; deal_value: number; updated_at: string }>;
  followups?: { cadencias_ativas?: number; followups_atrasados?: number };
  recomendacoes?: string[];
}

/** Briefing executivo do dia (card do topo). */
export function usePlatformMiaBriefing() {
  return useQuery({
    queryKey: [PLATFORM_CRM_KEY, 'mia', 'daily-briefing'],
    queryFn: () => callPlatformMiaTool<PlatformMiaBriefing>('get_daily_ai_summary'),
    staleTime: 5 * 60_000,
  });
}

export function useInvalidatePlatformMiaBriefing() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'mia', 'daily-briefing'] }),
    [queryClient],
  );
}

export interface UsePlatformCrmMiaChatOptions {
  /** Chamado a cada tool executada pela Mia no turno (alimenta a aba Contexto). */
  onToolEvent?: (event: PlatformMiaToolEvent) => void;
}

/**
 * Chat textual com a Mia. Mantém o histórico local e envia o transcript inteiro
 * ao edge a cada turno (o edge injeta o system prompt e roda o loop de tools).
 */
export function usePlatformCrmMiaChat(options: UsePlatformCrmMiaChatOptions = {}) {
  const [turns, setTurns] = useState<PlatformMiaTurn[]>([]);
  const [status, setStatus] = useState<PlatformMiaChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [queriesCount, setQueriesCount] = useState(0);
  const busyRef = useRef(false);
  const onToolEventRef = useRef(options.onToolEvent);
  onToolEventRef.current = options.onToolEvent;

  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setStatus('thinking');

    const nextTurns: PlatformMiaTurn[] = [...turns, { role: 'user', text: trimmed }];
    setTurns(nextTurns);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('platform-mia', {
        body: {
          messages: nextTurns.map((t) => ({ role: t.role, content: t.text })),
        },
      });
      if (invokeError) throw invokeError;
      if ((data as any)?.error) throw new Error((data as any).error);

      const reply = String((data as any)?.reply ?? '').trim();
      const toolEvents = Array.isArray((data as any)?.tool_events)
        ? ((data as any).tool_events as PlatformMiaToolEvent[])
        : [];

      for (const event of toolEvents) onToolEventRef.current?.(event);
      setQueriesCount((n) => n + 1 + toolEvents.length);

      setTurns((prev) => [
        ...prev,
        { role: 'assistant', text: reply || 'Não consegui responder agora. Tenta de novo?' },
      ]);
      setStatus('idle');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao falar com a Mia.';
      setError(message);
      setStatus('error');
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', text: `Falhou: ${message}` },
      ]);
    } finally {
      busyRef.current = false;
    }
  }, [turns]);

  const reset = useCallback(() => {
    setTurns([]);
    setStatus('idle');
    setError(null);
  }, []);

  return { turns, status, error, queriesCount, sendText, reset };
}
