// _shared/ads-optimize-rules.ts — MOTOR PURO de recomendações do agente
// ads-optimize (NexvyAds A2 / camada HITL). SEM banco, SEM rede, SEM Date.now no
// core → unit-testável com golden suite própria (ads-optimize-rules.test.ts).
//
// Recebe um array de linhas normalizadas (métrica agregada na janela + metadados
// da entidade) e devolve recomendações estruturadas que o super_admin aprova ou
// rejeita. NÃO aplica nada — quem escreve na Graph é ads-apply-recommendation,
// e só depois de `approved` (HITL).
//
// ── UNIDADES (herdadas do ads-sync / Meta Graph) ────────────────────────────
//   • spend, conversionValue  → unidade MAIOR da moeda (R$). A Meta devolve
//     `spend`/`action_values` como decimal na moeda da conta (ex.: "50.00" = R$50).
//   • dailyBudget             → unidade MENOR (centavos). A Meta devolve
//     `daily_budget` como inteiro em centavos (ex.: "5000" = R$50,00). Guardado
//     as-is em ads_campaigns/ads_adsets.daily_budget.
//   • roas                    → adimensional (conversion_value/spend); ambos em
//     unidade maior, então a razão independe da unidade.
//   • conversions             → contagem.
// Consequência: os limiares de spend/roas comparam em R$ (maior); a mutação de
// budget (increase_budget.to) sai em CENTAVOS (menor) — exatamente o que a Graph
// espera de volta em `daily_budget`.
//
// Determinístico: nenhuma leitura de relógio no core. A janela (`lookbackDays`)
// entra por parâmetro e serve só para o texto/expected_impact.

// ── Contratos públicos ──────────────────────────────────────────────────────

export type AdsLevel = 'account' | 'campaign' | 'adset' | 'ad';
export type TargetLevel = 'campaign' | 'adset' | 'ad';
export type RecommendationKind = 'pause_ad' | 'increase_budget' | 'shift_budget';
export type MutationAction = 'pause' | 'update_budget';

/** Linha normalizada de métrica+entidade (o edge monta isto a partir do banco). */
export interface MetricsRow {
  level: AdsLevel;
  /** id da entidade na plataforma (Meta). Vira target_external_id da mutação. */
  externalEntityId: string;
  /** id da ad account na plataforma (ex.: act_123). Ecoado na recomendação. */
  accountExternalId: string;
  /** uuid interno da entidade (ads_ads/ads_adsets/ads_campaigns.id) — opaco. */
  entityUuid?: string | null;
  name?: string | null;
  /** status configurado (ACTIVE/PAUSED/ARCHIVED/DELETED…). */
  status?: string | null;
  /** effective_status (idem, resolvido pela Meta). */
  effectiveStatus?: string | null;

  // Métricas agregadas na janela:
  spend: number | null; // R$ (maior)
  clicks?: number | null;
  impressions?: number | null;
  conversions: number | null; // contagem
  conversionValue?: number | null; // R$ (maior)
  roas?: number | null; // adimensional
  cpa?: number | null;

  /** daily_budget em CENTAVOS (menor) — adset/campaign; null em ad. */
  dailyBudget?: number | null;

  // Linkage (para shift_budget agrupar ads do mesmo adset):
  parentAdsetExternalId?: string | null;
  parentCampaignExternalId?: string | null;
}

/** Mutação estruturada — o que ads-apply-recommendation traduz p/ a Graph. */
export interface ProposedAction {
  action: MutationAction;
  target_level: TargetLevel;
  target_external_id: string;
  /** update_budget: campo alvo (sempre daily_budget nesta versão). */
  field?: 'daily_budget';
  /** update_budget: valor atual em CENTAVOS. */
  from?: number;
  /** update_budget: valor novo em CENTAVOS (o que vai pra Graph). */
  to?: number;
  /** update_budget: true → `from`/`to` estão em unidade menor (centavos). */
  currency_minor?: boolean;
  /** update_budget: percentual aplicado. */
  pct?: number;
  /** shift_budget: contexto de realocação (ação concreta = pause do pior). */
  shift?: { from_ad: string; to_ad: string; adset_external_id: string };
}

export interface Recommendation {
  kind: RecommendationKind;
  title: string;
  rationale: string;
  proposedAction: ProposedAction;
  expectedImpact: Record<string, unknown>;
  confidence: number; // 0..1
  priority: number; // inteiro (maior = mais urgente)
  targetLevel: TargetLevel;
  targetExternalId: string;
  accountExternalId: string;
  entityUuid?: string | null;
}

