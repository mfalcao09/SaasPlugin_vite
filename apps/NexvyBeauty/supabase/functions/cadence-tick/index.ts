// Cron a cada 5min. Executa cadence_step_runs vencidos.
// Para cada run: valida janela, condições, gera mensagem via manual-outreach
// (que monta prompt com contexto + histórico do lead) e agenda o próximo step.

import { createServiceClient } from "../_shared/campaign-audience.ts";
import { assertCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_TICK = 50;

const DAY_MAP: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function withinWindow(window: any): boolean {
  if (!window) return true;
  const now = new Date();
  const day = now.getDay();
  const days: any[] = Array.isArray(window.days) ? window.days : [];
  if (days.length) {
    const allowed = days.map((d) => (typeof d === "number" ? d : DAY_MAP[String(d).toLowerCase()]));
    if (!allowed.includes(day)) return false;
  }
  if (window.start && window.end) {
    const [sh, sm] = String(window.start).split(":").map(Number);
    const [eh, em] = String(window.end).split(":").map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < sh * 60 + (sm || 0) || nowMin > eh * 60 + (em || 0)) return false;
  }
  return true;
}

function computeScheduledAt(step: any, fromDate: Date): Date {
  if (step.execute_immediately) return new Date();
  const v = Number(step.delay_value ?? 0);
  const unit = step.delay_unit ?? "days";
  const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
  return new Date(fromDate.getTime() + v * mult);
}

async function evaluateStepConditions(supabase: any, conditions: any, lead_id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!conditions || !Object.keys(conditions).length) return { ok: true };

  // not_purchased — lead não tem deal em estágio won
  if (conditions.not_purchased) {
    const { data } = await supabase
      .from("deals")
      .select("id, stage_id, pipeline_stages!inner(stage_type)")
      .eq("lead_id", lead_id)
      .eq("pipeline_stages.stage_type", "won")
      .limit(1);
    if (data && data.length) return { ok: false, reason: "Lead já comprou" };
  }

  // not_responded — não respondeu em runs anteriores desta cadência (passa, será stop_rules quem trata)
  // without_tag — lead não tem essas tags
  if (Array.isArray(conditions.without_tags) && conditions.without_tags.length) {
    const { data } = await supabase
      .from("lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", lead_id)
      .in("tag_id", conditions.without_tags)
      .limit(1);
    if (data && data.length) return { ok: false, reason: "Lead possui tag de exclusão" };
  }

  // with_tag — exige uma das tags
  if (Array.isArray(conditions.with_tags) && conditions.with_tags.length) {
    const { data } = await supabase
      .from("lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", lead_id)
      .in("tag_id", conditions.with_tags)
      .limit(1);
    if (!data || !data.length) return { ok: false, reason: "Lead não possui tag exigida" };
  }

  return { ok: true };
}

