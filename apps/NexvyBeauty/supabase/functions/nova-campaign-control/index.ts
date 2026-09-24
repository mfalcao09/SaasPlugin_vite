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
  const campaignId = String(body?.campaign_id ?? '').trim();
  const action = String(body?.action ?? '').trim();
  if (!productId || !campaignId || !['arm', 'pause', 'resume'].includes(action)) {
    return json({ error: 'product_id, campaign_id e action (arm|pause|resume) são obrigatórios' }, 400);
  }

  const { data: campaign, error: readError } = await sb
    .from('platform_crm_campaigns')
    .select('id, product_id, status, name')
    .eq('id', campaignId)
    .eq('product_id', productId)
    .maybeSingle();
  if (readError) return json({ error: 'falha ao ler campanha' }, 500);
  if (!campaign) return json({ error: 'campanha não encontrada para este produto' }, 404);
  if (['completed', 'cancelled'].includes(campaign.status)) return json({ error: 'campanha encerrada' }, 409);

  if (action === 'arm') {
    const { count, error: targetError } = await sb
      .from('platform_crm_campaign_targets')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'queued');
    if (targetError) return json({ error: 'falha ao validar público da campanha' }, 500);
    if (!count) return json({ error: 'prepare o público antes de armar a campanha' }, 409);
  }

  const nextStatus = action === 'arm' || action === 'resume' ? 'active' : 'paused';
  const update: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() };
  if (nextStatus === 'active' && !campaign.status.includes('active')) update.started_at = new Date().toISOString();
  const { data: updated, error: updateError } = await sb
    .from('platform_crm_campaigns')
    .update(update)
    .eq('id', campaignId)
    .eq('product_id', productId)
    .select('id, name, status, started_at, updated_at')
    .single();
  if (updateError) return json({ error: 'falha ao atualizar status da campanha' }, 500);

  await sb.from('platform_crm_journey_events').insert({
    product_id: productId,
    user_id: user?.id ?? null,
    event_type: 'campaign_identified',
    event_category: 'contact',
    source: 'nova_prospeccao',
    title: `Campanha ${nextStatus === 'active' ? 'armada' : 'desarmada'}`,
    payload: { campaign_id: campaignId, action },
  });
  return json({ ok: true, campaign: updated });
});
