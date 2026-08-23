// instagram-login-oauth-callback — troca code→token (Instagram Login).
// Chamado pela SPA /instagram/oauth-return via functions.invoke (JWT).
// verify_jwt=true + authenticateTenant. Confiança extra = state HMAC.
// Token só cifrado (encryptSecret). Tabela: instagram_login_connections.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateTenant, resolveOrgId } from '../_shared/tenant-auth.ts';
import { encryptSecret } from '../_shared/meta-crypto.ts';
import {
  SCOPES_INSTAGRAM_LOGIN,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  loadInstagramLoginApp,
} from '../_shared/instagram-login-oauth.ts';
import { getStateSecret, verifyState } from '../_shared/instagram-login-oauth-state.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const auth = await authenticateTenant(req, sbAdmin, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const code = typeof body.code === 'string' ? body.code : null;
  const stateToken = typeof body.state === 'string' ? body.state : '';
  const oauthError = typeof body.error === 'string' ? body.error : null;

  const state = await verifyState(stateToken, getStateSecret());
  if (!state) {
    console.error('[instagram-login-oauth-callback] state invalido ou expirado');
    return json({ ok: false, ig_connected: false, reason: 'invalid_state' }, 400);
  }

  const organizationId = resolveOrgId(auth, state.organization_id);
  if (!organizationId || organizationId !== state.organization_id) {
    return json({ ok: false, ig_connected: false, reason: 'org_mismatch' }, 403);
  }

  if (oauthError || !code) {
    console.error('[instagram-login-oauth-callback] consentimento negado/sem code');
    return json({ ok: false, ig_connected: false, reason: 'oauth_denied' }, 400);
  }

  try {
    const app = loadInstagramLoginApp();
    const short = await exchangeCodeForToken(app, code);
    let accessToken = short.access_token;
    let expiresIn = short.expires_in;
    try {
      const longLived = await exchangeForLongLivedToken(app, short.access_token);
      accessToken = longLived.access_token;
      expiresIn = longLived.expires_in ?? expiresIn;
    } catch (e) {
      console.error(
        '[instagram-login-oauth-callback] long-lived falhou, usando short-lived',
        String((e as Error).message ?? e),
      );
    }

    let username: string | null = null;
    let name: string | null = null;
    let accountType: string | null = null;
    let igUserId = short.user_id;
    try {
      const profile = await fetchInstagramProfile(app, accessToken);
      igUserId = profile.user_id || igUserId;
      username = profile.username;
      name = profile.name;
      accountType = profile.account_type;
    } catch (e) {
      console.error(
        '[instagram-login-oauth-callback] profile falhou',
        String((e as Error).message ?? e),
      );
    }

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const row = {
      organization_id: organizationId,
      instagram_user_id: igUserId,
      username,
      name,
      account_type: accountType,
      access_token_encrypted: await encryptSecret(accessToken),
      token_expires_at: tokenExpiresAt,
      scopes: [...SCOPES_INSTAGRAM_LOGIN],
      status: 'active',
      last_error: null,
      connected_by: state.connected_by ?? auth.userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sbAdmin
      .from('instagram_login_connections')
      .upsert(row, { onConflict: 'organization_id,instagram_user_id' });
    if (error) throw new Error(error.message);

    return json({
      ok: true,
      ig_connected: true,
      username,
      instagram_user_id: igUserId,
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    console.error('[instagram-login-oauth-callback] falha na troca', msg);
    return json({ ok: false, ig_connected: false, reason: 'exchange_failed' }, 400);
  }
});
