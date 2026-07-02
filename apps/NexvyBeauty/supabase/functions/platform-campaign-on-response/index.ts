// platform-campaign-on-response — motor de CAMPANHAS do CRM de PLATAFORMA
//
// Porte 1:1 do `campaign-on-response` do CRM Vendus, DESACOPLADO do tenant.
// Aplica post_response_actions quando um lead em uma campanha ativa responde.
// No tenant era chamado fire-and-forget pelo evolution-webhook; na plataforma
// o caller natural é o caminho inbound do webchat (platform-webchat-api) com a
// SERVICE_ROLE key.
//
// POST { conversation_id?, lead_id? }
//
// Adaptações de schema:
//   * webchat_conversations → platform_crm_conversations.
//   * campaign_targets / campaigns / lead_tag_assignments / leads / lead_notes
//     → platform_crm_* . SEM organization_id.
//   * leads.stage_id → platform_crm_leads.current_stage_id.
//   * take_over: o original setava webchat_conversations.status = 'human'.
//     O enum da plataforma não tem 'human' → 'waiting_human' + needs_human
//     (mesmo padrão de handoff do platform-webchat-api).
//   * Nota: platform_crm_lead_notes exige author_id NOT NULL → usa
//     campaigns.created_by; sem created_by, a nota é pulada (warn, non-fatal).
//   * Auth: interno = bearer SERVICE_ROLE; humano = JWT super_admin.
//
// 🔒 ZERO tabela de tenant.

import { createPlatformServiceClient } from "../_shared/platform-crm-audience.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { conversation_id, lead_id: leadIdIn } = body;
    if (!conversation_id && !leadIdIn) {
      return new Response(JSON.stringify({ error: "Missing conversation_id or lead_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createPlatformServiceClient();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Interno: bearer = SERVICE_ROLE key. Humano: JWT super_admin.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (bearer !== serviceKey) {
      const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
      if (errorResponse) return errorResponse;
    }

    // Resolve lead_id a partir da conversa quando não vier no payload (1:1)
    let resolvedLeadId: string | null = leadIdIn ?? null;
    if (!resolvedLeadId && conversation_id) {
      const { data: conv } = await supabase
        .from("platform_crm_conversations")
        .select("lead_id")
        .eq("id", conversation_id)
        .maybeSingle();
      resolvedLeadId = (conv as any)?.lead_id ?? null;
    }

    // Localiza o target da campanha ativa para esta conversa/lead (1:1).
    let target: any = null;
    if (conversation_id) {
      const { data } = await supabase
        .from("platform_crm_campaign_targets")
        .select("id, campaign_id, lead_id, status, responded_at")
        .eq("conversation_id", conversation_id)
        .in("status", ["sent", "sending"])
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = data;
    }
    // Fallback por lead_id (cobre casos onde o conversation_id divergiu entre envio/resposta)
    if (!target && resolvedLeadId) {
      const { data } = await supabase
        .from("platform_crm_campaign_targets")
        .select("id, campaign_id, lead_id, status, responded_at")
        .eq("lead_id", resolvedLeadId)
        .in("status", ["sent", "sending"])
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = data;
    }

    if (!target) {
      console.log("[platform-campaign-on-response] no_active_target", { conversation_id, lead_id: resolvedLeadId });
      return new Response(JSON.stringify({ ok: true, skipped: "no_active_target" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (target.responded_at) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign } = await supabase
      .from("platform_crm_campaigns")
      .select("id, name, post_response_actions, tags_on_response, created_by")
      .eq("id", target.campaign_id)
      .maybeSingle();

    const actions = (campaign?.post_response_actions ?? {}) as any;
    const tagsOnResp: string[] = Array.isArray(campaign?.tags_on_response)
      ? (campaign!.tags_on_response as string[])
      : [];

    // 1) Marca target como respondido (1:1)
    await supabase
      .from("platform_crm_campaign_targets")
      .update({ status: "responded", responded_at: new Date().toISOString() })
      .eq("id", target.id);

    // 2) Parar restantes desse lead nesta campanha (se stop=true, default) (1:1)
    if (actions.stop !== false) {
      await supabase
        .from("platform_crm_campaign_targets")
        .update({ status: "cancelled", error: "Lead respondeu" })
        .eq("campaign_id", target.campaign_id)
        .eq("lead_id", target.lead_id)
        .eq("status", "queued");
    }

    // 3) Atualizações no lead (etapa, temperatura) —
    //    stage_id do original → current_stage_id na plataforma
    const leadUpdate: Record<string, any> = {};
    if (actions.stage_id) leadUpdate.current_stage_id = actions.stage_id;
    if (actions.temperature) leadUpdate.temperature = actions.temperature;
    if (Object.keys(leadUpdate).length) {
      await supabase.from("platform_crm_leads").update(leadUpdate).eq("id", target.lead_id);
    }

    // 4) Tags ao responder (1:1)
    if (tagsOnResp.length) {
      const rows = tagsOnResp.map((tag_id) => ({
        lead_id: target.lead_id,
        tag_id,
        source: "campaign_response",
      }));
      await supabase.from("platform_crm_lead_tag_assignments").upsert(rows, { onConflict: "lead_id,tag_id", ignoreDuplicates: true });
    }
    if (Array.isArray(actions.tags_add) && actions.tags_add.length) {
      const rows = actions.tags_add.map((tag_id: string) => ({
        lead_id: target.lead_id,
        tag_id,
        source: "campaign_response",
      }));
      await supabase.from("platform_crm_lead_tag_assignments").upsert(rows, { onConflict: "lead_id,tag_id", ignoreDuplicates: true });
    }
    if (Array.isArray(actions.tags_remove) && actions.tags_remove.length) {
      await supabase
        .from("platform_crm_lead_tag_assignments")
        .delete()
        .eq("lead_id", target.lead_id)
        .in("tag_id", actions.tags_remove);
    }

    // 5) Take over: muda conversa para humano. Original: status = 'human';
    //    plataforma: 'waiting_human' + needs_human (padrão platform-webchat-api).
    if (actions.take_over && conversation_id) {
      await supabase
        .from("platform_crm_conversations")
        .update({ status: "waiting_human", needs_human: true, assigned_to: null })
        .eq("id", conversation_id);
    }

    // 6) Nota opcional no lead — platform_crm_lead_notes exige author_id (ver header)
    if (actions.note && typeof actions.note === "string" && actions.note.trim()) {
      if (campaign?.created_by) {
        await supabase.from("platform_crm_lead_notes").insert({
          lead_id: target.lead_id,
          content: `[Campanha: ${campaign?.name ?? "—"}] ${actions.note.trim()}`,
          author_id: campaign.created_by,
        });
      } else {
        console.warn("[platform-campaign-on-response] nota pulada — campanha sem created_by (author_id obrigatório)");
      }
    }

    return new Response(
      JSON.stringify({ ok: true, target_id: target.id, campaign_id: target.campaign_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[platform-campaign-on-response]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
