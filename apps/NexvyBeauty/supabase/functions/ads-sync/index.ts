// ads-sync — puxa campanhas/adsets/ads/insights da Meta Graph e faz UPSERT
// idempotente (NexvyAds F1). Auth: super_admin. Product-scoped, ZERO organization_id.
// Recebe {product_id} ou {connection_id} (+ date_preset|time_range opcionais).
// Idempotência garantida pelos UNIQUEs do schema:
//   ads_campaigns(account_id,external_id) · ads_adsets(campaign_id,external_id)
//   ads_ads(adset_id,external_id) · ads_metrics(account_id,level,external_entity_id,date_start)
// Deriva cpa (spend/conversions) e roas (conversion_value/spend) quando possível.
// Segurança (§11): token só decifrado em memória; NUNCA logado.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GRAPH_BASE, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Ações de conversão que contam como "conversão" para cpa/roas. Meta expõe várias
// variações do mesmo evento de compra; somamos todas as que batem. (Assumido —
// ajustável quando a casa fixar o evento de otimização canônico.)
const PURCHASE_ACTION_TYPES = new Set([
  'purchase',
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_web_purchase',
  'onsite_conversion.purchase',
]);

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

interface ActionItem { action_type: string; value: string }
function sumActions(actions: ActionItem[] | undefined): number | null {
  if (!Array.isArray(actions)) return null;
  let total = 0, matched = false;
  for (const a of actions) {
    if (PURCHASE_ACTION_TYPES.has(a?.action_type)) {
      total += Number(a.value) || 0;
      matched = true;
    }
  }
  return matched ? total : null;
}

// Segue paginação (paging.next) acumulando data[]. Guard de páginas p/ não travar.
async function fetchAll<T = any>(path: string, token: string, maxPages = 25): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  let pages = 0;
  while (url && pages < maxPages) {
    const body: { data?: T[]; paging?: { next?: string } } = await graphFetch(url, token);
    if (Array.isArray(body?.data)) out.push(...body.data);
    url = body?.paging?.next ?? null;
    pages++;
  }
  return out;
}

