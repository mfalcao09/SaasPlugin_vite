// ads-optimize — agente A2 (HITL) do NexvyAds. Lê ads_metrics (join com
// campaigns/adsets/ads p/ nomes/budgets), roda o motor PURO ads-optimize-rules e
// grava recomendações `pending` em ads_recommendations. NÃO muta nada externo
// (zero Graph) — geração é leitura + escrita interna, segura por natureza.
//
// Auth: super_admin (authenticatePlatformAgent), igual ads-sync. Product-scoped,
// ZERO organization_id. Input: { product_id, account_id?, lookback_days? }.
//
// Dedup: não recria recomendação `pending` idêntica (mesmo kind + mesmo alvo
// externo aberto). Retorna { generated, skipped }.
//
// Gate ADS_OPTIMIZE_ENABLED (default LIGADO): defina 'false' p/ desligar a
// geração sem remover a função.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';
import {
  DEFAULT_LOOKBACK_DAYS,
  generateRecommendations,
  type MetricsRow,
} from '../_shared/ads-optimize-rules.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Coluna uuid da recomendação p/ cada nível-alvo.
const LEVEL_COLUMN: Record<string, 'ad_id' | 'adset_id' | 'campaign_id'> = {
  ad: 'ad_id',
  adset: 'adset_id',
  campaign: 'campaign_id',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { errorResponse } = await authenticatePlatformAgent(req, sb, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  // Gate: default LIGADO. Só desliga com ADS_OPTIMIZE_ENABLED='false'.
  const enabled = (Deno.env.get('ADS_OPTIMIZE_ENABLED') ?? 'true').toLowerCase() !== 'false';
  if (!enabled) return json({ ok: true, disabled: true, generated: 0, skipped: 0 });

  const productId = String(body?.product_id ?? '').trim();
  if (!productId || !UUID_RE.test(productId)) return json({ error: 'product_id invalido (esperado UUID)' }, 400);
  const accountId = String(body?.account_id ?? '').trim();
  if (accountId && !UUID_RE.test(accountId)) return json({ error: 'account_id invalido (esperado UUID)' }, 400);

  const lookbackDays = Math.max(1, Math.min(90, Math.trunc(num(body?.lookback_days) ?? DEFAULT_LOOKBACK_DAYS)));
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // ── 1) Metadados das entidades (nomes, status, budgets, external ids) ──────
    const [accountsRes, campaignsRes, adsetsRes, adsRes] = await Promise.all([
      sb.from('ads_accounts').select('id, external_account_id').eq('product_id', productId),
      sb.from('ads_campaigns').select('id, external_id, name, status, effective_status, daily_budget, account_id').eq('product_id', productId),
      sb.from('ads_adsets').select('id, external_id, name, status, effective_status, daily_budget, account_id').eq('product_id', productId),
      sb.from('ads_ads').select('id, external_id, name, status, effective_status, adset_id, campaign_id, account_id').eq('product_id', productId),
    ]);
    for (const r of [accountsRes, campaignsRes, adsetsRes, adsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const accById = new Map<string, string>((accountsRes.data ?? []).map((a: any) => [a.id, a.external_account_id]));
    const campById = new Map<string, any>((campaignsRes.data ?? []).map((c: any) => [c.id, c]));
    const adsetById = new Map<string, any>((adsetsRes.data ?? []).map((s: any) => [s.id, s]));
    const adById = new Map<string, any>((adsRes.data ?? []).map((a: any) => [a.id, a]));

    // ── 2) Métricas na janela (agrega por entidade se houver múltiplos dias) ───
    let mq = sb
      .from('ads_metrics')
      .select('level, external_entity_id, account_id, campaign_id, adset_id, ad_id, spend, clicks, impressions, conversions, conversion_value, roas, date_start')
      .eq('product_id', productId)
      .gte('date_start', cutoff);
    if (accountId) mq = mq.eq('account_id', accountId);
    const { data: metricRows, error: mErr } = await mq;
    if (mErr) throw new Error(mErr.message);

    // Agregação por (level, external_entity_id): soma spend/clicks/impr/conv/value.
    interface Agg {
      level: string;
      externalEntityId: string;
      accountUuid: string;
      campaignUuid: string | null;
      adsetUuid: string | null;
      adUuid: string | null;
      spend: number;
      clicks: number;
      impressions: number;
      conversions: number;
      conversionValue: number;
    }
    const aggMap = new Map<string, Agg>();
    for (const r of (metricRows ?? []) as any[]) {
      const key = `${r.level}::${r.external_entity_id}`;
      const a = aggMap.get(key) ?? {
        level: r.level,
        externalEntityId: r.external_entity_id,
        accountUuid: r.account_id,
        campaignUuid: r.campaign_id ?? null,
        adsetUuid: r.adset_id ?? null,
        adUuid: r.ad_id ?? null,
        spend: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        conversionValue: 0,
      };
      a.spend += num(r.spend) ?? 0;
      a.clicks += num(r.clicks) ?? 0;
      a.impressions += num(r.impressions) ?? 0;
      a.conversions += num(r.conversions) ?? 0;
      a.conversionValue += num(r.conversion_value) ?? 0;
      // preserva os uuids de linkage se aparecerem em qualquer linha
      a.campaignUuid = a.campaignUuid ?? r.campaign_id ?? null;
      a.adsetUuid = a.adsetUuid ?? r.adset_id ?? null;
      a.adUuid = a.adUuid ?? r.ad_id ?? null;
      aggMap.set(key, a);
    }

    // ── 3) Normaliza p/ MetricsRow (merge com metadados) ──────────────────────
    const accountUuidByEntity = new Map<string, string>(); // externalEntityId → account uuid (p/ montar a rec)
    const rows: MetricsRow[] = [];
    for (const a of aggMap.values()) {
      const accountExternalId = accById.get(a.accountUuid) ?? a.accountUuid;
      accountUuidByEntity.set(a.externalEntityId, a.accountUuid);

      let entityUuid: string | null = null;
      let name: string | null = null;
      let status: string | null = null;
      let effectiveStatus: string | null = null;
      let dailyBudget: number | null = null;
      let parentAdsetExternalId: string | null = null;
      let parentCampaignExternalId: string | null = null;

      if (a.level === 'ad') {
        const meta = a.adUuid ? adById.get(a.adUuid) : null;
        entityUuid = a.adUuid;
        name = meta?.name ?? null;
        status = meta?.status ?? null;
        effectiveStatus = meta?.effective_status ?? null;
        const parentAdset = meta?.adset_id ? adsetById.get(meta.adset_id) : null;
        parentAdsetExternalId = parentAdset?.external_id ?? null;
        const parentCamp = meta?.campaign_id ? campById.get(meta.campaign_id) : null;
        parentCampaignExternalId = parentCamp?.external_id ?? null;
      } else if (a.level === 'adset') {
        const meta = a.adsetUuid ? adsetById.get(a.adsetUuid) : null;
        entityUuid = a.adsetUuid;
        name = meta?.name ?? null;
        status = meta?.status ?? null;
        effectiveStatus = meta?.effective_status ?? null;
        dailyBudget = num(meta?.daily_budget);
      } else if (a.level === 'campaign') {
        const meta = a.campaignUuid ? campById.get(a.campaignUuid) : null;
        entityUuid = a.campaignUuid;
        name = meta?.name ?? null;
        status = meta?.status ?? null;
        effectiveStatus = meta?.effective_status ?? null;
        dailyBudget = num(meta?.daily_budget);
      } else {
        continue; // account-level não gera recomendação
      }

      const roas = a.spend > 0 ? a.conversionValue / a.spend : null;
      rows.push({
        level: a.level as MetricsRow['level'],
        externalEntityId: a.externalEntityId,
        accountExternalId,
        entityUuid,
        name,
        status,
        effectiveStatus,
        spend: a.spend,
        clicks: a.clicks,
        impressions: a.impressions,
        conversions: a.conversions,
        conversionValue: a.conversionValue,
        roas,
        dailyBudget,
        parentAdsetExternalId,
        parentCampaignExternalId,
      });
    }

    // ── 4) Roda o motor puro ──────────────────────────────────────────────────
    const recs = generateRecommendations(rows, { lookbackDays });

    // ── 5) Dedup contra pending existentes + insere ───────────────────────────
    const { data: pend, error: pErr } = await sb
      .from('ads_recommendations')
      .select('kind, proposed_action')
      .eq('product_id', productId)
      .eq('status', 'pending');
    if (pErr) throw new Error(pErr.message);
    const seen = new Set<string>(
      (pend ?? []).map((p: any) => `${p.kind}::${p.proposed_action?.target_external_id ?? ''}`),
    );

    let generated = 0;
    let skipped = 0;
    for (const rec of recs) {
      const dedupKey = `${rec.kind}::${rec.targetExternalId}`;
      if (seen.has(dedupKey)) {
        skipped++;
        continue;
      }
      seen.add(dedupKey); // evita duplicar dentro do próprio lote

      const accountUuid = accountUuidByEntity.get(rec.targetExternalId) ?? null;
      const uuidCol = LEVEL_COLUMN[rec.targetLevel];
      const insertRow: Record<string, unknown> = {
        product_id: productId,
        account_id: accountUuid,
        campaign_id: null,
        adset_id: null,
        ad_id: null,
        kind: rec.kind,
        title: rec.title,
        rationale: rec.rationale,
        proposed_action: rec.proposedAction,
        expected_impact: rec.expectedImpact,
        confidence: rec.confidence,
        priority: rec.priority,
        status: 'pending',
        source: 'ads-optimize',
      };
      if (rec.entityUuid) insertRow[uuidCol] = rec.entityUuid;

      const { error: insErr } = await sb.from('ads_recommendations').insert(insertRow);
      if (insErr) {
        console.error('[ads-optimize] insert falhou (non-fatal):', insErr.message);
        skipped++;
        continue;
      }
      generated++;
    }

    return json({ ok: true, lookback_days: lookbackDays, evaluated: rows.length, candidates: recs.length, generated, skipped });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    console.error('[ads-optimize] erro:', msg);
    return json({ ok: false, error: msg }, 200);
  }
});
