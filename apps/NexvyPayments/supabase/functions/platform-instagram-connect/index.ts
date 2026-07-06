// platform-instagram-connect — promove conexao Instagram (rascunho -> ativa).
// Valida via Graph API, criptografa segredos, inscreve pagina no app.
// Porte 1:1 do `instagram-connect`, DESACOPLADO do tenant:
//   * Tabela: platform_crm_instagram_connections (sem organization_id).
//   * Auth: super_admin via authenticatePlatformAgent.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { encryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { errorResponse } = await authenticatePlatformAgent(req, sbAdmin, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const {
    connection_id,
    display_name,
    app_id,
    app_secret,
    fb_page_id,
    ig_business_account_id,
    page_access_token,
  } = body ?? {};

  if (!connection_id || !app_id || !fb_page_id || !ig_business_account_id || !page_access_token) {
    return json({ error: 'campos obrigatorios ausentes' }, 400);
  }

  const { data: existing } = await sbAdmin
    .from('platform_crm_instagram_connections')
    .select('id, status, app_secret_encrypted')
    .eq('id', connection_id)
    .maybeSingle();
  if (!existing) return json({ error: 'connection not found' }, 404);

  let pageInfo: any, igInfo: any;
  try {
    pageInfo = await graphFetch(`/${fb_page_id}?fields=name,id,instagram_business_account`, page_access_token);
  } catch (e) {
    const ge = e as GraphError;
    return json({ error: 'Facebook Page ID ou Page Access Token invalido', detail: ge.graph?.message ?? String(e) }, 400);
  }
  if (pageInfo?.instagram_business_account?.id && String(pageInfo.instagram_business_account.id) !== String(ig_business_account_id)) {
    return json({ error: `A conta IG da pagina e ${pageInfo.instagram_business_account.id}, nao ${ig_business_account_id}` }, 400);
  }
  try {
    igInfo = await graphFetch(`/${ig_business_account_id}?fields=username,name`, page_access_token);
  } catch (e) {
    const ge = e as GraphError;
    return json({ error: 'Instagram Business Account ID invalido', detail: ge.graph?.message ?? String(e) }, 400);
  }

  let subscribedOk = true;
  try {
    await graphFetch(
      `/${fb_page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_reactions`,
      page_access_token,
      { method: 'POST' },
    );
  } catch (e) {
    subscribedOk = false;
    console.error('[platform-ig-connect] subscribed_apps failed', (e as GraphError).graph);
  }

  const updates: Record<string, any> = {
    display_name: display_name ?? undefined,
    app_id: String(app_id),
    fb_page_id: String(fb_page_id),
    fb_page_name: pageInfo?.name ?? null,
    ig_business_account_id: String(ig_business_account_id),
    ig_username: igInfo?.username ?? null,
    page_access_token_encrypted: await encryptSecret(String(page_access_token)),
    status: 'active',
    last_error: null,
  };
  if (app_secret) updates.app_secret_encrypted = await encryptSecret(String(app_secret));
  else if (!existing.app_secret_encrypted) {
    return json({ error: 'app_secret e obrigatorio na primeira ativacao' }, 400);
  }

  const { error: updErr } = await sbAdmin
    .from('platform_crm_instagram_connections')
    .update(updates)
    .eq('id', connection_id);
  if (updErr) return json({ error: updErr.message }, 500);

  return json({
    ok: true,
    connection_id,
    ig_username: igInfo?.username ?? null,
    fb_page_name: pageInfo?.name ?? null,
    subscribed: subscribedOk,
  });
});
