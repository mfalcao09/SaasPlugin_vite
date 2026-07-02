// platform-meta-whatsapp-connect — recebe credenciais do wizard, valida via Graph
// API, criptografa, salva. Porte 1:1 do `meta-whatsapp-connect` do Vendus,
// DESACOPLADO do tenant:
//   * Tabela: platform_crm_whatsapp_meta_connections (SEM organization_id).
//   * Auth: super_admin via authenticatePlatformAgent (era user_belongs_to_organization).
//   * Retorna webhook_url (platform-meta-whatsapp-webhook/{id}) + verify_token.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { encryptSecret, generateVerifyToken } from '../_shared/meta-crypto.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    const body = await req.json().catch(() => ({}));

    const { user, errorResponse } = await authenticatePlatformAgent(req, sbAdmin, serviceRoleKey, body);
    if (errorResponse) return errorResponse;
    const userId = user!.id;

    const {
      connection_id,
      display_name,
      app_id,
      app_secret,
      access_token,
      phone_number_id,
      waba_id,
      default_reengagement_template_id,
    } = body ?? {};

    if (!display_name || !app_id || !access_token || !phone_number_id || !waba_id) {
      return json({ error: 'missing fields' }, 400);
    }

    // Valida no Graph
    let phoneInfo: any;
    try {
      phoneInfo = await graphFetch(`/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, access_token);
    } catch (e) {
      const ge = e as GraphError;
      return json({ error: 'phone_number_id invalido ou token sem permissao', detail: ge.graph?.message ?? String(e) }, 400);
    }
    let wabaInfo: any;
    try {
      wabaInfo = await graphFetch(`/${waba_id}?fields=name,id`, access_token);
    } catch (e) {
      const ge = e as GraphError;
      return json({ error: 'WABA ID invalido ou sem permissao whatsapp_business_management', detail: ge.graph?.message ?? String(e) }, 400);
    }

    const isExisting = !!connection_id;
    let row: any;

    if (isExisting) {
      const { data: current, error: loadErr } = await sbAdmin
        .from('platform_crm_whatsapp_meta_connections')
        .select('id, status, app_secret_encrypted, access_token_encrypted, webhook_verify_token')
        .eq('id', connection_id)
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
        return json({ error: 'app_secret obrigatorio (nao ha um salvo anteriormente)' }, 400);
      }
      if (access_token) {
        updates.access_token_encrypted = await encryptSecret(access_token);
      } else if (!current.access_token_encrypted) {
        return json({ error: 'access_token obrigatorio (nao ha um salvo anteriormente)' }, 400);
      }

      const { data, error } = await sbAdmin
        .from('platform_crm_whatsapp_meta_connections')
        .update(updates)
        .eq('id', connection_id)
        .select('id, webhook_verify_token')
        .single();
      if (error) return json({ error: error.message }, 500);
      row = data;
    } else {
      if (!app_secret) return json({ error: 'app_secret obrigatorio na criacao' }, 400);
      const verifyToken = generateVerifyToken();
      const { data, error } = await sbAdmin
        .from('platform_crm_whatsapp_meta_connections')
        .insert({
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
    const webhookUrl = `${supabaseUrl}/functions/v1/platform-meta-whatsapp-webhook/${row.id}`;
    return json({
      connection_id: row.id,
      webhook_url: webhookUrl,
      verify_token: row.webhook_verify_token,
      subscribe_fields: ['messages', 'message_template_status_update'],
    });
  } catch (e) {
    console.error('[platform-meta-whatsapp-connect] unhandled', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || 'internal error' }, 500);
  }
});
