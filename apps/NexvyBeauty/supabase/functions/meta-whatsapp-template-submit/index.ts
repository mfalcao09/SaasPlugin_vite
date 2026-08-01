// meta-whatsapp-template-submit
//
// AUTH (adaptação declarada do porte): o original tinha `if (!auth) return 401`,
// que só verifica se o header EXISTE — a anon key pública (que vai no bundle do
// front) passava, e daí em diante o service_role operava sobre QUALQUER
// connection_id de QUALQUER org. Trocado por authenticateTenant + gate de org
// contra a org DA CONEXÃO. A versão de plataforma já havia corrigido isto
// (authenticatePlatformAgent); o Vendus, não.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { authenticateTenant, assertOrgAccess } from '../_shared/tenant-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Auth real (adaptação do porte): rejeita a anon key — que não é sessão de
  // usuário — e resolve a org do chamador a partir de profiles.
  const auth = await authenticateTenant(req, sb, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;
  const { connection_id, name, language, category, components } = await req.json().catch(() => ({}));

  if (!connection_id || !name || !language || !category || !components) {
    return json({ error: 'campos obrigatórios: connection_id, name, language, category, components' }, 400);
  }
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) {
    return json({ error: 'category inválida' }, 400);
  }

  const { data: conn, error } = await sb.from('whatsapp_meta_connections').select('*').eq('id', connection_id).maybeSingle();
  if (error || !conn) return json({ error: 'connection not found' }, 404);

  // Gate de org contra a org DA CONEXÃO — nunca contra um org_id vindo do body.
  // Sem isto, qualquer usuário autenticado opera a conexão de outro tenant só
  // por adivinhar ou vazar um connection_id.
  const denied = assertOrgAccess(auth, conn.organization_id as string, corsHeaders);
  if (denied) return denied;

  const accessToken = await decryptSecret(conn.access_token_encrypted);

  try {
    const res: any = await graphFetch(`/${conn.waba_id}/message_templates`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ name, language, category, components }),
    });
    await sb.from('whatsapp_meta_templates').upsert({
      connection_id,
      organization_id: conn.organization_id,
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

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
