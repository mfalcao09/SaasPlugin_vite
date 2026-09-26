// leads-import-profiles — importa perfis JÁ COLETADOS (raw Apify items ou cards
// normalizados do Prospectagram) direto no
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
import {
  resolveExtractedLeadIdentity,
  type ExtractedLeadForResolution,
} from '../_shared/platform-crm-extracted-lead-resolver.ts';
import {
  isCanonicalTriage,
  triageFromLegacySegment,
} from '../_shared/platform-crm-triage.ts';

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

  // Compatibilidade de entrada: Apify/Gemini usa profiles[]; o extrator
  // Prospectagram entrega o envelope legado como cards[]. Ambos passam pelo
  // mesmo normalizador e pela mesma triagem no backend.
  const profiles: unknown[] = Array.isArray(body?.profiles)
    ? body.profiles
    : (Array.isArray(body?.cards) ? body.cards : []);
  if (profiles.length === 0) return json({ error: 'profiles[] obrigatorio' }, 400);
  if (profiles.length > MAX_PROFILES) {
    return json({ error: `profiles[] excede ${MAX_PROFILES} — pagine o envio` }, 413);
  }

  const source = String(body?.source ?? 'instagram').trim() || 'instagram';
  const preserveTriagem = body?.preserve_triagem === true;
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
        params: {
          imported: true,
          via: 'leads-import-profiles',
          contract_version: String(body?.contract_version ?? 'legacy'),
          external_run_id: body?.external_run_id ?? null,
          source_file_name: body?.source_file_name ?? null,
        },
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

    // Lixeira (anti-recidiva): perfis "excluídos de vez" não voltam pro staging.
    const { data: excludedRows } = await sb
      .from('platform_crm_lead_excluded').select('handle').eq('product_id', productId);
    const excludedHandles = new Set(
      (excludedRows ?? []).map((r: any) => String(r.handle ?? '').replace(/^@/, '')).filter(Boolean),
    );

    // Universo multi-fase (anti-reinjeção): todo contato já visto em QUALQUER
    // fase do funil — inclusive `contatado`/`remarketing`, que antes escapavam
    // do dedup e voltavam como lead novo a cada extração.
    // A extração corrente é ignorada para preservar a idempotência de
    // reenvio/paginação do mesmo lote.
    const seenHandles = new Set<string>();
    {
      const { data: universeRows, error: uErr } = await sb
        .from('platform_crm_lead_universe')
        .select('telefone_digits, handle, extraction_id')
        .eq('product_id', productId);
      if (uErr) throw new Error(`lead_universe: ${uErr.message}`);
      for (const r of (universeRows ?? []) as Array<Record<string, unknown>>) {
        if (r.extraction_id && String(r.extraction_id) === String(extractionId)) continue;
        const h = String(r.handle ?? '').replace(/^@/, '').toLowerCase();
        if (h) seenHandles.add(h);
      }
    }

    // Normaliza + dedup por handle dentro do batch (mesma lógica do webhook).
    const byHandle = new Map<string, Record<string, unknown>>();
    const rowResults: Array<{ index: number; status: 'accepted' | 'error' | 'skipped'; reason?: string }> = [];
    let optedOut = 0, noHandle = 0, jaNoFunil = 0;
    for (const [index, item] of profiles.entries()) {
      let card: ReturnType<typeof buildLeadCard>;
      try {
        card = buildLeadCard(item);
      } catch (_) {
        rowResults.push({ index, status: 'error', reason: 'invalid_record' });
        continue;
      }
      if (!card.handle) { noHandle++; rowResults.push({ index, status: 'error', reason: 'missing_handle' }); continue; }
      if (
        optoutHandles.has(card.handle) ||
        excludedHandles.has(card.handle) ||
        (card.telefone && optoutPhones.has(card.telefone))
      ) {
        optedOut++;
        rowResults.push({ index, status: 'skipped', reason: 'suppressed_or_excluded' });
        continue;
      }
      const requestedTriagem = isCanonicalTriage((item as any)?.triagem)
        ? String((item as any).triagem)
        : null;
      if (preserveTriagem && !requestedTriagem) {
        rowResults.push({ index, status: 'error', reason: 'invalid_triagem' });
        continue;
      }

      // Handle repetido é idempotência. Telefone repetido com handle novo é
      // permitido: o resolver liga o novo perfil ao mesmo card canônico.
      if (seenHandles.has(card.handle.toLowerCase())) {
        jaNoFunil++;
        rowResults.push({ index, status: 'skipped', reason: 'already_in_universe' });
        continue;
      }
      const q = qualifyLead(item, card);
      const triagem = preserveTriagem && requestedTriagem
        ? requestedTriagem
        : triageFromLegacySegment(q.segment);
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
        triagem,
        triagem_source: preserveTriagem ? 'imported_classifier' : 'classifier',
        triagem_at: new Date().toISOString(),
        is_seed: q.is_seed,
        is_infoproduto: q.is_infoproduto,
        phone_is_br: q.phone_is_br,
        geo_country: q.geo_country,
        bio_lang: q.bio_lang,
        filter_verdicts: q.filter_verdicts,
        raw: item,
      });
      rowResults.push({ index, status: 'accepted' });
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

    // Persistência canônica: todo estado de triagem tem card na Base. A
    // elegibilidade para pré-seleção/campanha é uma regra separada do CRM.
    const { data: stagedRows, error: stagedError } = await sb
      .from('platform_crm_extracted_leads')
      .select('id, product_id, handle, name, telefone, segment, triagem, imported_to_lead_id')
      .eq('extraction_id', extractionId)
      .is('imported_to_lead_id', null)
      .limit(100);
    if (stagedError) throw new Error(`read staged rows: ${stagedError.message}`);

    let linked = 0;
    let createdCards = 0;
    let groupedByPhone = 0;
    for (const staged of (stagedRows ?? []) as ExtractedLeadForResolution[]) {
      const result = await resolveExtractedLeadIdentity(sb, staged);
      if (result.status === 'linked_existing' || result.status === 'skipped') linked++;
      if (result.status === 'created') createdCards++;
      if (result.groupedByPhone) groupedByPhone++;
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
      `[leads-import-profiles] extraction=${extractionId} received=${profiles.length} staged=${rows.length} qualified=${qualified} seeds=${seeds} cliente=${seg.salao_cliente} afiliado=${seg.afiliado_infoproduto} revisao=${seg.revisao} descarte=${seg.descarte} with_phone=${withPhone} opted_out=${optedOut} ja_no_funil=${jaNoFunil} no_handle=${noHandle} total_now=${count}`,
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
      linked,
      created_cards: createdCards,
      grouped_by_phone: groupedByPhone,
      row_results: rowResults,
      opted_out: optedOut,
      ja_no_funil: jaNoFunil,
      no_handle: noHandle,
      total_now: count,
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    console.error('[leads-import-profiles] error:', msg);
    return json({ ok: false, error: msg, extraction_id: extractionId }, 200);
  }
});
