// meta-whatsapp-draft
// Cria uma conexão WhatsApp Meta em modo "rascunho" para que o wizard
// possa exibir Verify Token e URL de callback ANTES de o usuário ter
// terminado de criar o Meta App.
// Cada conexão recebe seu próprio webhook_verify_token; a URL final é
// {SUPABASE_URL}/functions/v1/meta-whatsapp-webhook/{connection_id}.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateVerifyToken } from '../_shared/meta-crypto.ts';
import { authenticateTenant, assertOrgAccess } from '../_shared/tenant-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // AUTH (adaptação do porte): mesmo mecanismo das outras 8 desta leva.
  // O original já era auth real; isto padroniza e faz resolveOrgId ignorar o
  // organization_id vindo do body para usuário de tenant.
  const auth = await authenticateTenant(req, sbAdmin, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;
  const userId = auth.userId;

  const body = await req.json().catch(() => ({}));
  const { organization_id, display_name, connection_id } = body ?? {};

  if (!organization_id || !display_name) {
    return json({ error: 'missing fields: organization_id, display_name' }, 400);
  }

  // Gate de org — substitui a RPC user_belongs_to_organization do original.
  const denied = assertOrgAccess(auth, organization_id, corsHeaders);
  if (denied) return denied;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Se passaram connection_id, tenta retomar rascunho existente.
  if (connection_id) {
    const { data: existing } = await sbAdmin
      .from('whatsapp_meta_connections')
      .select('id, webhook_verify_token, status, webhook_subscribed_at')
      .eq('id', connection_id)
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (existing) {
      return json({
        connection_id: existing.id,
        verify_token: existing.webhook_verify_token,
        webhook_url: `${supabaseUrl}/functions/v1/meta-whatsapp-webhook/${existing.id}`,
        webhook_subscribed_at: existing.webhook_subscribed_at,
        status: existing.status,
      });
    }
  }

  // INSERT do rascunho.
  const verifyToken = generateVerifyToken();
  const { data: row, error } = await sbAdmin
    .from('whatsapp_meta_connections')
    .insert({
      organization_id,
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
    webhook_url: `${supabaseUrl}/functions/v1/meta-whatsapp-webhook/${row.id}`,
    webhook_subscribed_at: row.webhook_subscribed_at,
    status: row.status,
  });
});
