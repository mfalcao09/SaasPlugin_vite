// platform-catalog-sync-website — Crawl/sync de site (CRM de PLATAFORMA, super_admin)
//
// Porte 1:1 do `catalog-sync-website` do CRM Vendus (lado ORG), desacoplado do
// tenant: mesma lógica de crawl (Firecrawl map+scrape) + extração via IA
// (tool-calling), trocando SÓ o gate de escopo:
//   * Tabela: platform_crm_product_catalog_items — SEM organization_id, com
//     product_id NOT NULL (FK platform_crm_products). Upsert por (product_id,
//     external_id) em vez de (organization_id, external_id).
//   * Auth: authenticatePlatformAgent (super_admin via JWT do usuário OU
//     service_role+actorUserId no body) — igual ao padrão platform-* já
//     estabelecido em platform-webchat-inbox; NÃO mais "auth opcional" (o
//     original só usava o Authorization pra achar created_by; aqui o gate é
//     OBRIGATÓRIO, como em toda edge platform-*).
// Adaptação de schema (SEM simplificação de lógica):
//   * A org-scoped grava um log de execução em `catalog_sync_logs` (tabela
//     tenant-only, inexistente no mundo platform_crm_*). Não existe
//     `platform_crm_catalog_sync_logs` nas migrations atuais — em vez de
//     inventar uma tabela nova (fora do escopo deste porte) ou silenciar o
//     rastro, o resultado de cada fase é logado estruturado via console.log/
//     console.error (mesmo padrão de outras adaptações platform-* quando falta
//     coluna/tabela — ver cabeçalho de platform-webchat-inbox). A CHAMADA final
//     do endpoint segue devolvendo o resumo completo (items_found/created/
//     updated/failed) no JSON de resposta, então o caller nunca perde o dado.
//   * `created_by`/userId do log vira `user.id` resolvido pelo gate
//     authenticatePlatformAgent (sempre presente — diferente do original, que
//     tratava auth como opcional).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

interface SyncBody {
  product_id: string;
  base_url: string;
  item_pattern?: string; // ex: "/imovel/" — substring obrigatória na URL
  catalog_type?: string; // imoveis | produtos | veiculos | generico
  max_items?: number;
  actorUserId?: string; // usado quando chamada via SERVICE_ROLE (1:1 c/ auth platform-*)
}

