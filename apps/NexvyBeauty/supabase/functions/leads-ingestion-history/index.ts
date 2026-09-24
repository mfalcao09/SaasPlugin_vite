import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  authenticatePlatformAgent,
  platformCrmCorsHeaders as corsHeaders,
} from '../_shared/platform-crm-auth.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);
  const { errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;
  const productId = String(body?.product_id ?? '').trim();
  if (!productId) return json({ error: 'product_id obrigatorio' }, 400);
  const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 200);
  const { data, error } = await sb.from('platform_crm_lead_extractions')
    .select('id, source, status, keywords, total_found, params, last_error, created_at, updated_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return json({ error: 'falha ao carregar histórico de ingestão' }, 500);
  return json({ ok: true, data: data ?? [] });
});
