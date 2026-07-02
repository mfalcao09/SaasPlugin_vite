// platform-campaign-prepare — motor de CAMPANHAS do CRM de PLATAFORMA (super_admin)
//
// Porte 1:1 do `campaign-prepare` do CRM Vendus, DESACOPLADO do tenant.
// Worker assíncrono. Cron 1/min. Pega até 3 jobs pending e insere
// platform_crm_campaign_targets em lotes de 500. Quando termina, marca a
// campanha como 'active' e o job como 'completed'.
//
// Adaptações:
//   * campaign_targets / campaign_preparation_jobs / campaigns →
//     platform_crm_* . SEM organization_id.
//   * Claim de jobs: o original tentava a RPC `claim_campaign_preparation_jobs`
//     (FOR UPDATE SKIP LOCKED) com fallback SELECT+UPDATE. A RPC NÃO existe no
//     banco da plataforma (verificado) — aqui o fallback do original é o caminho
//     único. O UPDATE condicionado a `status = 'pending'` mantém o claim
//     idempotente entre ticks concorrentes (só um tick "vence" cada job).
//     TODO: criar RPC SKIP LOCKED se surgir concorrência real de dispatchers.
//   * instance_id: a "instância" do snapshot da plataforma é o webchat virtual
//     ({ id: null, connection_type: 'webchat' }) — targets ficam com
//     instance_id NULL. TODO(whatsapp): voltar a gravar instância real.
//   * Auth: cron/interno = bearer SERVICE_ROLE; humano = JWT super_admin
//     (padrão dos edges platform-crm já portados).
//
// 🔒 ZERO tabela de tenant.

import { createPlatformServiceClient } from "../_shared/platform-crm-audience.ts";
import {
  platformCrmCorsHeaders as corsHeaders,
  authenticatePlatformAgent,
} from "../_shared/platform-crm-auth.ts";

const MAX_JOBS_PER_TICK = 3;
const MAX_INSERTS_PER_TICK = 5000; // teto de proteção por execução (1:1)
const MAX_ATTEMPTS = 3;

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

