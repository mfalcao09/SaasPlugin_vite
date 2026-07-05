// platform-analyze-conversation — AVALIADOR (LLM-as-Judge) da inbox do CRM de PLATAFORMA.
//
// Porte 1:1 do `analyze-conversation` do CRM Vendus (tenant), desacoplado do tenant:
//   * Tabelas: platform_crm_messages / platform_crm_conversations / platform_crm_leads.
//     SEM organization_id, SEM webchat_widgets/products (a conversa de plataforma não
//     tem produto vinculado — adaptação anotada abaixo).
//   * Auth: Bearer JWT do usuário validado via getClaims + gate super_admin em
//     user_roles (via authenticatePlatformAgent). Leitura SEMPRE via SERVICE_ROLE.
//   * Gateway IA: MESMO shape/env do original — aiChatCompletionsUrl()/aiApiKey() do
//     _shared/ai.ts (AI_API_KEY/AI_GATEWAY_URL, fallback LOVABLE_API_KEY). Mesmo modelo,
//     mesmo system prompt, mesma tool `analyze_conversation` e mesmo formato de saída.
//
// Adaptações de schema (vs. original tenant):
//   * `productName`: o original deriva de webchat_widgets(products(name,description)),
//     inexistente na plataforma. Aqui usa-se um rótulo de contexto derivado da própria
//     conversa (nome do visitante/lead + canal), mantendo o resto do prompt idêntico.
//   * Transcrição: mesma projeção `[sender_type|direction]: content`, filtrando
//     mensagens soft-deleted (is_deleted) que não existem no original.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { aiChatCompletionsUrl, aiApiKey } from "../_shared/ai.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Parse do body ANTES do auth (o gate de service-role atua sobre actorUserId do body).
    let bodyParsed: any = {};
    try {
      bodyParsed = await req.clone().json();
    } catch (_) {
      /* sem body ou json inválido */
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gate super_admin (JWT do usuário ou service-role interna) — 1:1 com os demais edges platform-crm.
    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      supabaseKey,
      bodyParsed,
    );
    if (errorResponse) return errorResponse;
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversationId = bodyParsed?.conversationId ?? bodyParsed?.conversation_id;
    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca mensagens da conversa (exclui soft-deleted; ordena cronologicamente).
    const { data: messages, error: msgError } = await supabase
      .from("platform_crm_messages")
      .select("content, sender_type, created_at, direction")
      .eq("conversation_id", conversationId)
      .neq("is_deleted", true)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("[platform-analyze-conversation] error fetching messages:", msgError);
      throw new Error("Failed to fetch messages");
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Contexto da conversa: a plataforma não tem produto vinculado (sem webchat_widgets/
    // products). Deriva-se um rótulo a partir do visitante/lead + canal para manter o
    // prompt do original o mais próximo possível.
    const { data: conv } = await supabase
      .from("platform_crm_conversations")
      .select("id, visitor_name, channel, lead_id")
      .eq("id", conversationId)
      .maybeSingle();

    let leadName: string | null = null;
    if (conv?.lead_id) {
      const { data: lead } = await supabase
        .from("platform_crm_leads")
        .select("name")
        .eq("id", conv.lead_id)
        .maybeSingle();
      leadName = lead?.name ?? null;
    }

    const contactLabel = leadName || conv?.visitor_name || "Contato não identificado";
    const channelLabel = conv?.channel || "chat";
    const contextName = `${contactLabel} (canal: ${channelLabel})`;

    const transcript = messages
      .map((m: any) => `[${m.sender_type || m.direction}]: ${m.content}`)
      .join("\n");

    const AI_KEY = aiApiKey();
    if (!AI_KEY) throw new Error("AI_API_KEY (ou LOVABLE_API_KEY) not configured");

    const prompt = `Analise a seguinte conversa de atendimento comercial da plataforma para o contato "${contextName}".

Transcrição:
${transcript}

Retorne a análise usando a ferramenta analyze_conversation.`;

    const response = await fetch(aiChatCompletionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um analista de qualidade de vendas. Analise conversas de atendimento e forneça feedback detalhado. Avalie:
- Tempo de resposta (rápido, adequado, lento)
- Tom da conversa (profissional, amigável, frio)
- Técnicas de vendas utilizadas (rapport, SPIN, gatilhos mentais, etc.)
- Objeções identificadas e como foram tratadas
- Nota geral de 1 a 10
- Pontos fortes e fracos específicos
- Sugestões de melhoria acionáveis`,
          },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_conversation",
              description: "Return structured conversation analysis",
              parameters: {
                type: "object",
                properties: {
                  score: { type: "number", description: "Score 1-10" },
                  strengths: { type: "array", items: { type: "string" } },
                  weaknesses: { type: "array", items: { type: "string" } },
                  suggestions: { type: "array", items: { type: "string" } },
                  metrics: {
                    type: "object",
                    properties: {
                      avgResponseTime: { type: "string" },
                      tone: { type: "string" },
                      salesTechniques: { type: "array", items: { type: "string" } },
                      objectionsHandled: { type: "number" },
                    },
                    required: ["avgResponseTime", "tone", "salesTechniques", "objectionsHandled"],
                  },
                },
                required: ["score", "strengths", "weaknesses", "suggestions", "metrics"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_conversation" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[platform-analyze-conversation] AI error:", response.status, errText);

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
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call response");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[platform-analyze-conversation] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
