// Instagram Login (API with Instagram Login) — tenant app.* (NEXVY - IGLOG).
// NÃO é Facebook Login nem o app WhatsApp 1289456453376034.
//
// Escopos Direct-only. Nunca content_publish / manage_comments / manage_insights.
// Credenciais: Function secrets INSTAGRAM_LOGIN_APP_ID / INSTAGRAM_LOGIN_APP_SECRET
// / INSTAGRAM_LOGIN_REDIRECT_URI. Não inventar valores de secret.

export const DEFAULT_GRAPH_VERSION = 'v21.0';
export const DEFAULT_REDIRECT_URI = 'https://app.nexvybeauty.com.br/instagram/oauth-return';

export const SCOPES_INSTAGRAM_LOGIN = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
] as const;

export const FORBIDDEN_INSTAGRAM_SCOPES = [
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_insights',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
] as const;

export interface InstagramLoginApp {
  app_id: string;
  app_secret: string;
  redirect_uri: string;
  graph_version: string;
}

export function resolveInstagramLoginScopes(): string {
  return SCOPES_INSTAGRAM_LOGIN.join(',');
}

export function loadInstagramLoginApp(): InstagramLoginApp {
  const app_id = Deno.env.get('INSTAGRAM_LOGIN_APP_ID') ?? '';
  const app_secret = Deno.env.get('INSTAGRAM_LOGIN_APP_SECRET') ?? '';
  if (!app_id || !app_secret) {
    throw new Error(
      'Instagram Login não configurado: defina INSTAGRAM_LOGIN_APP_ID e INSTAGRAM_LOGIN_APP_SECRET.',
    );
  }
  const redirect_uri = Deno.env.get('INSTAGRAM_LOGIN_REDIRECT_URI') || DEFAULT_REDIRECT_URI;
  const graph_version = Deno.env.get('INSTAGRAM_LOGIN_GRAPH_VERSION') || DEFAULT_GRAPH_VERSION;
  return { app_id, app_secret, redirect_uri, graph_version };
}

/** Authorize URL do Instagram Login (não facebook.com/dialog/oauth). */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL('https://www.instagram.com/oauth/authorize');
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', resolveInstagramLoginScopes());
  u.searchParams.set('state', params.state);
  u.searchParams.set('enable_fb_login', '0');
  return u.toString();
}

export interface InstagramToken {
  access_token: string;
  user_id: string;
  permissions?: string[];
  expires_in?: number;
}

export function parseTokenExchange(body: unknown): InstagramToken {
  const raw = body as Record<string, unknown> | null;
  const row = Array.isArray(raw?.data) ? (raw.data[0] as Record<string, unknown>) : raw;
  const access_token = String(row?.access_token ?? '');
  const user_id = String(row?.user_id ?? (row?.user as { id?: unknown } | undefined)?.id ?? '');
  if (!access_token || !user_id) {
    throw new Error('token exchange: resposta sem access_token/user_id');
  }
  const permRaw = row?.permissions;
  const permissions = Array.isArray(permRaw)
    ? permRaw.map(String)
    : typeof permRaw === 'string'
      ? permRaw.split(/[,\s]+/).filter(Boolean)
      : undefined;
  const expires_in = typeof row?.expires_in === 'number' ? row.expires_in : undefined;
  return { access_token, user_id, permissions, expires_in };
}

export async function exchangeCodeForToken(
  app: InstagramLoginApp,
  code: string,
): Promise<InstagramToken> {
  const body = new URLSearchParams({
    client_id: app.app_id,
    client_secret: app.app_secret,
    grant_type: 'authorization_code',
    redirect_uri: app.redirect_uri,
    code,
  });
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token exchange: ${JSON.stringify(json)}`);
  return parseTokenExchange(json);
}

export async function exchangeForLongLivedToken(
  app: InstagramLoginApp,
  shortToken: string,
): Promise<{ access_token: string; expires_in?: number }> {
  const u = new URL('https://graph.instagram.com/access_token');
  u.searchParams.set('grant_type', 'ig_exchange_token');
  u.searchParams.set('client_secret', app.app_secret);
  u.searchParams.set('access_token', shortToken);
  const res = await fetch(u.toString());
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`long-lived exchange: ${JSON.stringify(json)}`);
  const access_token = String((json as { access_token?: string }).access_token ?? '');
  if (!access_token) throw new Error('long-lived exchange: sem access_token');
  const expires_in = (json as { expires_in?: number }).expires_in;
  return { access_token, expires_in };
}

export interface InstagramProfile {
  user_id: string;
  username: string | null;
  name: string | null;
  account_type: string | null;
}

export async function fetchInstagramProfile(
  app: InstagramLoginApp,
  accessToken: string,
): Promise<InstagramProfile> {
  const u = new URL(`https://graph.instagram.com/${app.graph_version}/me`);
  u.searchParams.set('fields', 'user_id,username,name,account_type');
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`profile: ${JSON.stringify(json)}`);
  const user_id = String((json as { user_id?: string; id?: string }).user_id
    ?? (json as { id?: string }).id
    ?? '');
  if (!user_id) throw new Error('profile: sem user_id');
  return {
    user_id,
    username: typeof (json as { username?: string }).username === 'string'
      ? (json as { username: string }).username
      : null,
    name: typeof (json as { name?: string }).name === 'string'
      ? (json as { name: string }).name
      : null,
    account_type: typeof (json as { account_type?: string }).account_type === 'string'
      ? (json as { account_type: string }).account_type
      : null,
  };
}
