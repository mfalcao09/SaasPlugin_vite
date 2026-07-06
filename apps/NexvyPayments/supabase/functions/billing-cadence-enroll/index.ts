// billing-cadence-enroll — D1: inscreve UMA FATURA na régua de cobrança.
//
// Gatilho: um billing_events(tipo='emitida', invoice_id=...) (gravado pelo batch
// ao emitir) OU chamada direta { invoice_id }. Cria UM billing_cadence_enrollment
// carregando o invoice_id + source_ref estruturado (D1), e materializa os
// step_runs D-3/D0/D+1/D+7 AGENDADOS POR VENCIMENTO (D2, via buildStepRuns).
//
// CORREÇÃO-CHAVE (adversarial): NÃO reusa cadence-enroll do Beauty (que é
// lead-cêntrico e agenda por now+delay — cadence-enroll/index.ts:15-21,107-131).
// Aqui a chave é invoice_id e o agendamento é relativo ao vencimento.
//
// Critério D1: o enrollment carrega invoice_id; a 1ª mensagem renderizada CITA
// fatura/valor/vencimento (renderFirstMessageContext) — não genérica. O contexto
// da 1ª msg é gravado em source_ref.first_message_context para o tick/executor.
//
// ISOLAMENTO: função NOVA (hard fork §0). createServiceClient herdado de
// _shared/campaign-audience.ts:166 (mesmo molde das functions cadence).

import { createServiceClient } from "../_shared/campaign-audience.ts";
import {
  buildStepRuns,
  BILLING_CADENCE_STEPS,
  renderFirstMessageContext,
} from "../_shared/billing-cadence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    // Aceita { invoice_id } direto OU { event_id } (evento 'emitida' a resolver).
    let invoice_id: string | undefined = body.invoice_id;
    const event_id: string | undefined = body.event_id;
    const source: string = body.source ?? "billing_event";

    const supabase = createServiceClient();

    // Se veio por evento, resolve o invoice_id a partir do billing_events.
    let eventTipo: string | undefined;
    let eventPayload: any = {};
    if (!invoice_id && event_id) {
      const { data: evt } = await supabase
        .from("billing_events")
        .select("id, invoice_id, tipo, payload")
        .eq("id", event_id)
        .maybeSingle();
      if (!evt) {
        return json({ error: "Evento não encontrado" }, 404);
      }
      invoice_id = (evt as any).invoice_id;
      eventTipo = (evt as any).tipo;
      eventPayload = (evt as any).payload ?? {};
    }

    if (!invoice_id) {
      return json({ error: "Missing invoice_id (ou event_id que o resolva)" }, 400);
    }

    // Carrega a fatura — fonte da verdade do valor/vencimento/org/pagador.
    const { data: inv } = await supabase
      .from("invoices")
      .select(
        "id, organization_id, payer_id, competencia, referencia, valor_total, vencimento, status, c6_linha_digitavel, c6_pix_copia_cola",
      )
      .eq("id", invoice_id)
      .maybeSingle();
    if (!inv) return json({ error: "Fatura não encontrada" }, 404);

    // Faturas já liquidadas/terminais não entram em régua de cobrança.
    if (["paga", "cancelada", "substituida"].includes((inv as any).status)) {
      return json({ skipped: "invoice_terminal", status: (inv as any).status });
    }

    const org = (inv as any).organization_id;
    const payer_id = (inv as any).payer_id;

    // Vínculo de conveniência com o CRM: lead do pagador (herdar omnichannel).
    let lead_id: string | null = null;
    let payerName: string | null = null;
    if (payer_id) {
      const { data: payer } = await supabase
        .from("payers")
        .select("id, nome, lead_id")
        .eq("id", payer_id)
        .maybeSingle();
      lead_id = (payer as any)?.lead_id ?? null;
      payerName = (payer as any)?.nome ?? null;
    }

    // IDEMPOTÊNCIA: já há régua ATIVA p/ esta fatura? (uq_bce_active_per_invoice)
    const { data: existing } = await supabase
      .from("billing_cadence_enrollments")
      .select("id")
      .eq("organization_id", org)
      .eq("invoice_id", invoice_id)
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      return json({ skipped: "already_enrolled", enrollment_id: (existing as any).id });
    }

    // D1: 1ª mensagem CITANDO a fatura (valor/vencimento/referência) — não genérica.
    const firstMessageContext = renderFirstMessageContext(payerName, {
      referencia: (inv as any).referencia,
      valor_total: Number((inv as any).valor_total),
      vencimento: (inv as any).vencimento,
      c6_linha_digitavel: (inv as any).c6_linha_digitavel,
      c6_pix_copia_cola: (inv as any).c6_pix_copia_cola,
    });

    // source_ref ESTRUTURADO (D1): carrega o gatilho + snapshot p/ a mensagem.
    const source_ref = {
      event_id: event_id ?? null,
      tipo: eventTipo ?? "emitida",
      competencia: (inv as any).competencia,
      referencia: (inv as any).referencia,
      valor_total: Number((inv as any).valor_total),
      vencimento: (inv as any).vencimento,
      first_message_context: firstMessageContext,
      event_payload: eventPayload,
    };

    // Cria o enrollment (chave de vida = invoice_id).
    const { data: enrollment, error: enrErr } = await supabase
      .from("billing_cadence_enrollments")
      .insert({
        organization_id: org,
        invoice_id,
        payer_id,
        lead_id,
        status: "active",
        current_step_index: 0,
        source,
        source_ref,
      })
      .select("id")
      .single();
    if (enrErr || !enrollment) {
      return json({ error: `Falha ao criar enrollment: ${enrErr?.message ?? "?"}` }, 500);
    }
    const enrollment_id = (enrollment as any).id;

    // D2: materializa os step_runs relativos ao VENCIMENTO (não now+delay).
    const seeds = buildStepRuns((inv as any).vencimento);
    const rows = seeds.map((s) => ({
      organization_id: org,
      enrollment_id,
      invoice_id,
      step_key: s.step_key,
      offset_days: s.offset_days,
      scheduled_at: s.scheduled_at,
      status: "scheduled",
    }));
    const { error: runsErr } = await supabase.from("billing_cadence_step_runs").insert(rows);
    if (runsErr) {
      return json({ error: `Falha ao agendar steps: ${runsErr.message}`, enrollment_id }, 500);
    }

    return json({
      enrolled: true,
      enrollment_id,
      invoice_id,
      steps: rows.map((r) => ({ step_key: r.step_key, scheduled_at: r.scheduled_at })),
      first_step: BILLING_CADENCE_STEPS[0].step_key,
      first_message_context: firstMessageContext,
    });
  } catch (err) {
    console.error("[billing-cadence-enroll]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