async function processJob(supabase: any, job: any) {
  const snap = job.campaign_snapshot ?? {};
  const instances: any[] = snap.instances ?? [];
  const contexts: any[] = snap.contexts ?? [];
  const distribution: string = snap.context_distribution ?? "random";
  const strategy: string = snap.instance_strategy ?? "rotation";
  const [minSec, maxSec] = speedSecondsRange(snap.speed_preset as SpeedPreset, snap.speed_config);

  const leadIds: string[] = job.lead_ids ?? [];
  const batchSize: number = job.batch_size ?? 500;
  let cursor: number = job.cursor ?? 0;
  const total = leadIds.length;

  // base time recalculado pelo cursor: cada lead consome um intervalo
  // determinístico médio para manter scheduled_for consistente entre ticks.
  // Estratégia simples: pegar maior scheduled_for já existente p/ continuar a curva.
  let baseTimeMs: number;
  if (cursor === 0) {
    baseTimeMs = snap.base_time_ms ?? Date.now();
  } else {
    const { data: lastTarget } = await supabase
      .from("platform_crm_campaign_targets")
      .select("scheduled_for")
      .eq("campaign_id", job.campaign_id)
      .order("scheduled_for", { ascending: false })
      .limit(1)
      .maybeSingle();
    baseTimeMs = lastTarget?.scheduled_for
      ? new Date(lastTarget.scheduled_for).getTime()
      : (snap.base_time_ms ?? Date.now());
  }

  let inserted = 0;
  let timeCursor = baseTimeMs;
  let seqIdx = cursor; // continua sequência onde parou
  let instIdx = cursor;

  while (cursor < total && inserted < MAX_INSERTS_PER_TICK) {
    const end = Math.min(cursor + batchSize, total);
    const slice = leadIds.slice(cursor, end);
    const targets: any[] = [];

    for (const leadId of slice) {
      let ctx;
      if (distribution === "sequential") {
        ctx = contexts[seqIdx % contexts.length];
        seqIdx++;
      } else if (distribution === "weighted") {
        ctx = weightedPick(contexts)!;
      } else {
        ctx = contexts[Math.floor(Math.random() * contexts.length)];
      }

      let inst;
      if (strategy === "rotation") {
        inst = instances[instIdx % instances.length];
        instIdx++;
      } else if (strategy === "manual") {
        inst = weightedPick(instances)!;
      } else {
        inst = instances[Math.floor(Math.random() * instances.length)];
      }

      timeCursor += randomBetween(minSec, maxSec) * 1000;

      targets.push({
        campaign_id: job.campaign_id,
        lead_id: leadId,
        status: "queued",
        context_used: ctx.text,
        context_id: ctx.id ?? null,
        // Plataforma: instância virtual webchat → instance_id NULL.
        // TODO(whatsapp): gravar instância real quando o canal existir.
        instance_id: inst?.id ?? null,
        connection_type: inst?.connection_type ?? "webchat",
        scheduled_for: new Date(timeCursor).toISOString(),
      });
    }

    // Unique index platform_crm_campaign_targets_unique (campaign_id, lead_id)
    // existe no banco — verificado. Upsert 1:1 com o original.
    const { error: insErr } = await supabase
      .from("platform_crm_campaign_targets")
      .upsert(targets, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
    if (insErr) throw insErr;

    cursor = end;
    inserted += targets.length;

    // checkpoint após cada lote
    await supabase
      .from("platform_crm_campaign_preparation_jobs")
      .update({ cursor, processed_contacts: cursor })
      .eq("id", job.id);
  }

  if (cursor >= total) {
    // concluído
    await supabase
      .from("platform_crm_campaign_preparation_jobs")
      .update({
        status: "completed",
        processed_contacts: cursor,
        cursor,
        completed_at: new Date().toISOString(),
        lead_ids: [], // libera memória do snapshot
      })
      .eq("id", job.id);

    await supabase
      .from("platform_crm_campaigns")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", job.campaign_id);
  } else {
    // ainda há mais — volta para pending para próximo tick
    await supabase
      .from("platform_crm_campaign_preparation_jobs")
      .update({ status: "pending", cursor, processed_contacts: cursor })
      .eq("id", job.id);
  }

  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const tickId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const supabase = createPlatformServiceClient();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));

    // Cron/interno: bearer = SERVICE_ROLE key. Humano: JWT super_admin.
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (bearer !== serviceKey) {
      const { errorResponse } = await authenticatePlatformAgent(req, supabase, serviceKey, body);
      if (errorResponse) return errorResponse;
    }

    // Claim de jobs — caminho fallback do original promovido a único (sem RPC
    // SKIP LOCKED na plataforma; ver header). O UPDATE condicionado a status
    // 'pending' + select() garante que só este tick fica com os jobs retornados.
    const { data: pending } = await supabase
      .from("platform_crm_campaign_preparation_jobs")
      .select("id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_TICK);

    let claimed: any[] = [];
    const pendingIds = (pending ?? []).map((j: any) => j.id);
    if (pendingIds.length) {
      const { data: rows, error: claimErr } = await supabase
        .from("platform_crm_campaign_preparation_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .in("id", pendingIds)
        .eq("status", "pending")
        .select("*");
      if (claimErr) throw claimErr;
      claimed = rows ?? [];
    }

    return await runJobs(supabase, claimed, tickId, startedAt);
  } catch (err) {
    console.error("[platform-campaign-prepare] fatal", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runJobs(supabase: any, jobs: any[], tickId: string, startedAt: number) {
  let totalInserted = 0;
  const results: any[] = [];

  for (const job of jobs) {
    try {
      const inserted = await processJob(supabase, job);
      totalInserted += inserted;
      results.push({ job_id: job.id, inserted, ok: true });
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[platform-campaign-prepare] job ${job.id} failed:`, message);
      const attempts = (job.attempts ?? 0) + 1;
      await supabase
        .from("platform_crm_campaign_preparation_jobs")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          error: message,
        })
        .eq("id", job.id);

      if (attempts >= MAX_ATTEMPTS) {
        await supabase
          .from("platform_crm_campaigns")
          .update({ status: "draft" })
          .eq("id", job.campaign_id);
      }

      results.push({ job_id: job.id, inserted: 0, ok: false, error: message });
    }
  }

  const payload = {
    tick_id: tickId,
    jobs_processed: jobs.length,
    total_inserted: totalInserted,
    duration_ms: Date.now() - startedAt,
    results,
  };
  console.log(JSON.stringify(payload));
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
