// _shared/tenant-auth.ts
//
// Autenticação de TENANT para Edge Functions que rodam com SERVICE_ROLE (RLS
// off) e recebem organization_id/ids de recurso no body.
//
// ⚠️ POR QUE ISTO EXISTE (P0/P1 de 2026-07-20): o gateway do Supabase aceita a
// ANON KEY (pública, no bundle JS) como Authorization válida. Uma edge com
// service_role que NÃO reautentica por conta própria está aberta a qualquer
// pessoa da internet, mesmo com verify_jwt=true. Foi a classe do P0
// set-user-password e de ~40 irmãs (evolution-send, campaign-*, catalog-*, ...).
//
// Regra de ouro nos chamadores: NUNCA confie no organization_id do body vindo de
// um usuário. Derive a org do JWT (auth.organizationId) e só aceite o org do
// body quando isServiceRole/isSuperAdmin (chamadas server-to-server e admin).

export interface TenantAuth {
  /** id do usuário autenticado (null em chamada service_role). */
  userId: string | null;
  /** org do usuário (de profiles.organization_id). null p/ super_admin/service_role sem org. */
  organizationId: string | null;
  isSuperAdmin: boolean;
  /** true quando o Authorization é a própria service_role key (cron/edge→edge). */
  isServiceRole: boolean;
  /** Response 401 pronto quando a autenticação falha; null quando ok. */
  errorResponse: Response | null;
}

function corsFrom(extra?: Record<string, string>): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    ...(extra ?? {}),
  };
}

function jsonError(message: string, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/**
 * Valida o chamador de uma edge de tenant.
 *  - service_role key  → { isServiceRole:true } (confiança server-to-server).
 *  - JWT de usuário     → getUser (rejeita a anon key, que não é sessão de user)
 *                         + resolve org de profiles + flag super_admin.
 *  - sem/ inválido      → errorResponse 401 pronto.
 *
 * @param admin  client criado com a SERVICE_ROLE_KEY.
 */
export async function authenticateTenant(
  req: Request,
  admin: any,
  corsHeaders?: Record<string, string>,
): Promise<TenantAuth> {
  const cors = corsFrom(corsHeaders);
  const fail: TenantAuth = {
    userId: null, organizationId: null, isSuperAdmin: false, isServiceRole: false,
    errorResponse: jsonError('unauthorized', 401, cors),
  };

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return fail;
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return fail;

  // Chamada interna (cron / edge→edge): a service_role key é secreta do servidor.
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return {
      userId: null, organizationId: null, isSuperAdmin: true, isServiceRole: true,
      errorResponse: null,
    };
  }

  // JWT de usuário. getUser rejeita a anon key (não representa uma sessão).
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return fail;

  const { data: profile } = await admin
    .from('profiles').select('organization_id').eq('id', user.id).maybeSingle();
  const { data: isSuper } = await admin.rpc('is_super_admin', { _user_id: user.id });

  return {
    userId: user.id,
    organizationId: (profile?.organization_id as string) ?? null,
    isSuperAdmin: isSuper === true,
    isServiceRole: false,
    errorResponse: null,
  };
}

/**
 * Deriva a org efetiva de uma requisição, com segurança:
 *  - service_role / super_admin → confia no requestedOrgId (pode operar em qualquer org).
 *  - usuário de tenant          → SEMPRE a própria org (ignora requestedOrgId).
 * Retorna null se não há org resolvível.
 */
export function resolveOrgId(auth: TenantAuth, requestedOrgId?: string | null): string | null {
  if (auth.isServiceRole || auth.isSuperAdmin) return requestedOrgId ?? auth.organizationId ?? null;
  return auth.organizationId ?? null;
}

/**
 * Gate de acesso a uma org específica. Retorna Response 403 pronto quando o
 * usuário de tenant tenta acessar org diferente da sua; null quando liberado.
 */
export function assertOrgAccess(
  auth: TenantAuth,
  requestedOrgId: string | null | undefined,
  corsHeaders?: Record<string, string>,
): Response | null {
  if (auth.isServiceRole || auth.isSuperAdmin) return null;
  if (requestedOrgId && auth.organizationId && auth.organizationId === requestedOrgId) return null;
  return jsonError('forbidden', 403, corsFrom(corsHeaders));
}
