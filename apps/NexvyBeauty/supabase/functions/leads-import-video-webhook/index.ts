// leads-import-video-webhook — callback do Apify para a Importação por vídeo.
// verify_jwt=false (o Apify chama sem JWT — ver config.toml). Auth real =
// (1) extraction_id na query casa com a busca "dona do run" (c/ wpp),
// (2) o run id do payload está nos run_ids gravados no start (prova de origem),
// (3) o dataset só é lido com o APIFY_TOKEN do projeto (prova de posse).
//
// Diferença vs. leads-extraction-webhook: DISTRIBUI cada lead enriquecido em DUAS
// buscas do dia — "… - c/ wpp" (a própria dona) e "… - s/ wpp" (params.sibling_swpp)
// conforme o telefone FINAL. Reusa buildLeadCard/qualifyLead/fetchDatasetItems do
// _shared (o webhook padrão fica intocado). Segurança (§11): SERVICE_ROLE, nunca loga PII.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { platformCrmCorsHeaders as corsHeaders } from '../_shared/platform-crm-auth.ts';
import {
  getApifyToken,
  fetchDatasetItems,
  buildLeadCard,
  qualifyLead,
} from '../_shared/apify-leads.ts';

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

  const cwppId = new URL(req.url).searchParams.get('extraction_id')?.trim() ?? '';
  if (!cwppId || !UUID_RE.test(cwppId)) {
    return json({ ignored: true, reason: 'extraction_id ausente/invalido' }, 200);
  }

  const payload = await req.json().catch(() => ({}));
  const eventType = String(payload?.eventType ?? '');
  const resource = payload?.resource ?? {};
  const runId = String(payload?.eventData?.actorRunId ?? resource?.id ?? '');

  if (eventType === 'TEST' || (!runId && !resource?.defaultDatasetId)) {
    return json({ ok: true, test: true });
  }

  // Busca "dona do run" (c/ wpp) — traz sibling_swpp + run_ids + day.
  const { data: cwpp } = await sb
    .from('platform_crm_lead_extractions')
    .select('id, product_id, apify_run_id, params')
    .eq('id', cwppId)
    .maybeSingle();
  if (!cwpp) return json({ ignored: true, reason: 'extraction nao encontrada' }, 200);

  const params = cwpp.params ?? {};
  const swppId = String(params?.sibling_swpp ?? '');
  const runIds: string[] = Array.isArray(params?.run_ids) ? params.run_ids : [];
  const day = String(params?.day ?? '');

  // Guard: o run id PRECISA estar entre os disparados (suporta append no mesmo dia).
  const runOk = runId && (runIds.includes(runId) || cwpp.apify_run_id === runId);
  if (!runOk) {
    console.warn(`[leads-import-video-webhook] run mismatch cwpp=${cwppId}`);
    return json({ ignored: true, reason: 'run id divergente' }, 200);
  }

  if (!UUID_RE.test(swppId)) {
    return json({ ignored: true, reason: 'sibling_swpp ausente/invalido' }, 200);
  }

  if (FAIL_EVENTS.has(eventType)) {
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: eventType }).in('id', [cwppId, swppId]);
    return json({ ok: true, status: 'error', event: eventType });
  }

  const datasetId = String(resource?.defaultDatasetId ?? '');
  if (!datasetId) {
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: 'sem defaultDatasetId no payload' }).in('id', [cwppId, swppId]);
    return json({ ok: false, error: 'sem defaultDatasetId' }, 200);
  }

  try {
    const token = getApifyToken();
    const items = await fetchDatasetItems(datasetId, token);

    // Opt-out (Art.18) + lixeira (anti-recidiva), product-scoped.
    const { data: optoutRows } = await sb
      .from('platform_crm_lead_optout').select('handle, telefone').eq('product_id', cwpp.product_id);
    const optoutPhones = new Set((optoutRows ?? []).map((r: any) => r.telefone).filter(Boolean));
    const optoutHandles = new Set(
      (optoutRows ?? []).map((r: any) => (r.handle ? String(r.handle).replace(/^@/, '') : null)).filter(Boolean),
    );
    const { data: excludedRows } = await sb
      .from('platform_crm_lead_excluded').select('handle').eq('product_id', cwpp.product_id);
    const excludedHandles = new Set(
      (excludedRows ?? []).map((r: any) => String(r.handle ?? '').replace(/^@/, '')).filter(Boolean),
    );

    const labelCwpp = `Extração vídeo ${day} - c/ wpp`;
    const labelSwpp = `Extração vídeo ${day} - s/ wpp`;

    // Normaliza + dedup por handle DENTRO do batch, distribuindo por wpp.
    const byKey = new Map<string, Record<string, unknown>>();
    let optedOut = 0, noHandle = 0;
    for (const item of items) {
      const card = buildLeadCard(item);
      if (!card.handle) { noHandle++; continue; }
      if (optoutHandles.has(card.handle) || excludedHandles.has(card.handle) ||
          (card.telefone && optoutPhones.has(card.telefone))) { optedOut++; continue; }

      const q = qualifyLead(item, card);
      const target = card.telefone ? cwppId : swppId;
      const label = card.telefone ? labelCwpp : labelSwpp;
      byKey.set(`${target}|${card.handle}`, {
        extraction_id: target,
        product_id: cwpp.product_id,
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
    let withPhone = 0;
    for (const r of rows) if (r.telefone) withPhone++;

    if (rows.length > 0) {
      const { error: upErr } = await sb
        .from('platform_crm_extracted_leads')
        .upsert(rows, { onConflict: 'extraction_id,handle' });
      if (upErr) throw new Error(`upsert staging: ${upErr.message}`);
    }

    // Recontagem real de cada busca (idempotente com append).
    const totalCwpp = await countLeads(sb, cwppId);
    const totalSwpp = await countLeads(sb, swppId);
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'done', total_found: totalCwpp, last_error: null }).eq('id', cwppId);
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'done', total_found: totalSwpp, last_error: null }).eq('id', swppId);

    console.log(
      `[leads-import-video-webhook] cwpp=${cwppId} day=${day} dataset_items=${items.length} staged=${rows.length} c_wpp=${withPhone} s_wpp=${rows.length - withPhone} total_cwpp=${totalCwpp} total_swpp=${totalSwpp} opted_out=${optedOut} no_handle=${noHandle}`,
    );
    return json({
      ok: true, extraction_id: cwppId, swpp_extraction_id: swppId,
      dataset_items: items.length, staged: rows.length,
      com_wpp: withPhone, sem_wpp: rows.length - withPhone,
      total_cwpp: totalCwpp, total_swpp: totalSwpp, opted_out: optedOut,
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await sb.from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: msg }).in('id', [cwppId, swppId]);
    console.error('[leads-import-video-webhook] error:', msg);
    return json({ ok: false, error: msg }, 200);
  }
});
