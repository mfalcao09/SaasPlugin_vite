// Porte 1:1 do distribute-lead do CRM Vendus -> platform_crm (super-admin). Nao construir inspirado.
//
// MAPEAMENTOS APLICADOS:
//   * Tabelas/RPC (tableMappings):
//       - RPC distribute_lead        -> distribute_platform_lead
//       - RPC process_pending_queue  -> process_platform_pending_queue
//         (fila round-robin sobre platform_crm_distribution_config +
//          platform_crm_lead_queue)
//   * Escopo organization_id (orgScopingRule): REMOVIDO. O CRM de plataforma nao
//     tem tenant — `organization_id` sai do body, da validacao e do payload das
//     RPCs. `product_id` tambem sai: a tabela platform_crm_lead_queue nao tem a
//     coluna product_id (ver schema 8.1) e a distribuicao da plataforma nao é
//     escopada por produto.
//   * Imports _shared (sharedImports):
//       - createClient(SUPABASE_URL, SERVICE_ROLE) inline do original
//         -> createPlatformServiceClient() (../_shared/platform-crm-audience.ts)
//       - corsHeaders inline do original
//         -> platformCrmCorsHeaders (../_shared/platform-crm-auth.ts)
//   * Auth (authNote): o original nao autenticava (rodava so com SERVICE_ROLE
//     interno). Mantido o mesmo padrao dos edges platform-* ja portados:
//     cron/interno = bearer SERVICE_ROLE; humano = JWT super_admin
//     (authenticatePlatformAgent). Este bloco é ADICAO de gate de plataforma,
//     nao existia branch de auth no original (nada foi removido de comportamento).
//
// ⚠️ __NO_EQUIVALENT__ (sinalizado — RPCs ainda NAO existem no schema platform_crm):
//     As funcoes SQL distribute_platform_lead(p_lead_id, p_squad_id) e
//     process_platform_pending_queue(p_user_id) NAO foram encontradas em
//     supabase/migrations_platform_crm/ (só existem as TABELAS
//     platform_crm_distribution_config e platform_crm_lead_queue). O original
//     apenas invocava as RPCs distribute_lead / process_pending_queue — portanto
//     este porte 1:1 mantem a invocacao com os nomes mapeados. É PRÉ-REQUISITO
//     criar essas 2 funcoes SQL (porte 1:1 das originais em
//     20260219194028_*.sql / 20260218150936_*.sql, sem organization_id/product_id,
//     usando squad_members/user_status da plataforma) antes deste edge funcionar.
//
// 🔒 ZERO tabela de tenant.

import { createPlatformServiceClient } from '../_shared/platform-crm-audience.ts';
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from '../_shared/platform-crm-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createPlatformServiceClient();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json();

    // Cron/interno: bearer = SERVICE_ROLE key. Humano: JWT super_admin.
    const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (bearer !== serviceKey) {
      const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
      if (errorResponse) return errorResponse;
    }

    const { action, lead_id, squad_id, user_id } = body;

    if (action === 'distribute') {
      if (!lead_id || !squad_id) {
        return new Response(JSON.stringify({ error: 'lead_id, squad_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // __NO_EQUIVALENT__: RPC ainda inexistente no schema platform_crm (ver header).
      const { data: assignedUserId, error } = await supabase.rpc('platform_crm_distribute_lead', {
        p_lead_id: lead_id,
        p_squad_id: squad_id,
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

      // __NO_EQUIVALENT__: RPC ainda inexistente no schema platform_crm (ver header).
      const { data, error } = await supabase.rpc('platform_crm_process_pending_queue', {
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
    console.error('platform-distribute-lead error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
