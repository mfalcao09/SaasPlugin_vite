// leads-import-video — "Importação por vídeo" (Prospecção Ativa, super_admin).
//
// Fluxo: o FRONT extrai quadros (frames JPEG) de uma gravação de tela rolando o
// Instagram e envia os frames base64 aqui. Esta edge manda os frames ao Gemini
// (visão, via gateway do app — AI_GATEWAY_URL/AI_API_KEY) pedindo TODOS os
// @handles visíveis, deduplica GLOBALMENTE por handle contra a base do produto,
// e dispara o profile-scraper do Apify (usernames[]) — o MESMO enriquecimento do
// colar-handles. O webhook dedicado (leads-import-video-webhook) baixa o dataset,
// classifica e distribui os leads em DUAS buscas do dia: "… - c/ wpp" e "… - s/ wpp".
//
// Por que frames e não o vídeo cru? O gateway do app (OpenRouter) NÃO aceita vídeo
// no chat/completions (400 em image_url/video_url/file; o part input_video é
// silenciosamente ignorado e o modelo alucina). Não há GEMINI_API_KEY nos secrets
// p/ usar a Files API nativa. Extrair frames no client → mandar imagens (visão,
// já suportada e provada) é o caminho robusto. Ver spike documentado no PR.
//
// Auth: super_admin (authenticatePlatformAgent). Segurança (§11): APIFY_TOKEN /
// AI_API_KEY só em env; nunca logar PII (só contagens).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import {
  PROFILE_ACTOR_ID,
  getApifyToken,
  startProfileScraperRun,
  HANDLE_RE,
  sanitizeInstagramHandle,
} from '../_shared/apify-leads.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HANDLES = 200;      // teto anti-fatura por importação (igual ao colar-handles).
const MAX_FRAMES = 80;        // teto de frames por chamada (anti-flood / custo).
const GEMINI_BATCH = 8;       // imagens por chamada ao Gemini.
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

const GEMINI_PROMPT =
  'As imagens são quadros de uma gravação de tela rolando o Instagram. ' +
  'Extraia TODOS os @usernames de PERFIS do Instagram visíveis em qualquer quadro ' +
  '(o texto que começa com @, ex.: @salao.bella). Inclua os que aparecem no cabeçalho ' +
  'do perfil, em comentários, marcações e sugestões. Ignore hashtags (#) e textos que ' +
  'não sejam usernames. Responda APENAS a lista de @handles, um por linha, sem numerar, ' +
  'sem repetir e sem nenhum outro texto.';

/** Data local (America/Sao_Paulo) YYYY-MM-DD — a data do UPLOAD é o marcador da leva. */
function saoPauloDay(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date()); // en-CA → YYYY-MM-DD
}

