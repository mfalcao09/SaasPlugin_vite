// leads-import-video-webhook — callback do Apify para a Importação por vídeo.
// verify_jwt=false (o Apify chama sem JWT — ver config.toml). Auth real =
// (1) extraction_id na query casa com a busca "dona do run",
// (2) o run id do payload está nos run_ids gravados no start (prova de origem),
// (3) o dataset só é lido com o APIFY_TOKEN do projeto (prova de posse).
//
// Contrato 2026-07-19: INSERE todos os leads numa ÚNICA busca "Extração vídeo <data>"
// (ingestão é dona da busca + do segment NO NASCIMENTO). A aba com/link/sem whatsapp é
// DERIVADA em runtime via classifyWhatsapp no read — NÃO há split físico c/s aqui. O
// enriquecimento posterior nunca toca segment/extraction_id (propriedade por coluna).
// Reusa buildLeadCard/qualifyLead/fetchDatasetItems do _shared. Segurança (§11): SERVICE_ROLE, nunca loga PII.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { platformCrmCorsHeaders as corsHeaders } from '../_shared/platform-crm-auth.ts';
import {
  getApifyToken,
  fetchDatasetItems,
  buildLeadCard,
  qualifyLead,
} from '../_shared/apify-leads.ts';
import { classifyWhatsapp } from '../_shared/lead-geo.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAIL_EVENTS = new Set(['ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED']);

async function countLeads(sb: any, extractionId: string): Promise<number> {
  const { count } = await sb
    .from('platform_crm_extracted_leads')
    .select('*', { count: 'exact', head: true })
    .eq('extraction_id', extractionId)
    .is('excluded_at', null);
  return count ?? 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const bucketId = new URL(req.url).searchParams.get('extraction_id')?.trim() ?? '';
  if (!bucketId || !UUID_RE.test(bucketId)) {
    return json({ ignored: true, reason: 'extraction_id ausente/invalido' }, 200);
  }

  const payload = await req.json().catch(() => ({}));
  const eventType = String(payload?.eventType ?? '');
  const resource = payload?.resource ?? {};
  const runId = String(payload?.eventData?.actorRunId ?? resource?.id ?? '');

  if (eventType === 'TEST' || (!runId && !resource?.defaultDatasetId)) {
    return json({ ok: true, test: true });
  }

  // Busca dona do run — traz run_ids + day (prova de origem do webhook).
  const { data: bucket } = await sb
    .from('platform_crm_lead_extractions')
    .select('id, product_id, apify_run_id, params')
    .eq('id', bucketId)
    .maybeSingle();
  if (!bucket) return json({ ignored: true, reason: 'extraction nao encontrada' }, 200);

  const params = bucket.params ?? {};
  const runIds: string[] = Array.isArray(params?.run_ids) ? params.run_ids : [];
  const day = String(params?.day ?? '');

  // Guard: o run id PRECISA estar entre os disparados (suporta append no mesmo dia).
  const runOk = runId && (runIds.includes(runId) || bucket.apify_run_id === runId);
  if (!runOk) {
    console.warn(`[leads-import-video-webhook] run mismatch bucket=${bucketId}`);
    return json({ ignored: true, reason: 'run id divergente' }, 200);
  }

  if (FAIL_EVENTS.has(eventType)) {
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: eventType }).eq('id', bucketId);
    return json({ ok: true, status: 'error', event: eventType });
  }

  const datasetId = String(resource?.defaultDatasetId ?? '');
  if (!datasetId) {
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: 'sem defaultDatasetId no payload' }).eq('id', bucketId);
    return json({ ok: false, error: 'sem defaultDatasetId' }, 200);
  }

  try {
    const token = getApifyToken();
    const items = await fetchDatasetItems(datasetId, token);

    // Opt-out (Art.18) + lixeira (anti-recidiva), product-scoped.
    const { data: optoutRows } = await sb
      .from('platform_crm_lead_optout').select('handle, telefone').eq('product_id', bucket.product_id);
    const optoutPhones = new Set((optoutRows ?? []).map((r: any) => r.telefone).filter(Boolean));
    const optoutHandles = new Set(
      (optoutRows ?? []).map((r: any) => (r.handle ? String(r.handle).replace(/^@/, '') : null)).filter(Boolean),
    );
    const { data: excludedRows } = await sb
      .from('platform_crm_lead_excluded').select('handle').eq('product_id', bucket.product_id);
    const excludedHandles = new Set(
      (excludedRows ?? []).map((r: any) => String(r.handle ?? '').replace(/^@/, '')).filter(Boolean),
    );

    const label = `Extração vídeo ${day}`;

    // Normaliza + dedup por handle DENTRO do batch. TODOS os leads vão pra 1 busca;
    // a aba (numero/link/nenhum) é derivada no read via classifyWhatsapp — nunca gravada.
    // segment É gravado aqui porque isto é INGESTÃO (nascimento do lead); só o
    // enriquecimento posterior é proibido de tocar segment (propriedade por coluna).
    const byKey = new Map<string, Record<string, unknown>>();
    let optedOut = 0, noHandle = 0;
    for (const item of items) {
      const card = buildLeadCard(item);
      if (!card.handle) { noHandle++; continue; }
      if (optoutHandles.has(card.handle) || excludedHandles.has(card.handle) ||
          (card.telefone && optoutPhones.has(card.telefone))) { optedOut++; continue; }

      const q = qualifyLead(item, card);
      byKey.set(`${bucketId}|${card.handle}`, {
        extraction_id: bucketId,
        product_id: bucket.product_id,
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
        palavras_chave: [label],
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

    const rows = Array.from(byKey.values());

    // Telemetria 3-estados via classificador ÚNICO (consome classifyWhatsapp, não reimplementa).
    // É só p/ log/resposta — a aba real é derivada no read pelo CRM; nada disto é persistido.
    let n_numero = 0, n_link = 0, n_nenhum = 0;
    for (const r of rows) {
      const w = classifyWhatsapp({
        telefone: (r.telefone as string | null) ?? null,
        whatsapp_link: (r.whatsapp_link as string | null) ?? null,
        raw: r.raw,
      });
      if (w.state === 'numero') n_numero++;
      else if (w.state === 'link') n_link++;
      else n_nenhum++;
    }

    if (rows.length > 0) {
      const { error: upErr } = await sb
        .from('platform_crm_extracted_leads')
        .upsert(rows, { onConflict: 'extraction_id,handle' });
      if (upErr) throw new Error(`upsert staging: ${upErr.message}`);
    }

    // Recontagem real da busca (idempotente com append de várias importações no mesmo dia).
    const total = await countLeads(sb, bucketId);
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'done', total_found: total, last_error: null }).eq('id', bucketId);

    console.log(
      `[leads-import-video-webhook] bucket=${bucketId} day=${day} dataset_items=${items.length} staged=${rows.length} numero=${n_numero} link=${n_link} nenhum=${n_nenhum} total=${total} opted_out=${optedOut} no_handle=${noHandle}`,
    );
    return json({
      ok: true, extraction_id: bucketId,
      dataset_items: items.length, staged: rows.length,
      numero: n_numero, link: n_link, nenhum: n_nenhum,
      total, opted_out: optedOut,
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: msg }).eq('id', bucketId);
    console.error('[leads-import-video-webhook] error:', msg);
    return json({ ok: false, error: msg }, 200);
  }
});
