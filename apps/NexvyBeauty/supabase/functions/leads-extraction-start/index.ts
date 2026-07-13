// leads-extraction-start — dispara uma extração de leads Instagram-first (C9 F0).
// Auth: super_admin (authenticatePlatformAgent). Product-scoped, ZERO organization_id.
// Recebe {product_id, keywords[], limit}. Insere o job em platform_crm_lead_extractions,
// dispara o run ASSÍNCRONO do actor apify/instagram-scraper (busca perfis por
// palavra-chave) com um webhook ad-hoc apontando para leads-extraction-webhook,
// e devolve {extraction_id, run_id}. O parse/staging acontece no webhook.
//
// Segurança (§11): APIFY_TOKEN só em env (secret), nunca no frontend. As tabelas
// platform_crm_* são super_admin-only por RLS; aqui roda com SERVICE_ROLE, então o
// gate super_admin é re-aplicado em código (authenticatePlatformAgent).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import {
  IG_ACTOR_ID,
  getApifyToken,
  startIgActorRun,
  type IgActorInput,
} from '../_shared/apify-leads.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Teto físico do run (anti-surpresa-de-fatura — R1 do plano). Ajustável.
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;
const MAX_KEYWORDS = 20;

// Base pública das Functions p/ o Apify chamar de volta. Override por env quando o
// callback precisar de domínio branded; fallback = domínio cru do Supabase.
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

  // ── Validação de input (§11.3) ─────────────────────────────────────────────
  const productId = String(body?.product_id ?? '').trim();
  if (!productId) return json({ error: 'product_id obrigatorio' }, 400);
  if (!UUID_RE.test(productId)) return json({ error: 'product_id invalido (esperado UUID)' }, 400);

  const rawKeywords = Array.isArray(body?.keywords) ? body.keywords : [];
  const keywords = rawKeywords
    .map((k: unknown) => String(k ?? '').trim())
    .filter((k: string) => k.length > 0 && k.length <= 80)
    .slice(0, MAX_KEYWORDS);
  if (keywords.length === 0) return json({ error: 'keywords[] obrigatorio (1..20 termos)' }, 400);

  let limit = Number(body?.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(Math.trunc(limit), MAX_LIMIT);

  // Produto existe? (falha cedo em vez de gerar run órfão)
  const { data: product } = await sb
    .from('platform_crm_products')
    .select('id')
    .eq('id', productId)
    .maybeSingle();
  if (!product) return json({ error: 'produto nao encontrado' }, 404);

  // Token cedo — erro de config vira 500 claro em vez de run pela metade.
  let token: string;
  try {
    token = getApifyToken();
  } catch (e) {
    console.error('[leads-extraction-start] config:', (e as Error).message);
    return json({ error: 'APIFY_TOKEN nao configurado no projeto' }, 500);
  }

  // Actor aceita múltiplos termos separados por vírgula → 1 run p/ N keywords.
  const search = keywords.join(', ');
  const actorInput: IgActorInput = {
    search,
    searchType: 'user',
    resultsType: 'details',
    searchLimit: limit,
  };

  // 1) Job em 'pending' — precisamos do extraction_id p/ montar a URL do webhook.
  const { data: job, error: insErr } = await sb
    .from('platform_crm_lead_extractions')
    .insert({
      product_id: productId,
      keywords,
      source: 'instagram',
      status: 'pending',
      apify_actor_id: IG_ACTOR_ID,
      requested_by: user?.id ?? null,
      params: { search, searchLimit: limit, limit, searchType: 'user', resultsType: 'details' },
    })
    .select('id')
    .single();
  if (insErr || !job) {
    console.error('[leads-extraction-start] insert job:', insErr?.message);
    return json({ error: 'falha ao criar job de extracao' }, 500);
  }

  const webhookUrl = `${webhookBaseUrl()}/leads-extraction-webhook?extraction_id=${job.id}`;

  // 2) Dispara o run async no Apify.
  try {
    const run = await startIgActorRun(actorInput, webhookUrl, token);
    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'running', apify_run_id: run.runId })
      .eq('id', job.id);
    // Nunca loga PII — só ids técnicos.
    console.log(`[leads-extraction-start] extraction=${job.id} run=${run.runId} keywords=${keywords.length} limit=${limit}`);
    return json({ extraction_id: job.id, run_id: run.runId });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: msg })
      .eq('id', job.id);
    console.error('[leads-extraction-start] apify start failed:', msg);
    // Erro de negócio como HTTP 200 {error} (padrão do repo) + o id do job.
    return json({ error: msg, extraction_id: job.id }, 200);
  }
});
