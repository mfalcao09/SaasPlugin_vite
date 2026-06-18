// Edge Function: inbox-copilot
// Deployed em: project gpxmkximudukbljrvtxj (NexvyOficinas)
// verify_jwt: true
//
// Responsabilidades:
// 1. Receber { conversation_id, empresa_id }
// 2. Buscar últimas 15 mensagens da conversa
// 3. Montar prompt de atendimento de oficina mecânica
// 4. Chamar Anthropic Claude via fetch direto (sem SDK — ambiente Deno)
// 5. Retornar { suggestion }
//
// Env vars: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

interface RequestBody {
  conversation_id: string;
  empresa_id: string;
}

interface MessageRow {
  sender_type: string;
  content: string | null;
  content_type: string;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Validar JWT
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
    const { conversation_id } = body;

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar últimas 15 mensagens (não deletadas)
    const { data: msgs } = await supabase
      .from("inbox_messages")
      .select("sender_type,content,content_type,created_at")
      .eq("conversation_id", conversation_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(15);

    const messages: MessageRow[] = (msgs ?? []).reverse(); // mais antiga primeiro

    // 2. Montar histórico legível
    const historico = messages
      .map(m => {
        const remetente =
          m.sender_type === "contact" ? "Cliente" :
          m.sender_type === "bot"     ? "Bot"     : "Atendente";
        const texto =
          m.content_type === "text"
            ? (m.content ?? "")
            : `[${m.content_type}]`;
        return `${remetente}: ${texto}`;
      })
      .join("\n");

    const prompt =
      "Você é assistente de atendimento de uma oficina mecânica. " +
      "Histórico:\n" + historico +
      "\n\nSugira UMA resposta curta e profissional em português:";

    // 3. Chamar Anthropic API via fetch direto (NUNCA via SDK — ambiente Deno)
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[inbox-copilot] Anthropic API error:", anthropicRes.status, errText);
      return new Response(JSON.stringify({ error: "Anthropic API error", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicData = await anthropicRes.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const suggestion = anthropicData.content
      .filter(c => c.type === "text")
      .map(c => c.text)
      .join("")
      .trim();

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[inbox-copilot] exception:", err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
