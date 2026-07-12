// platform-instagram-connect — promove conexao Instagram (rascunho -> ativa).
// Valida via Graph API, criptografa segredos, inscreve pagina no app.
// Porte 1:1 do `instagram-connect`, DESACOPLADO do tenant:
//   * Tabela: platform_crm_instagram_connections (sem organization_id).
//   * Auth: super_admin via authenticatePlatformAgent.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { encryptSecret, decryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Campos do webhook inscritos por conexao. `comments`/`mentions` habilitam as
// automacoes product-scoped (Instagram Flows / front-4) alem do inbox de DMs.
// (Antes so `messages,messaging_postbacks,message_reactions`.)
const IG_SUBSCRIBED_FIELDS = 'messages,messaging_postbacks,message_reactions,comments,mentions';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { errorResponse } = await authenticatePlatformAgent(req, sbAdmin, serviceRoleKey, body);
  if (errorResponse) return errorResponse;

  const {
    connection_id,
    display_name,
    app_id,
    app_secret,
    fb_page_id,
    ig_business_account_id,
    page_access_token,
  } = body ?? {};

  // page_access_token NAO e mais obrigatorio incondicionalmente: em conexao
  // existente com token cifrado no banco, vazio = manter o atual (ver abaixo).
  if (!connection_id || !app_id || !fb_page_id || !ig_business_account_id) {
    return json({ error: 'campos obrigatorios ausentes' }, 400);
  }

  const { data: existing } = await sbAdmin
    .from('platform_crm_instagram_connections')
    .select('id, status, app_secret_encrypted, page_access_token_encrypted, webhook_verify_token')
    .eq('id', connection_id)
    .maybeSingle();
  if (!existing) return json({ error: 'connection not found' }, 404);

  // app_secret EFETIVO: payload > banco (decriptado). Necessario na troca
  // long-lived e na assinatura app-level (app access token `app_id|app_secret`).
  const providedSecret = String(app_secret ?? '').trim();
  let effectiveAppSecret = providedSecret;
  if (!effectiveAppSecret && existing.app_secret_encrypted) {
    try {
      effectiveAppSecret = await decryptSecret(existing.app_secret_encrypted);
    } catch (e) {
      console.error('[platform-ig-connect] decrypt do app_secret salvo falhou (segue sem)', String(e));
    }
  }

  // Token em branco em conexao existente = manter o atual: decripta o salvo e
  // usa como effectiveToken, pulando a troca long-lived (o salvo ja e o efetivo).
  const providedToken = String(page_access_token ?? '').trim();
  let effectiveToken = providedToken;
  if (!providedToken) {
    if (!existing.page_access_token_encrypted) {
      return json({ error: 'page_access_token e obrigatorio na primeira ativacao' }, 400);
    }
    try {
      effectiveToken = await decryptSecret(existing.page_access_token_encrypted);
    } catch (e) {
      console.error('[platform-ig-connect] decrypt do token salvo falhou', String(e));
      return json({ error: 'falha ao decriptar o token salvo — cole um novo Page Access Token' }, 500);
    }
    console.log('[platform-ig-connect] page_access_token em branco: reutilizando token salvo');
  }

  // Troca interna por long-lived (fb_exchange_token). Aceita o token CRU do
  // Graph Explorer — o usuário não precisa fazer a troca manual por URL (fonte
  // de erros: espaços colados, secret divergente). Se a troca falhar (ex.:
  // token já é long-lived de system user), segue com o token recebido.
  // So roda quando um token NOVO foi colado; usa o app_secret efetivo
  // (payload ou decriptado do banco).
  if (providedToken && effectiveAppSecret) {
    try {
      const ex: any = await graphFetch(
        `/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(app_id)}&client_secret=${encodeURIComponent(effectiveAppSecret)}&fb_exchange_token=${encodeURIComponent(effectiveToken)}`,
        effectiveToken,
      );
      if (ex?.access_token) effectiveToken = ex.access_token;
      console.log('[platform-ig-connect] long-lived exchange', ex?.access_token ? 'ok' : 'sem access_token');
    } catch (e) {
      console.error('[platform-ig-connect] exchange failed (segue com token recebido)', JSON.stringify((e as GraphError).graph ?? String(e)));
    }
  }

  let pageInfo: any = null, igInfo: any;
  // Validação da página é BEST-EFFORT: exige pages_read_engagement, permissão
  // que o consentimento dev-mode pode não ter. O runtime real (perfil do
  // visitante, mídia, subscribed_apps, envio) usa instagram_basic /
  // pages_manage_metadata / instagram_manage_messages — validadas abaixo.
  try {
    pageInfo = await graphFetch(`/${fb_page_id}?fields=name,id,instagram_business_account`, effectiveToken);
  } catch (e) {
    const ge = e as GraphError;
    console.error('[platform-ig-connect] pageInfo indisponivel (best-effort, segue)', JSON.stringify(ge.graph ?? String(e)));
  }
  if (pageInfo?.instagram_business_account?.id && String(pageInfo.instagram_business_account.id) !== String(ig_business_account_id)) {
    console.error('[platform-ig-connect] IG mismatch', pageInfo.instagram_business_account.id, '!=', ig_business_account_id);
    return json({ error: `A conta IG da pagina e ${pageInfo.instagram_business_account.id}, nao ${ig_business_account_id}` }, 400);
  }
  try {
    igInfo = await graphFetch(`/${ig_business_account_id}?fields=username,name`, effectiveToken);
  } catch (e) {
    const ge = e as GraphError;
    console.error('[platform-ig-connect] igInfo fetch failed', JSON.stringify(ge.graph ?? String(e)));
    return json({ error: 'Instagram Business Account ID invalido', detail: ge.graph?.message ?? String(e) }, 400);
  }

  let subscribedOk = true;
  try {
    await graphFetch(
      `/${fb_page_id}/subscribed_apps?subscribed_fields=${IG_SUBSCRIBED_FIELDS}`,
      effectiveToken,
      { method: 'POST' },
    );
  } catch (e) {
    subscribedOk = false;
    console.error('[platform-ig-connect] subscribed_apps failed', (e as GraphError).graph);
  }

  // Assinatura APP-LEVEL do objeto `instagram` (campo messages) via API.
  // O App Dashboard da Meta NAO permite assinar `messages` pela UI sem
  // Advanced Access (celula sem toggle) — a API permite. Toda conexao nova ja
  // nasce com a assinatura correta. Best-effort: falha nao bloqueia ativacao.
  // Obs.: a Meta re-verifica o callback_url (GET hub.challenge) nesse POST —
  // o platform-instagram-webhook responde via webhook_verify_token da conexao.
  let appSubscriptionOk = false;
  if (effectiveAppSecret) {
    try {
      const appAccessToken = `${app_id}|${effectiveAppSecret}`;
      const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/platform-instagram-webhook/${connection_id}`;
      const params = new URLSearchParams({
        object: 'instagram',
        callback_url: callbackUrl,
        fields: IG_SUBSCRIBED_FIELDS,
        verify_token: String(existing.webhook_verify_token ?? ''),
      });
      await graphFetch(`/${app_id}/subscriptions?${params.toString()}`, appAccessToken, { method: 'POST' });
      appSubscriptionOk = true;
      console.log('[platform-ig-connect] app-level subscription (instagram/messages) ok');
    } catch (e) {
      console.error('[platform-ig-connect] app-level subscription failed (best-effort, segue)', JSON.stringify((e as GraphError).graph ?? String(e)));
    }
  } else {
    console.error('[platform-ig-connect] app-level subscription pulada: app_secret indisponivel (payload e banco)');
  }

  const updates: Record<string, any> = {
    display_name: typeof display_name === 'string' && display_name.trim() ? display_name.trim() : undefined,
    app_id: String(app_id),
    fb_page_id: String(fb_page_id),
    fb_page_name: pageInfo?.name ?? null,
    ig_business_account_id: String(ig_business_account_id),
    ig_username: igInfo?.username ?? null,
    // persiste o token EFETIVO (long-lived quando a troca interna funcionou)
    page_access_token_encrypted: await encryptSecret(effectiveToken),
    status: 'active',
    last_error: null,
  };
  if (providedSecret) updates.app_secret_encrypted = await encryptSecret(providedSecret);
  else if (!existing.app_secret_encrypted) {
    return json({ error: 'app_secret e obrigatorio na primeira ativacao' }, 400);
  }

  const { error: updErr } = await sbAdmin
    .from('platform_crm_instagram_connections')
    .update(updates)
    .eq('id', connection_id);
  if (updErr) return json({ error: updErr.message }, 500);

  return json({
    ok: true,
    connection_id,
    ig_username: igInfo?.username ?? null,
    fb_page_name: pageInfo?.name ?? null,
    subscribed: subscribedOk,
    app_subscription: appSubscriptionOk,
  });
});
