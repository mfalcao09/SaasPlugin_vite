// ads-oauth-start — inicia o OAuth de Meta Ads (NexvyAds F1).
// Auth: super_admin (authenticatePlatformAgent). Product-scoped, ZERO organization_id.
// Recebe {product_id}, monta a authorize_url do Facebook Login for Business
// (config_id + override_default_response_type=code) com redirect_uri para o
// ads-oauth-callback e um state ASSINADO (HMAC) carregando product_id + nonce.
// NUNCA expõe app_secret — só devolve {authorize_url}.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { loadPlatformMetaAdsApp, buildAuthorizeUrl } from '../_shared/meta-ads-oauth.ts';
import { signState, getStateSecret, type AdsOAuthStatePayload } from '../_shared/ads-oauth-state.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// redirect_uri PRECISA ser idêntico no start e no callback (a troca de code
// pela Graph re-valida esse valor). Deriva do SUPABASE_URL do projeto.
function callbackUrl(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/ads-oauth-callback`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const product_id = String(body?.product_id ?? '').trim();
  if (!product_id) return json({ error: 'product_id obrigatorio' }, 400);
  if (!UUID_RE.test(product_id)) return json({ error: 'product_id invalido (esperado UUID)' }, 400);

  // Confere que o produto existe (falha cedo em vez de gerar URL órfã).
  const { data: product } = await sb
    .from('platform_crm_products')
    .select('id')
    .eq('id', product_id)
    .maybeSingle();
  if (!product) return json({ error: 'produto nao encontrado' }, 404);

  let app;
  try {
    app = await loadPlatformMetaAdsApp();
  } catch (e) {
    // Erro de negócio como HTTP 200 {error} para o supabase-js expor o corpo.
    return json({ error: String((e as Error).message ?? e) }, 200);
  }
  if (!app.enabled) return json({ error: 'Meta Ads desabilitado (META_ADS_ENABLED=false)' }, 200);

  const nonce = crypto.randomUUID();
  const payload: AdsOAuthStatePayload = {
    product_id,
    connected_by: user?.id ?? null,
    nonce,
    ts: Date.now(),
  };
  const state = await signState(payload, getStateSecret());

  const authorize_url = buildAuthorizeUrl(app, { redirect_uri: callbackUrl(), state });
  return json({ authorize_url });
});
