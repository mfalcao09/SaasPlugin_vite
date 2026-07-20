// _shared/cron-auth.ts
//
// Autenticação de edges de CRON/fila que não recebem tenant e processam a fila
// GLOBAL (cadence-tick, campaign-dispatcher, process-scheduled-messages,
// ai-followup-cron, auto-notifications, campaign-start).
//
// ⚠️ P1 (2026-07-20): esses crons eram disparáveis por QUALQUER um — os cron jobs
// legados mandam a anon key (pública) no Authorization, então o gateway aceitava
// e a edge processava a fila de todos os tenants sem checar nada (furando o
// pacing anti-flood → ban de número, custo, LGPD). Agora exige um segredo
// compartilhado só-servidor (CRON_SECRET) OU a service_role key.
//
// O cron job manda `x-cron-secret: <CRON_SECRET>`. Comparação timing-safe.

/** Comparação de tempo constante (evita descobrir o segredo por timing). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  // Comprimentos diferentes: ainda percorre para não vazar tamanho cedo.
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Retorna Response 401 pronto quando o chamador não é um cron autorizado; null
 * quando liberado. Aceita: (a) x-cron-secret == CRON_SECRET; (b) Authorization
 * Bearer == service_role key (chamadas edge→edge internas).
 */
export function assertCron(req: Request, corsHeaders?: Record<string, string>): Response | null {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    ...(corsHeaders ?? {}),
  };

  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (secret && provided && timingSafeEqual(provided, secret)) return null;

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey && token && timingSafeEqual(token, serviceKey)) return null;

  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
