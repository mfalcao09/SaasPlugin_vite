// billing-cadence-stop — D3: PARA a régua de UMA FATURA (stop por fatura).
//
// A CORREÇÃO-CHAVE do adversarial vive aqui. cadence-on-response do Beauty para
// a régua por LEAD (cadence-on-response/index.ts:60-64,96-109 — busca enrollments
// por lead_id e encerra TODOS). cadence-stop idem aceita { cadence_id, lead_id }
// (cadence-stop/index.ts:19). Se aplicássemos isso à cobrança, pagar UMA fatura
// mataria a régua de TODAS as faturas abertas do mesmo pagador — errado.
//
// Aqui o stop é keyed por (enrollment, invoice_id): recebe { invoice_id } (o
// gatilho natural é billing_events(tipo='paga', invoice_id=...) gravado por
// _shared/billing-baixa.ts:160-177 ou pelo webhook C6) e:
//   1) marca APENAS os step_runs 'scheduled' DAQUELA fatura como 'skipped'
//      (UPDATE keyed por invoice_id — usa idx_bcsr_invoice_scheduled);
//   2) encerra APENAS o enrollment ATIVO daquela fatura (status='stopped').
// Faturas IRMÃS (mesmo payer, outras invoices) NÃO são tocadas — continuam.
//
// ISOLAMENTO: função NOVA (hard fork §0). createServiceClient de
// _shared/campaign-audience.ts:166.

import { createServiceClient } from "../_shared/campaign-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Razões de parada válidas (o gatilho informa; default 'paga').
const REASONS = new Set(["paga", "cancelada", "substituida", "manual"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    let invoice_id: string | undefined = body.invoice_id;
    const event_id: string | undefined = body.event_id;
    const reason: string = REASONS.has(body.reason) ? body.reason : "paga";

    const supabase = createServiceClient();

    // Gatilho por evento: resolve invoice_id do billing_events (ex.: 'paga').
    if (!invoice_id && event_id) {
      const { data: evt } = await supabase
        .from("billing_events")
        .select("id, invoice_id, tipo")
        .eq("id", event_id)
        .maybeSingle();
      invoice_id = (evt as any)?.invoice_id ?? undefined;
    }

    if (!invoice_id) {
      return json({ error: "Missing invoice_id (ou event_id que o resolva)" }, 400);
    }

    // 1) CANCELA os runs FUTUROS (scheduled) DESTA fatura — e SÓ desta fatura.
    //    O filtro .eq("invoice_id", invoice_id) é a garantia por-fatura do D3:
    //    runs de faturas irmãs não casam o WHERE e permanecem 'scheduled'.
    const nowIso = new Date().toISOString();
    const { data: skipped } = await supabase
      .from("billing_cadence_step_runs")
      .update({ status: "skipped", skip_reason: reason, executed_at: nowIso })
      .eq("invoice_id", invoice_id)
      .eq("status", "scheduled")
      .select("id");

    // 2) ENCERRA o enrollment ATIVO desta fatura (status='stopped').
    const { data: stoppedEnrollments } = await supabase
      .from("billing_cadence_enrollments")
      .update({ status: "stopped", stopped_at: nowIso, stop_reason: reason })
      .eq("invoice_id", invoice_id)
      .eq("status", "active")
      .select("id");

    return json({
      ok: true,
      invoice_id,
      reason,
      runs_cancelled: (skipped ?? []).length,
      enrollments_stopped: (stoppedEnrollments ?? []).length,
    });
  } catch (err) {
    console.error("[billing-cadence-stop]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
