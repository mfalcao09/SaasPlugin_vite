// Inicia uma campanha: resolve público (snapshot), insere targets,
// sorteia contexto + número, calcula scheduled_for por preset de velocidade.
// POST { campaign_id }

import { resolveAudience, createServiceClient, type CampaignFilters } from "../_shared/campaign-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SpeedPreset = "safe" | "recommended" | "fast" | "aggressive" | "custom";

function speedSecondsRange(preset: SpeedPreset, custom?: any): [number, number] {
  switch (preset) {
    case "safe": return [120, 300];
    case "recommended": return [60, 180];
    case "fast": return [30, 120];
    case "aggressive": return [10, 45];
    case "custom":
      return [Number(custom?.min_seconds ?? 60), Number(custom?.max_seconds ?? 180)];
    default: return [60, 180];
  }
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick<T extends { weight?: number }>(items: T[]): T | null {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight ?? 1;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { campaign_id } = (await req.json()) as { campaign_id: string };
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "Missing campaign_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createServiceClient();

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    if (campaign.status === "active") {
      return new Response(JSON.stringify({ error: "Campaign already active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve público (snapshot)
    const { leadIds, total, excluded } = await resolveAudience(
      supabase,
      campaign.organization_id,
      (campaign.audience_filters ?? {}) as CampaignFilters,
      (campaign.exclusion_filters ?? {}) as CampaignFilters,
    );

    // Resolve instâncias disponíveis
    let instances: any[] = [];
    if (campaign.instance_strategy === "manual" && Array.isArray(campaign.instance_distribution) && campaign.instance_distribution.length) {
      const ids = (campaign.instance_distribution as any[]).map((i: any) => i.instance_id).filter(Boolean);
      if (ids.length) {
        const { data } = await supabase
          .from("evolution_instances")
          .select("id, status")
          .in("id", ids);
        instances = (data ?? []).filter((i: any) => i.status === "connected").map((i: any) => ({
          ...i,
          weight: (campaign.instance_distribution as any[]).find((x: any) => x.instance_id === i.id)?.weight ?? 1,
        }));
      }
    } else {
      const { data } = await supabase
        .from("evolution_instances")
        .select("id, status")
        .eq("organization_id", campaign.organization_id)
        .eq("status", "connected");
      instances = (data ?? []).map((i: any) => ({ ...i, weight: 1 }));
    }

    if (!instances.length) {
      return new Response(
        JSON.stringify({ error: "Nenhum número WhatsApp conectado para envio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve contextos disponíveis
    const contextEntries: Array<{ text: string; id?: string; weight: number }> = [];
    const declared = Array.isArray(campaign.contexts) ? (campaign.contexts as any[]) : [];
    for (const c of declared) {
      if (c.inline_text) {
        contextEntries.push({ text: c.inline_text, weight: c.weight ?? 1 });
      } else if (c.context_id) {
        const { data: ctx } = await supabase
          .from("campaign_contexts")
          .select("instructions, objective, tone, cta")
          .eq("id", c.context_id)
          .maybeSingle();
        if (ctx) {
          const text = [
            ctx.objective ? `Objetivo: ${ctx.objective}` : "",
            ctx.tone ? `Tom: ${ctx.tone}` : "",
            ctx.cta ? `CTA: ${ctx.cta}` : "",
            ctx.instructions,
          ].filter(Boolean).join("\n");
          contextEntries.push({ text, id: c.context_id, weight: c.weight ?? 1 });
        }
      }
    }
    if (!contextEntries.length) {
      // fallback: nome da campanha como contexto mínimo
      contextEntries.push({ text: campaign.description ?? campaign.name, weight: 1 });
    }

    // Velocidade
    const [minSec, maxSec] = speedSecondsRange(campaign.speed_preset as SpeedPreset, campaign.speed_config);

    // Base time
    const baseTime = campaign.schedule_type === "scheduled" && campaign.scheduled_at
      ? new Date(campaign.scheduled_at).getTime()
      : Date.now();

    // Constrói targets
    const distribution = campaign.context_distribution as string;
    const targets: any[] = [];
    let cursor = baseTime;
    let seqIdx = 0;
    let instIdx = 0;

    for (const leadId of leadIds) {
      // Pick context
      let ctx;
      if (distribution === "sequential") {
        ctx = contextEntries[seqIdx % contextEntries.length];
        seqIdx++;
      } else if (distribution === "weighted") {
        ctx = weightedPick(contextEntries)!;
      } else {
        ctx = contextEntries[Math.floor(Math.random() * contextEntries.length)];
      }

      // Pick instance
      let inst;
      if (campaign.instance_strategy === "rotation") {
        inst = instances[instIdx % instances.length];
        instIdx++;
      } else if (campaign.instance_strategy === "manual") {
        inst = weightedPick(instances)!;
      } else {
        inst = instances[Math.floor(Math.random() * instances.length)];
      }

      // Spread time
      cursor += randomBetween(minSec, maxSec) * 1000;
      const scheduledFor = new Date(cursor).toISOString();

      targets.push({
        campaign_id,
        lead_id: leadId,
        organization_id: campaign.organization_id,
        status: "queued",
        context_used: ctx.text,
        context_id: ctx.id ?? null,
        instance_id: inst.id,
        scheduled_for: scheduledFor,
      });
    }

    // Insere em chunks (upsert para evitar duplicar em reexecuções)
    const CHUNK = 500;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const batch = targets.slice(i, i + CHUNK);
      const { error: insErr } = await supabase
        .from("campaign_targets")
        .upsert(batch, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
      if (insErr) {
        console.error("[campaign-start] insert error", insErr);
        throw insErr;
      }
    }

    // Atualiza campanha
    await supabase
      .from("campaigns")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
        totals: { audience: total, will_receive: leadIds.length, excluded },
      })
      .eq("id", campaign_id);

    // Incrementa usage_count dos contextos da biblioteca
    const usedIds = Array.from(new Set(contextEntries.map((c) => c.id).filter(Boolean))) as string[];
    if (usedIds.length) {
      for (const id of usedIds) {
        await supabase.rpc("noop").catch(() => {});
        // increment usage_count manually
        const { data: row } = await supabase
          .from("campaign_contexts")
          .select("usage_count")
          .eq("id", id)
          .maybeSingle();
        if (row) {
          await supabase
            .from("campaign_contexts")
            .update({ usage_count: (row.usage_count ?? 0) + 1 })
            .eq("id", id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total_audience: total,
        scheduled: leadIds.length,
        excluded,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[campaign-start]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
