// platform-embedded-signup-register — completa o rascunho do Embedded Signup
// de PLATAFORMA. Irmão de `whatsapp-embedded-signup-register` (tenant).
// Auth: authenticatePlatformAgent. Tabela: platform_crm_whatsapp_meta_connections.
// Graph confirma os assets; depois POST /{waba_id}/subscribed_apps.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

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

    const { errorResponse } = await authenticatePlatformAgent(
      req,
      sbAdmin,
      serviceRoleKey,
      body,
    );
    if (errorResponse) {
      if (errorResponse.status === 401) return unauthorized();
      return errorResponse;
    }

    const { connection_id, waba_id, phone_number_id, display_name } = body ?? {};
    if (!connection_id || !waba_id || !phone_number_id) {
      return json({ error: 'connection_id, waba_id e phone_number_id sao obrigatorios' }, 400);
    }

    const { data: draft, error: draftErr } = await sbAdmin
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, access_token_encrypted, status, app_secret_source')
      .eq('id', connection_id)
      .maybeSingle();

    if (draftErr || !draft) {
      return json({ error: 'conexao nao encontrada', code: 'draft_not_found' }, 404);
    }
    if (draft.status !== 'draft') {
      return json({ error: 'esta conexao ja foi concluida', code: 'already_registered' }, 409);
    }

    const accessToken = await decryptSecret(draft.access_token_encrypted ?? '');
    if (!accessToken) {
      console.error('[platform-embedded-signup-register] rascunho sem token utilizavel', connection_id);
      return json({ error: 'conexao invalida, refaca o processo', code: 'draft_corrupt' }, 409);
    }

    let phoneInfo: Record<string, unknown>;
    let wabaInfo: Record<string, unknown>;
    try {
      [phoneInfo, wabaInfo] = await Promise.all([
        graphFetch<Record<string, unknown>>(
          `/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
          accessToken,
        ),
        graphFetch<Record<string, unknown>>(`/${waba_id}?fields=name,id`, accessToken),
      ]);
    } catch (e) {
      console.warn('[platform-embedded-signup-register] Graph recusou os assets', String(e));
      return json({
        error: 'Não foi possível confirmar este número na conta que você autorizou. ' +
          'Refaça a conexão e selecione um número da sua própria conta.',
        code: 'asset_not_authorized',
      }, 403);
    }

    if (!phoneInfo?.display_phone_number || String(wabaInfo?.id ?? '') !== String(waba_id)) {
      console.warn('[platform-embedded-signup-register] assets nao confirmados', { phone_number_id, waba_id });
      return json({
        error: 'Este número não pertence à conta que você autorizou.',
        code: 'asset_not_authorized',
      }, 403);
    }

    const finalName =
      (typeof display_name === 'string' && display_name.trim()) ||
      (phoneInfo?.verified_name as string) ||
      (wabaInfo?.name as string) ||
      'WhatsApp Oficial';

    const { error: updErr } = await sbAdmin
      .from('platform_crm_whatsapp_meta_connections')
      .update({
        display_name: finalName,
        phone_number_id: String(phone_number_id),
        waba_id: String(waba_id),
        phone_number: (phoneInfo?.display_phone_number as string) ?? null,
        business_account_name: (wabaInfo?.name as string) ?? null,
        quality_rating: (phoneInfo?.quality_rating as string) ?? null,
        messaging_limit_tier: (phoneInfo?.messaging_limit_tier as string) ?? null,
        app_secret_source: 'platform',
        status: 'active',
        last_health_check_at: new Date().toISOString(),
      })
      .eq('id', connection_id);

    if (updErr) {
      if ((updErr as { code?: string }).code === '23505') {
        return json({
          error: 'Este número de WhatsApp já está conectado a outra conta. ' +
            'Desconecte-o de lá antes de conectar aqui.',
          code: 'phone_already_connected',
        }, 409);
      }
      console.error('[platform-embedded-signup-register] update falhou', updErr.message);
      return json({ error: updErr.message }, 500);
    }

    let subscribed = false;
    try {
      await graphFetch(`/${waba_id}/subscribed_apps`, accessToken, { method: 'POST' });
      subscribed = true;
    } catch (e) {
      console.error('[platform-embedded-signup-register] subscribed_apps falhou', String(e));
    }

    return json({
      connection_id,
      phone_number: (phoneInfo?.display_phone_number as string) ?? null,
      business_account_name: (wabaInfo?.name as string) ?? null,
      display_name: finalName,
      subscribed,
    });
  } catch (e) {
    console.error('[platform-embedded-signup-register] unhandled', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || 'internal error' }, 500);
  }
});
