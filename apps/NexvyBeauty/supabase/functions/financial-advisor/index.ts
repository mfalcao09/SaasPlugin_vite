import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Inline do _shared/ai.ts (self-contained p/ deploy sem dep relativa). Mesmo gateway
// env-driven das demais edges (OpenRouter por padrão).
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

// Consultor financeiro (controller) de salão de beleza — análise one-shot sob demanda.
// Recebe métricas já calculadas no front (sem tocar o banco) e devolve { answer }.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { metrics } = await req.json();
    if (!metrics || typeof metrics !== "object") {
      return new Response(JSON.stringify({ error: "metrics is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AI_API_KEY = aiApiKey();
    if (!AI_API_KEY) throw new Error("AI_API_KEY (ou LOVABLE_API_KEY) not configured");

    const brl = (n: unknown) =>
      `R$ ${Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pct = (n: unknown) => `${Number(n ?? 0).toFixed(1)}%`;
    const m = metrics as Record<string, any>;

    const topDespesas = Array.isArray(m.topDespesas)
      ? m.topDespesas.slice(0, 8).map((d: any) => `  - ${d.categoria ?? "Sem categoria"}: ${brl(d.valor)}`).join("\n")
      : "  (sem dados)";

    const resumo = [
      `Período: ${m.periodo ?? "—"}`,
      `Receitas: ${brl(m.receitas)}`,
      `Despesas: ${brl(m.despesas)}`,
      `Resultado (lucro/prejuízo): ${brl(m.resultado)}`,
      `Margem de lucro: ${pct(m.margemLucro)}`,
      `Custo fixo: ${brl(m.custoFixo)}`,
      `Custo variável: ${brl(m.custoVariavel)}`,
      `Margem de contribuição: ${pct(m.margemContribuicaoPct)} (${brl(m.margemContribuicaoValor)})`,
      m.pontoEquilibrio != null ? `Ponto de equilíbrio estimado: ${brl(m.pontoEquilibrio)}` : "",
      "",
      "Maiores despesas:",
      topDespesas,
    ].filter(Boolean).join("\n");

    const response = await fetch(aiChatCompletionsUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um consultor financeiro (controller) de um salão de beleza, falando direto com a dona — pessoa leiga em finanças. " +
              "Com base nos números do período, escreva uma análise CURTA e prática em pt-BR: " +
              "1) um diagnóstico de 2-3 frases (a saúde financeira em linguagem simples); " +
              "2) de 3 a 5 recomendações ACIONÁVEIS e específicas para AUMENTAR a margem de lucro e a margem de contribuição " +
              "(ex.: reduzir custo fixo desnecessário, renegociar fornecedor, ajustar preço de serviço, melhorar mix de serviços, cortar gargalo de custo variável). " +
              "Use os números reais nas recomendações. Sem jargão pesado, sem encher linguiça. Use markdown enxuto (negrito + bullets).",
          },
          { role: "user", content: `Dados financeiros do salão:\n\n${resumo}\n\nFaça a análise e as recomendações.` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const answer = (aiData.choices?.[0]?.message?.content ?? "").trim();
    if (!answer) throw new Error("No analysis returned");

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("financial-advisor error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
