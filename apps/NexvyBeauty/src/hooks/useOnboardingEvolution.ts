// ─── useOnboardingEvolution — cliente do front p/ a edge `onboarding-evolution` ─
//
// Gêmeo do useDemoEvolution, para a implantação PAGA. A compradora ainda não tem
// conta (a senha nasce no último passo), então autentica por
// { token, session_token } do link — a edge é pública (verify_jwt=false) e o
// supabase-js manda a anon key no Authorization, que a edge ignora.
//
// Existe porque, sem ele, o passo do QR chama o `evolution-proxy` (exige JWT de
// usuário) e devolve 401 — bug de produção de 20/07/2026.
//
// Também cobre o POLLING: sem sessão o front não enxerga `evolution_instances`
// pela RLS, então perguntar o status pela edge não é luxo, é o único caminho.

import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Args {
  token: string;
  sessionToken: string;
}

export interface OnboardingConnectResult {
  ok: boolean;
  instance_id: string | null;
  qr_code: string | null;
  already_connected?: boolean;
  status?: string;
  error?: string;
  limit_reached?: boolean;
}

export interface OnboardingStatusResult {
  ok: boolean;
  status: string;
  instance_id: string | null;
  qr_code: string | null;
  phone_number?: string | null;
}

/** FunctionsHttpError esconde o corpo na Response — extrai a mensagem real. */
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

export interface OnboardingEvolutionApi {
  connect: () => Promise<OnboardingConnectResult>;
  status: () => Promise<OnboardingStatusResult>;
}

export function useOnboardingEvolution({ token, sessionToken }: Args): OnboardingEvolutionApi {
  return useMemo<OnboardingEvolutionApi>(() => {
    const invoke = async <T>(action: string): Promise<T> => {
      const { data, error } = await supabase.functions.invoke('onboarding-evolution', {
        body: { action, token, session_token: sessionToken },
      });
      if (error) throw new Error(await readErr(error, `Falha em ${action}`));
      return data as T;
    };

    return {
      connect: () => invoke<OnboardingConnectResult>('connect'),
      status: () => invoke<OnboardingStatusResult>('status'),
    };
  }, [token, sessionToken]);
}
