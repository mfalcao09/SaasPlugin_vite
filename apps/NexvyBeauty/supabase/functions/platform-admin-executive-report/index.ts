// platform-admin-executive-report — RELATÓRIO EXECUTIVO on-demand do Agente Admin
// (CRM de PLATAFORMA, super_admin). Religa o `AdminExecutivePanel` product-scoped.
//
// O painel org-scoped da fonte Bizon agendava (cron admin-agent-summary) resumos
// diários/semanais por organização, agregando leads/deals/conversas com
// organization_id. Aqui a versão de PLATAFORMA é:
//   * ON-DEMAND: o super_admin clica "Gerar relatório executivo" e este edge
//     agrega as métricas reais dos produtos monitorados e sintetiza via IA.
//   * PRODUCT-SCOPED PURO: agrega platform_crm_leads / platform_crm_conversations /
//     platform_crm_deals / platform_crm_product_agents por product_id. ZERO
//     organization_id, ZERO tabela de tenant (a única tabela global tocada é
//     user_roles, via authenticatePlatformAgent — o mesmo gate das outras edges).
//   * Auth: Bearer JWT do usuário validado via getClaims + gate super_admin
//     (authenticatePlatformAgent). Leitura SEMPRE via SERVICE_ROLE.
//   * Gateway IA: MESMO shape/env das outras edges — aiChatCompletionsUrl()/aiApiKey()
//     do _shared/ai.ts (AI_API_KEY/AI_GATEWAY_URL). Sem chave configurada, cai para
//     um resumo determinístico a partir das próprias métricas (nunca botão morto).
//
// Body aceito (todos opcionais):
//   { admin_agent_id?: uuid, product_ids?: uuid[], period_days?: number }
//   - product_ids explícito manda; senão resolve os monitorados do admin_agent_id;
//     senão (nenhum) agrega TODOS os produtos (mesmo default "Vazio = todos" do painel).
//
// TODO(cron): relatório diário agendado — requer pg_cron/launchd, fora do escopo
// desta onda (o painel entrega só o ON-DEMAND). Quando existir infra de agendamento,
// um scheduler chamaria este mesmo edge (service-role + actorUserId no body) por
// admin_agent_id e despacharia o texto (ex.: WhatsApp/e-mail). NÃO construído aqui.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { aiChatCompletionsUrl, aiApiKey } from "../_shared/ai.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

const AI_MODEL = "google/gemini-3-flash-preview";

interface ProductMetrics {
  product_id: string;
  product_name: string;
  leads_created: number;
  hot_leads: number;
  active_conversations: number;
  conversations_needing_human: number;
  deals_won: number;
  revenue_won: number;
  open_pipeline: number;
  active_agents: number;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Resumo determinístico (fallback quando não há chave de IA). Texto puro. */
function buildDeterministicReport(
  totals: Omit<ProductMetrics, "product_id" | "product_name">,
  perProduct: ProductMetrics[],
  periodDays: number,
): string {
  const lines: string[] = [];
  lines.push(`Relatório executivo — últimos ${periodDays} dia(s)`);
  lines.push("");
  lines.push("VISÃO GERAL");
  lines.push(`- Leads criados: ${totals.leads_created}`);
  lines.push(`- Leads quentes: ${totals.hot_leads}`);
  lines.push(`- Conversas ativas: ${totals.active_conversations}`);
  lines.push(`- Conversas aguardando humano: ${totals.conversations_needing_human}`);
  lines.push(`- Vendas ganhas: ${totals.deals_won}`);
  lines.push(`- Receita ganha: ${fmtBRL(totals.revenue_won)}`);
  lines.push(`- Pipeline aberto: ${fmtBRL(totals.open_pipeline)}`);
  lines.push(`- Agentes de IA ativos: ${totals.active_agents}`);
  lines.push("");
  lines.push("POR PRODUTO");
  for (const p of perProduct) {
    lines.push(
      `- ${p.product_name}: ${p.leads_created} leads (${p.hot_leads} quentes), ` +
        `${p.active_conversations} conversas ativas, ${p.deals_won} vendas, ` +
        `${fmtBRL(p.revenue_won)} ganho, ${fmtBRL(p.open_pipeline)} em pipeline.`,
    );
  }
  return lines.join("\n");
}

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

