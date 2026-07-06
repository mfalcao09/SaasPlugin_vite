// _shared/require-caller-org.ts
//
// Helper anti-IDOR para as Edge Functions de COBRANÇA (NexvyPayments).
//
// Problema que resolve (IDOR / cross-org): as functions de negócio hoje confiam
// no `organization_id` que chega no body para escopar consultas/mutações. Um
// caller autenticado pode trocar esse campo pelo org de OUTRO tenant e ler/gravar
// dados que não são dele. Este helper NUNCA confia no body: resolve o org REAL do
// caller a partir do vínculo `profiles.organization_id` (a mesma fonte de verdade
// que o baseline usa em webchat-inbox/presence-test/cakto-proxy) e, se o body
// tentar declarar um org diferente, devolve 403.
//
// Estilo portado 1:1 do molde `_shared/platform-crm-auth.ts`:
//   - `getClaims(token)` p/ validar o JWT criptograficamente (nunca decodifica manual);
//   - service_role key => atua em nome de `actorUserId`/`created_by` do body;
//   - erros como `Response` prontos (401/403/503) via `jsonError`.
//
// Injeção de dependência: o client Supabase é passado por parâmetro (`supabaseAdmin`),
// então a suíte de testes injeta um mock e roda 100% offline (zero rede).

export const requireCallerOrgCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

export interface RequireCallerOrgOptions {
  /**
   * SERVICE_ROLE key. Quando o `Authorization: Bearer <token>` for exatamente
   * essa key, a chamada é tratada como server-to-server e atua em nome de
   * `actorUserId`/`created_by` do body (mesmo contrato do molde). Opcional: se
   * não for passada, chamadas service_role não são reconhecidas (só JWT humano).
   */
  serviceRoleKey?: string;
  /** Body já parseado (JSON). Fonte de `organization_id` (a validar) e `actorUserId`. */
  body?: any;
}

export interface RequireCallerOrgResult {
  /** organization_id REAL do caller (nunca o do body). Presente quando ok. */
  organizationId: string | null;
  /** id do usuário resolvido (do JWT ou do actorUserId em chamada service_role). */
  userId: string | null;
  /** Response pronto (401/403/503) quando a verificação falha; null quando ok. */
  errorResponse: Response | null;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...requireCallerOrgCorsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Resolve e valida o `organization_id` do chamador de uma Edge Function de cobrança,
 * IGNORANDO qualquer `organization_id` vindo do body (defesa anti-IDOR).
 *
 * Fluxo:
 *  1. Sem header `Authorization` OU JWT inválido            -> 401.
 *  2. JWT válido -> resolve `userId` via `getClaims(token).sub`;
 *     service_role key -> `userId = body.actorUserId || body.created_by`.
 *  3. Resolve o org REAL: `profiles.organization_id` do `userId`
 *     (mesma query do baseline). Falha de infra na consulta -> 503.
 *  4. Caller sem organização                                 -> 403.
 *  5. Body traz `organization_id` DIFERENTE do org do token  -> 403 (cross-org).
 *  6. OK -> retorna `{ organizationId, userId }` (o org é sempre o do token/perfil).
 *
 * @param req           Request original (para ler o header Authorization).
 * @param supabaseAdmin Client Supabase (service_role). Injetado p/ testabilidade.
 * @param opts          `serviceRoleKey` (opcional) e `body` já parseado.
 */
export async function requireCallerOrg(
  req: Request,
  supabaseAdmin: any,
  opts: RequireCallerOrgOptions = {},
): Promise<RequireCallerOrgResult> {
  const fail = (msg: string, status: number): RequireCallerOrgResult => ({
    organizationId: null,
    userId: null,
    errorResponse: jsonError(msg, status),
  });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return fail('Unauthorized', 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const body = opts.body;
  let userId: string | null = null;

  if (opts.serviceRoleKey && token === opts.serviceRoleKey) {
    // Chamada interna/sistema: service_role atua em nome de actorUserId/created_by.
    const actorId = (body?.actorUserId || body?.created_by) as string | undefined;
    if (actorId) userId = actorId;
  } else {
    try {
      const { data: claimsData, error: claimsErr } = await supabaseAdmin.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims?.sub) {
        userId = claimsData.claims.sub as string;
      }
    } catch (_) {
      /* token inválido */
    }
  }

  if (!userId) {
    return fail('Invalid token', 401);
  }

  // Org REAL do caller — mesma fonte de verdade do baseline (profiles.organization_id).
  // NUNCA confia no organization_id do body.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    console.error('[require-caller-org] profiles fetch error:', profileErr.message);
    return fail('Backend temporarily unavailable. Please retry.', 503);
  }

  const organizationId = (profile?.organization_id as string | null) ?? null;
  if (!organizationId) {
    return fail('User has no organization', 403);
  }

  // Anti-IDOR: se o body declara um org e ele DIVERGE do org do token -> cross-org.
  const bodyOrg = body?.organization_id;
  if (bodyOrg != null && bodyOrg !== organizationId) {
    console.warn(
      `[require-caller-org] cross-org attempt: user=${userId} token_org=${organizationId} body_org=${bodyOrg}`,
    );
    return fail('Forbidden', 403);
  }

  return { organizationId, userId, errorResponse: null };
}
