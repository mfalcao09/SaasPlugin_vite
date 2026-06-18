// Edge Function: start-conversation (v1)
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: true (chamada pelo front-end com token do usuário autenticado)
//
// Responsabilidade: iniciar uma nova conversa outbound via Evolution API.
// 1. Normalizar telefone (adicionar DDI 55 se necessário)
// 2. Buscar instância ativa da empresa (se instance_id não fornecido)
// 3. Enviar mensagem via Evolution API POST /message/sendText/{instance}
// 4. Retornar { success: true } — o webhook criará a conversa ao receber o eco

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Adiciona DDI 55 (Brasil) se não começar com 55 e tiver 10-11 dígitos
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  return digits;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  let body: { phone?: string; message?: string; empresa_id?: string; instance_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const { phone: rawPhone, message, empresa_id: empresaId, instance_id: instanceIdInput } = body;

  if (!rawPhone || !message || !empresaId) {
    return new Response(
      JSON.stringify({ error: "phone, message e empresa_id são obrigatórios" }),
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const phone = normalizePhone(rawPhone);
  if (phone.length < 12) {
    return new Response(
      JSON.stringify({ error: "Número de telefone inválido (mínimo 12 dígitos com DDI)" }),
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Buscar instância da Evolution
  let instanceName: string;

  if (instanceIdInput) {
    // instance_id fornecido explicitamente
    const { data: inst } = await supabase
      .from("evolution_instances")
      .select("instance_id")
      .eq("id", instanceIdInput)
      .eq("empresa_id", empresaId)
      .single();

    if (!inst?.instance_id) {
      return new Response(
        JSON.stringify({ error: "Instância não encontrada ou não pertence a esta empresa" }),
        { status: 404, headers: CORS_HEADERS },
      );
    }
    instanceName = inst.instance_id;
  } else {
    // Buscar instância conectada da empresa
    const { data: inst } = await supabase
      .from("evolution_instances")
      .select("instance_id")
      .eq("empresa_id", empresaId)
      .eq("status", "connected")
      .order("last_connected_at", { ascending: false })
      .limit(1)
      .single();

    if (!inst?.instance_id) {
      return new Response(
        JSON.stringify({ error: "Nenhuma instância WhatsApp conectada para esta empresa" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }
    instanceName = inst.instance_id;
  }

  // Enviar mensagem via Evolution API
  try {
    const evoRes = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: phone,
          text: message,
        }),
      },
    );

    if (!evoRes.ok) {
      const errText = await evoRes.text();
      console.error(`[start-conversation] Evolution API error ${evoRes.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: `Erro ao enviar via WhatsApp: ${evoRes.status}` }),
        { status: 502, headers: CORS_HEADERS },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("[start-conversation] fetch exception:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao contatar WhatsApp" }),
      { status: 500, headers: CORS_HEADERS },
    );
  }
});