    // Gate super_admin (JWT do usuário ou service-role interna) — 1:1 com as demais edges platform-crm.
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

    // ─── Janela temporal ──────────────────────────────────────────────────────
    const rawPeriod = Number(bodyParsed?.period_days);
    const periodDays = Number.isFinite(rawPeriod)
      ? Math.min(Math.max(Math.trunc(rawPeriod), 1), 90)
      : 7;
    const startISO = new Date(Date.now() - periodDays * 86400000).toISOString();

    // ─── Resolve o conjunto de produtos ───────────────────────────────────────
    // Prioridade: product_ids explícito > monitorados do admin_agent_id > TODOS.
    let productIds: string[] = Array.isArray(bodyParsed?.product_ids)
      ? bodyParsed.product_ids.filter((x: unknown) => typeof x === "string")
      : [];

    const adminAgentId =
      typeof bodyParsed?.admin_agent_id === "string" ? bodyParsed.admin_agent_id : null;

    if (productIds.length === 0 && adminAgentId) {
      const { data: monitored, error: monErr } = await supabase
        .from("platform_crm_admin_monitored_products")
        .select("product_id")
        .eq("admin_agent_id", adminAgentId)
        .eq("is_active", true);
      if (monErr) {
        console.error("[platform-admin-executive-report] monitored fetch error:", monErr.message);
      }
      productIds = (monitored ?? [])
        .map((m: any) => m.product_id as string)
        .filter(Boolean);
    }

    // Nomes dos produtos (e default "Vazio = todos" quando nada foi selecionado).
    const { data: allProducts, error: prodErr } = await supabase
      .from("platform_crm_products")
      .select("id, name");
    if (prodErr) {
      console.error("[platform-admin-executive-report] products fetch error:", prodErr.message);
      throw new Error("Failed to fetch products");
    }
    const productNameById = new Map<string, string>(
      (allProducts ?? []).map((p: any) => [p.id as string, (p.name as string) || "Produto"]),
    );
    if (productIds.length === 0) {
      productIds = (allProducts ?? []).map((p: any) => p.id as string);
    }

