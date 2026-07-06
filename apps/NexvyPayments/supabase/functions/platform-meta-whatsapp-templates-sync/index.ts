// platform-meta-whatsapp-templates-sync — porte 1:1 do `meta-whatsapp-templates-sync`,
// DESACOPLADO do tenant (tabelas platform_crm_*, sem organization_id; auth super_admin).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch } from '../_shared/meta-graph.ts';
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
  let next = `/${conn.waba_id}/message_templates?fields=name,language,status,category,components,quality_score,id,rejected_reason&limit=100`;
  const allNames: { name: string; language: string }[] = [];

  while (next) {
    const page: any = await graphFetch(next, accessToken);
    const items = page?.data ?? [];
    for (const t of items) {
      allNames.push({ name: t.name, language: t.language });
      await sb.from('platform_crm_whatsapp_meta_templates').upsert({
        connection_id,
        meta_template_id: String(t.id ?? ''),
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components ?? [],
        quality_score: t.quality_score ?? null,
        rejected_reason: t.rejected_reason ?? null,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'connection_id,name,language' });
    }
    next = page?.paging?.next ?? '';
  }

  return json({ ok: true, count: allNames.length, templates: allNames });
});
