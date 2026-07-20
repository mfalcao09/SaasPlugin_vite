import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticateTenant, assertOrgAccess } from '../_shared/tenant-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth OBRIGATÓRIA (P1): a anon key pública chamava esta edge e reatribuía
    // leads de qualquer org sem verificação. Agora reautentica SEMPRE e valida a
    // posse da org do lead/squad (service_role/super_admin passam).
    const auth = await authenticateTenant(req, supabase, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;

    const { action, lead_id, squad_id, organization_id, product_id, user_id } = await req.json();

    if (action === 'distribute') {
      if (!lead_id || !squad_id || !organization_id) {
        return new Response(JSON.stringify({ error: 'lead_id, squad_id, organization_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Usuário de tenant só distribui dentro da própria org.
      const orgGuard = assertOrgAccess(auth, organization_id, corsHeaders);
      if (orgGuard) return orgGuard;

      const { data: assignedUserId, error } = await supabase.rpc('distribute_lead', {
        p_lead_id: lead_id,
        p_squad_id: squad_id,
        p_organization_id: organization_id,
        p_product_id: product_id || null,
      });

      if (error) {
        console.error('Distribution error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          assigned_to: assignedUserId,
          queued: assignedUserId === null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'process_queue') {
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Usuário de tenant só processa fila de alguém da própria org (o user_id
      // vem do body e não é confiável). service_role/super_admin passam direto.
      if (!auth.isServiceRole && !auth.isSuperAdmin) {
        const { data: targetProfile } = await supabase
          .from('profiles').select('organization_id').eq('id', user_id).maybeSingle();
        const queueGuard = assertOrgAccess(auth, targetProfile?.organization_id ?? null, corsHeaders);
        if (queueGuard) return queueGuard;
      }

      const { data, error } = await supabase.rpc('process_pending_queue', {
        p_user_id: user_id,
      });

      if (error) {
        console.error('Queue processing error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          assigned: data && data.length > 0 ? data[0] : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('distribute-lead error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
