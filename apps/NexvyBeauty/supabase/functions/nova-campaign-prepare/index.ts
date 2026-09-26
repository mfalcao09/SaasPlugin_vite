// Prepara targets a partir do universo vertical canônico.
// Não dispara mensagens: apenas cria a relação campanha ↔ card.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authenticatePlatformAgent,
  platformCrmCorsHeaders as corsHeaders,
} from "../_shared/platform-crm-auth.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LEADS = 5000;
const CAMPAIGN_TRIAGES = new Set(["principal", "semente"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
  const { user, errorResponse } = await authenticatePlatformAgent(
    req,
    sb,
    serviceRoleKey,
    body,
  );
  if (errorResponse) return errorResponse;

  const productId = String(body?.product_id ?? "").trim();
  const campaignId = String(body?.campaign_id ?? "").trim();
  const leadIds = Array.isArray(body?.lead_ids)
    ? body.lead_ids
        .map((id: unknown) => String(id).trim())
        .filter((id: string) => UUID_RE.test(id))
        .slice(0, MAX_LEADS)
    : [];
  if (
    !UUID_RE.test(productId) ||
    !UUID_RE.test(campaignId) ||
    !leadIds.length
  ) {
    return json(
      { error: "product_id, campaign_id e lead_ids[] são obrigatórios" },
      400,
    );
  }

  const { data: campaign, error: campaignError } = await sb
    .from("platform_crm_campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .eq("product_id", productId)
    .maybeSingle();
  if (campaignError) return json({ error: "falha ao ler campanha" }, 500);
  if (!campaign) return json({ error: "campanha não encontrada" }, 404);
  if (["completed", "cancelled"].includes(campaign.status))
    return json({ error: "campanha encerrada" }, 409);

  const { data: leads, error: leadsError } = await sb
    .from("platform_crm_leads")
    .select("id, phone, platform_crm_lead_state!inner(derived_stage)")
    .eq("product_id", productId)
    .in("id", leadIds)
    .eq("platform_crm_lead_state.derived_stage", "preselected");
  if (leadsError) return json({ error: "falha ao validar público" }, 500);
  const eligible = (leads ?? []).map((row: any) => row.id);
  if (!eligible.length)
    return json({ error: "nenhum lead pré-selecionado elegível" }, 409);

  const { data: profiles, error: profileError } = await sb
    .from("platform_crm_extracted_leads")
    .select("imported_to_lead_id, triagem")
    .eq("product_id", productId)
    .in("imported_to_lead_id", eligible);
  if (profileError)
    return json({ error: "falha ao validar categoria do público" }, 500);
  const triageByLead = new Map<string, string[]>();
  for (const profile of profiles ?? []) {
    const leadId = String(profile.imported_to_lead_id);
    const values = triageByLead.get(leadId) ?? [];
    values.push(String(profile.triagem ?? "nao_classificado"));
    triageByLead.set(leadId, values);
  }
  const categoryOf = (leadId: string) => {
    const values = triageByLead.get(leadId) ?? [];
    if (values.includes("principal")) return "principal";
    if (values.includes("semente")) return "semente";
    if (
      values.length &&
      values.every((value) => value === "remocao_confirmada")
    ) {
      return "remocao_confirmada";
    }
    return "nao_classificado";
  };
  const invalidCategory = eligible.filter(
    (leadId: string) => !CAMPAIGN_TRIAGES.has(categoryOf(leadId)),
  );
  if (invalidCategory.length) {
    return json(
      {
        error: "há leads que precisam ser reclassificados antes da campanha",
        requires_reclassification: true,
        lead_ids: invalidCategory,
        allowed_triagens: ["principal", "semente"],
      },
      409,
    );
  }

  const missingPhone = (leads ?? [])
    .filter((row: any) => !row.phone)
    .map((row: any) => row.id);
  if (missingPhone.length) {
    return json(
      {
        error:
          "há leads sem telefone que precisam de enriquecimento antes da campanha",
        requires_enrichment: true,
        lead_ids: missingPhone,
      },
      409,
    );
  }

  const { data: optouts } = await sb
    .from("platform_crm_lead_optout")
    .select("telefone")
    .eq("product_id", productId)
    .not("telefone", "is", null);
  const blockedPhones = new Set(
    (optouts ?? []).map((row: any) => String(row.telefone)),
  );
  const finalIds = (leads ?? [])
    .filter((row: any) => !blockedPhones.has(String(row.phone)))
    .map((row: any) => row.id);
  if (!finalIds.length)
    return json({ error: "todos os leads estão suprimidos" }, 409);

  const targets = finalIds.map((leadId: string) => ({
    campaign_id: campaignId,
    lead_id: leadId,
    status: "queued",
  }));
  const { data: inserted, error: insertError } = await sb
    .from("platform_crm_campaign_targets")
    .upsert(targets, {
      onConflict: "campaign_id,lead_id",
      ignoreDuplicates: true,
    })
    .select("id, lead_id, status");
  if (insertError) return json({ error: "falha ao preparar targets" }, 500);

  await sb.from("platform_crm_journey_events").insert(
    finalIds.map((leadId: string) => ({
      product_id: productId,
      lead_id: leadId,
      user_id: user?.id ?? null,
      event_type: "cadence_enrolled",
      event_category: "contact",
      source: "nova_prospeccao",
      title: "Lead preparado para campanha",
      payload: { campaign_id: campaignId },
    })),
  );

  return json({
    ok: true,
    campaign_id: campaignId,
    requested: leadIds.length,
    eligible: finalIds.length,
    inserted: inserted?.length ?? 0,
    excluded: leadIds.length - finalIds.length,
  });
});