const CAMPAIGN_FIELDS = 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,buying_type,start_time,stop_time';
const ADSET_FIELDS = 'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_amount,targeting,start_time,end_time,campaign_id';
const AD_FIELDS = 'id,name,status,effective_status,creative,preview_shareable_link,adset_id,campaign_id';
const INSIGHT_FIELDS = 'impressions,clicks,reach,spend,cpc,cpm,ctr,actions,action_values,date_start,date_stop,account_id,campaign_id,adset_id,ad_id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const connectionId = String(body?.connection_id ?? '').trim();
  const productId = String(body?.product_id ?? '').trim();
  if (!connectionId && !productId) return json({ error: 'informe connection_id ou product_id' }, 400);
  if (connectionId && !UUID_RE.test(connectionId)) return json({ error: 'connection_id invalido (esperado UUID)' }, 400);
  if (productId && !UUID_RE.test(productId)) return json({ error: 'product_id invalido (esperado UUID)' }, 400);

  // Janela de insights: time_range {since,until} tem prioridade sobre date_preset.
  const datePreset = String(body?.date_preset ?? 'last_30d');
  const timeRange = body?.time_range && body.time_range.since && body.time_range.until
    ? { since: String(body.time_range.since), until: String(body.time_range.until) }
    : null;

  // Resolve a conexão (por id direto ou a conexão meta ativa do produto).
  let connQuery = sb.from('ads_platform_connections').select('id, product_id, access_token_encrypted, status');
  connQuery = connectionId
    ? connQuery.eq('id', connectionId)
    : connQuery.eq('product_id', productId).eq('platform', 'meta').eq('status', 'active').order('created_at', { ascending: false });
  const { data: conn } = await connQuery.limit(1).maybeSingle();
  if (!conn) return json({ error: 'conexao nao encontrada' }, 404);
  if (!conn.access_token_encrypted) return json({ error: 'conexao sem token — refaca o OAuth' }, 200);

  let token: string;
  try {
    token = await decryptSecret(conn.access_token_encrypted);
  } catch (_e) {
    await sb.from('ads_platform_connections').update({ status: 'error', last_error: 'falha ao decifrar token' }).eq('id', conn.id);
    return json({ error: 'falha ao decifrar token' }, 200);
  }

  const { data: accounts } = await sb
    .from('ads_accounts')
    .select('id, product_id, external_account_id')
    .eq('connection_id', conn.id)
    .eq('is_active', true);
  if (!accounts || accounts.length === 0) return json({ error: 'nenhuma ad account nesta conexao' }, 200);

  const summary = { accounts: 0, campaigns: 0, adsets: 0, ads: 0, metrics_rows: 0 };
  const nowIso = new Date().toISOString();

  const insightsQS = () => {
    const p = new URLSearchParams({ fields: INSIGHT_FIELDS, limit: '500' });
    if (timeRange) p.set('time_range', JSON.stringify(timeRange));
    else p.set('date_preset', datePreset);
    return p.toString();
  };

  try {
    for (const acc of accounts) {
      summary.accounts++;
      const actId = acc.external_account_id; // já vem como "act_<id>"

      // ── Campanhas ──────────────────────────────────────────────────────────
      const campaigns = await fetchAll<any>(`/${actId}/campaigns?fields=${CAMPAIGN_FIELDS}&limit=200`, token);
      if (campaigns.length > 0) {
        const rows = campaigns.map((c) => ({
          product_id: acc.product_id,
          account_id: acc.id,
          connection_id: conn.id,
          external_id: String(c.id),
          name: c.name ?? null,
          objective: c.objective ?? null,
          status: c.status ?? null,
          effective_status: c.effective_status ?? null,
          daily_budget: num(c.daily_budget),
          lifetime_budget: num(c.lifetime_budget),
          buying_type: c.buying_type ?? null,
          start_time: c.start_time ?? null,
          stop_time: c.stop_time ?? null,
          raw: c,
          synced_at: nowIso,
        }));
        const { error } = await sb.from('ads_campaigns').upsert(rows, { onConflict: 'account_id,external_id' });
        if (error) throw new Error(`ads_campaigns: ${error.message}`);
        summary.campaigns += rows.length;
      }
      // mapa external_id -> uuid interno (necessário p/ FK de adsets/ads)
      const { data: campRows } = await sb.from('ads_campaigns').select('id, external_id').eq('account_id', acc.id);
      const campMap = new Map<string, string>((campRows ?? []).map((r: any) => [r.external_id, r.id]));

      // ── Ad sets ────────────────────────────────────────────────────────────
      const adsets = await fetchAll<any>(`/${actId}/adsets?fields=${ADSET_FIELDS}&limit=200`, token);
      const validAdsets = adsets.filter((s) => campMap.has(String(s.campaign_id)));
      if (validAdsets.length > 0) {
        const rows = validAdsets.map((s) => ({
          product_id: acc.product_id,
          campaign_id: campMap.get(String(s.campaign_id))!,
          account_id: acc.id,
          external_id: String(s.id),
          name: s.name ?? null,
          status: s.status ?? null,
          effective_status: s.effective_status ?? null,
          daily_budget: num(s.daily_budget),
          lifetime_budget: num(s.lifetime_budget),
          optimization_goal: s.optimization_goal ?? null,
          billing_event: s.billing_event ?? null,
          bid_amount: num(s.bid_amount),
          targeting: s.targeting ?? {},
          start_time: s.start_time ?? null,
          end_time: s.end_time ?? null,
          raw: s,
          synced_at: nowIso,
        }));
        const { error } = await sb.from('ads_adsets').upsert(rows, { onConflict: 'campaign_id,external_id' });
        if (error) throw new Error(`ads_adsets: ${error.message}`);
        summary.adsets += rows.length;
      }
      const { data: adsetRows } = await sb.from('ads_adsets').select('id, external_id').eq('account_id', acc.id);
      const adsetMap = new Map<string, string>((adsetRows ?? []).map((r: any) => [r.external_id, r.id]));

      // ── Ads ────────────────────────────────────────────────────────────────
      const ads = await fetchAll<any>(`/${actId}/ads?fields=${AD_FIELDS}&limit=200`, token);
      const validAds = ads.filter((a) => adsetMap.has(String(a.adset_id)) && campMap.has(String(a.campaign_id)));
      if (validAds.length > 0) {
        const rows = validAds.map((a) => ({
          product_id: acc.product_id,
          adset_id: adsetMap.get(String(a.adset_id))!,
          campaign_id: campMap.get(String(a.campaign_id))!,
          account_id: acc.id,
          external_id: String(a.id),
          name: a.name ?? null,
          status: a.status ?? null,
          effective_status: a.effective_status ?? null,
          creative: a.creative ?? {},
          preview_url: a.preview_shareable_link ?? null,
          raw: a,
          synced_at: nowIso,
        }));
        const { error } = await sb.from('ads_ads').upsert(rows, { onConflict: 'adset_id,external_id' });
        if (error) throw new Error(`ads_ads: ${error.message}`);
        summary.ads += rows.length;
      }
      const { data: adRows } = await sb.from('ads_ads').select('id, external_id').eq('account_id', acc.id);
      const adMap = new Map<string, string>((adRows ?? []).map((r: any) => [r.external_id, r.id]));

      // ── Insights (métricas) por nível ────────────────────────────────────────
      // Um row agregado por entidade no range (sem time_increment): date_start =
      // início do range. external_entity_id + level + date_start compõem o UNIQUE.
      const levels: Array<{ level: string; entity: (r: any) => string | null; link: (r: any) => Record<string, string | null> }> = [
        { level: 'account', entity: () => actId, link: () => ({}) },
        { level: 'campaign', entity: (r) => (r.campaign_id ? String(r.campaign_id) : null), link: (r) => ({ campaign_id: campMap.get(String(r.campaign_id)) ?? null }) },
        { level: 'adset', entity: (r) => (r.adset_id ? String(r.adset_id) : null), link: (r) => ({ adset_id: adsetMap.get(String(r.adset_id)) ?? null, campaign_id: campMap.get(String(r.campaign_id)) ?? null }) },
        { level: 'ad', entity: (r) => (r.ad_id ? String(r.ad_id) : null), link: (r) => ({ ad_id: adMap.get(String(r.ad_id)) ?? null, adset_id: adsetMap.get(String(r.adset_id)) ?? null, campaign_id: campMap.get(String(r.campaign_id)) ?? null }) },
      ];

      for (const lv of levels) {
        const insights = await fetchAll<any>(`/${actId}/insights?level=${lv.level}&${insightsQS()}`, token);
        const rows = insights.map((r) => {
          const entity = lv.entity(r);
          if (!entity || !r.date_start) return null;
          const spend = num(r.spend);
          const conversions = sumActions(r.actions);
          const conversionValue = sumActions(r.action_values);
          const cpa = spend !== null && conversions && conversions > 0 ? spend / conversions : null;
          const roas = spend !== null && spend > 0 && conversionValue !== null ? conversionValue / spend : null;
          return {
            product_id: acc.product_id,
            account_id: acc.id,
            level: lv.level,
            external_entity_id: entity,
            ...lv.link(r),
            date_start: r.date_start,
            impressions: int(r.impressions),
            clicks: int(r.clicks),
            reach: int(r.reach),
            spend,
            cpc: num(r.cpc),
            cpm: num(r.cpm),
            ctr: num(r.ctr),
            conversions,
            conversion_value: conversionValue,
            cpa,
            roas,
            actions: Array.isArray(r.actions) ? r.actions : [],
            raw: r,
          };
        }).filter(Boolean) as Record<string, unknown>[];
        if (rows.length > 0) {
          const { error } = await sb.from('ads_metrics').upsert(rows, { onConflict: 'account_id,level,external_entity_id,date_start' });
          if (error) throw new Error(`ads_metrics(${lv.level}): ${error.message}`);
          summary.metrics_rows += rows.length;
        }
      }
    }

    await sb.from('ads_platform_connections').update({ status: 'active', last_error: null }).eq('id', conn.id);
    return json({ ok: true, ...summary });
  } catch (e) {
    const ge = e as GraphError;
    const msg = ge?.graph?.message ?? String((e as Error).message ?? e);
    await sb.from('ads_platform_connections').update({ status: 'error', last_error: msg.slice(0, 500) }).eq('id', conn.id);
    // Erro de negócio como HTTP 200 {error} (padrão do repo) + sumário parcial.
    return json({ ok: false, error: msg, ...summary }, 200);
  }
});
