// _shared/platform-crm-auth.ts
//
// Autenticação das Edge Functions do CRM de PLATAFORMA (super_admin).
// Porte 1:1 do bloco de auth do `webchat-inbox` do CRM Vendus, adaptado ao
// mundo plataforma: em vez de org-membership, o gate é super_admin (as tabelas
// platform_crm_* são super_admin-only por RLS; aqui o edge roda com SERVICE_ROLE,
// então o gate PRECISA ser re-aplicado em código).
//
// 🔒 ZERO tabela de tenant além de `user_roles` (tabela global de papéis, a mesma
// que o RLS `has_role` usa) — nenhuma webchat_*, leads, organizations etc.

export const platformCrmCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  // Explícito (POST já é CORS-safelisted por padrão, mas alguns proxies/CDNs
  // exigem o header presente). Cobre o invoke cross-origin de gestao.nexvy.tech
  // (ex.: ads-oauth-callback chamado via supabase.functions.invoke, POST).
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export interface PlatformAgentUser {
  id: string;
  email: string;
}

export interface PlatformAgentAuthResult {
  user: PlatformAgentUser | null;
  /** Response pronto (401/403/503) quando a autenticação falha; null quando ok. */
  errorResponse: Response | null;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...platformCrmCorsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Valida o chamador do edge:
 *  1. `Authorization: Bearer <JWT do usuário>` — verificado criptograficamente
 *     via `supabase.auth.getClaims` (mesmo mecanismo do original; nunca decodifica
 *     o JWT manualmente).
 *  2. Chamada interna/sistema: se o token for a própria SERVICE_ROLE key, atua em
 *     nome de `actorUserId`/`created_by` do body (1:1 com o original).
 *  3. Gate final: o usuário resolvido PRECISA ter role `super_admin` em
 *     `user_roles` (o CRM de plataforma é exclusivo do time da plataforma).
 */
export async function authenticatePlatformAgent(
  req: Request,
  supabase: any,
  serviceRoleKey: string,
  bodyParsed: any,
): Promise<PlatformAgentAuthResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, errorResponse: jsonError('Unauthorized', 401) };
  }

  const token = authHeader.replace('Bearer ', '');
  let user: PlatformAgentUser | null = null;

  if (token === serviceRoleKey) {
    // Internal/system call: service_role key bypasses JWT and acts on behalf of actorUserId
    const actorId = (bodyParsed?.actorUserId || bodyParsed?.created_by) as string | undefined;
    if (actorId) {
      user = { id: actorId, email: '' };
    }
  } else {
    try {
      const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims?.sub) {
        user = {
          id: claimsData.claims.sub as string,
          email: (claimsData.claims.email as string) || '',
        };
      }
    } catch (_) {
      /* token inválido */
    }
  }

  if (!user?.id) {
    return { user: null, errorResponse: jsonError('Invalid token', 401) };
  }

  // Gate super_admin — mesma fonte de verdade do RLS (user_roles).
  const { data: roles, error: rolesErr } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (rolesErr) {
    console.error('[platform-crm-auth] user_roles fetch error:', rolesErr.message);
    return {
      user: null,
      errorResponse: jsonError('Backend temporarily unavailable. Please retry.', 503),
    };
  }

  const isSuperAdmin = (roles || []).some((r: any) => r.role === 'super_admin');
  if (!isSuperAdmin) {
    return { user: null, errorResponse: jsonError('Forbidden', 403) };
  }

  return { user, errorResponse: null };
}
