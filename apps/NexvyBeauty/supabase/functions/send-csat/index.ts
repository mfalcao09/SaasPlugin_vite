// Edge Function: send-csat (Sprint 7 F1)
// verify_jwt: true
// Envia pesquisa CSAT ao fechar uma conversa.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { conversation_id } = body;
  if (!conversation_id) {
    return new Response(JSON.stringify({ error: "conversation_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Busca conversa + empresa
  const { data: conv, error: convErr } = await supabase
    .from("inbox_conversations")
    .select("id, empresa_id, contact_phone, evolution_instance_id")
    .eq("id", conversation_id)
    .single();

  if (convErr || !conv) {
    return new Response(JSON.stringify({ error: "conversation not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verifica csat_enabled na empresa
  const { data: empresa, error: empErr } = await supabase
    .from("empresas")
    .select("csat_enabled, csat_message")
    .eq("id", conv.empresa_id)
    .single();

  if (empErr || !empresa) {
    return new Response(JSON.stringify({ error: "empresa not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!empresa.csat_enabled) {
    return new Response(JSON.stringify({ skipped: true, reason: "csat_disabled" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verifica UNIQUE: não reenvia se já existe entry
  const { data: existing } = await supabase
    .from("inbox_csat_responses")
    .select("id")
    .eq("conversation_id", conversation_id)
    .single();

  if (existing) {
    return new Response(JSON.stringify({ skipped: true, reason: "already_sent" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Busca instance_id para enviar via Evolution
  const { data: instance } = await supabase
    .from("evolution_instances")
    .select("instance_id")
    .eq("id", conv.evolution_instance_id)
    .single();

  if (!instance?.instance_id) {
    return new Response(JSON.stringify({ error: "evolution instance not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const csatMessage =
    empresa.csat_message ??
    "Como foi seu atendimento? Responda com um número de 1 a 5 (1=péssimo, 5=ótimo)";

  // Envia via Evolution API (fetch direto — sem SDK)
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
        text: csatMessage,
      }),
    },
  );

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    console.error("[send-csat] Evolution send error:", errText);
    return new Response(JSON.stringify({ error: "evolution send failed", detail: errText }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // INSERT em inbox_csat_responses
  const { error: insertErr } = await supabase.from("inbox_csat_responses").insert({
    empresa_id: conv.empresa_id,
    conversation_id,
    contact_phone: conv.contact_phone,
    sent_at: new Date().toISOString(),
  });

  if (insertErr) {
    console.error("[send-csat] insert error:", insertErr.message);
    return new Response(JSON.stringify({ error: "insert failed", detail: insertErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[send-csat] CSAT enviado para conversa ${conversation_id}, phone ${conv.contact_phone}`);
  return new Response(JSON.stringify({ sent: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
