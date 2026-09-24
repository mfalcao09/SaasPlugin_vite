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
  const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;
  const productId = String(body?.product_id ?? '').trim();
  const name = String(body?.name ?? '').trim().slice(0, 160);
  if (!name) return json({ error: 'name obrigatorio' }, 400);
  const description = String(body?.description ?? '').trim().slice(0, 1000) || null;
  const { data, error } = await sb.from('platform_crm_campaigns').insert({
    product_id: productId || null,
    name,
    description,
    channel: 'whatsapp',
    status: 'draft',
    created_by: user?.id ?? null,
    audience_filters: { source: 'nova_prospeccao', product_id: productId || null, requires_stage: 'preselected' },
    exclusion_filters: { suppressed: true },
  }).select('id, name, status, created_at').single();
  if (error) return json({ error: 'falha ao criar rascunho de campanha' }, 500);
  return json({ ok: true, campaign: data });
});
