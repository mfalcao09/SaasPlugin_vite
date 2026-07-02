// platform-meta-whatsapp-template-submit — porte 1:1 do `meta-whatsapp-template-submit`,
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

  const { connection_id, name, language, category, components } = body ?? {};

  if (!connection_id || !name || !language || !category || !components) {
    return json({ error: 'campos obrigatorios: connection_id, name, language, category, components' }, 400);
  }
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) {
    return json({ error: 'category invalida' }, 400);
  }

  const { data: conn, error } = await sb.from('platform_crm_whatsapp_meta_connections').select('*').eq('id', connection_id).maybeSingle();
  if (error || !conn) return json({ error: 'connection not found' }, 404);

  const accessToken = await decryptSecret(conn.access_token_encrypted);

  try {
    const res: any = await graphFetch(`/${conn.waba_id}/message_templates`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ name, language, category, components }),
    });
    await sb.from('platform_crm_whatsapp_meta_templates').upsert({
      connection_id,
      meta_template_id: String(res?.id ?? ''),
      name,
      language,
      category,
      status: res?.status ?? 'PENDING',
      components,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'connection_id,name,language' });

    return json({ ok: true, meta_template_id: res?.id, status: res?.status ?? 'PENDING' });
  } catch (e) {
    const ge = e as GraphError;
    return json({ error: ge.graph?.message ?? String(e) }, ge.status ?? 500);
  }
});
