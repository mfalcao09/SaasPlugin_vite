// platform-handle-objection — "Contornar Objeção IA" do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `handle-objection` do CRM Vendus (tenant), desacoplado do tenant:
//   * Tabelas: platform_crm_products (contexto do produto — SEM organization_id,
//     product-scoped, single-plataforma) / platform_crm_product_knowledge_sources
//     (base de conhecimento — gêmea de `ai_knowledge_base`, shape diferente:
//     sem `content`/`category` diretos, monta-se a partir de
//     title/extracted_content/raw_content/question/answer/data_category) /
//     platform_crm_objections (objeções conhecidas — MESMAS colunas do original:
//     category, what_they_say, suggested_response).
//   * LLM: gateway OpenRouter via env `AI_API_KEY` (+ `AI_GATEWAY_URL` opcional,
//     default https://openrouter.ai/api/v1) — a plataforma não tem roteamento
//     por organização (o `_shared/ai-call.ts` original é org-scoped e não se
//     aplica aqui; mesma adaptação já feita em platform-sales-copilot /
//     platform-webchat-inbox). Modelo: mesmo do original (google/gemini-3-flash-preview),
//     com override via env AI_SALES_COPILOT_MODEL (mesma env já usada pelos
//     outros edges de IA da plataforma).
//   * Streaming: PRESERVADO (SSE passthrough) — o original streama e o front
//     (`useHandleObjection`) consome via ReadableStream/SSE; NÃO simplificado
//     para JSON não-streamado (diferente da adaptação anotada no sales-copilot,
//     que é uma feature distinta com contrato de front diferente).
//   * Auth: Bearer JWT do usuário (ou service_role+actorUserId) + gate
//     super_admin via `authenticatePlatformAgent` (o original não tinha auth
//     — CRM de plataforma é SUPER_ADMIN-only por padrão).
//   * Gate de escopo: productId (NUNCA organizationId) — platform_crm_* é
//     product-scoped puro.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

