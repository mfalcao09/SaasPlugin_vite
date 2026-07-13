// leads-import-profiles — importa perfis JÁ COLETADOS (raw Apify items) direto no
// staging do C9, sem passar pelo run do Apify. Irmão do leads-extraction-webhook:
// o webhook BAIXA o dataset (token do projeto); este RECEBE os perfis no corpo do
// POST. Serve dois consumidores:
//   • pusher local (dados coletados via MCP / arquivos de dataset) — auth x-import-secret
//   • feature in-app "subir vídeo na página" (Gemini extrai handles → profile-scrape
//     → POST aqui) — auth JWT super_admin
//
// Classifica cada perfil com o MESMO motor do webhook (buildLeadCard + qualifyLead),
// respeita opt-out (Art.18) e faz upsert idempotente (onConflict extraction_id,handle).
// Anexa a uma extração existente (extraction_id) OU cria uma nova.
//
// Segurança (§11): verify_jwt=false no gateway; auth real na função =
//   x-import-secret == LEADS_IMPORT_SECRET  (server-to-server / pusher)
//   OU  JWT super_admin (authenticatePlatformAgent)  — um dos dois é obrigatório.
// SERVICE_ROLE só server-side. NUNCA loga PII — só contagens.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import { buildLeadCard, qualifyLead } from '../_shared/apify-leads.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROFILES = 2000; // teto por chamada (anti-payload-gigante); o pusher pagina.

