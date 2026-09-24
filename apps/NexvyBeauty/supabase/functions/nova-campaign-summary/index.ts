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

  const { data: campaigns, error } = await sb.from('platform_crm_campaigns')
    .select('id, name, status, channel, created_at, updated_at, started_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return json({ error: 'falha ao carregar histórico de campanhas' }, 500);

  const result = [];
  for (const campaign of campaigns ?? []) {
    const { data: targets, error: targetsError } = await sb.from('platform_crm_campaign_targets')
      .select('id, lead_id, status, sent_at, responded_at, error, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (targetsError) return json({ error: 'falha ao carregar targets da campanha' }, 500);
    const counts = (targets ?? []).reduce<Record<string, number>>((acc, target: any) => { const key = String(target.status ?? 'unknown'); acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
    result.push({ ...campaign, target_count: targets?.length ?? 0, target_counts: counts, targets: targets ?? [] });
  }
  return json({ ok: true, campaigns: result });
});
