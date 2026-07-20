// Cron 1/min. Pega targets vencidos e invoca manual-outreach por lead.
// Respeita janela horária da recorrência e status da campanha (active).

import { createServiceClient } from "../_shared/campaign-audience.ts";
import { assertCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_TICK = 50;

function withinWindow(campaign: any): boolean {
  if (campaign.schedule_type !== "recurring") return true;
  const rec = campaign.recurrence;
  if (!rec) return true;
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  if (Array.isArray(rec.days) && rec.days.length && !rec.days.includes(day)) return false;
  if (rec.start && rec.end) {
    const [sh, sm] = String(rec.start).split(":").map(Number);
    const [eh, em] = String(rec.end).split(":").map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMin = sh * 60 + (sm || 0);
    const endMin = eh * 60 + (em || 0);
    if (nowMin < startMin || nowMin > endMin) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cronErr = assertCron(req, corsHeaders);
  if (cronErr) return cronErr;
  try {
    const supabase = createServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { data: targets } = await supabase
      .from("campaign_targets")
      .select("id, campaign_id, lead_id, organization_id, instance_id, context_used, attempts")
      .eq("status", "queued")
      .lte("scheduled_for", new Date().toISOString())
      .limit(MAX_PER_TICK);

    const list = targets ?? [];
    if (!list.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache de campanhas usadas neste tick
    const campaignCache = new Map<string, any>();
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const t of list) {
      let campaign = campaignCache.get(t.campaign_id);
      if (!campaign) {
        const { data } = await supabase
          .from("campaigns")
          .select("id, status, agent_id, schedule_type, recurrence, name, post_cadence_id")
          .eq("id", t.campaign_id)
          .maybeSingle();
        if (data) campaignCache.set(t.campaign_id, data);
        campaign = data;
      }
      // Campanha não existe ou foi explicitamente cancelada → cancela target
      if (!campaign || campaign.status === "cancelled" || campaign.status === "archived") {
        await supabase
          .from("campaign_targets")
          .update({ status: "cancelled", error: "Campanha cancelada" })
          .eq("id", t.id);
        skipped++;
        continue;
      }
      // Pausada / rascunho / completed → mantém na fila, reagenda 5min (pausa reversível)
      if (campaign.status !== "active") {
        await supabase
          .from("campaign_targets")
          .update({ scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
          .eq("id", t.id);
        skipped++;
        continue;
      }
      if (!withinWindow(campaign)) {
        // Reagendar 5 minutos à frente
        await supabase
          .from("campaign_targets")
          .update({ scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
          .eq("id", t.id);
        skipped++;
        continue;
      }

      // Marca como sending (lock otimista)
      const { data: locked } = await supabase
        .from("campaign_targets")
        .update({ status: "sending", attempts: (t.attempts ?? 0) + 1 })
        .eq("id", t.id)
        .eq("status", "queued")
        .select("id")
        .maybeSingle();
      if (!locked) {
        skipped++;
        continue;
      }

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/manual-outreach`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            lead_ids: [t.lead_id],
            agent_id: campaign.agent_id,
            organization_id: t.organization_id,
            objective: `Campanha: ${campaign.name}`,
            extra_context: t.context_used,
            mode: "direct",
            instance_id: t.instance_id,
            event_context: { campaign_id: campaign.id, campaign_target_id: t.id },
          }),
        });

        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          await supabase
            .from("campaign_targets")
            .update({ status: "failed", error: body?.error ?? `HTTP ${resp.status}` })
            .eq("id", t.id);
          failed++;
          continue;
        }

        const result = body?.results?.[0] ?? {};
        if (result.skipped) {
          await supabase
            .from("campaign_targets")
            .update({ status: "skipped", error: result.reason ?? "skipped" })
            .eq("id", t.id);
          skipped++;
        } else {
          await supabase
            .from("campaign_targets")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              conversation_id: result.conversationId ?? null,
              outreach_queue_id: result.outreachQueueId ?? null,
            })
            .eq("id", t.id);
          processed++;
          // Post-campaign cadence enroll (fire-and-forget)
          if (campaign.post_cadence_id) {
            fetch(`${supabaseUrl}/functions/v1/cadence-enroll`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({
                cadence_id: campaign.post_cadence_id,
                lead_ids: [t.lead_id],
                source: "campaign",
                source_ref: { campaign_id: campaign.id, campaign_target_id: t.id },
              }),
            }).catch((e) => console.error("[campaign-dispatcher] cadence-enroll non-fatal:", e));
          }
        }
      } catch (err) {
        console.error("[campaign-dispatcher] target error", t.id, err);
        await supabase
          .from("campaign_targets")
          .update({ status: "failed", error: (err as Error).message })
          .eq("id", t.id);
        failed++;
      }
    }

    // Marca campanhas como completed se não há mais targets queued
    const campaignIds = Array.from(campaignCache.keys());
    for (const cid of campaignIds) {
      const { count } = await supabase
        .from("campaign_targets")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", cid)
        .eq("status", "queued");
      if (count === 0) {
        const camp = campaignCache.get(cid);
        if (camp?.schedule_type !== "recurring") {
          await supabase
            .from("campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", cid)
            .eq("status", "active");
        }
      }
    }

    return new Response(
      JSON.stringify({ processed, skipped, failed, total: list.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[campaign-dispatcher]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
