// instagram-login-oauth-start — inicia Instagram Login no tenant (app.*).
// Auth: authenticateTenant + JWT (verify_jwt=true). Devolve {authorize_url}.
// State HMAC carrega organization_id. App secret nunca sai daqui.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateTenant, resolveOrgId } from '../_shared/tenant-auth.ts';
import { buildAuthorizeUrl, loadInstagramLoginApp } from '../_shared/instagram-login-oauth.ts';
import {
  getStateSecret,
  signState,
  type InstagramLoginStatePayload,
} from '../_shared/instagram-login-oauth-state.ts';

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

  const organizationId = resolveOrgId(auth, null);
  if (!organizationId) return json({ error: 'organization_id ausente' }, 400);

  let app;
  try {
    app = loadInstagramLoginApp();
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }

  const payload: InstagramLoginStatePayload = {
    organization_id: organizationId,
    connected_by: auth.userId,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
  };
  const state = await signState(payload, getStateSecret());
  const authorize_url = buildAuthorizeUrl({
    clientId: app.app_id,
    redirectUri: app.redirect_uri,
    state,
  });
  return json({ authorize_url });
});
