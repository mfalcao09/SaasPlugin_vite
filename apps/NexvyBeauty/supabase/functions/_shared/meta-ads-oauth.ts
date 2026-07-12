// Helper compartilhado do OAuth de Meta ADS via Facebook Login for Business.
// ----------------------------------------------------------------------------
// PORTE de _shared/meta-oauth.ts do V5 (guigascruz25-sales-guide-buddy), adaptado
// para NexvyAds F1 (blueprint DESENHO-NEXVYADS-F1-2026-07-12.md §3/§4):
//   • OAuth-only via Login for Business: buildAuthorizeUrl usa `config_id` +
//     `override_default_response_type=code` e NÃO lista `scope` inline (a
//     Configuration no App Dashboard governa escopos + assets). Token colado
//     manualmente foi DROPADO (decisão Marcelo 2026-07-12).
//   • discoverAssets só busca /me/adaccounts (pages/instagram removidos).
//   • SCOPES_ADS / resolveScopes viram LEGADO (só fallback OAuth clássico se
//     login_config_id ausente — ver buildAuthorizeUrl).
//
// ⚠️ FONTE DE CREDENCIAL — NÃO INVENTADA:
//   O V5 lia app_id/secret de `platform_settings.meta_oauth_*`. Essas colunas
//   NÃO EXISTEM no prod alvo (fzhlbwhdejumkyqosuvq) — verificado 2026-07-12:
//   platform_settings só tem meta_commerce_* / meta_wa_master_key / meta_description.
//   Portanto a leitura de credencial é PARAMETRIZÁVEL (MetaAdsCredentialSource) e
//   o default lê de env (Function secrets). Quando a casa decidir guardar no banco,
//   basta uma migration aditiva (platform_settings.meta_ads_*) + injetar um source
//   DB-based — sem tocar este arquivo. Manter este helper SEM dependência de
//   meta-crypto/supabase-js mantém `deno check` hermético (sem npm/rede).
//
// ⚠️ ESCRITA-NÃO-APLICADA: rascunho para revisão. NÃO deployado, NÃO commitado.

export const DEFAULT_GRAPH_VERSION = 'v21.0';

export interface PlatformMetaAdsApp {
  app_id: string;
  app_secret: string;
  graph_version: string;
  enabled: boolean;
  /** Configuration ID do Facebook Login for Business (governa escopos+assets). */
  login_config_id: string | null;
  /** Legado: override de escopos p/ fallback OAuth clássico (config ausente). */
  scopes_override: string | null;
}

/**
 * Fonte de credencial parametrizável. O default (`envCredentialSource`) lê de
 * env; um edge pode injetar outro source (ex.: platform_settings.meta_ads_*)
 * quando a migration aditiva existir.
 */
export type MetaAdsCredentialSource = () => Promise<PlatformMetaAdsApp>;

/** Default: env / Supabase Function secrets. Sem dependência de banco. */
export const envCredentialSource: MetaAdsCredentialSource = () => {
  const app_id = Deno.env.get('META_ADS_APP_ID') ?? '';
  const app_secret = Deno.env.get('META_ADS_APP_SECRET') ?? '';
  if (!app_id || !app_secret) {
    throw new Error(
      'Meta Ads App não configurado: defina META_ADS_APP_ID e META_ADS_APP_SECRET (Function secrets).',
    );
  }
  const login_config_id = Deno.env.get('META_ADS_LOGIN_CONFIG_ID') ?? null;
  const graph_version = Deno.env.get('META_ADS_GRAPH_VERSION') || DEFAULT_GRAPH_VERSION;
  const scopes_override = Deno.env.get('META_ADS_SCOPES_OVERRIDE') ?? null;
  const enabled = (Deno.env.get('META_ADS_ENABLED') ?? 'true') !== 'false';
  return Promise.resolve({
    app_id,
    app_secret,
    graph_version,
    enabled,
    login_config_id,
    scopes_override,
  });
};

let cached: PlatformMetaAdsApp | null = null;
let cachedAt = 0;

export async function loadPlatformMetaAdsApp(
  source: MetaAdsCredentialSource = envCredentialSource,
): Promise<PlatformMetaAdsApp> {
  if (cached && Date.now() - cachedAt < 60_000) return cached;
  const app = await source();
  if (!app.app_id || !app.app_secret) {
    throw new Error('Meta Ads App sem app_id/app_secret.');
  }
  cached = app;
  cachedAt = Date.now();
  return cached;
}

