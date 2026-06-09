// Edge Function: transcribe-audio
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: true
//
// Responsabilidades:
// 1. Receber { storage_url, message_id }
// 2. Fazer fetch do áudio no storage_url
// 3. Enviar para OpenAI Whisper API (whisper-1, language: pt)
// 4. UPDATE inbox_messages SET transcript WHERE id = message_id
// 5. Retornar { transcript }
//
// Env vars: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

interface RequestBody {
  storage_url: string;
  message_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Validar JWT do usuário
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    const { storage_url, message_id } = body;

    if (!storage_url || !message_id) {
      return new Response(JSON.stringify({ error: "storage_url and message_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch do arquivo de áudio do storage
    const audioResponse = await fetch(storage_url);
    if (!audioResponse.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch audio: ${audioResponse.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buffer = await audioResponse.arrayBuffer();

    // 2. Montar FormData para Whisper API
    const formData = new FormData();
    const audioBlob = new Blob([buffer], { type: "audio/ogg" });
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    // 3. Chamar OpenAI Whisper via fetch direto (sem SDK — ambiente Deno)
    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("[transcribe-audio] Whisper API error:", whisperRes.status, errText);
      return new Response(JSON.stringify({ error: "Whisper API error", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const whisperData = await whisperRes.json() as { text: string };
    const transcript = whisperData.text?.trim() ?? "";

    // 4. Persistir transcrição no banco
    const { error: updateErr } = await supabase
      .from("inbox_messages")
      .update({ transcript })
      .eq("id", message_id);

    if (updateErr) {
      console.error("[transcribe-audio] DB update error:", updateErr.message);
      return new Response(JSON.stringify({ error: "Failed to save transcript", detail: updateErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[transcribe-audio] exception:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