async function getStepContext(supabase: any, step: any): Promise<string> {
  if (step.context_inline && step.context_inline.trim()) return step.context_inline.trim();
  if (step.context_id) {
    const { data } = await supabase
      .from("campaign_contexts")
      .select("content, name")
      .eq("id", step.context_id)
      .maybeSingle();
    if (data?.content) return data.content as string;
  }
  return step.objective ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cronErr = assertCron(req, corsHeaders);
  if (cronErr) return cronErr;
  try {
    const supabase = createServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { data: runs } = await supabase
      .from("cadence_step_runs")
      .select("id, enrollment_id, step_id, organization_id, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(MAX_PER_TICK);

    const list = runs ?? [];
    if (!list.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0, skipped = 0, failed = 0, completed = 0;
    const cadenceCache = new Map<string, any>();
    const stepsCache = new Map<string, any[]>();

    for (const run of list) {
      // Lock otimista
      const { data: locked } = await supabase
        .from("cadence_step_runs")
        .update({ status: "sent" }) // será revertido se falhar / skip
        .eq("id", run.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (!locked) { skipped++; continue; }

      try {
        // Pega enrollment + cadence + step
        const { data: enrollment } = await supabase
          .from("cadence_enrollments")
          .select("id, cadence_id, lead_id, organization_id, status, current_step_index")
          .eq("id", run.enrollment_id)
          .maybeSingle();
        if (!enrollment || enrollment.status !== "active") {
          await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: "enrollment_inactive", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        let cadence = cadenceCache.get(enrollment.cadence_id);
        if (!cadence) {
          const { data } = await supabase
            .from("cadences")
            .select("id, status, agent_id, name, execution_window, stop_rules")
            .eq("id", enrollment.cadence_id)
            .maybeSingle();
          if (data) cadenceCache.set(enrollment.cadence_id, data);
          cadence = data;
        }
        if (!cadence || cadence.status !== "active") {
          await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: "cadence_inactive", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        if (!withinWindow(cadence.execution_window)) {
          // Reagendar 10min à frente
          await supabase
            .from("cadence_step_runs")
            .update({ status: "scheduled", scheduled_at: new Date(Date.now() + 10 * 60_000).toISOString() })
            .eq("id", run.id);
          skipped++; continue;
        }

        // stop_rules globais — ex: stop_on_purchase
        const stopRules = cadence.stop_rules ?? {};
        if (stopRules.stop_on_purchase) {
          const { data: deals } = await supabase
            .from("deals")
            .select("id, pipeline_stages!inner(stage_type)")
            .eq("lead_id", enrollment.lead_id)
            .eq("pipeline_stages.stage_type", "won")
            .limit(1);
          if (deals && deals.length) {
            await supabase.from("cadence_enrollments").update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: "purchased" }).eq("id", enrollment.id);
            await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: "stopped_on_purchase", executed_at: new Date().toISOString() }).eq("id", run.id);
            skipped++; continue;
          }
        }

        let steps = stepsCache.get(enrollment.cadence_id);
        if (!steps) {
          const { data } = await supabase
            .from("cadence_steps")
            .select("*")
            .eq("cadence_id", enrollment.cadence_id)
            .order("order_index", { ascending: true });
          steps = data ?? [];
          stepsCache.set(enrollment.cadence_id, steps);
        }

        const currentStep = steps.find((s: any) => s.id === run.step_id);
        if (!currentStep) {
          await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: "step_not_found", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        // Avalia condições da etapa
        const evalResult = await evaluateStepConditions(supabase, currentStep.conditions, enrollment.lead_id);
        if (!evalResult.ok) {
          await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: evalResult.reason ?? "conditions", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++;
          // Avança mesmo assim para próximo step? Sim — não trava o lead na etapa.
        } else {
          if (!cadence.agent_id) {
            await supabase.from("cadence_step_runs").update({ status: "failed", error: "Cadence has no agent_id", executed_at: new Date().toISOString() }).eq("id", run.id);
            failed++; continue;
          }
          // Monta contexto + objetivo da etapa + tom
          const ctx = await getStepContext(supabase, currentStep);
          const extra_context = [
            `[Cadência: ${cadence.name}]`,
            currentStep.objective ? `Objetivo da etapa: ${currentStep.objective}` : "",
            currentStep.tone ? `Tom: ${currentStep.tone}` : "",
            ctx ? `Contexto:\n${ctx}` : "",
          ].filter(Boolean).join("\n\n");

          const resp = await fetch(`${supabaseUrl}/functions/v1/manual-outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              lead_ids: [enrollment.lead_id],
              agent_id: cadence.agent_id,
              organization_id: enrollment.organization_id,
              objective: `Cadência: ${cadence.name} — ${currentStep.name}`,
              extra_context,
              mode: "direct",
              event_context: { cadence_id: cadence.id, cadence_step_id: currentStep.id, cadence_run_id: run.id },
            }),
          });
          const body = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            await supabase.from("cadence_step_runs").update({ status: "failed", error: body?.error ?? `HTTP ${resp.status}`, executed_at: new Date().toISOString() }).eq("id", run.id);
            failed++; continue;
          }
          const result = body?.results?.[0] ?? {};
          if (result.skipped) {
            await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: result.reason ?? "outreach_skipped", executed_at: new Date().toISOString() }).eq("id", run.id);
            skipped++;
          } else {
            await supabase.from("cadence_step_runs").update({
              status: "sent",
              executed_at: new Date().toISOString(),
              conversation_id: result.conversationId ?? null,
              agent_message: result.message ?? null,
            }).eq("id", run.id);
            processed++;
          }
        }

        // Agenda próximo step
        const nextIndex = (enrollment.current_step_index ?? 0) + 1;
        const nextStep = steps[nextIndex];
        if (nextStep) {
          const from = nextStep.delay_from === "enrollment"
            ? new Date(/* approximation: now-from-enrollment is complex; use now as previous reference */)
            : new Date();
          const scheduledAt = computeScheduledAt(nextStep, from);
          await supabase.from("cadence_step_runs").insert({
            enrollment_id: enrollment.id,
            step_id: nextStep.id,
            organization_id: enrollment.organization_id,
            scheduled_at: scheduledAt.toISOString(),
            status: "scheduled",
          });
          await supabase.from("cadence_enrollments").update({
            current_step_id: nextStep.id,
            current_step_index: nextIndex,
          }).eq("id", enrollment.id);
        } else {
          // Concluído
          await supabase.from("cadence_enrollments").update({
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", enrollment.id);
          completed++;
        }

        // Atualiza last_executed_at da cadência
        await supabase.from("cadences").update({ last_executed_at: new Date().toISOString() }).eq("id", cadence.id);
      } catch (err) {
        console.error("[cadence-tick] run error", run.id, err);
        await supabase.from("cadence_step_runs").update({ status: "failed", error: (err as Error).message, executed_at: new Date().toISOString() }).eq("id", run.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, skipped, failed, completed, total: list.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cadence-tick]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