export function invalidatePlatformMetaAdsAppCache() {
  cached = null;
  cachedAt = 0;
}

/**
 * Monta a URL de autorização.
 *   • Login for Business (preferido): usa `config_id` + `override_default_response_type=code`
 *     e NÃO envia `scope` (a Configuration governa). Este é o caminho OAuth-only.
 *   • Fallback OAuth clássico: só quando `login_config_id` está ausente — envia
 *     `scope` (resolveScopes) + `response_type=code`. Mantido apenas para dev
 *     antes do App Review da Configuration.
 */
export function buildAuthorizeUrl(app: PlatformMetaAdsApp, params: {
  redirect_uri: string;
  state: string;
  /** Legado: só usado no fallback clássico (login_config_id ausente). */
  scope?: string;
}): string {
  const u = new URL(`https://www.facebook.com/${app.graph_version}/dialog/oauth`);
  u.searchParams.set('client_id', app.app_id);
  u.searchParams.set('redirect_uri', params.redirect_uri);
  u.searchParams.set('state', params.state);
  if (app.login_config_id) {
    // Facebook Login for Business — a Configuration governa escopos e assets.
    u.searchParams.set('config_id', app.login_config_id);
    u.searchParams.set('override_default_response_type', 'code');
  } else {
    // Fallback OAuth clássico (legado). Só peça escopos JÁ adicionados no App.
    u.searchParams.set('scope', params.scope ?? resolveScopes(app.scopes_override));
    u.searchParams.set('response_type', 'code');
  }
  return u.toString();
}

// ── LEGADO ───────────────────────────────────────────────────────────────────
// Com Login for Business a Configuration governa os escopos; SCOPES_ADS/resolveScopes
// só entram no fallback OAuth clássico acima. Presets Instagram/pages foram removidos
// (NexvyAds é ads-only).
export const SCOPES_ADS = [
  'ads_read',
  'ads_management',
  'business_management',
];

/** Legado: resolve escopos p/ o fallback clássico. Config-first ignora isto. */
export function resolveScopes(override?: string | null): string {
  if (override && override.trim()) {
    return override.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).join(',');
  }
  return SCOPES_ADS.join(',');
}

export async function exchangeCodeForToken(
  app: PlatformMetaAdsApp,
  code: string,
  redirect_uri: string,
) {
  const u = new URL(`https://graph.facebook.com/${app.graph_version}/oauth/access_token`);
  u.searchParams.set('client_id', app.app_id);
  u.searchParams.set('client_secret', app.app_secret);
  u.searchParams.set('redirect_uri', redirect_uri);
  u.searchParams.set('code', code);
  const res = await fetch(u.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token exchange: ${JSON.stringify(body)}`);
  return body as { access_token: string; expires_in?: number; token_type?: string };
}

/**
 * LEGADO/no-op no fluxo de Configuration: o token de System-User emitido via
 * Login for Business já vem long-lived. Mantido 1:1 para o fallback clássico.
 */
export async function exchangeForLongLivedToken(app: PlatformMetaAdsApp, shortToken: string) {
  const u = new URL(`https://graph.facebook.com/${app.graph_version}/oauth/access_token`);
  u.searchParams.set('grant_type', 'fb_exchange_token');
  u.searchParams.set('client_id', app.app_id);
  u.searchParams.set('client_secret', app.app_secret);
  u.searchParams.set('fb_exchange_token', shortToken);
  const res = await fetch(u.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`long-lived exchange: ${JSON.stringify(body)}`);
  return body as { access_token: string; expires_in?: number; token_type?: string };
}

/** Descobre apenas contas de anúncio (NexvyAds é ads-only). */
export async function discoverAssets(app: PlatformMetaAdsApp, userToken: string) {
  const base = `https://graph.facebook.com/${app.graph_version}`;
  const adsRes = await fetch(
    `${base}/me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name,business{id,name}&limit=100`,
    { headers: { Authorization: `Bearer ${userToken}` } },
  );
  const adsJson = await adsRes.json().catch(() => ({}));
  const data = (adsJson as { data?: unknown })?.data;
  return {
    ad_accounts: Array.isArray(data) ? data : [],
    ads_error: adsRes.ok ? null : adsJson,
  };
}
