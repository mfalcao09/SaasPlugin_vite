import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticatePlatformAgent, platformCrmCorsHeaders as corsHeaders } from '../_shared/platform-crm-auth.ts';

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
  const leadId = String(body?.lead_id ?? '').trim();
  if (!productId || !leadId) return json({ error: 'product_id e lead_id obrigatorios' }, 400);
  const { data, error } = await sb.from('platform_crm_lead_operations')
    .select('id, operation_type, status, requested_at, started_at, finished_at, error, result, payload')
    .eq('product_id', productId).eq('lead_id', leadId)
    .order('requested_at', { ascending: false }).limit(20);
  if (error) return json({ error: 'falha ao carregar historico da operacao' }, 500);
  return json({
    ok: true,
    data: (data ?? []).map((operation: any) => ({
      ...operation,
      type: operation.operation_type,
    })),
  });
});
