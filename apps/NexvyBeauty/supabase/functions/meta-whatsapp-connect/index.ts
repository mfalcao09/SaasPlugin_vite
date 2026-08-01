// meta-whatsapp-connect
// Recebe credenciais do wizard, valida via Graph API, criptografa, salva.
// Retorna webhook_url + verify_token para o cliente colar no Meta App.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GRAPH_BASE, graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { encryptSecret, generateVerifyToken } from '../_shared/meta-crypto.ts';
import { authenticateTenant, assertOrgAccess } from '../_shared/tenant-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {

  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // AUTH (adaptação declarada do porte). O original JÁ era auth real — getUser()
  // + RPC user_belongs_to_organization — então isto NÃO é correção de
  // vulnerabilidade, é upgrade de robustez. Vale registrar a diferença:
  //   * padroniza com as outras 8 desta leva (um mecanismo só para revisar);
  //   * resolveOrgId força usuário de tenant à PRÓPRIA org, ignorando o
  //     organization_id vindo no body. O original aceitava o org do cliente e
  //     só DEPOIS checava membership — seguro como está, mas é a forma que
  //     sobrevive a revisão desatenta no dia em que alguém trocar a ordem.
  const auth = await authenticateTenant(req, sbAdmin, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;
  const userId = auth.userId;

  const body = await req.json().catch(() => ({}));
  const {
    connection_id,
    organization_id,
    display_name,
    app_id,
    app_secret,
    access_token,
    phone_number_id,
    waba_id,
    default_reengagement_template_id,
  } = body ?? {};

  if (!organization_id || !display_name || !app_id || !access_token || !phone_number_id || !waba_id) {
    return json({ error: 'missing fields' }, 400);
  }

  // Gate de org. Substitui a RPC user_belongs_to_organization do original:
  // assertOrgAccess libera service_role/super_admin e, para usuário de tenant,
  // exige que o organization_id pedido seja o DELE — mesma garantia, mecanismo
  // único em toda a leva.
  const denied = assertOrgAccess(auth, organization_id, corsHeaders);
  if (denied) return denied;

  // Valida no Graph
  let phoneInfo: any;
  try {
    phoneInfo = await graphFetch(`/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, access_token);
  } catch (e) {
    const ge = e as GraphError;
    return json({ error: 'phone_number_id inválido ou token sem permissão', detail: ge.graph?.message ?? String(e) }, 400);
  }
  let wabaInfo: any;
  try {
    wabaInfo = await graphFetch(`/${waba_id}?fields=name,id`, access_token);
  } catch (e) {
    const ge = e as GraphError;
    return json({ error: 'WABA ID inválido ou sem permissão whatsapp_business_management', detail: ge.graph?.message ?? String(e) }, 400);
  }

  // Detecta se é update/promoção (connection_id) ou criação direta (sem id).
  const isExisting = !!connection_id;
  let row: any;

  if (isExisting) {
    // Carrega o registro (rascunho ou ativo) e promove a 'active'.
    const { data: current, error: loadErr } = await sbAdmin
      .from('whatsapp_meta_connections')
      .select('id, status, app_secret_encrypted, access_token_encrypted, webhook_verify_token')
      .eq('id', connection_id)
      .eq('organization_id', organization_id)
      .single();
    if (loadErr || !current) return json({ error: 'connection not found' }, 404);

    const updates: Record<string, any> = {
      display_name,
      app_id,
      phone_number_id,
      waba_id,
      phone_number: phoneInfo?.display_phone_number ?? null,
      business_account_name: wabaInfo?.name ?? null,
      quality_rating: phoneInfo?.quality_rating ?? null,
      messaging_limit_tier: phoneInfo?.messaging_limit_tier ?? null,
      status: 'active',
      last_error: null,
      last_health_check_at: new Date().toISOString(),
      default_reengagement_template_id: default_reengagement_template_id ?? null,
    };
    if (app_secret) {
      updates.app_secret_encrypted = await encryptSecret(app_secret);
    } else if (!current.app_secret_encrypted) {
      return json({ error: 'app_secret obrigatório (não há um salvo anteriormente)' }, 400);
    }
    if (access_token) {
      updates.access_token_encrypted = await encryptSecret(access_token);
    } else if (!current.access_token_encrypted) {
      return json({ error: 'access_token obrigatório (não há um salvo anteriormente)' }, 400);
    }

    const { data, error } = await sbAdmin
      .from('whatsapp_meta_connections')
      .update(updates)
      .eq('id', connection_id)
      .eq('organization_id', organization_id)
      .select('id, webhook_verify_token')
      .single();
    if (error) return json({ error: error.message }, 500);
    row = data;
  } else {
    // app_secret OPCIONAL na criação (pedido triangulado da Trilha S — Embedded
    // Signup). No caminho self-service o app Meta é NOSSO: o tenant nunca vê nem
    // possui app_secret, e existe UM secret só, em env de servidor. Exigir aqui
    // quebraria o insert do fluxo self-service. A coluna já nascia NULLABLE — a
    // obrigatoriedade vivia só neste 400, não no schema.
    // O caminho manual (wizard) continua enviando app_secret normalmente; quem
    // valida a conexão de fato é o Graph, logo acima.
    const verifyToken = generateVerifyToken();
    const { data, error } = await sbAdmin
      .from('whatsapp_meta_connections')
      .insert({
        organization_id,
        display_name,
        app_id,
        app_secret_encrypted: await encryptSecret(app_secret),
        access_token_encrypted: await encryptSecret(access_token),
        phone_number_id,
        waba_id,
        phone_number: phoneInfo?.display_phone_number ?? null,
        business_account_name: wabaInfo?.name ?? null,
        quality_rating: phoneInfo?.quality_rating ?? null,
        messaging_limit_tier: phoneInfo?.messaging_limit_tier ?? null,
        webhook_verify_token: verifyToken,
        status: 'active',
        last_health_check_at: new Date().toISOString(),
        created_by: userId,
      })
      .select('id, webhook_verify_token')
      .single();
    if (error) return json({ error: error.message }, 500);
    row = data;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const webhookUrl = `${supabaseUrl}/functions/v1/meta-whatsapp-webhook/${row.id}`;
  return json({
    connection_id: row.id,
    webhook_url: webhookUrl,
    verify_token: row.webhook_verify_token,
    subscribe_fields: ['messages', 'message_template_status_update'],
  });
  } catch (e) {
    console.error('[meta-whatsapp-connect] unhandled', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || 'internal error' }, 500);
  }
});



function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
