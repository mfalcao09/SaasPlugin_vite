// platform-instagram-test — health-check da conexao. Porte 1:1 do `instagram-test`,
// DESACOPLADO do tenant (tabela platform_crm_instagram_connections; auth super_admin).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const { connection_id } = body ?? {};
  if (!connection_id) return json({ error: 'connection_id required' }, 400);

  const { data: conn } = await sb.from('platform_crm_instagram_connections').select('*').eq('id', connection_id).maybeSingle();
  if (!conn) return json({ error: 'not found' }, 404);

  try {
    const token = await decryptSecret(conn.page_access_token_encrypted);
    const ig = await graphFetch<any>(`/${conn.ig_business_account_id}?fields=username,name,followers_count`, token);
    const subs = await graphFetch<any>(`/${conn.fb_page_id}/subscribed_apps`, token).catch(() => ({ data: [] }));
    const subscribed = Array.isArray(subs?.data) && subs.data.length > 0;
    await sb.from('platform_crm_instagram_connections').update({ status: 'active', last_error: null }).eq('id', connection_id);
    return json({ ok: true, ig, subscribed });
  } catch (e) {
    const ge = e as GraphError;
    const msg = ge.graph?.message ?? String(e);
    await sb.from('platform_crm_instagram_connections').update({ status: 'error', last_error: msg }).eq('id', connection_id);
    return json({ ok: false, error: msg }, 200);
  }
});