function gatewayBase(): string {
  return (Deno.env.get('AI_GATEWAY_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

/** Manda um lote de frames ao Gemini (visão) e devolve os @handles crus achados. */
async function extractHandlesBatch(frames: string[], model: string, apiKey: string): Promise<string[]> {
  const content: unknown[] = [{ type: 'text', text: GEMINI_PROMPT }];
  for (const f of frames) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${f}` } });
  }
  const resp = await fetch(`${gatewayBase()}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], max_tokens: 800, temperature: 0 }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`gemini ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  return text.split(/[\s,;]+/).filter(Boolean);
}

/** find-or-create de uma busca do dia (idempotente por product_id + label). */
async function findOrCreateBucket(
  sb: any, productId: string, label: string, extra: Record<string, unknown>,
): Promise<string> {
  const { data: existing } = await sb
    .from('platform_crm_lead_extractions')
    .select('id')
    .eq('product_id', productId)
    .contains('keywords', [label])
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await sb
    .from('platform_crm_lead_extractions')
    .insert({
      product_id: productId,
      keywords: [label],
      source: 'instagram',
      status: 'running',
      ...extra,
    })
    .select('id').single();
  if (error || !created) throw new Error(`bucket "${label}": ${error?.message ?? 'insert falhou'}`);
  return created.id as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const productId = String(body?.product_id ?? '').trim();
  if (!UUID_RE.test(productId)) return json({ error: 'product_id invalido (UUID)' }, 400);

  const rawFrames: unknown[] = Array.isArray(body?.frames) ? body.frames : [];
  const frames: string[] = rawFrames
    .filter((f): f is string => typeof f === 'string' && f.length > 100)
    .slice(0, MAX_FRAMES);
  if (frames.length === 0) return json({ error: 'frames[] vazio (extraia quadros do vídeo no navegador)' }, 400);

  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

  const apiKey = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return json({ error: 'AI_API_KEY nao configurado no projeto' }, 500);

  let apifyToken: string;
  try { apifyToken = getApifyToken(); } catch {
    return json({ error: 'APIFY_TOKEN nao configurado no projeto' }, 500);
  }

  // Produto existe? (falha cedo)
  const { data: product } = await sb
    .from('platform_crm_products').select('id').eq('id', productId).maybeSingle();
  if (!product) return json({ error: 'produto nao encontrado' }, 404);

  // 1) Gemini: frames → @handles (em lotes). Union dedup + sanitização.
  const seen = new Set<string>();
  const handles: string[] = [];
  let geminiCalls = 0;
  try {
    for (let i = 0; i < frames.length; i += GEMINI_BATCH) {
      const batch = frames.slice(i, i + GEMINI_BATCH);
      const found = await extractHandlesBatch(batch, model, apiKey);
      geminiCalls++;
      for (const raw of found) {
        const h = sanitizeInstagramHandle(raw);
        if (h && HANDLE_RE.test(h) && !seen.has(h)) { seen.add(h); handles.push(h); }
      }
    }
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    console.error('[leads-import-video] gemini falhou:', msg);
    return json({ error: `Extração por IA falhou: ${msg}` }, 502);
  }

  const totalExtracted = handles.length;
  if (totalExtracted === 0) {
    return json({
      ok: true, day: saoPauloDay(), frames: frames.length, gemini_calls: geminiCalls,
      handles_extracted: 0, net_new: 0, duplicates: 0,
      message: 'Nenhum @perfil legível nos quadros. Grave a tela mais devagar/nítida.',
    });
  }

  // 2) Dedup GLOBAL por handle contra a base do produto (leads + opt-out + lixeira).
  const candidates = handles.slice(0, 500); // teto de segurança p/ o .in()
  const known = new Set<string>();
  for (const table of ['platform_crm_extracted_leads', 'platform_crm_lead_optout', 'platform_crm_lead_excluded']) {
    const { data } = await sb.from(table).select('handle').eq('product_id', productId).in('handle', candidates);
    for (const r of (data ?? [])) {
      const h = r?.handle ? String(r.handle).replace(/^@/, '').toLowerCase() : null;
      if (h) known.add(h);
    }
  }
  let netNew = handles.filter((h) => !known.has(h));
  const duplicates = totalExtracted - netNew.length;
  const overflow = Math.max(0, netNew.length - MAX_HANDLES);
  netNew = netNew.slice(0, MAX_HANDLES);

  const day = saoPauloDay();
  const labelCwpp = `Extração vídeo ${day} - c/ wpp`;
  const labelSwpp = `Extração vídeo ${day} - s/ wpp`;

  if (netNew.length === 0) {
    return json({
      ok: true, day, frames: frames.length, gemini_calls: geminiCalls,
      handles_extracted: totalExtracted, net_new: 0, duplicates, overflow: 0,
      message: 'Todos os @perfis do vídeo já estão na base (nada novo p/ enriquecer).',
    });
  }

  // 3) find-or-create das 2 buscas do dia. A c/wpp é a "dona do run" (guarda os run_ids).
  let swppId: string, cwppId: string;
  try {
    swppId = await findOrCreateBucket(sb, productId, labelSwpp, {
      apify_actor_id: PROFILE_ACTOR_ID,
      requested_by: user?.id ?? null,
      params: { via: 'leads-import-video', wpp_bucket: 'sem', day },
    });
    cwppId = await findOrCreateBucket(sb, productId, labelCwpp, {
      apify_actor_id: PROFILE_ACTOR_ID,
      requested_by: user?.id ?? null,
      params: { via: 'leads-import-video', wpp_bucket: 'com', day, split_by_wpp: true, sibling_swpp: swppId, run_ids: [] },
    });
  } catch (e) {
    return json({ error: `falha ao criar buscas do dia: ${String((e as Error).message).slice(0, 200)}` }, 500);
  }

  const webhookUrl =
    `${Deno.env.get('LEADS_WEBHOOK_BASE_URL') || `${Deno.env.get('SUPABASE_URL')}/functions/v1`}` +
    `/leads-import-video-webhook?extraction_id=${cwppId}`;

  // 4) Dispara o profile-scraper (usernames[]) async.
  try {
    const run = await startProfileScraperRun(netNew, webhookUrl, apifyToken);
    // Acumula o run id na dona (suporta append de várias importações no mesmo dia).
    const { data: cur } = await sb
      .from('platform_crm_lead_extractions').select('params').eq('id', cwppId).maybeSingle();
    const prevRunIds: string[] = Array.isArray(cur?.params?.run_ids) ? cur.params.run_ids : [];
    const params = {
      ...(cur?.params ?? {}),
      via: 'leads-import-video', wpp_bucket: 'com', day, split_by_wpp: true, sibling_swpp: swppId,
      run_ids: [...prevRunIds, run.runId],
      last_import: { frames: frames.length, handles_extracted: totalExtracted, net_new: netNew.length, at: new Date().toISOString() },
    };
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'running', apify_run_id: run.runId, params }).eq('id', cwppId);
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'running' }).eq('id', swppId);

    console.log(`[leads-import-video] day=${day} frames=${frames.length} gemini_calls=${geminiCalls} extracted=${totalExtracted} net_new=${netNew.length} dup=${duplicates} overflow=${overflow} run=${run.runId}`);
    return json({
      ok: true, day, extraction_id: cwppId, swpp_extraction_id: swppId, run_id: run.runId,
      frames: frames.length, gemini_calls: geminiCalls,
      handles_extracted: totalExtracted, net_new: netNew.length, duplicates, overflow,
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 400);
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: msg }).in('id', [cwppId, swppId]);
    console.error('[leads-import-video] apify start failed:', msg);
    return json({ error: msg, extraction_id: cwppId }, 200);
  }
});
