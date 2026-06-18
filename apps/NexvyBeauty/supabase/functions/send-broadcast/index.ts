// Edge Function: send-broadcast
// Envia uma mensagem de texto para uma lista de números via Evolution API.
// Limitado a 50 contatos por chamada com anti-flood de 1.5s entre envios.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? ""
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  let body: { phones: string[]; message: string; empresa_id: string; instance_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const { phones, message, empresa_id } = body
  if (!phones?.length || !message || !empresa_id) {
    return new Response(
      JSON.stringify({ error: "phones, message e empresa_id são obrigatórios" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const batch = phones.slice(0, 50)

  const { data: instance } = await supabase
    .from("evolution_instances")
    .select("instance_id")
    .eq("empresa_id", empresa_id)
    .eq("status", "connected")
    .limit(1)
    .single()

  if (!instance) {
    return new Response(
      JSON.stringify({ error: "Nenhuma instância WhatsApp conectada" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const phone of batch) {
    try {
      const res = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${instance.instance_id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVOLUTION_API_KEY,
          },
          body: JSON.stringify({ number: phone, text: message }),
        },
      )
      if (res.ok) {
        sent++
      } else {
        failed++
        errors.push(`${phone}: HTTP ${res.status}`)
      }
    } catch (e) {
      failed++
      errors.push(`${phone}: ${e instanceof Error ? e.message : "erro"}`)
    }
    // Anti-flood: esperar 1.5s entre cada envio
    await new Promise(r => setTimeout(r, 1500))
  }

  return new Response(
    JSON.stringify({ sent, failed, errors }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
})
