// Edge Function: inbox-followup (Sprint 7 F4)
// verify_jwt: false — autenticado via CRON_SECRET no header x-cron-secret
// Envia follow-up para conversas inativas há N dias (até 3x por conversa).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

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

  // Busca empresas com followup_enabled = true
  const { data: empresas, error: empErr } = await supabase
    .from("empresas")
    .select("id, followup_delay_days, followup_message")
    .eq("followup_enabled", true);

  if (empErr || !empresas || empresas.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let totalSent = 0;

  for (const empresa of empresas) {
    const empresaId = empresa.id as string;
    const delayDays = (empresa.followup_delay_days as number) ?? 2;
    const followupMessage =
      (empresa.followup_message as string) ??
      "Olá! Passando para verificar se ainda posso te ajudar. 😊";

    // Calcula threshold de inatividade
    const thresholdDate = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000).toISOString();

    // Busca conversas inativas elegíveis para follow-up
    const { data: convs } = await supabase
      .from("inbox_conversations")
      .select("id, contact_phone, evolution_instance_id, followup_count")
      .eq("empresa_id", empresaId)
      .in("status", ["waiting_human", "human_active"])
      .lt("last_message_at", thresholdDate)
      .lt("followup_count", 3);

    if (!convs || convs.length === 0) continue;

    for (const conv of convs) {
      // Busca instance_id para enviar via Evolution
      const { data: instance } = await supabase
        .from("evolution_instances")
        .select("instance_id")
        .eq("id", conv.evolution_instance_id)
        .single();

      if (!instance?.instance_id) {
        console.warn(`[followup] sem instance para conv ${conv.id}`);
        continue;
      }

      // Envia follow-up via Evolution API (fetch direto — sem SDK)
      const sendRes = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${instance.instance_id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: conv.contact_phone,
            text: followupMessage,
          }),
        },
      ).catch(() => null);

      if (!sendRes || !sendRes.ok) {
        console.error(`[followup] falha ao enviar para conv ${conv.id}`);
        continue;
      }

      const now = new Date().toISOString();

      // Atualiza conversa + insere mensagem de follow-up no histórico
      await Promise.all([
        supabase
          .from("inbox_conversations")
          .update({
            last_followup_at: now,
            followup_count: ((conv.followup_count as number) ?? 0) + 1,
          })
          .eq("id", conv.id),
        supabase.from("inbox_messages").insert({
          conversation_id: conv.id,
          direction: "outbound",
          sender_type: "bot",
          content: followupMessage,
          content_type: "text",
          is_deleted: false,
        }),
      ]);

      totalSent++;
      console.log(`[followup] enviado para conv ${conv.id} (count=${((conv.followup_count as number) ?? 0) + 1})`);
    }
  }

  return new Response(JSON.stringify({ sent: totalSent }), {
    headers: { "Content-Type": "application/json" },
  });
});
