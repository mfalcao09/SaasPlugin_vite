// ─── useDemoEvolution — cliente do front p/ a edge `demo-evolution` ─────────
// Implementação REAL da DemoEvolutionApi. A lead anônima autentica por
// { token, session_token } (onboarding_submissions mode='demo'); a edge é
// pública (verify_jwt=false) e o supabase-js manda a anon key no Authorization
// — a edge ignora isso (só reconhece o SERVICE bearer p/ chamadas internas) e
// cai no ramo token+session. Zero JWT de usuário.

import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  DemoEvolutionApi,
  DemoAcceptInput,
  DemoConnectResult,
  DemoStatusResult,
  DemoReport,
} from '@/components/onboarding/implantacao/demo/demoApi';

interface Args {
  token: string;
  sessionToken: string;
}

// Extrai a mensagem de erro real (FunctionsHttpError esconde o corpo na Response).
async function readErr(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  try {
    const body = await ctx?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* mantém fallback */
  }
  return (error as { message?: string })?.message || fallback;
}

export function useDemoEvolution({ token, sessionToken }: Args): DemoEvolutionApi {
  return useMemo<DemoEvolutionApi>(() => {
    const invoke = async <T>(action: string, extra: Record<string, unknown> = {}): Promise<T> => {
      const { data, error } = await supabase.functions.invoke('demo-evolution', {
        body: { action, token, session_token: sessionToken, ...extra },
      });
      if (error) throw new Error(await readErr(error, `Falha em ${action}`));
      return data as T;
    };

    return {
      accept: (input: DemoAcceptInput) => invoke<{ ok: boolean }>('accept', { ...input }),
      connect: () => invoke<DemoConnectResult>('connect'),
      status: () => invoke<DemoStatusResult>('status'),
      report: () => invoke<DemoReport>('report'),
      sendReport: (input: { text: string; report_url: string }) =>
        invoke<{ ok: boolean }>('send_report', { ...input }),
      requestDeletion: () => invoke<{ ok: boolean }>('request_deletion'),
    };
  }, [token, sessionToken]);
}
