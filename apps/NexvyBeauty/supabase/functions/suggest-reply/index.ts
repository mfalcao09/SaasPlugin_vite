import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Inline do _shared/ai.ts (mantém a função self-contained p/ deploy sem dep relativa).
// Mesmo gateway env-driven das demais edges (OpenRouter por padrão).
function aiGatewayUrl(): string {
  return (Deno.env.get("AI_GATEWAY_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
}
function aiApiKey(): string {
  return Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY") ?? "";
}
function aiChatCompletionsUrl(): string {
  return `${aiGatewayUrl()}/chat/completions`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversationId } = await req.json();
    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the conversation's messages (last ~12 used for the prompt).
    const { data: messages, error: msgError } = await supabase
      .from("webchat_messages")
      .select("content, sender_type, direction, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      throw new Error("Failed to fetch messages");
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recent = messages.slice(-12);
    const transcript = recent
      .map((m: any) => `[${m.sender_type || m.direction}]: ${m.content}`)
      .join("\n");

    const AI_API_KEY = aiApiKey();
    if (!AI_API_KEY) throw new Error("AI_API_KEY (ou LOVABLE_API_KEY) not configured");

    const response = await fetch(aiChatCompletionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é a recepcionista de um espaço de beleza falando no WhatsApp. Escreva UMA resposta curta, calorosa e profissional (1-3 frases) para enviar AGORA ao cliente, com base na conversa. Sem colchetes, sem placeholders, sem 'Olá [nome]'. Responda apenas com a mensagem pronta para enviar.",
          },
          {
            role: "user",
            content: `${transcript}\n\nSugira a melhor resposta para enviar agora:`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const answer = (aiData.choices?.[0]?.message?.content ?? "").trim();

    if (!answer) {
      throw new Error("No suggestion returned");
    }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