    if (productIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum produto cadastrado para gerar o relatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Agrega métricas reais (4 queries + bucket em JS) ─────────────────────
    const [leadsRes, convsRes, dealsRes, agentsRes] = await Promise.all([
      supabase
        .from("platform_crm_leads")
        .select("id, product_id, temperature, deal_value, created_at")
        .in("product_id", productIds)
        .gte("created_at", startISO),
      supabase
        .from("platform_crm_conversations")
        .select("id, product_id, status, needs_human")
        .in("product_id", productIds)
        .neq("status", "closed"),
      supabase
        .from("platform_crm_deals")
        .select("product_id, status, deal_value, closed_at")
        .in("product_id", productIds),
      supabase
        .from("platform_crm_product_agents")
        .select("id, product_id, is_active")
        .in("product_id", productIds)
        .eq("is_active", true),
    ]);

    if (leadsRes.error) throw new Error(`leads: ${leadsRes.error.message}`);
    if (convsRes.error) throw new Error(`conversations: ${convsRes.error.message}`);
    if (dealsRes.error) throw new Error(`deals: ${dealsRes.error.message}`);
    if (agentsRes.error) throw new Error(`agents: ${agentsRes.error.message}`);

    const metricsById = new Map<string, ProductMetrics>();
    const ensure = (productId: string): ProductMetrics => {
      let m = metricsById.get(productId);
      if (!m) {
        m = {
          product_id: productId,
          product_name: productNameById.get(productId) ?? "Produto",
          leads_created: 0,
          hot_leads: 0,
          active_conversations: 0,
          conversations_needing_human: 0,
          deals_won: 0,
          revenue_won: 0,
          open_pipeline: 0,
          active_agents: 0,
        };
        metricsById.set(productId, m);
      }
      return m;
    };
    // Garante linha para todo produto do escopo (mesmo com zero atividade).
    for (const pid of productIds) ensure(pid);

    for (const l of leadsRes.data ?? []) {
      if (!l.product_id) continue;
      const m = ensure(l.product_id as string);
      m.leads_created++;
      if ((l as any).temperature === "hot") m.hot_leads++;
    }

    for (const c of convsRes.data ?? []) {
      if (!c.product_id) continue;
      const m = ensure(c.product_id as string);
      m.active_conversations++;
      if ((c as any).needs_human) m.conversations_needing_human++;
    }

    const startMs = Date.parse(startISO);
    for (const d of dealsRes.data ?? []) {
      if (!d.product_id) continue;
      const m = ensure(d.product_id as string);
      const value = Number((d as any).deal_value ?? 0);
      const status = (d as any).status as string | null;
      if (status === "won") {
        const closedMs = (d as any).closed_at ? Date.parse((d as any).closed_at) : NaN;
        // Receita ganha DENTRO da janela (fechada no período).
        if (Number.isFinite(closedMs) && closedMs >= startMs) {
          m.deals_won++;
          m.revenue_won += value;
        }
      } else if (status && status !== "lost" && status !== "cancelled") {
        // Pipeline aberto = deals NÃO-terminais (all-time), preservando a intenção do painel
        // org-scoped. O CHECK de platform_crm_deals.status hoje só permite won/lost/cancelled
        // (sem 'open'), então isto rende 0 até o modelo de deals ganhar um estado ativo —
        // robusto a qualquer status ativo futuro sem depender de um literal impossível.
        m.open_pipeline += value;
      }
    }

    for (const a of agentsRes.data ?? []) {
      if (!a.product_id) continue;
      ensure(a.product_id as string).active_agents++;
    }

    const perProduct = Array.from(metricsById.values()).sort(
      (a, b) => b.leads_created - a.leads_created,
    );

    const totals = perProduct.reduce(
      (acc, p) => {
        acc.leads_created += p.leads_created;
        acc.hot_leads += p.hot_leads;
        acc.active_conversations += p.active_conversations;
        acc.conversations_needing_human += p.conversations_needing_human;
        acc.deals_won += p.deals_won;
        acc.revenue_won += p.revenue_won;
        acc.open_pipeline += p.open_pipeline;
        acc.active_agents += p.active_agents;
        return acc;
      },
      {
        leads_created: 0,
        hot_leads: 0,
        active_conversations: 0,
        conversations_needing_human: 0,
        deals_won: 0,
        revenue_won: 0,
        open_pipeline: 0,
        active_agents: 0,
      },
    );

    // ─── Síntese via IA (com fallback determinístico) ─────────────────────────
    const AI_KEY = aiApiKey();
    let report = buildDeterministicReport(totals, perProduct, periodDays);
    let aiUsed = false;

    if (AI_KEY) {
      const dataForAI = {
        period_days: periodDays,
        product_count: perProduct.length,
        totals,
        per_product: perProduct,
      };

      const systemPrompt =
        "Você é um analista executivo de vendas. Recebe métricas agregadas de um CRM " +
        "multiproduto e produz um RELATÓRIO EXECUTIVO conciso em português do Brasil, " +
        "em TEXTO PURO (sem markdown, sem tabelas, sem HTML). Estruture em seções curtas: " +
        "1) Panorama geral em 2-3 frases; 2) Destaques positivos; 3) Pontos de atenção " +
        "(ex.: conversas aguardando humano, produtos parados, pipeline sem conversão); " +
        "4) Recomendações acionáveis. Seja direto, use os números fornecidos, valores em " +
        "reais (R$). Não invente dados além dos fornecidos.";

      const userPrompt =
        `Gere o relatório executivo a partir destas métricas (JSON):\n\n${JSON.stringify(
          dataForAI,
          null,
          2,
        )}`;

      try {
        const response = await fetch(aiChatCompletionsUrl(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AI_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(
            "[platform-admin-executive-report] AI error:",
            response.status,
            errText,
          );
          if (response.status === 429) {
            return new Response(
              JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          // Outras falhas de IA: mantém o fallback determinístico (não derruba o painel).
        } else {
          const aiData = await response.json();
          const content = aiData?.choices?.[0]?.message?.content;
          if (typeof content === "string" && content.trim()) {
            report = content.trim();
            aiUsed = true;
          }
        }
      } catch (aiErr) {
        console.error("[platform-admin-executive-report] AI fetch failed:", aiErr);
        // Mantém o fallback determinístico.
      }
    }

    return new Response(
      JSON.stringify({
        report,
        ai_used: aiUsed,
        generated_at: new Date().toISOString(),
        period_days: periodDays,
        product_count: perProduct.length,
        totals,
        per_product: perProduct,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[platform-admin-executive-report] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
