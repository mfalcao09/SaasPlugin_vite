// platform-embedded-signup-exchange — troca o code do Embedded Signup por um
// token de negócio e grava RASCUNHO em platform_crm_whatsapp_meta_connections.
//
// Irmão de `whatsapp-embedded-signup-exchange` (tenant). Copia o CONTRATO
// (code TTL 30s, Graph lista ativos, app_secret_source='platform'), NÃO as
// tabelas/auth de tenant. Ator: authenticatePlatformAgent.
//
// ⚠️ TTL DE 30 SEGUNDOS. A troca é a PRIMEIRA coisa depois do gate de auth.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch } from '../_shared/meta-graph.ts';
import { encryptSecret, generateVerifyToken } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') || 'v21.0';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return json({ error: 'unauthorized' }, 401);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    const body = await req.json().catch(() => ({}));

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.replace(/^Bearer\s+/i, '').trim()) {
      return unauthorized();
    }

    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      sbAdmin,
      serviceRoleKey,
      body,
    );
    if (errorResponse) {
      if (errorResponse.status === 401) return unauthorized();
      return errorResponse;
    }

    const { code } = body ?? {};
    if (!code) {
      return json({ error: 'code e obrigatorio' }, 400);
    }

    const appId = Deno.env.get('META_WHATSAPP_APP_ID');
    const ownSecret = Deno.env.get('META_WHATSAPP_APP_SECRET');
    const appSecret = ownSecret || Deno.env.get('META_ADS_APP_SECRET');
    const secretSource = ownSecret ? 'META_WHATSAPP_APP_SECRET' : 'META_ADS_APP_SECRET(fallback)';

    if (!appId || !appSecret) {
      console.error('[platform-embedded-signup-exchange] credenciais ausentes', {
        appId: appId ? 'ok' : 'AUSENTE',
        appSecret: 'AUSENTE',
      });
      return json({ error: 'integracao Meta nao configurada no servidor' }, 500);
    }
    console.log('[platform-embedded-signup-exchange] app_secret via', secretSource);

    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('code', String(code));

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenBody = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenBody?.access_token) {
      console.error('[platform-embedded-signup-exchange] troca falhou', tokenBody?.error ?? tokenRes.status);
      return json({
        error: 'nao foi possivel concluir a conexao. Tente conectar novamente.',
        detail: tokenBody?.error?.message ?? `graph ${tokenRes.status}`,
        retryable: true,
      }, 400);
    }
    const accessToken = String(tokenBody.access_token);

    await sbAdmin
      .from('platform_crm_whatsapp_meta_connections')
      .delete()
      .eq('status', 'draft')
      .is('phone_number_id', null)
      .eq('created_by', user!.id);

    const { data: draft, error: draftError } = await sbAdmin
      .from('platform_crm_whatsapp_meta_connections')
      .insert({
        display_name: 'Conexão em andamento',
        webhook_verify_token: generateVerifyToken(),
        app_id: appId,
        app_secret_source: 'platform',
        access_token_encrypted: await encryptSecret(accessToken),
        status: 'draft',
        created_by: user!.id,
      })
      .select('id')
      .single();

    if (draftError) {
      console.error('[platform-embedded-signup-exchange] rascunho falhou', draftError.message);
      return json({ error: draftError.message }, 500);
    }

    let assets: Record<string, unknown>;
    try {
      assets = await graphFetch<Record<string, unknown>>(
        '/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name,' +
          'phone_numbers{id,display_phone_number,verified_name,quality_rating}}',
        accessToken,
      );
    } catch (e) {
      console.warn('[platform-embedded-signup-exchange] Graph recusou a listagem', String(e));
      return json({
        error: 'Não foi possível ler as contas de WhatsApp que você autorizou. ' +
          'Refaça a conexão.',
        code: 'assets_unavailable',
      }, 502);
    }

    return json({ connection_id: draft.id, assets });
  } catch (e) {
    console.error('[platform-embedded-signup-exchange] unhandled', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || 'internal error' }, 500);
  }
});
