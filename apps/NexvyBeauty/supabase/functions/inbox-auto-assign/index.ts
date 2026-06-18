// Edge Function: inbox-auto-assign (Sprint 7 F3)
// verify_jwt: false — autenticado via CRON_SECRET no header x-cron-secret
// Executa round-robin de atribuição em conversas sem agente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

Deno.serve(async (req) => {
  // Autenticação via CRON_SECRET
  const incomingSecret = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && incomingSecret !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Busca empresas com auto_assign_enabled = true
  const { data: empresas, error: empErr } = await supabase
    .from("empresas")
    .select("id")
    .eq("auto_assign_enabled", true);

  if (empErr || !empresas || empresas.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let totalAssigned = 0;

  for (const empresa of empresas) {
    const empresaId = empresa.id as string;

    // Busca conversas sem agente e em waiting_human
    const { data: unassigned } = await supabase
      .from("inbox_conversations")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("status", "waiting_human")
      .is("assigned_user_id", null);

    if (!unassigned || unassigned.length === 0) continue;

    // Busca agentes disponíveis
    const { data: agents } = await supabase
      .from("empresa_users")
      .select("user_id")
      .eq("empresa_id", empresaId)
      .eq("inbox_available", true);

    if (!agents || agents.length === 0) continue;

    // Conta conversas ativas por agente para round-robin
    const { data: activeConvs } = await supabase
      .from("inbox_conversations")
      .select("assigned_user_id")
      .eq("empresa_id", empresaId)
      .in("status", ["human_active", "waiting_human"])
      .not("assigned_user_id", "is", null);

    const loadMap: Record<string, number> = {};
    for (const agent of agents) {
      loadMap[agent.user_id as string] = 0;
    }
    for (const conv of activeConvs ?? []) {
      const uid = conv.assigned_user_id as string;
      if (uid && loadMap[uid] !== undefined) {
        loadMap[uid]++;
      }
    }

    for (const conv of unassigned) {
      // Seleciona agente com menor carga (menor número de conversas ativas)
      const agentId = Object.entries(loadMap).sort((a, b) => a[1] - b[1])[0]?.[0];
      if (!agentId) break;

      await supabase
        .from("inbox_conversations")
        .update({ assigned_user_id: agentId })
        .eq("id", conv.id);

      await supabase.from("inbox_assign_log").insert({
        empresa_id: empresaId,
        conversation_id: conv.id,
        assigned_to: agentId,
        assigned_at: new Date().toISOString(),
      });

      // Incrementa carga local para distribuição justa na mesma execução
      loadMap[agentId]++;
      totalAssigned++;
      console.log(`[auto-assign] conversa ${conv.id} → agente ${agentId}`);
    }
  }

  return new Response(JSON.stringify({ assigned: totalAssigned }), {
    headers: { "Content-Type": "application/json" },
  });
});
