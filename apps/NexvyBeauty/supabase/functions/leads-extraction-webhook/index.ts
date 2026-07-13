// leads-extraction-webhook — callback do Apify (C9 F0). verify_jwt=false (o Apify
// chama sem JWT — ver config.toml). Auth real = (1) extraction_id na query casa com
// uma linha em platform_crm_lead_extractions, (2) o run id do payload casa com o
// apify_run_id gravado, (3) o dataset só é lido com o APIFY_TOKEN do projeto (prova
// de posse). Baixa o dataset do run, normaliza cada perfil no card do prospectagram,
// respeita opt-out (Art.18) e faz upsert idempotente em platform_crm_extracted_leads.
//
// Segurança (§11): SERVICE_ROLE (bypass RLS) — mas sem gate de usuário porque quem
// chama é o Apify. NUNCA loga PII (nome/telefone/bio) — só contagens.
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  // 1) extraction_id da query.
  const extractionId = new URL(req.url).searchParams.get('extraction_id')?.trim() ?? '';
  if (!extractionId || !UUID_RE.test(extractionId)) {
    return json({ ignored: true, reason: 'extraction_id ausente/invalido' }, 200);
  }

  const payload = await req.json().catch(() => ({}));
  const eventType = String(payload?.eventType ?? '');
  const resource = payload?.resource ?? {};
  const runId = String(payload?.eventData?.actorRunId ?? resource?.id ?? '');

  // Ping de teste do Apify (sem resource/run) — responde 200 e sai.
  if (eventType === 'TEST' || (!runId && !resource?.defaultDatasetId)) {
    return json({ ok: true, test: true });
  }

  // 2) Casa a extração.
  const { data: job } = await sb
    .from('platform_crm_lead_extractions')
    .select('id, product_id, apify_run_id, keywords, status')
    .eq('id', extractionId)
    .maybeSingle();
  if (!job) return json({ ignored: true, reason: 'extraction nao encontrada' }, 200);

  // 3) Guard: o run id do payload PRECISA casar com o gravado no start.
  if (job.apify_run_id && runId && job.apify_run_id !== runId) {
    console.warn(`[leads-extraction-webhook] run mismatch extraction=${job.id}`);
    return json({ ignored: true, reason: 'run id divergente' }, 200);
  }

  // Run falhou/abortou → marca error e sai.
  if (FAIL_EVENTS.has(eventType)) {
    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: eventType })
      .eq('id', job.id);
    return json({ ok: true, status: 'error', event: eventType });
  }

  const datasetId = String(resource?.defaultDatasetId ?? '');
  if (!datasetId) {
    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: 'sem defaultDatasetId no payload' })
      .eq('id', job.id);
    return json({ ok: false, error: 'sem defaultDatasetId' }, 200);
  }

  try {
    const token = getApifyToken();
    const items = await fetchDatasetItems(datasetId, token);

    // Opt-out (Art.18): não estagia quem se opôs (por telefone ou @handle).
    const { data: optoutRows } = await sb
      .from('platform_crm_lead_optout')
      .select('handle, telefone')
      .eq('product_id', job.product_id);
    const optoutPhones = new Set(
      (optoutRows ?? []).map((r: any) => r.telefone).filter(Boolean),
    );
    const optoutHandles = new Set(
      (optoutRows ?? [])
        .map((r: any) => (r.handle ? String(r.handle).replace(/^@/, '') : null))
        .filter(Boolean),
    );

    const keywords: string[] = Array.isArray(job.keywords) ? job.keywords : [];

    // Normaliza + dedup por handle dentro do batch.
    const byHandle = new Map<string, Record<string, unknown>>();
    let optedOut = 0;
    let noHandle = 0;
    for (const item of items) {
      const card = buildLeadCard(item);
      if (!card.handle) {
        noHandle++;
        continue;
      }
      if (optoutHandles.has(card.handle) || (card.telefone && optoutPhones.has(card.telefone))) {
        optedOut++;
        continue;
      }
      // Qualificação por camadas (ICP · idioma · GEO · telefone). Estagia TODOS
      // com o veredito; a UI/import usa só qualified=true.
      const q = qualifyLead(item, card);
      byHandle.set(card.handle, {
        extraction_id: job.id,
        product_id: job.product_id,
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
        is_infoproduto: q.is_infoproduto,
        phone_is_br: q.phone_is_br,
        geo_country: q.geo_country,
        bio_lang: q.bio_lang,
        filter_verdicts: q.filter_verdicts,
        raw: item,
      });
    }

    const rows = Array.from(byHandle.values());
    let withPhone = 0;
    let qualified = 0;
    const seg: Record<string, number> = { salao_cliente: 0, afiliado_infoproduto: 0, revisao: 0, descarte: 0 };
    for (const r of rows) {
      if (r.telefone) withPhone++;
      if (r.qualified) qualified++;
      const s = String(r.segment ?? 'descarte');
      seg[s] = (seg[s] ?? 0) + 1;
    }

    if (rows.length > 0) {
      const { error: upErr } = await sb
        .from('platform_crm_extracted_leads')
        .upsert(rows, { onConflict: 'extraction_id,handle' });
      if (upErr) throw new Error(`upsert staging: ${upErr.message}`);
    }

    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'done', total_found: rows.length, last_error: null })
      .eq('id', job.id);

    // Só contagens no log (nunca PII).
    console.log(
      `[leads-extraction-webhook] extraction=${job.id} dataset_items=${items.length} staged=${rows.length} qualified=${qualified} cliente=${seg.salao_cliente} afiliado=${seg.afiliado_infoproduto} revisao=${seg.revisao} descarte=${seg.descarte} with_phone=${withPhone} opted_out=${optedOut} no_handle=${noHandle}`,
    );
    return json({
      ok: true,
      extraction_id: job.id,
      dataset_items: items.length,
      staged: rows.length,
      qualified,
      segments: seg,
      with_phone: withPhone,
      opted_out: optedOut,
    });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await sb
      .from('platform_crm_lead_extractions')
      .update({ status: 'error', last_error: msg })
      .eq('id', job.id);
    console.error('[leads-extraction-webhook] error:', msg);
    // 200 p/ o Apify não entrar em loop de retry (o error fica registrado no job).
    return json({ ok: false, error: msg }, 200);
  }
});
