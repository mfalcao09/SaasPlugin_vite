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
const GEMINI_BATCH = 8;       // imagens por chamada ao Gemini (path frames).
const DEFAULT_MODEL = 'google/gemini-2.5-flash';
const VIDEO_BUCKET = 'prospeccao-video';
const NATIVE_MAX_BYTES = 60 * 1024 * 1024; // teto do path nativo (memória da edge); acima → frames
const GENAI_BASE = 'https://generativelanguage.googleapis.com';

const GEMINI_PROMPT =
  'As imagens são quadros de uma gravação de tela rolando o Instagram. ' +
  'Extraia TODOS os @usernames de PERFIS do Instagram visíveis em qualquer quadro ' +
  '(o texto que começa com @, ex.: @salao.bella). Inclua os que aparecem no cabeçalho ' +
  'do perfil, em comentários, marcações e sugestões. Ignore hashtags (#) e textos que ' +
  'não sejam usernames. Responda APENAS a lista de @handles, um por linha, sem numerar, ' +
  'sem repetir e sem nenhum outro texto.';

// Prompt do path NATIVO (vídeo inteiro na Gemini Files API) — resolve o buraco de
// amostragem dos frames: o modelo assiste o vídeo todo, não quadros esparsos.
const NATIVE_VIDEO_PROMPT =
  'Este é um vídeo de gravação de tela rolando o Instagram. Assista TODO o vídeo e ' +
  'liste TODOS os @usernames de PERFIS do Instagram ÚNICOS que aparecem em qualquer ' +
  'momento (cabeçalho de perfil, comentários, marcações, sugestões). Ignore hashtags. ' +
  'Retorne um array JSON de strings com os @handles, sem repetir e sem mais nada.';

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

/**
 * PATH NATIVO — sobe o vídeo INTEIRO pra Gemini Files API e pede os @handles.
 * upload resumável → aguarda ACTIVE → generateContent(file_uri) → array JSON.
 * Usa a API nativa do Google (generativelanguage) com GEMINI_API_KEY — o gateway
 * OpenRouter do app NÃO aceita vídeo. Devolve os @handles crus (pré-sanitização).
 */
