// platform-meta-whatsapp-draft — cria conexão WhatsApp Meta em "rascunho" no CRM
// de PLATAFORMA (super_admin). Porte 1:1 do `meta-whatsapp-draft` do Vendus,
// DESACOPLADO do tenant:
//   * Tabela: platform_crm_whatsapp_meta_connections (SEM organization_id).
//   * Auth: super_admin via authenticatePlatformAgent (era user_belongs_to_organization).
//   * Webhook URL -> ${SUPABASE_URL}/functions/v1/platform-meta-whatsapp-webhook/{id}
//     (o -webhook de plataforma e fase de inbox; a URL e exibida no wizard).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateVerifyToken } from '../_shared/meta-crypto.ts';
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const body = await req.json().catch(() => ({}));

  const { user, errorResponse } = await authenticatePlatformAgent(req, sbAdmin, serviceRoleKey, body);
  if (errorResponse) return errorResponse;
  const userId = user!.id;

  const { display_name, connection_id } = body ?? {};
  if (!display_name) return json({ error: 'missing fields: display_name' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  if (connection_id) {
    const { data: existing } = await sbAdmin
      .from('platform_crm_whatsapp_meta_connections')
      .select('id, webhook_verify_token, status, webhook_subscribed_at')
      .eq('id', connection_id)
      .maybeSingle();
    if (existing) {
      return json({
        connection_id: existing.id,
        verify_token: existing.webhook_verify_token,
        webhook_url: `${supabaseUrl}/functions/v1/platform-meta-whatsapp-webhook/${existing.id}`,
        webhook_subscribed_at: existing.webhook_subscribed_at,
        status: existing.status,
      });
    }
  }

  const verifyToken = generateVerifyToken();
  const { data: row, error } = await sbAdmin
    .from('platform_crm_whatsapp_meta_connections')
    .insert({
      display_name,
      webhook_verify_token: verifyToken,
      status: 'draft',
      created_by: userId,
    })
    .select('id, webhook_verify_token, webhook_subscribed_at, status')
    .single();
  if (error) return json({ error: error.message }, 500);

  return json({
    connection_id: row.id,
    verify_token: row.webhook_verify_token,
    webhook_url: `${supabaseUrl}/functions/v1/platform-meta-whatsapp-webhook/${row.id}`,
    webhook_subscribed_at: row.webhook_subscribed_at,
    status: row.status,
  });
});
