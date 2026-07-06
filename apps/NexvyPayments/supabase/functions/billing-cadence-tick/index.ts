// billing-cadence-tick — executor dos step_runs da RÉGUA DE COBRANÇA (cron 5min).
//
// REUSA o padrão do executor do Beauty cadence-tick/index.ts:102-129 (SELECT dos
// runs vencidos + lock otimista status 'scheduled'->'sent' via UPDATE condicional
// com re-check de status) — mas POR FATURA, não por lead. NÃO reescreve o
// cadence-tick do Beauty; é uma camada nova.
//
// GUARDA DE FATURA (defesa-em-profundidade do D3): antes de disparar cada passo,
// re-checa o estado da invoice. Se a fatura já está paga/cancelada/substituida,
// o run é 'skipped' e o enrollment 'stopped' — NENHUMA mensagem pós-pagamento
// sai, mesmo que billing-cadence-stop não tenha corrido ainda (idempotência de
// efeito). Isso torna o critério D3 verdadeiro por DOIS caminhos independentes:
// o stop explícito (billing-cadence-stop) e esta guarda no disparo.
//
// A mensagem é gerada pelo executor de outreach herdado (manual-outreach), com o
// contexto CITANDO a fatura vindo de source_ref.first_message_context (D1) ou do
// objetivo do passo. NÃO reescreve o executor — só monta o contexto por fatura.
//
// ISOLAMENTO: função NOVA (hard fork §0). createServiceClient de
// _shared/campaign-audience.ts:166.

import { createServiceClient } from "../_shared/campaign-audience.ts";
import { BILLING_CADENCE_STEPS } from "../_shared/billing-cadence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_TICK = 50;
const TERMINAL_INVOICE = new Set(["paga", "cancelada", "substituida"]);
const STEP_BY_KEY = new Map(BILLING_CADENCE_STEPS.map((s) => [s.step_key, s]));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Runs vencidos ainda agendados (molde cadence-tick:102-107).
    const { data: runs } = await supabase
      .from("billing_cadence_step_runs")
      .select("id, enrollment_id, invoice_id, organization_id, step_key, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(MAX_PER_TICK);

    const list = runs ?? [];
    if (!list.length) return json({ processed: 0 });

    let processed = 0, skipped = 0, failed = 0, completed = 0;

    for (const run of list) {
      // Lock otimista (molde cadence-tick:122-129).
      const { data: locked } = await supabase
        .from("billing_cadence_step_runs")
        .update({ status: "sent" })
        .eq("id", run.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (!locked) { skipped++; continue; }

      try {
        // Enrollment ativo?
        const { data: enr } = await supabase
          .from("billing_cadence_enrollments")
          .select("id, invoice_id, payer_id, lead_id, organization_id, status, source_ref")
          .eq("id", run.enrollment_id)
          .maybeSingle();
        if (!enr || (enr as any).status !== "active") {
          await markRun(supabase, run.id, "skipped", { skip_reason: "enrollment_inactive" });
          skipped++; continue;
        }

        // GUARDA DE FATURA (D3 defesa-em-profundidade): fatura terminal → não envia.
        const { data: inv } = await supabase
          .from("invoices")
          .select("id, status, referencia, valor_total, vencimento")
          .eq("id", run.invoice_id)
          .maybeSingle();
        if (!inv) {
          await markRun(supabase, run.id, "skipped", { skip_reason: "invoice_missing" });
          skipped++; continue;
        }
        if (TERMINAL_INVOICE.has((inv as any).status)) {
          // Fatura já liquidada/terminal — encerra a régua desta fatura, sem enviar.
          await markRun(supabase, run.id, "skipped", { skip_reason: `invoice_${(inv as any).status}` });
          await supabase
            .from("billing_cadence_enrollments")
            .update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: (inv as any).status })
            .eq("id", (enr as any).id)
            .eq("status", "active");
          skipped++; continue;
        }

        // Monta o contexto do passo CITANDO a fatura (D1). 1º passo (D-3) usa o
        // contexto pré-renderizado gravado no enroll; demais passos usam o
        // objetivo do passo + snapshot da fatura.
        const step = STEP_BY_KEY.get(run.step_key);
        const srcRef = (enr as any).source_ref ?? {};
        const extra_context =
          run.step_key === "D-3" && srcRef.first_message_context
            ? srcRef.first_message_context
            : [
                `[Régua de cobrança — passo ${run.step_key}]`,
                step?.objective ? `Objetivo: ${step.objective}` : "",
                `Fatura: ${(inv as any).referencia} — venc. ${(inv as any).vencimento}`,
                `Cite valor e vencimento; ofereça meios de pagamento.`,
              ].filter(Boolean).join("\n");

        // Dispara via executor herdado (NÃO reescrito). lead_id é o vínculo de
        // conveniência p/ herdar a conversa; se ausente, registra sem enviar.
        const lead_id = (enr as any).lead_id;
        if (!lead_id) {
          await markRun(supabase, run.id, "skipped", { skip_reason: "no_channel_lead" });
          skipped++;
        } else {
          const resp = await fetch(`${supabaseUrl}/functions/v1/manual-outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              lead_ids: [lead_id],
              organization_id: (enr as any).organization_id,
              objective: `Cobrança ${(inv as any).referencia} — passo ${run.step_key}`,
              extra_context,
              mode: "direct",
              event_context: {
                billing_invoice_id: run.invoice_id,
                billing_enrollment_id: (enr as any).id,
                billing_step_key: run.step_key,
              },
            }),
          });
          const rbody = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            await markRun(supabase, run.id, "failed", { error: rbody?.error ?? `HTTP ${resp.status}` });
            failed++; continue;
          }
          const result = rbody?.results?.[0] ?? {};
          if (result.skipped) {
            await markRun(supabase, run.id, "skipped", { skip_reason: result.reason ?? "outreach_skipped" });
            skipped++;
          } else {
            await markRun(supabase, run.id, "sent", { agent_message: result.message ?? null });
            processed++;
          }
        }

        // Avança o índice do passo; se era o último, completa o enrollment.
        const idx = BILLING_CADENCE_STEPS.findIndex((s) => s.step_key === run.step_key);
        const isLast = idx === BILLING_CADENCE_STEPS.length - 1;
        if (isLast) {
          await supabase
            .from("billing_cadence_enrollments")
            .update({ status: "completed", completed_at: new Date().toISOString(), current_step_index: idx })
            .eq("id", (enr as any).id)
            .eq("status", "active");
          completed++;
        } else {
          await supabase
            .from("billing_cadence_enrollments")
            .update({ current_step_index: idx + 1 })
            .eq("id", (enr as any).id);
        }
      } catch (err) {
        console.error("[billing-cadence-tick] run error", run.id, err);
        await markRun(supabase, run.id, "failed", { error: (err as Error).message });
        failed++;
      }
    }

    return json({ processed, skipped, failed, completed, total: list.length });
  } catch (err) {
    console.error("[billing-cadence-tick]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

async function markRun(
  supabase: any,
  id: string,
  status: string,
  extra: Record<string, unknown>,
) {
  await supabase
    .from("billing_cadence_step_runs")
    .update({ status, executed_at: new Date().toISOString(), ...extra })
    .eq("id", id);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