// Comparação de segredo em tempo constante (§11 — evita timing oracle).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  // ── Auth: x-import-secret OU JWT super_admin ───────────────────────────────
  const importSecret = Deno.env.get('LEADS_IMPORT_SECRET') ?? '';
  const provided = req.headers.get('x-import-secret') ?? '';
  const secretOk = importSecret.length > 0 && provided.length > 0 && safeEqual(provided, importSecret);

  let requestedBy: string | null = null;
  if (!secretOk) {
    const { user, errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
    if (errorResponse) return errorResponse; // sem secret e sem JWT super_admin → 401/403
    requestedBy = user?.id ?? null;
  }

  // ── Input (§11.3) ──────────────────────────────────────────────────────────
  const productId = String(body?.product_id ?? '').trim();
  if (!UUID_RE.test(productId)) return json({ error: 'product_id invalido (UUID)' }, 400);

  const profiles: unknown[] = Array.isArray(body?.profiles) ? body.profiles : [];
  if (profiles.length === 0) return json({ error: 'profiles[] obrigatorio' }, 400);
  if (profiles.length > MAX_PROFILES) {
    return json({ error: `profiles[] excede ${MAX_PROFILES} — pagine o envio` }, 413);
  }

  const source = String(body?.source ?? 'instagram').trim() || 'instagram';
  const keywords: string[] = Array.isArray(body?.keywords)
    ? body.keywords.map((k: unknown) => String(k ?? '').trim()).filter((k: string) => k.length > 0 && k.length <= 80).slice(0, 20)
    : [];

  // Produto existe? (falha cedo)
  const { data: product } = await sb
    .from('platform_crm_products').select('id').eq('id', productId).maybeSingle();
  if (!product) return json({ error: 'produto nao encontrado' }, 404);

  // ── Extração: anexa a uma existente OU cria nova ───────────────────────────
  let extractionId = String(body?.extraction_id ?? '').trim();
  if (extractionId) {
    if (!UUID_RE.test(extractionId)) return json({ error: 'extraction_id invalido' }, 400);
    const { data: job } = await sb
      .from('platform_crm_lead_extractions')
      .select('id, product_id').eq('id', extractionId).maybeSingle();
    if (!job) return json({ error: 'extraction nao encontrada' }, 404);
    if (job.product_id !== productId) return json({ error: 'extraction de outro produto' }, 403);
  } else {
    const { data: job, error: insErr } = await sb
      .from('platform_crm_lead_extractions')
      .insert({
        product_id: productId,
        keywords,
        source,
        status: 'running',
        requested_by: requestedBy,
        params: { imported: true, via: 'leads-import-profiles' },
      })
      .select('id').single();
    if (insErr || !job) {
      console.error('[leads-import-profiles] insert job:', insErr?.message);
      return json({ error: 'falha ao criar extracao' }, 500);
    }
    extractionId = job.id;
  }

  try {
    // Opt-out (Art.18) — não estagia quem se opôs (por telefone ou @handle).
    const { data: optoutRows } = await sb
      .from('platform_crm_lead_optout').select('handle, telefone').eq('product_id', productId);
    const optoutPhones = new Set((optoutRows ?? []).map((r: any) => r.telefone).filter(Boolean));
    const optoutHandles = new Set(
      (optoutRows ?? []).map((r: any) => (r.handle ? String(r.handle).replace(/^@/, '') : null)).filter(Boolean),
    );

    // Normaliza + dedup por handle dentro do batch (mesma lógica do webhook).
    const byHandle = new Map<string, Record<string, unknown>>();
    let optedOut = 0, noHandle = 0;
    for (const item of profiles) {
      const card = buildLeadCard(item);
      if (!card.handle) { noHandle++; continue; }
      if (optoutHandles.has(card.handle) || (card.telefone && optoutPhones.has(card.telefone))) {
        optedOut++;
        continue;
      }
      const q = qualifyLead(item, card);
      byHandle.set(card.handle, {
        extraction_id: extractionId,
        product_id: productId,
        handle: card.handle,
        name: card.name,
        primeiro_nome: card.primeiro_nome,
        seguidores: card.seguidores,
        seguindo: card.seguindo,
        posts: card.posts,
        telefone: card.telefone,
        whatsapp_link: card.whatsapp_link,
        email: card.email,
        instagram_url: card.instagram_url,
        website: card.website,
        categoria: card.categoria,
        cnpj: card.cnpj,
        is_verified: card.is_verified,
        is_private: card.is_private,
        bio: card.bio,
        palavras_chave: keywords,
        is_business: card.is_business,
        lgpd_basis: 'art7_par4_publico',
        finalidade: 'audiencia_ads',
        qualified: q.qualified,
        segment: q.segment,
        is_seed: q.is_seed,
        is_infoproduto: q.is_infoproduto,
        phone_is_br: q.phone_is_br,
        geo_country: q.geo_country,
        bio_lang: q.bio_lang,
        filter_verdicts: q.filter_verdicts,
        raw: item,
      });
    }

    const rows = Array.from(byHandle.values());
    const seg: Record<string, number> = { salao_cliente: 0, afiliado_infoproduto: 0, revisao: 0, descarte: 0 };
    let withPhone = 0, qualified = 0, seeds = 0;
    for (const r of rows) {
      if (r.telefone) withPhone++;
      if (r.qualified) qualified++;
      if (r.is_seed) seeds++;
      const s = String(r.segment ?? 'descarte');
      seg[s] = (seg[s] ?? 0) + 1;
    }

    if (rows.length > 0) {
      const { error: upErr } = await sb
        .from('platform_crm_extracted_leads')
        .upsert(rows, { onConflict: 'extraction_id,handle' });
      if (upErr) throw new Error(`upsert staging: ${upErr.message}`);
    }

    // total_found = contagem REAL na extração (idempotente sob reenvio/paginação).
    const { count } = await sb
      .from('platform_crm_extracted_leads')
      .select('id', { count: 'exact', head: true })
      .eq('extraction_id', extractionId);

    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'done', total_found: count ?? rows.length, last_error: null })
      .eq('id', extractionId);

    console.log(
      `[leads-import-profiles] extraction=${extractionId} received=${profiles.length} staged=${rows.length} qualified=${qualified} seeds=${seeds} cliente=${seg.salao_cliente} afiliado=${seg.afiliado_infoproduto} revisao=${seg.revisao} descarte=${seg.descarte} with_phone=${withPhone} opted_out=${optedOut} no_handle=${noHandle} total_now=${count}`,
    );
    return json({
      ok: true,
      extraction_id: extractionId,
      received: profiles.length,
      staged: rows.length,
      qualified,
      seeds,
      segments: seg,
      with_phone: withPhone,
      opted_out: optedOut,
      no_handle: noHandle,
      total_now: count,
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    console.error('[leads-import-profiles] error:', msg);
    return json({ ok: false, error: msg, extraction_id: extractionId }, 200);
  }
});