// ── Config (limiares) — parametrizável; defaults documentados ────────────────

export interface PauseAdConfig {
  /** gasto mínimo na janela (R$) p/ considerar desperdício. */
  minSpend: number;
  /** conversões no máximo (<=) p/ contar como "não converteu". */
  maxConversions: number;
  /** entrega mínima (impressões) — sem isto não há sinal p/ julgar. */
  minImpressions: number;
}
export interface IncreaseBudgetConfig {
  /** ROAS mínimo (meta) p/ recomendar escalar. */
  minRoas: number;
  /** conversões mínimas — ROAS sem conversão de fato não vale. */
  minConversions: number;
  /** gasto mínimo (R$) p/ o ROAS ser estatisticamente confiável. */
  minSpend: number;
  /** quanto subir o daily_budget (fração; 0.20 = +20%). */
  increasePct: number;
  /** teto opcional de daily_budget em CENTAVOS (null = sem teto). */
  maxDailyBudgetMinor: number | null;
}
export interface ShiftBudgetConfig {
  /** gasto mínimo por ad (R$) p/ entrar na comparação. */
  minSpendPerAd: number;
  /** razão melhor/pior ROAS mínima p/ justificar realocar. */
  roasRatio: number;
}
export interface RulesConfig {
  pauseAd: PauseAdConfig;
  increaseBudget: IncreaseBudgetConfig;
  shiftBudget: ShiftBudgetConfig;
}

export const DEFAULT_LOOKBACK_DAYS = 7;

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  pauseAd: { minSpend: 50, maxConversions: 0, minImpressions: 500 },
  increaseBudget: { minRoas: 2.0, minConversions: 1, minSpend: 20, increasePct: 0.20, maxDailyBudgetMinor: null },
  shiftBudget: { minSpendPerAd: 30, roasRatio: 2.0 },
};

// ── Helpers puros ────────────────────────────────────────────────────────────

const PAUSED_STATES = new Set(['PAUSED', 'ARCHIVED', 'DELETED', 'DISAPPROVED']);

