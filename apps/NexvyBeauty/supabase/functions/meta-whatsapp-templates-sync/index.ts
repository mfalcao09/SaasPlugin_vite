// meta-whatsapp-templates-sync — ORG-SCOPED (porte reverso de oficial-vendus-v5).
//
// AUTH: o original tinha `if (!auth) return 401`, que só verifica se o header
// EXISTE — a anon key pública (que vai no bundle do front) passava, e daí em diante
// o service_role lia QUALQUER connection_id de QUALQUER org. Trocado por
// authenticateTenant + gate de org contra a org DA CONEXÃO. A versão de plataforma
// já tinha corrigido isso (authenticatePlatformAgent); o Vendus, não — este porte
// traz o org-scoping do Vendus e a postura de auth da plataforma.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { authenticateTenant, assertOrgAccess } from '../_shared/tenant-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Auth real: rejeita a anon key (não é sessão de usuário) e resolve a org.
  const auth = await authenticateTenant(req, sb, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;

  const { connection_id } = await req.json().catch(() => ({}));
  if (!connection_id) return json({ error: 'connection_id required' }, 400);

  const { data: conn, error } = await sb.from('whatsapp_meta_connections').select('*').eq('id', connection_id).maybeSingle();
  if (error || !conn) return json({ error: 'connection not found' }, 404);

  // Gate de org contra a org DA CONEXÃO — não contra um org_id vindo do body.
  // Sem isto, qualquer usuário autenticado sincroniza a conexão de outro tenant
  // só por adivinhar/vazar um connection_id.
  const denied = assertOrgAccess(auth, conn.organization_id as string, corsHeaders);
  if (denied) return denied;

  const accessToken = await decryptSecret(conn.access_token_encrypted);
  let next = `/${conn.waba_id}/message_templates?fields=name,language,status,category,components,quality_score,id,rejected_reason&limit=100`;
  const allNames: { name: string; language: string }[] = [];

  while (next) {
    const page: any = await graphFetch(next, accessToken);
    const items = page?.data ?? [];
    for (const t of items) {
      allNames.push({ name: t.name, language: t.language });
      await sb.from('whatsapp_meta_templates').upsert({
        connection_id,
        organization_id: conn.organization_id,
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

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
