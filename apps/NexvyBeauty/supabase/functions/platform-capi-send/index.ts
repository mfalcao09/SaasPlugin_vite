// platform-capi-send — dispatcher da Conversions API (Meta) do funil Ads Inbound
// (Click-to-WhatsApp · gap G4). Devolve ao Meta as conversões do funil de 6
// eventos (LeadSubmitted/QualifiedLead/ViewContent/InitiateCheckout/Purchase) com
// o ctwa_clid, pra o Advantage+ aprender a buscar dona-que-COMPRA em vez de
// curioso-que-manda-oi.
//
// DESACOPLADO (não edita webhook/brain/esteira/cakto): lê os eventos de jornada
// que TODOS eles já emitem (platform_crm_journey_events) via a função SQL
// ads_capi_pending() — que já resolve o ctwa_clid pela ads_attribution e filtra
// quem ainda não foi enviado (anti-join em ads_capi_events por journey_event_id).
//
// GATED OFF por default: CAPI_ENABLED != 'true' → modo DRY-RUN (monta e persiste
// o payload em ads_capi_events.status='dry_run', SEM tocar a rede). Ligar exige
// CAPI_ENABLED=true + META_CAPI_TOKEN + META_CAPI_DATASET_ID + META_CAPI_WABA_ID
// (secrets server-side; o token NUNCA sai do servidor).
//
// Auth server-to-server: service-role key (Authorization/apikey) OU x-brain-secret
// == BRAIN_INTERNAL_SECRET. Invocação: cron (dispatcher) ou manual. Idempotente
// por event_id (índice único em ads_capi_events).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GRAPH_BASE, timingSafeEqual } from '../_shared/meta-graph.ts';
import { buildCapiPayload, type CapiConfig } from '../_shared/capi-payload.ts';

type Json = Record<string, unknown>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function getServiceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/** Auth de máquina: service-role OU x-brain-secret (verify_jwt=false). */
function isAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const brainSecret = Deno.env.get('BRAIN_INTERNAL_SECRET') ?? '';
  const brainHeader = req.headers.get('x-brain-secret') ?? '';
  if (brainSecret && brainHeader && timingSafeEqual(brainHeader, brainSecret)) return true;
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const apikey = req.headers.get('apikey') ?? '';
  if (serviceKey && ((bearer && timingSafeEqual(bearer, serviceKey)) || (apikey && timingSafeEqual(apikey, serviceKey)))) {
    return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = getServiceClient();

  const enabled = (Deno.env.get('CAPI_ENABLED') ?? '').toLowerCase() === 'true';
  const token = Deno.env.get('META_CAPI_TOKEN') ?? '';
  const datasetId = Deno.env.get('META_CAPI_DATASET_ID') ?? '';
  const wabaId = Deno.env.get('META_CAPI_WABA_ID') ?? '';
  const partnerAgent = Deno.env.get('CAPI_PARTNER_AGENT') ?? 'nexvybeauty';
  const limit = Number(Deno.env.get('CAPI_BATCH_LIMIT') ?? '100') || 100;
  const cfg: CapiConfig = { datasetId, wabaId, partnerAgent };

  // Envio real só quando ligado E com credenciais completas; senão DRY-RUN.
  const live = enabled && !!token && !!datasetId && !!wabaId;

  // 1) Puxa os eventos de jornada CTWA-atribuídos ainda não enviados.
  const { data: pending, error: pendErr } = await supabase.rpc('ads_capi_pending', { p_limit: limit });
  if (pendErr) {
    console.error('[platform-capi-send] ads_capi_pending falhou:', pendErr);
    return json({ error: 'pending_query_failed', detail: pendErr.message }, 500);
  }
  const rows = (pending as Array<Record<string, any>>) ?? [];

  let enqueued = 0, sent = 0, dryRun = 0, failed = 0, skipped = 0;

  for (const r of rows) {
    const built = buildCapiPayload(
      {
        journeyEventType: String(r.event_type),
        journeyEventId: String(r.journey_event_id),
        ctwaClid: String(r.ctwa_clid),
        eventTimeIso: r.occurred_at ?? null,
        value: r.value ?? null,
        currency: r.currency ?? null,
      },
      cfg,
    );
    if (!built) {
      skipped++;
      continue;
    }

    // 2) Enfileira em ads_capi_events (dedup duro por event_id). status inicial:
    //    'pending' se vai enviar agora; 'dry_run' se gated OFF (fica visível o
    //    payload que SERIA enviado, sem rede).
    const { data: ins, error: insErr } = await supabase
      .from('ads_capi_events')
      .insert({
        product_id: r.product_id,
        lead_id: r.lead_id,
        conversation_id: r.conversation_id,
        journey_event_id: r.journey_event_id,
        event_name: built.eventName,
        event_id: built.eventId,
        ctwa_clid: r.ctwa_clid,
        value: r.value ?? null,
        currency: r.currency ?? null,
        event_time: r.occurred_at ?? new Date().toISOString(),
        status: live ? 'pending' : 'dry_run',
        request: built.body,
      })
      .select('id')
      .single();
    if (insErr) {
      // 23505 = já enfileirado (corrida entre invocações) → não é erro.
      if (String(insErr.code).includes('23505')) skipped++;
      else {
        console.error('[platform-capi-send] insert ads_capi_events falhou (non-fatal):', insErr);
        failed++;
      }
      continue;
    }
    enqueued++;

    if (!live) {
      dryRun++;
      continue;
    }

    // 3) Envio real à Conversions API. Token só no servidor; nunca no corpo logado.
    try {
      const url = `${GRAPH_BASE}/${datasetId}/events?access_token=${encodeURIComponent(token)}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.body),
      });
      const respJson = (await resp.json().catch(() => ({}))) as Json;
      if (resp.ok) {
        await supabase
          .from('ads_capi_events')
          .update({ status: 'sent', response: respJson, sent_at: new Date().toISOString(), attempts: 1 })
          .eq('id', ins.id);
        sent++;
      } else {
        await supabase
          .from('ads_capi_events')
          .update({ status: 'failed', response: respJson, error: `HTTP ${resp.status}`, attempts: 1 })
          .eq('id', ins.id);
        failed++;
      }
    } catch (e) {
      await supabase
        .from('ads_capi_events')
        .update({ status: 'failed', error: String(e).slice(0, 300), attempts: 1 })
        .eq('id', ins.id);
      failed++;
    }
  }

  return json({
    ok: true,
    mode: live ? 'live' : 'dry_run',
    candidates: rows.length,
    enqueued,
    sent,
    dry_run: dryRun,
    failed,
    skipped,
  });
});
