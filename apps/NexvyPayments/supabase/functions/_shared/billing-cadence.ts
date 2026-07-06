// _shared/billing-cadence.ts
//
// Lógica PURA (sem rede, sem client) da RÉGUA DE COBRANÇA POR FATURA — D1+D2+D3.
// Isolada aqui para ser testável por `deno test` sem stub de rede: as Edge
// Functions billing-cadence-enroll/-tick/-stop importam estes helpers e só
// acrescentam I/O (supabase + fetch p/ o executor de mensagem).
//
// CORREÇÃO-CHAVE (adversarial): o motor cadence-* do Beauty agenda por now+delay
// e é lead-cêntrico (cadence-tick/index.ts:34-40 computeScheduledAt por delay;
// stop por lead em :167-181 / cadence-on-response). Aqui o agendamento é
// RELATIVO ao vencimento da fatura (D2) e o stop é POR FATURA (D3).
//
// GATILHO do stop (D3): o pagamento grava billing_events(tipo='paga',
// invoice_id=...) — ver _shared/billing-baixa.ts:160-177. billing-cadence-stop
// consome esse invoice_id e para SÓ a régua daquela fatura.
//
// ISOLAMENTO: arquivo NOVO em _shared/ (hard fork §0). Não toca o core.

// ---------------------------------------------------------------------------
// Passos canônicos da régua de cobrança, relativos ao VENCIMENTO da fatura.
// D-3 = lembrete 3 dias antes; D0 = vence hoje; D+1 = venceu ontem (1º atraso);
// D+7 = 7 dias em atraso. offset em dias corridos.
// ---------------------------------------------------------------------------
export interface BillingStep {
  step_key: string;
  offset_days: number;
  objective: string;
}

export const BILLING_CADENCE_STEPS: BillingStep[] = [
  { step_key: "D-3", offset_days: -3, objective: "Lembrete amigável: a fatura vence em 3 dias." },
  { step_key: "D0", offset_days: 0, objective: "A fatura vence hoje — enviar meios de pagamento." },
  { step_key: "D+1", offset_days: 1, objective: "1º aviso de atraso: fatura venceu ontem." },
  { step_key: "D+7", offset_days: 7, objective: "Cobrança firme: 7 dias em atraso — oferecer 2ª via/acordo." },
];

// Fuso do negócio (padrão salon-automation-run/index.ts:25 America/Sao_Paulo).
export const BILLING_TZ = "America/Sao_Paulo";

// "Hoje" no fuso do negócio como YYYY-MM-DD (molde salon-automation-run:25).
export function brToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: BILLING_TZ });
}

// ---------------------------------------------------------------------------
// D2 — AGENDAMENTO POR DUE_DATE.
// scheduledAt(step) = (vencimento + offset_days) às 09:00 no fuso do negócio,
// convertido para o instante UTC correspondente. NÃO é now+delay.
//
// dueDate: 'YYYY-MM-DD' (invoices.vencimento é `date`). sendHourLocal: hora
// local de disparo (default 9h — horário comercial). Retorna Date (instante UTC).
//
// Regra prática do critério D2: fatura vencendo em D+3 (vencimento = hoje+3) →
// o passo D-3 (offset -3) cai em (hoje+3)-3 = HOJE; o passo D+7 cai em
// vencimento+7. Ver teste.
// ---------------------------------------------------------------------------
export function computeScheduledAtByDueDate(
  dueDate: string,
  offsetDays: number,
  sendHourLocal = 9,
): Date {
  // Soma offset em dias no calendário (usa UTC-noon como âncora p/ evitar drift de DST na aritmética de dia).
  const anchor = new Date(`${dueDate}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  const targetLocalDate = anchor.toISOString().slice(0, 10); // YYYY-MM-DD já com offset aplicado

  // Constrói o instante UTC de `targetLocalDate` às `sendHourLocal` no fuso BR.
  // BR não tem mais horário de verão (desde 2019) → offset fixo -03:00. Ancoramos
  // explícito em -03:00 para determinismo (não depende do TZ do host que roda o Deno).
  const hh = String(sendHourLocal).padStart(2, "0");
  return new Date(`${targetLocalDate}T${hh}:00:00-03:00`);
}

// Constrói os step_runs de uma fatura a partir do vencimento (D2).
// Retorna as linhas prontas p/ INSERT (sem ids — o banco/ mock geram).
export interface StepRunSeed {
  step_key: string;
  offset_days: number;
  scheduled_at: string; // ISO UTC
}

export function buildStepRuns(dueDate: string, now: Date = new Date()): StepRunSeed[] {
  return BILLING_CADENCE_STEPS.map((s) => {
    let at = computeScheduledAtByDueDate(dueDate, s.offset_days);
    // Passo cujo horário-alvo já passou (ex.: enrollment tardio) → dispara agora,
    // nunca no passado (o tick não reprocessaria retroativo de forma útil).
    if (at.getTime() < now.getTime()) at = now;
    return { step_key: s.step_key, offset_days: s.offset_days, scheduled_at: at.toISOString() };
  });
}

// ---------------------------------------------------------------------------
// D1 — RENDERIZAÇÃO DA 1ª MENSAGEM CITANDO A FATURA.
// Critério: a mensagem NÃO é genérica — cita valor, vencimento e referência da
// fatura. Formata BRL e data BR sem `new Date(iso)` cru (evita TZ-shift; molde
// da lição feedback_iso_date_format_br: fatiar a string ISO).
// ---------------------------------------------------------------------------
export function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' por regex direto (sem Date(), sem shift de fuso).
export function formatDateBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export interface InvoiceForMessage {
  referencia: string;
  valor_total: number;
  vencimento: string; // YYYY-MM-DD
  c6_linha_digitavel?: string | null;
  c6_pix_copia_cola?: string | null;
}

// Objetivo/contexto do 1º passo, CITANDO a fatura — insumo p/ o executor de
// mensagem (agente IA) render a copy final. Garante que a régua nunca começa
// genérica: nome do pagador + valor + vencimento + referência entram no prompt.
export function renderFirstMessageContext(
  payerName: string | null | undefined,
  inv: InvoiceForMessage,
  step: BillingStep = BILLING_CADENCE_STEPS[0],
): string {
  const nome = (payerName || "cliente").trim().split(/\s+/)[0];
  const linhas = [
    `[Régua de cobrança — passo ${step.step_key}]`,
    `Objetivo: ${step.objective}`,
    `Pagador: ${nome}`,
    `Fatura: ${inv.referencia}`,
    `Valor: ${formatBRL(inv.valor_total)}`,
    `Vencimento: ${formatDateBR(inv.vencimento)}`,
    inv.c6_pix_copia_cola ? `PIX copia-e-cola disponível.` : "",
    inv.c6_linha_digitavel ? `Boleto (linha digitável) disponível.` : "",
    `Cite valor, vencimento e forma de pagamento — NÃO envie mensagem genérica.`,
  ].filter(Boolean);
  return linhas.join("\n");
}