async function extractHandlesFromVideo(blob: Blob, model: string, apiKey: string): Promise<string[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type || 'video/mp4';
  const nativeModel = model.replace(/^google\//, ''); // gateway usa google/…; nativo, não.

  // 1) start (resumable)
  const startResp = await fetch(`${GENAI_BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'prospeccao-video' } }),
  });
  if (!startResp.ok) throw new Error(`files:start ${startResp.status}: ${(await startResp.text()).slice(0, 150)}`);
  const uploadUrl = startResp.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('files:start sem upload url');

  // 2) upload + finalize
  const upResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  });
  if (!upResp.ok) throw new Error(`files:upload ${upResp.status}: ${(await upResp.text()).slice(0, 150)}`);
  let file = (await upResp.json())?.file;
  if (!file?.uri || !file?.name) throw new Error('files:upload sem uri/name');
  const fileName = String(file.name); // "files/xxxx"

  // 3) poll até ACTIVE (vídeo é processado async)
  const deadline = Date.now() + 90_000;
  while (String(file.state) !== 'ACTIVE') {
    if (String(file.state) === 'FAILED') throw new Error('processamento do vídeo falhou (state=FAILED)');
    if (Date.now() > deadline) throw new Error('timeout aguardando o vídeo ficar ACTIVE');
    await new Promise((r) => setTimeout(r, 2500));
    const st = await fetch(`${GENAI_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!st.ok) throw new Error(`files:get ${st.status}`);
    file = await st.json();
  }

  // 4) generateContent (file_uri + prompt), JSON array de strings
  const genResp = await fetch(`${GENAI_BASE}/v1beta/models/${nativeModel}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { file_data: { mime_type: file.mimeType ?? mime, file_uri: file.uri } },
          { text: NATIVE_VIDEO_PROMPT },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    }),
  });
  const genText = await genResp.text();
  // 5) apaga o file do Gemini (best-effort; não bloqueia)
  fetch(`${GENAI_BASE}/v1beta/${fileName}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {});
  if (!genResp.ok) throw new Error(`generateContent ${genResp.status}: ${genText.slice(0, 150)}`);

  const gen = JSON.parse(genText);
  const out: string = (gen?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p?.text).filter(Boolean).join('');
  let arr: unknown[] = [];
  try { const parsed = JSON.parse(out); if (Array.isArray(parsed)) arr = parsed; } catch { arr = out.split(/[\s,;]+/); }
  return arr.map((x) => String(x));
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

  const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const videoPath = typeof body?.video_path === 'string' ? body.video_path.trim() : '';
  const rawFrames: unknown[] = Array.isArray(body?.frames) ? body.frames : [];
  const frames: string[] = rawFrames
    .filter((f): f is string => typeof f === 'string' && f.length > 100)
    .slice(0, MAX_FRAMES);
  if (!videoPath && frames.length === 0) {
    return json({ error: 'envie video_path (path nativo) OU frames[] (extraídos no navegador)' }, 400);
  }

  let apifyToken: string;
  try { apifyToken = getApifyToken(); } catch {
    return json({ error: 'APIFY_TOKEN nao configurado no projeto' }, 500);
  }

  // Produto existe? (falha cedo)
  const { data: product } = await sb
    .from('platform_crm_products').select('id').eq('id', productId).maybeSingle();
  if (!product) return json({ error: 'produto nao encontrado' }, 404);

  // 1) Extração de @handles — NATIVO (vídeo → Gemini Files API) OU FRAMES (imagens → gateway).
  const seen = new Set<string>();
  const handles: string[] = [];
  const pushHandles = (found: Iterable<string>) => {
    for (const raw of found) {
      const h = sanitizeInstagramHandle(raw);
      if (h && HANDLE_RE.test(h) && !seen.has(h)) { seen.add(h); handles.push(h); }
    }
  };

  let mode: 'video' | 'frames' = videoPath ? 'video' : 'frames';
  let geminiCalls = 0;
  let framesUsed = 0;

  if (videoPath) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY nao configurado no projeto', fallback: 'frames' }, 200);
    try {
      const { data: blob, error: dlErr } = await sb.storage.from(VIDEO_BUCKET).download(videoPath);
      if (dlErr || !blob) throw new Error(`download storage: ${dlErr?.message ?? 'sem dados'}`);
      if (blob.size > NATIVE_MAX_BYTES) {
        return json({
          error: `vídeo ${(blob.size / 1048576).toFixed(0)}MB acima do limite nativo (${NATIVE_MAX_BYTES / 1048576}MB)`,
          fallback: 'frames',
        }, 200);
      }
      pushHandles(await extractHandlesFromVideo(blob, model, geminiKey));
      geminiCalls = 1;
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 300);
      console.error('[leads-import-video] nativo falhou:', msg);
      // pede ao front pra cair pro path de frames (o vídeo cru fica no client)
      return json({ error: `Extração nativa do vídeo falhou: ${msg}`, fallback: 'frames' }, 200);
    } finally {
      // vídeo já lido → remove do storage (best-effort; não guardamos o cru)
      try { await sb.storage.from(VIDEO_BUCKET).remove([videoPath]); } catch { /* best-effort */ }
    }
  } else {
    framesUsed = frames.length;
    const apiKey = Deno.env.get('AI_API_KEY') ?? Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return json({ error: 'AI_API_KEY nao configurado no projeto' }, 500);
    try {
      for (let i = 0; i < frames.length; i += GEMINI_BATCH) {
        const batch = frames.slice(i, i + GEMINI_BATCH);
        pushHandles(await extractHandlesBatch(batch, model, apiKey));
        geminiCalls++;
      }
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 300);
      console.error('[leads-import-video] gemini(frames) falhou:', msg);
      return json({ error: `Extração por IA falhou: ${msg}` }, 502);
    }
  }

  const totalExtracted = handles.length;
  if (totalExtracted === 0) {
    return json({
      ok: true, day: saoPauloDay(), mode, frames: framesUsed, gemini_calls: geminiCalls,
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
      ok: true, day, mode, frames: framesUsed, gemini_calls: geminiCalls,
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
      last_import: { mode, frames: framesUsed, handles_extracted: totalExtracted, net_new: netNew.length, at: new Date().toISOString() },
    };
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'running', apify_run_id: run.runId, params }).eq('id', cwppId);
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'running' }).eq('id', swppId);

    console.log(`[leads-import-video] mode=${mode} day=${day} frames=${framesUsed} gemini_calls=${geminiCalls} extracted=${totalExtracted} net_new=${netNew.length} dup=${duplicates} overflow=${overflow} run=${run.runId}`);
    return json({
      ok: true, day, extraction_id: cwppId, swpp_extraction_id: swppId, run_id: run.runId,
      mode, frames: framesUsed, gemini_calls: geminiCalls,
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
