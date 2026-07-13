// leads-import-handles — "colar handles" (e, na Fase 2, o output do vídeo→Gemini).
// Recebe uma lista de @handles, dispara o profile-scraper do Apify (usernames[]) na
// conta do projeto e deixa o MESMO webhook (leads-extraction-webhook) baixar+classificar.
// É o irmão do leads-extraction-start, mas pesca por USERNAME em vez de keyword.
//
// Auth: super_admin (authenticatePlatformAgent) — verify_jwt default (não entra no
// config.toml). Product-scoped, ZERO organization_id.
//
// Segurança (§11): APIFY_TOKEN só em env; nunca logar PII (só contagens).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import {
  PROFILE_ACTOR_ID,
  getApifyToken,
  startProfileScraperRun,
} from '../_shared/apify-leads.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HANDLES = 200; // teto anti-fatura (colar uma multidão não estoura o run).
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

// Aceita @handle, instagram.com/handle, URL completa ou username cru → normaliza.
function sanitizeHandle(raw: unknown): string | null {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  // tira protocolo + domínio do IG se veio como URL/link
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.replace(/^instagram\.com\//, '').replace(/^m\.instagram\.com\//, '');
  s = s.replace(/[/?#].*$/, ''); // corta path/query/hash restante
  s = s.replace(/^@/, '');
  return HANDLE_RE.test(s) ? s : null;
}

function webhookBaseUrl(): string {
  return (
    Deno.env.get('LEADS_WEBHOOK_BASE_URL') ||
    `${Deno.env.get('SUPABASE_URL')}/functions/v1`
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  // ── Input (§11.3) ──────────────────────────────────────────────────────────
  const productId = String(body?.product_id ?? '').trim();
  if (!UUID_RE.test(productId)) return json({ error: 'product_id invalido (UUID)' }, 400);

  const rawHandles: unknown[] = Array.isArray(body?.handles) ? body.handles : [];
  const seen = new Set<string>();
  const handles: string[] = [];
  for (const r of rawHandles) {
    const h = sanitizeHandle(r);
    if (h && !seen.has(h)) {
      seen.add(h);
      handles.push(h);
    }
    if (handles.length >= MAX_HANDLES) break;
  }
  if (handles.length === 0) return json({ error: 'handles[] vazio ou invalido (1..200 @perfis)' }, 400);

  // Produto existe? (falha cedo — sem run órfão)
  const { data: product } = await sb
    .from('platform_crm_products').select('id').eq('id', productId).maybeSingle();
  if (!product) return json({ error: 'produto nao encontrado' }, 404);

  let token: string;
  try {
    token = getApifyToken();
  } catch (e) {
    console.error('[leads-import-handles] config:', (e as Error).message);
    return json({ error: 'APIFY_TOKEN nao configurado no projeto' }, 500);
  }

  // 1) Job 'pending' — precisamos do id p/ a URL do webhook.
  const { data: job, error: insErr } = await sb
    .from('platform_crm_lead_extractions')
    .insert({
      product_id: productId,
      keywords: ['paste-handles'],
      source: 'instagram',
      status: 'pending',
      apify_actor_id: PROFILE_ACTOR_ID,
      requested_by: user?.id ?? null,
      params: { via: 'leads-import-handles', handles_count: handles.length },
    })
    .select('id').single();
  if (insErr || !job) {
    console.error('[leads-import-handles] insert job:', insErr?.message);
    return json({ error: 'falha ao criar job de extracao' }, 500);
  }

  const webhookUrl = `${webhookBaseUrl()}/leads-extraction-webhook?extraction_id=${job.id}`;

  // 2) Dispara o profile-scraper (usernames[]) async.
  try {
    const run = await startProfileScraperRun(handles, webhookUrl, token);
    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'running', apify_run_id: run.runId })
      .eq('id', job.id);
    console.log(`[leads-import-handles] extraction=${job.id} run=${run.runId} handles=${handles.length}`);
    return json({ extraction_id: job.id, run_id: run.runId, handles: handles.length });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: msg })
      .eq('id', job.id);
    console.error('[leads-import-handles] apify start failed:', msg);
    return json({ error: msg, extraction_id: job.id }, 200);
  }
});
