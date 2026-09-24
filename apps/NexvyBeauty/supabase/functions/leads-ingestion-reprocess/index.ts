// Reprocessa uma extração já armazenada usando o mesmo contrato canônico de
// importação. A operação é server-side: a UI só solicita o lote por ID.
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
  const extractionId = String(body?.extraction_id ?? '').trim();
  if (!productId || !extractionId) return json({ error: 'product_id e extraction_id obrigatorios' }, 400);

  const { data: job, error: jobError } = await sb.from('platform_crm_lead_extractions')
    .select('id, product_id, source, status')
    .eq('id', extractionId).eq('product_id', productId).maybeSingle();
  if (jobError) return json({ error: 'falha ao ler lote' }, 500);
  if (!job) return json({ error: 'lote nao encontrado' }, 404);

  const { data: rows, error: rowsError } = await sb.from('platform_crm_extracted_leads')
    .select('raw')
    .eq('extraction_id', extractionId)
    .limit(2000);
  if (rowsError) return json({ error: 'falha ao ler perfis do lote' }, 500);
  const cards = (rows ?? []).map((row: any) => row.raw).filter((raw: unknown) => raw && typeof raw === 'object');
  if (!cards.length) return json({ error: 'lote sem dados reprocessaveis' }, 409);

  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/leads-import-profiles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, extraction_id: extractionId, source: job.source, cards, actorUserId: user?.id ?? null, contract_version: '1', reprocess: true }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) return json({ error: 'falha ao reprocessar lote', detail: result?.error ?? null }, 502);
  return json({ ok: true, extraction_id: extractionId, reprocessed: cards.length, result });
});