/** Entidade está veiculando? status/effective_status ausente = tratado como ativo. */
function isActiveEntity(row: MetricsRow): boolean {
  const s = (row.status ?? '').toUpperCase();
  const e = (row.effectiveStatus ?? '').toUpperCase();
  if (s && PAUSED_STATES.has(s)) return false;
  if (e && PAUSED_STATES.has(e)) return false;
  return true;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const money = (reais: number): string => `R$ ${reais.toFixed(2)}`;
const budgetReais = (minor: number): string => `R$ ${(minor / 100).toFixed(2)}`;
const label = (row: MetricsRow): string => row.name?.trim() || row.externalEntityId;

function roasOf(row: MetricsRow): number | null {
  if (typeof row.roas === 'number' && Number.isFinite(row.roas)) return row.roas;
  if (typeof row.conversionValue === 'number' && typeof row.spend === 'number' && row.spend > 0) {
    return row.conversionValue / row.spend;
  }
  return null;
}

// ── Regra 1: pause_ad ────────────────────────────────────────────────────────
// Ad ATIVO que gastou >= minSpend, teve entrega (>= minImpressions) e converteu
// <= maxConversions → recomenda pausar. Interrompe gasto sem retorno.
function evalPauseAd(row: MetricsRow, cfg: PauseAdConfig, lookbackDays: number): Recommendation | null {
  if (row.level !== 'ad') return null;
  if (!isActiveEntity(row)) return null;
  const spend = row.spend;
  if (typeof spend !== 'number' || spend < cfg.minSpend) return null;
  const impressions = row.impressions ?? 0;
  if (impressions < cfg.minImpressions) return null;
  const conversions = row.conversions ?? 0;
  if (conversions > cfg.maxConversions) return null;

  // Confiança cresce com o gasto desperdiçado, saturando em 2× o limiar.
  const confidence = round2(clamp(0.6 + 0.3 * clamp((spend - cfg.minSpend) / (cfg.minSpend * 2), 0, 1), 0.6, 0.95));
  const priority = Math.min(100, Math.round(spend));
  const est30d = round2((spend / Math.max(1, lookbackDays)) * 30);

  return {
    kind: 'pause_ad',
    title: `Pausar ad sem conversão: ${label(row)}`,
    rationale:
      `O ad "${label(row)}" gastou ${money(spend)} em ${lookbackDays} dia(s) ` +
      `com ${conversions} conversão(ões) e ${impressions} impressões. ` +
      `Pausar interrompe o gasto sem retorno (economia estimada ~${money(est30d)}/mês).`,
    proposedAction: { action: 'pause', target_level: 'ad', target_external_id: row.externalEntityId },
    expectedImpact: {
      metric: 'spend_saved',
      spend_window_brl: round2(spend),
      window_days: lookbackDays,
      est_monthly_saving_brl: est30d,
      basis: 'zero_conversions_in_window',
    },
    confidence,
    priority,
    targetLevel: 'ad',
    targetExternalId: row.externalEntityId,
    accountExternalId: row.accountExternalId,
    entityUuid: row.entityUuid ?? null,
  };
}

// ── Regra 2: increase_budget ─────────────────────────────────────────────────
// Adset/campaign ATIVO, com daily_budget definido, ROAS >= meta, conversões e
// gasto suficientes → recomenda subir daily_budget em increasePct.
function evalIncreaseBudget(row: MetricsRow, cfg: IncreaseBudgetConfig, lookbackDays: number): Recommendation | null {
  if (row.level !== 'adset' && row.level !== 'campaign') return null;
  if (!isActiveEntity(row)) return null;
  const budget = row.dailyBudget;
  if (typeof budget !== 'number' || budget <= 0) return null;
  const spend = row.spend;
  if (typeof spend !== 'number' || spend < cfg.minSpend) return null;
  const conversions = row.conversions ?? 0;
  if (conversions < cfg.minConversions) return null;
  const roas = roasOf(row);
  if (roas === null || roas < cfg.minRoas) return null;

  const fromMinor = Math.round(budget);
  let toMinor = Math.round(fromMinor * (1 + cfg.increasePct));
  if (cfg.maxDailyBudgetMinor !== null) toMinor = Math.min(toMinor, cfg.maxDailyBudgetMinor);
  if (toMinor <= fromMinor) return null; // nada a fazer (já no teto)

  // Confiança cresce com o ROAS acima da meta, saturando em 2× a meta.
  const confidence = round2(clamp(0.55 + 0.35 * clamp((roas - cfg.minRoas) / cfg.minRoas, 0, 1), 0.55, 0.9));
  const priority = Math.min(100, Math.round(roas * 10));

  return {
    kind: 'increase_budget',
    title: `Escalar ${row.level} com ROAS ${roas.toFixed(2)}: ${label(row)}`,
    rationale:
      `O ${row.level} "${label(row)}" tem ROAS ${roas.toFixed(2)} ` +
      `(${conversions} conversões, ${money(spend)} de gasto em ${lookbackDays} dia(s)). ` +
      `Subir o daily_budget de ${budgetReais(fromMinor)} para ${budgetReais(toMinor)} ` +
      `(+${Math.round(cfg.increasePct * 100)}%) tende a captar volume ao mesmo retorno.`,
    proposedAction: {
      action: 'update_budget',
      target_level: row.level,
      target_external_id: row.externalEntityId,
      field: 'daily_budget',
      from: fromMinor,
      to: toMinor,
      currency_minor: true,
      pct: cfg.increasePct,
    },
    expectedImpact: {
      metric: 'incremental_conversions',
      current_roas: round2(roas),
      budget_from_minor: fromMinor,
      budget_to_minor: toMinor,
      increase_pct: cfg.increasePct,
    },
    confidence,
    priority,
    targetLevel: row.level,
    targetExternalId: row.externalEntityId,
    accountExternalId: row.accountExternalId,
    entityUuid: row.entityUuid ?? null,
  };
}

// ── Regra 3 (opcional): shift_budget ─────────────────────────────────────────
// Dentro de um mesmo adset (ABO, sem budget por-ad na Meta), realocar verba do
// pior p/ o melhor ad = pausar o pior (o Advantage+/entrega redistribui p/ os
// ativos). Ação CONCRETA = 'pause' do pior ad; kind = 'shift_budget' + contexto.
//
// Guarda anti-sobreposição: o pior ad DEVE ter conversões > 0 (senão é caso de
// pause_ad puro, não de realocação) e NÃO pode já ter uma pause_ad emitida.
function evalShiftBudget(
  rows: MetricsRow[],
  cfg: ShiftBudgetConfig,
  _lookbackDays: number,
  alreadyPausedAdIds: Set<string>,
): Recommendation[] {
  const out: Recommendation[] = [];

  // Agrupa ads ativos com gasto relevante por adset pai.
  const groups = new Map<string, MetricsRow[]>();
  for (const row of rows) {
    if (row.level !== 'ad' || !isActiveEntity(row)) continue;
    if (typeof row.spend !== 'number' || row.spend < cfg.minSpendPerAd) continue;
    const key = row.parentAdsetExternalId;
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  for (const [adsetExternalId, ads] of groups) {
    if (ads.length < 2) continue;

    let best: { row: MetricsRow; roas: number } | null = null;
    let worst: { row: MetricsRow; roas: number } | null = null;
    for (const ad of ads) {
      const r = roasOf(ad);
      if (r === null) continue;
      if (!best || r > best.roas) best = { row: ad, roas: r };
      if (!worst || r < worst.roas) worst = { row: ad, roas: r };
    }
    if (!best || !worst) continue;
    if (best.row.externalEntityId === worst.row.externalEntityId) continue;
    if ((best.row.conversions ?? 0) <= 0) continue; // melhor precisa converter
    if ((worst.row.conversions ?? 0) <= 0) continue; // pior converte → não é pause_ad
    if (alreadyPausedAdIds.has(worst.row.externalEntityId)) continue; // já pausado por regra 1
    if (worst.roas <= 0) continue;
    if (best.roas < worst.roas * cfg.roasRatio) continue; // gap não justifica

    const confidence = round2(clamp(0.5 + 0.3 * clamp((best.roas / worst.roas - cfg.roasRatio) / cfg.roasRatio, 0, 1), 0.5, 0.85));
    const priority = Math.min(90, Math.round(best.roas * 5));

    out.push({
      kind: 'shift_budget',
      title: `Realocar verba p/ o melhor ad do adset ${adsetExternalId}`,
      rationale:
        `No adset ${adsetExternalId}, "${label(best.row)}" tem ROAS ${best.roas.toFixed(2)} vs ` +
        `${worst.roas.toFixed(2)} de "${label(worst.row)}". Pausar o pior concentra a entrega ` +
        `no melhor (mesmo adset), realocando a verba sem mexer no budget total.`,
      // Ação concreta aplicável = pausar o pior ad.
      proposedAction: {
        action: 'pause',
        target_level: 'ad',
        target_external_id: worst.row.externalEntityId,
        shift: {
          from_ad: worst.row.externalEntityId,
          to_ad: best.row.externalEntityId,
          adset_external_id: adsetExternalId,
        },
      },
      expectedImpact: {
        metric: 'budget_reallocation',
        from_ad: worst.row.externalEntityId,
        to_ad: best.row.externalEntityId,
        from_roas: round2(worst.roas),
        to_roas: round2(best.roas),
      },
      confidence,
      priority,
      targetLevel: 'ad',
      targetExternalId: worst.row.externalEntityId,
      accountExternalId: worst.row.accountExternalId,
      entityUuid: worst.row.entityUuid ?? null,
    });
  }

  return out;
}

// ── Orquestrador ─────────────────────────────────────────────────────────────

export interface GenerateOptions {
  config?: Partial<RulesConfig>;
  lookbackDays?: number;
}

function mergeConfig(partial?: Partial<RulesConfig>): RulesConfig {
  if (!partial) return DEFAULT_RULES_CONFIG;
  return {
    pauseAd: { ...DEFAULT_RULES_CONFIG.pauseAd, ...partial.pauseAd },
    increaseBudget: { ...DEFAULT_RULES_CONFIG.increaseBudget, ...partial.increaseBudget },
    shiftBudget: { ...DEFAULT_RULES_CONFIG.shiftBudget, ...partial.shiftBudget },
  };
}

/**
 * Roda todas as regras sobre as linhas normalizadas e devolve recomendações.
 * Determinístico: mesma entrada → mesma saída (sem relógio no core). shift_budget
 * nunca colide com pause_ad no mesmo ad (dedup por target_external_id).
 */
export function generateRecommendations(rows: MetricsRow[], opts: GenerateOptions = {}): Recommendation[] {
  const cfg = mergeConfig(opts.config);
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  const recs: Recommendation[] = [];
  const pausedAdIds = new Set<string>();

  for (const row of rows) {
    const pause = evalPauseAd(row, cfg.pauseAd, lookbackDays);
    if (pause) {
      recs.push(pause);
      pausedAdIds.add(pause.targetExternalId);
    }
    const inc = evalIncreaseBudget(row, cfg.increaseBudget, lookbackDays);
    if (inc) recs.push(inc);
  }

  recs.push(...evalShiftBudget(rows, cfg.shiftBudget, lookbackDays, pausedAdIds));

  // Ordena por prioridade desc (estável) — determinístico.
  return recs.sort((a, b) => b.priority - a.priority);
}
