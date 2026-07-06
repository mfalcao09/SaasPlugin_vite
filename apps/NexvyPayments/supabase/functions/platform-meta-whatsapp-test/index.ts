// platform-meta-whatsapp-test — health check: valida credenciais, atualiza
// qualidade/tier, sincroniza templates. Porte 1:1 do `meta-whatsapp-test`,
// DESACOPLADO do tenant (tabelas platform_crm_*, sem organization_id; auth super_admin).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const { connection_id } = body ?? {};
  if (!connection_id) return json({ error: 'connection_id required' }, 400);

  const { data: conn, error } = await sb.from('platform_crm_whatsapp_meta_connections').select('*').eq('id', connection_id).maybeSingle();
  if (error || !conn) return json({ error: 'connection not found' }, 404);

  const accessToken = await decryptSecret(conn.access_token_encrypted);
  const checks: any = {};

  try {
    const phone: any = await graphFetch(`/${conn.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status`, accessToken);
    checks.phone = { ok: true, ...phone };
    await sb.from('platform_crm_whatsapp_meta_connections').update({
      status: 'active',
      last_error: null,
      last_health_check_at: new Date().toISOString(),
      quality_rating: phone?.quality_rating ?? null,
      messaging_limit_tier: phone?.messaging_limit_tier ?? null,
      phone_number: phone?.display_phone_number ?? conn.phone_number,
    }).eq('id', connection_id);
  } catch (e) {
    const ge = e as GraphError;
    const msg = ge.graph?.message ?? String(e);
    await sb.from('platform_crm_whatsapp_meta_connections').update({ status: 'error', last_error: msg, last_health_check_at: new Date().toISOString() }).eq('id', connection_id);
    return json({ ok: false, error: msg, checks }, 200);
  }

  try {
    const waba: any = await graphFetch(`/${conn.waba_id}?fields=name,id`, accessToken);
    checks.waba = { ok: true, ...waba };
  } catch (e) {
    checks.waba = { ok: false, error: (e as GraphError).graph?.message ?? String(e) };
  }

  try {
    await graphFetch(`/${conn.waba_id}/subscribed_apps`, accessToken, { method: 'POST' });
    checks.subscribed_apps = { ok: true };
  } catch (e) {
    checks.subscribed_apps = { ok: false, error: (e as GraphError).graph?.message ?? String(e) };
  }

  try {
    const tpl: any = await graphFetch(`/${conn.waba_id}/message_templates?fields=name,language,status,category,components,id&limit=100`, accessToken);
    const items = tpl?.data ?? [];
    for (const t of items) {
      await sb.from('platform_crm_whatsapp_meta_templates').upsert({
        connection_id,
        meta_template_id: String(t.id ?? ''),
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components ?? [],
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'connection_id,name,language' });
    }
    checks.templates = { ok: true, count: items.length };
  } catch (e) {
    checks.templates = { ok: false, error: (e as GraphError).graph?.message ?? String(e) };
  }

  return json({ ok: true, checks });
});
