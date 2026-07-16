// ads-optimize-rules.test.ts — GOLDEN suite do motor PURO de recomendações
// (NexvyAds A2). Prova, sem banco/rede, o comportamento das 3 regras + o dedup
// de campos (pause_ad e shift_budget nunca miram o mesmo ad) e o determinismo.
// Roda: deno test supabase/functions/_shared/ads-optimize-rules.test.ts

import {
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_RULES_CONFIG,
  generateRecommendations,
  type MetricsRow,
  type Recommendation,
} from './ads-optimize-rules.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} — esperado ${e}, veio ${a}`);
}
function byKind(recs: Recommendation[], kind: string): Recommendation[] {
  return recs.filter((r) => r.kind === kind);
}

const ACCOUNT = 'act_100';

// Linha-base saudável (não dispara nada). Cada teste ajusta o necessário.
function adRow(over: Partial<MetricsRow> = {}): MetricsRow {
  return {
    level: 'ad',
    externalEntityId: 'ad_ok',
    accountExternalId: ACCOUNT,
    entityUuid: 'uuid-ad-ok',
    name: 'Ad OK',
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    spend: 10,
    impressions: 1000,
    clicks: 40,
    conversions: 3,
    conversionValue: 120,
    ...over,
  };
}
function adsetRow(over: Partial<MetricsRow> = {}): MetricsRow {
  return {
    level: 'adset',
    externalEntityId: 'adset_ok',
    accountExternalId: ACCOUNT,
    entityUuid: 'uuid-adset-ok',
    name: 'Adset OK',
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    spend: 40,
    impressions: 3000,
    conversions: 2,
    conversionValue: 60,
    dailyBudget: 5000, // R$50,00 em centavos
    ...over,
  };
}

// ── 1) DISPARA pause_ad ───────────────────────────────────────────────────────
Deno.test('pause_ad — ad ativo, R$50+ gastos, 0 conversões, com entrega → dispara', () => {
  const rows = [adRow({ externalEntityId: 'ad_burn', entityUuid: 'uuid-burn', name: 'Queima', spend: 90, impressions: 2000, conversions: 0, conversionValue: 0 })];
  const recs = generateRecommendations(rows);
  const pause = byKind(recs, 'pause_ad');
  eq(pause.length, 1, 'exatamente 1 pause_ad');
  const r = pause[0];
  eq(r.proposedAction.action, 'pause', 'action=pause');
  eq(r.proposedAction.target_level, 'ad', 'target_level=ad');
  eq(r.proposedAction.target_external_id, 'ad_burn', 'target_external_id');
  eq(r.targetExternalId, 'ad_burn', 'targetExternalId espelhado');
  eq(r.accountExternalId, ACCOUNT, 'accountExternalId ecoado');
  eq(r.entityUuid, 'uuid-burn', 'entityUuid ecoado');
  assert(r.confidence >= 0.6 && r.confidence <= 0.95, 'confidence em faixa');
  assert(r.rationale.includes('R$ 90.00'), 'rationale cita o gasto');
});

// ── 2) DISPARA increase_budget ────────────────────────────────────────────────
Deno.test('increase_budget — adset ROAS>=2, com budget, conversões e gasto → dispara +20%', () => {
  const rows = [adsetRow({ externalEntityId: 'adset_win', entityUuid: 'uuid-win', spend: 100, conversions: 5, conversionValue: 300, dailyBudget: 5000 })];
  const recs = generateRecommendations(rows);
  const inc = byKind(recs, 'increase_budget');
  eq(inc.length, 1, 'exatamente 1 increase_budget');
  const r = inc[0];
  eq(r.proposedAction.action, 'update_budget', 'action=update_budget');
  eq(r.proposedAction.target_level, 'adset', 'target_level=adset');
  eq(r.proposedAction.field, 'daily_budget', 'field=daily_budget');
  eq(r.proposedAction.from, 5000, 'from = budget atual (centavos)');
  eq(r.proposedAction.to, 6000, 'to = +20% (centavos, arredondado)');
  eq(r.proposedAction.currency_minor, true, 'flag currency_minor');
  eq(r.expectedImpact.budget_to_minor, 6000, 'expected_impact.budget_to_minor');
});

Deno.test('increase_budget — também vale p/ campaign com budget', () => {
  const rows = [adsetRow({ level: 'campaign', externalEntityId: 'camp_win', entityUuid: 'uuid-camp', spend: 200, conversions: 8, conversionValue: 800, dailyBudget: 10000 })];
  const inc = byKind(generateRecommendations(rows), 'increase_budget');
  eq(inc.length, 1, '1 increase p/ campaign');
  eq(inc[0].proposedAction.to, 12000, 'to = 10000*1.2');
  eq(inc[0].targetLevel, 'campaign', 'targetLevel=campaign');
});

// ── 3) NÃO dispara em métrica saudável / condições insuficientes ──────────────
Deno.test('sem gatilho — ad convertendo e adset com ROAS baixo → nenhuma recomendação', () => {
  const rows = [
    adRow(), // convertendo → sem pause
    adsetRow({ conversionValue: 40 }), // ROAS 40/40 = 1.0 < 2 → sem increase
  ];
  eq(generateRecommendations(rows), [], 'lista vazia');
});

Deno.test('pause_ad NÃO dispara sem entrega mínima (impressões abaixo do piso)', () => {
  const rows = [adRow({ spend: 80, conversions: 0, conversionValue: 0, impressions: 100 })];
  eq(byKind(generateRecommendations(rows), 'pause_ad').length, 0, 'sem sinal → sem pause');
});