const CATALOG_SCHEMAS: Record<string, string> = {
  imoveis: "Imóveis: campos esperados — bairro, cidade, estado, quartos, banheiros, vagas, area_m2, tipo (apartamento/casa/comercial), suites.",
  veiculos: "Veículos: campos esperados — marca, modelo, ano, km, combustivel, cambio, cor, tipo.",
  produtos: "Produtos: campos esperados — categoria, marca, sku, estoque, variantes.",
  generico: "Genérico: extraia os atributos mais relevantes do produto/item.",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let bodyParsed: any = {};
    try {
      bodyParsed = await req.clone().json();
    } catch (_) {
      /* no body or invalid json */
    }
    const body = bodyParsed as SyncBody;

    // Gate: super_admin (JWT do usuário OU service_role+actorUserId) — 1:1 com
    // o padrão platform-* (authenticatePlatformAgent), sempre OBRIGATÓRIO.
    const { user, errorResponse } = await authenticatePlatformAgent(
      req,
      supabase,
      supabaseKey,
      bodyParsed,
    );
    if (errorResponse) return errorResponse;
    if (!user) return json({ error: "Invalid token" }, 401);

    if (!body.product_id || !body.base_url) {
      return json({ error: "product_id and base_url required" }, 400);
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const aiKey = Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return json({ error: "Firecrawl not configured" }, 500);
    }
    if (!aiKey) {
      return json({ error: "Lovable AI not configured" }, 500);
    }

    const catalogType = body.catalog_type || "generico";
    const maxItems = Math.min(body.max_items ?? 30, 50);

    console.log(
      `[platform-catalog-sync] start product_id=${body.product_id} base_url=${body.base_url} catalog_type=${catalogType} actor=${user.id}`,
    );

    // 1. MAP — descobre URLs do site
    console.log("[platform-catalog-sync] Mapping", body.base_url);
    const mapRes = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: body.base_url, limit: 500, includeSubdomains: false }),
    });
    const mapData = await mapRes.json();
    if (!mapRes.ok) throw new Error(mapData.error || "Map failed");

    let urls: string[] = mapData.links || [];
    if (body.item_pattern) {
      const pat = body.item_pattern.toLowerCase();
      urls = urls.filter((u) => u.toLowerCase().includes(pat));
    }
    urls = urls.slice(0, maxItems);

    console.log(`[platform-catalog-sync] Found ${urls.length} URLs to scrape`);

    let created = 0, updated = 0, failed = 0;

    // 2. Para cada URL: scrape + extract via IA
    for (const url of urls) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: true,
          }),
        });
        const scrapeData = await scrapeRes.json();
        if (!scrapeRes.ok) {
          console.error("[platform-catalog-sync] scrape failed for", url);
          failed++;
          continue;
        }
        const markdown: string = scrapeData.data?.markdown || scrapeData.markdown || "";
        if (!markdown) { failed++; continue; }

        // Extract via Lovable AI (tool calling pra structured output)
        const extractRes = await fetch(`${Deno.env.get("AI_GATEWAY_URL") ?? "https://openrouter.ai/api/v1"}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${aiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `Você extrai dados estruturados de páginas web.
Tipo de catálogo: ${catalogType}.
${CATALOG_SCHEMAS[catalogType] || CATALOG_SCHEMAS.generico}
Sempre devolva preço como número (sem R$, sem pontos de milhar). Se não encontrar, retorne null.
images: array de URLs absolutas das fotos do item.`,
              },
              {
                role: "user",
                content: `URL: ${url}\n\nConteúdo:\n${markdown.slice(0, 8000)}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "extract_item",
                  description: "Extrai dados de um item de catálogo",
                  parameters: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      price: { type: ["number", "null"] },
                      images: { type: "array", items: { type: "string" } },
                      attributes: { type: "object", additionalProperties: true },
                    },
                    required: ["title"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "extract_item" } },
          }),
        });

        if (!extractRes.ok) {
          if (extractRes.status === 402) {
            throw new Error("Lovable AI: créditos insuficientes");
          }
          failed++;
          continue;
        }

        const extractData = await extractRes.json();
        const tc = extractData.choices?.[0]?.message?.tool_calls?.[0];
        if (!tc) { failed++; continue; }
        const parsed = JSON.parse(tc.function.arguments);

        const externalId = `firecrawl:${url}`;
        const thumbnail = Array.isArray(parsed.images) && parsed.images.length > 0 ? parsed.images[0] : null;

        // Upsert por (product_id, external_id) — sem organization_id (plataforma
        // é product-scoped puro).
        const { data: existing } = await supabase
          .from("platform_crm_product_catalog_items")
          .select("id")
          .eq("product_id", body.product_id)
          .eq("external_id", externalId)
          .maybeSingle();

        const itemPayload = {
          product_id: body.product_id,
          external_id: externalId,
          title: parsed.title || "Sem título",
          description: parsed.description ?? null,
          price: parsed.price ?? null,
          currency: "BRL",
          url,
          thumbnail_url: thumbnail,
          images: Array.isArray(parsed.images) ? parsed.images : [],
          attributes: parsed.attributes ?? {},
          source_type: "firecrawl",
          source_url: url,
          last_synced_at: new Date().toISOString(),
        };

        if (existing) {
          await supabase.from("platform_crm_product_catalog_items").update(itemPayload).eq("id", existing.id);
          updated++;
        } else {
          await supabase.from("platform_crm_product_catalog_items").insert(itemPayload);
          created++;
        }
      } catch (e) {
        console.error("[platform-catalog-sync] item error:", e);
        failed++;
      }
    }

    console.log(
      `[platform-catalog-sync] done product_id=${body.product_id} found=${urls.length} created=${created} updated=${updated} failed=${failed}`,
    );

    return json({
      success: true,
      items_found: urls.length,
      items_created: created,
      items_updated: updated,
      items_failed: failed,
    });
  } catch (err: any) {
    console.error("[platform-catalog-sync] exception:", err);
    return json({ error: err.message }, 500);
  }
});
