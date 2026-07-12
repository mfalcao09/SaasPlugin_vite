// ads-oauth-callback — REDIRECT do browser após consentimento Meta (NexvyAds F1).
// Público (verify_jwt=false): não há JWT do usuário no redirect. A confiança vem
// do state ASSINADO (HMAC) que validamos aqui — sem state válido, nada toca o banco.
// Fluxo: valida state -> troca code por token (server-side, app_secret via env)
// -> descobre ad accounts -> upsert em ads_platform_connections + ads_accounts
// (SERVICE_ROLE) -> redireciona pro gestao com ?ads_connected=1|0.
// Segurança (§11): NUNCA loga token/secret/code; token só cifrado (encryptSecret).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { platformCrmCorsHeaders as corsHeaders } from '../_shared/platform-crm-auth.ts';
import { encryptSecret } from '../_shared/meta-crypto.ts';
import {
  loadPlatformMetaAdsApp,
  exchangeCodeForToken,
  discoverAssets,
  SCOPES_ADS,
} from '../_shared/meta-ads-oauth.ts';
import { verifyState, getStateSecret } from '../_shared/ads-oauth-state.ts';

// Destino do redirect final (gestao). Configurável por env; default = host canônico.
function returnBase(): string {
  return Deno.env.get('ADS_OAUTH_RETURN_URL') || 'https://gestao.nexvy.tech/ads';
}

function redirect(connected: boolean, extra?: Record<string, string>): Response {
  const u = new URL(returnBase());
  u.searchParams.set('ads_connected', connected ? '1' : '0');
  for (const [k, v] of Object.entries(extra ?? {})) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
}

function callbackUrl(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/ads-oauth-callback`;
}

// Localiza a conexão do produto (platform=meta) ou cria uma nova. ads_platform_connections
// NÃO tem UNIQUE(product_id,platform), então fazemos find-then-update/insert manual.
async function upsertConnection(sb: any, row: Record<string, unknown>): Promise<string | null> {
  const { data: existing } = await sb
    .from('ads_platform_connections')
    .select('id')
    .eq('product_id', row.product_id)
    .eq('platform', 'meta')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await sb.from('ads_platform_connections').update(row).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return existing.id as string;
  }
  const { data: inserted, error } = await sb
    .from('ads_platform_connections')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (inserted?.id as string) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state') ?? '';
  const oauthError = url.searchParams.get('error') || url.searchParams.get('error_description');

  // 1) Valida o state HMAC ANTES de qualquer coisa (gate anti-CSRF/forjado).
  const state = await verifyState(stateToken, getStateSecret());
  if (!state) {
    console.error('[ads-oauth-callback] state invalido ou expirado');
    return redirect(false, { reason: 'invalid_state' });
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  // Base da linha de conexão — reusada tanto no caminho de sucesso quanto de erro.
  const baseRow = {
    product_id: state.product_id,
    platform: 'meta',
    auth_mode: 'oauth',
    connected_by: state.connected_by,
  };

  // 2) Usuário negou consentimento ou Meta devolveu erro: grava 'error' e volta.
  if (oauthError || !code) {
    console.error('[ads-oauth-callback] consentimento negado/sem code');
    try {
      await upsertConnection(sb, { ...baseRow, status: 'error', last_error: 'oauth_denied_or_no_code' });
    } catch (e) {
      console.error('[ads-oauth-callback] upsert(error) falhou', String((e as Error).message ?? e));
    }
    return redirect(false, { reason: 'oauth_denied' });
  }

  try {
    const app = await loadPlatformMetaAdsApp();

    // 3) Troca code -> token (server-side; app_secret nunca sai daqui). Token do
    // System-User via Login for Business já vem long-lived.
    const tok = await exchangeCodeForToken(app, code, callbackUrl());
    const accessToken = tok.access_token;
    const tokenExpiresAt = tok.expires_in
      ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
      : null;

    // 4) Descobre as ad accounts do usuário (/me/adaccounts).
    const { ad_accounts, ads_error } = await discoverAssets(app, accessToken);
    if (ads_error && (!ad_accounts || ad_accounts.length === 0)) {
      // Erro real da Graph ao listar contas — não persistimos token órfão.
      throw new Error(`adaccounts: ${JSON.stringify(ads_error)}`);
    }

    // external_business_id: business da primeira conta com business definido.
    const firstBiz = ad_accounts.find((a: any) => a?.business?.id)?.business;

    // 5) Upsert da conexão ATIVA com token cifrado (mesmo padrão do IG: coluna
    // *_encrypted protegida por RLS super_admin + envelope AES-256-GCM).
    const connectionId = await upsertConnection(sb, {
      ...baseRow,
      external_business_id: firstBiz?.id ?? null,
      login_config_id: app.login_config_id,
      access_token_encrypted: await encryptSecret(accessToken),
      token_expires_at: tokenExpiresAt,
      scopes: SCOPES_ADS,
      status: 'active',
      last_error: null,
    });
    if (!connectionId) throw new Error('falha ao criar/atualizar conexao');

    // 6) Upsert das ad accounts (UNIQUE(connection_id, external_account_id)).
    if (ad_accounts.length > 0) {
      const rows = ad_accounts.map((a: any) => ({
        product_id: state.product_id,
        connection_id: connectionId,
        external_account_id: String(a.id), // formato "act_<id>"
        name: a.name ?? null,
        currency: a.currency ?? null,
        timezone_name: a.timezone_name ?? null,
        account_status: typeof a.account_status === 'number' ? a.account_status : null,
        business_id: a.business?.id ?? null,
        business_name: a.business?.name ?? null,
        is_active: true,
      }));
      const { error: accErr } = await sb
        .from('ads_accounts')
        .upsert(rows, { onConflict: 'connection_id,external_account_id' });
      if (accErr) throw new Error(`ads_accounts: ${accErr.message}`);
    }

    console.log(`[ads-oauth-callback] conexao ativa product=${state.product_id} contas=${ad_accounts.length}`);
    return redirect(true, { accounts: String(ad_accounts.length) });
  } catch (e) {
    // NUNCA logamos o token/secret/code; só a mensagem de erro.
    const msg = String((e as Error).message ?? e);
    console.error('[ads-oauth-callback] falha na troca/descoberta', msg);
    try {
      await upsertConnection(sb, { ...baseRow, status: 'error', last_error: msg.slice(0, 500) });
    } catch (e2) {
      console.error('[ads-oauth-callback] upsert(error) falhou', String((e2 as Error).message ?? e2));
    }
    return redirect(false, { reason: 'exchange_failed' });
  }
});