Deno.test('pause_ad NÃO dispara em ad já pausado', () => {
  const rows = [adRow({ spend: 200, conversions: 0, conversionValue: 0, impressions: 5000, status: 'PAUSED' })];
  eq(generateRecommendations(rows), [], 'ad pausado é ignorado');
});

Deno.test('increase_budget NÃO dispara sem daily_budget (ex.: CBO na campanha-mãe)', () => {
  const rows = [adsetRow({ spend: 100, conversions: 5, conversionValue: 300, dailyBudget: null })];
  eq(byKind(generateRecommendations(rows), 'increase_budget').length, 0, 'sem budget → sem increase');
});

Deno.test('increase_budget NÃO dispara com ROAS alto mas 0 conversão real', () => {
  // conversionValue alto sem conversions passa no ROAS mas falha no minConversions.
  const rows = [adsetRow({ spend: 100, conversions: 0, conversionValue: 500, dailyBudget: 5000 })];
  eq(byKind(generateRecommendations(rows), 'increase_budget').length, 0, 'ROAS sem conversão → sem increase');
});

// ── 4) DEDUP de campos: pause_ad e shift_budget nunca miram o mesmo ad ─────────
Deno.test('dedup — ad que queima verba vira pause_ad, não gera shift duplicado no mesmo alvo', () => {
  // Adset com 2 ads: um bom (converte) e um que queima (0 conversão, gasto alto).
  // O que queima → pause_ad. O shift_budget exige pior COM conversão, então não
  // deve mirar o mesmo ad (nem sobrepor pause).
  const rows: MetricsRow[] = [
    adRow({ externalEntityId: 'ad_good', entityUuid: 'u-good', parentAdsetExternalId: 'adset_x', spend: 60, conversions: 6, conversionValue: 240 }),
    adRow({ externalEntityId: 'ad_burn', entityUuid: 'u-burn', parentAdsetExternalId: 'adset_x', spend: 70, impressions: 3000, conversions: 0, conversionValue: 0 }),
  ];
  const recs = generateRecommendations(rows);
  const pause = byKind(recs, 'pause_ad');
  const shift = byKind(recs, 'shift_budget');
  eq(pause.length, 1, '1 pause_ad (o ad_burn)');
  eq(pause[0].targetExternalId, 'ad_burn', 'pause mira ad_burn');
  eq(shift.length, 0, 'nenhum shift_budget (pior sem conversão é caso de pause, não de shift)');

  // Nenhum alvo (kind+target) repetido em toda a saída.
  const keys = recs.map((r) => `${r.kind}::${r.targetExternalId}`);
  eq(new Set(keys).size, keys.length, 'sem par (kind,target) duplicado');
});

Deno.test('shift_budget — dispara quando ambos convertem mas há gap de ROAS >= ratio', () => {
  const rows: MetricsRow[] = [
    adRow({ externalEntityId: 'ad_star', entityUuid: 'u-star', parentAdsetExternalId: 'adset_y', spend: 50, conversions: 10, conversionValue: 500 }), // ROAS 10
    adRow({ externalEntityId: 'ad_weak', entityUuid: 'u-weak', parentAdsetExternalId: 'adset_y', spend: 50, conversions: 1, conversionValue: 60 }), // ROAS 1.2
  ];
  const shift = byKind(generateRecommendations(rows), 'shift_budget');
  eq(shift.length, 1, '1 shift_budget');
  const r = shift[0];
  eq(r.proposedAction.action, 'pause', 'ação concreta = pausar o pior');
  eq(r.proposedAction.target_external_id, 'ad_weak', 'mira o pior (ad_weak)');
  eq(r.proposedAction.shift?.to_ad, 'ad_star', 'shift aponta p/ o melhor');
  eq(r.proposedAction.shift?.from_ad, 'ad_weak', 'shift.from = pior');
  eq(r.proposedAction.shift?.adset_external_id, 'adset_y', 'shift no mesmo adset');
});

// ── 5) Determinismo & config parametrizável ──────────────────────────────────
Deno.test('determinístico — mesma entrada produz saída idêntica', () => {
  const rows: MetricsRow[] = [
    adRow({ externalEntityId: 'a1', spend: 120, conversions: 0, conversionValue: 0, impressions: 4000 }),
    adsetRow({ externalEntityId: 's1', spend: 90, conversions: 4, conversionValue: 400 }),
  ];
  const a = generateRecommendations(rows);
  const b = generateRecommendations(rows);
  eq(a, b, 'saída idêntica em duas execuções');
});

Deno.test('config — limiares customizados mudam o gatilho', () => {
  // Ad gastou R$30, 0 conversão: no default (minSpend 50) NÃO dispara.
  const rows = [adRow({ spend: 30, conversions: 0, conversionValue: 0, impressions: 2000 })];
  eq(byKind(generateRecommendations(rows), 'pause_ad').length, 0, 'default não dispara em R$30');
  const custom = generateRecommendations(rows, { config: { pauseAd: { minSpend: 25, maxConversions: 0, minImpressions: 500 } } });
  eq(byKind(custom, 'pause_ad').length, 1, 'com minSpend 25 → dispara');
});

Deno.test('defaults expostos — sanity das constantes públicas', () => {
  eq(DEFAULT_LOOKBACK_DAYS, 7, 'janela default');
  eq(DEFAULT_RULES_CONFIG.increaseBudget.increasePct, 0.2, 'increase 20%');
  eq(DEFAULT_RULES_CONFIG.pauseAd.minSpend, 50, 'pause minSpend R$50');
});