/** Mesmo modelo do original (handle-objection do tenant), override via env
 *  AI_SALES_COPILOT_MODEL (mesma env compartilhada pelos outros edges de IA
 *  da plataforma — platform-sales-copilot / platform-webchat-inbox). */
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const objection: string | undefined = body?.objection;
    const productId: string | undefined = body?.productId;

    if (!objection || !productId) {
      return jsonError("Objection and productId are required", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gate super_admin — plataforma não tem org-membership, o "tenant" aqui é
    // o time da plataforma inteiro (RLS super_admin_only nas platform_crm_*).
    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      supabaseKey,
      body,
    );
    if (errorResponse) return errorResponse;
    if (!user) return jsonError("Unauthorized", 401);

    // Fetch product context (gêmeo do org-scoped; SEM organization_id — o
    // product-scoped não tem roteamento por org, a chave de IA é única).
    const { data: product } = await supabase
      .from("platform_crm_products")
      .select("name, description, pitch_15s, pitch_30s, pitch_2min, icp, differentials, pricing")
      .eq("id", productId)
      .maybeSingle();

    // Fetch knowledge base — gêmea `platform_crm_product_knowledge_sources`.
    // Shape diferente da `ai_knowledge_base` original (sem content/category
    // diretos): monta-se o "content" a partir de extracted_content/
    // raw_content/question+answer, e o "category" a partir de source_type/
    // data_category (fiel na intenção: título + texto utilizável no prompt).
    const { data: knowledgeRows } = await supabase
      .from("platform_crm_product_knowledge_sources")
      .select("title, source_type, data_category, extracted_content, raw_content, question, answer")
      .eq("product_id", productId)
      .eq("is_active", true);

    const knowledge = (knowledgeRows || [])
      .map((k: any) => {
        const content =
          k.extracted_content ||
          k.raw_content ||
          (k.question && k.answer ? `P: ${k.question}\nR: ${k.answer}` : k.answer || k.question) ||
          "";
        return {
          title: k.title,
          category: k.data_category || k.source_type,
          content,
        };
      })
      .filter((k: any) => k.content);

    // Fetch existing objections for context — mesmas colunas do original.
    const { data: existingObjections } = await supabase
      .from("platform_crm_objections")
      .select("category, what_they_say, suggested_response")
      .eq("product_id", productId)
      .limit(10);

    // Build context
    let productContext = "";
    if (product) {
      productContext = `
PRODUTO: ${product.name}
DESCRIÇÃO: ${product.description || "Não informada"}
PITCH CURTO: ${product.pitch_15s || product.pitch_30s || "Não definido"}
ICP (Cliente Ideal): ${product.icp || "Não definido"}
DIFERENCIAIS: ${product.differentials?.join(", ") || "Não definidos"}
PRICING: ${JSON.stringify(product.pricing) || "Não definido"}
`;
    }

    let knowledgeContext = "";
    if (knowledge.length > 0) {
      knowledgeContext = "\nBASE DE CONHECIMENTO:\n" + knowledge
        .map((k) => `- ${k.title}: ${k.content}`)
        .join("\n");
    }

    let objectionsContext = "";
    if (existingObjections && existingObjections.length > 0) {
      objectionsContext = "\nOBJEÇÕES CONHECIDAS E RESPOSTAS:\n" + existingObjections
        .map((o) => `- "${o.what_they_say}" → ${o.suggested_response}`)
        .join("\n");
    }

    const systemPrompt = `Você é um especialista em vendas via WhatsApp. Gere respostas CURTAS e DIRETAS para copiar e enviar.

${productContext}
${knowledgeContext}
${objectionsContext}

⚠️ REGRAS CRÍTICAS - FORMATO WHATSAPP:
1. Respostas CURTAS - máximo 3-4 linhas por seção
2. Use emojis estratégicos: ✅ 💡 🎯 ⏰ 💰 🤝
3. Quebras de linha para facilitar leitura no celular
4. Tom conversacional e direto
5. NUNCA seja agressivo - vendas é ajudar

FORMATO DE RESPOSTA:

**O QUE ELE QUER DIZER:**
[1 linha máximo - o medo/dúvida real]

**RESPOSTA SUGERIDA:**
[Mensagem pronta para WhatsApp - 3-4 linhas curtas com emoji]

**PERGUNTA DE RETORNO:**
[1 pergunta direta de até 15 palavras]`;

    // Gateway OpenRouter via env (sem roteamento por organização — plataforma
    // tem UMA chave: AI_API_KEY; o original resolvia por org via _shared/ai-call.ts
    // aiChat/resolveAIConfig). Mesmo transporte de platform-sales-copilot /
    // platform-webchat-inbox, mas com stream:true (preservado do original).
    const apiKey = Deno.env.get("AI_API_KEY") ?? "";
    if (!apiKey) {
      return jsonError(
        "AI_API_KEY não configurada na plataforma. Configure o secret e tente novamente.",
        500,
      );
    }
    const gatewayBase = (Deno.env.get("AI_GATEWAY_URL") ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    const model = Deno.env.get("AI_SALES_COPILOT_MODEL") ?? DEFAULT_MODEL;

    const response = await fetch(`${gatewayBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `O cliente disse: "${objection}"\n\nGere uma resposta estratégica para contornar essa objeção.` },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[platform-handle-objection] AI gateway error:", response.status, errText.slice(0, 300));
      if (response.status === 429) {
        return jsonError("Limite de requisições excedido. Tente novamente em alguns segundos.", 429);
      }
      if (response.status === 402) {
        return jsonError("Créditos de IA esgotados. Adicione créditos na conta do gateway (OpenRouter).", 402);
      }
      if (response.status === 401 || response.status === 403) {
        return jsonError("Chave do gateway de IA (AI_API_KEY) inválida ou sem permissão.", response.status);
      }
      return jsonError(
        `Erro do provedor de IA (${response.status}): ${errText.slice(0, 200) || response.statusText}`,
        502,
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("[platform-handle-objection] error:", error);
    return jsonError(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
