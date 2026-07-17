// approved-gate.ts — RECHECK de aprovação no MOMENTO do envio (defense-in-depth).
//
// O portão de ENQUEUE (actionEnqueue) já filtra `approved_at IS NOT NULL`, então
// a fila só deveria conter leads aprovados. Mas o gate de enqueue NÃO cobre uma
// linha de fila que:
//   (a) predata o gate (enfileirada antes do portão existir), ou
//   (b) foi enfileirada aprovada e depois o lead foi DES-aprovado (approved_at→NULL), ou
//   (c) segue disparando follow-ups (D+2/breakup) após o status='sent'.
// Este módulo é a ÚLTIMA barreira: no SEND, reverifica `approved_at` do lead
// (via extracted_lead_id) e, sem aprovação, NÃO envia — marca a linha como pulada.
//
// PURO (sem I/O): a leitura do approved_at e a marcação da fila são feitas pelo
// chamador (index.ts). Este módulo só DECIDE — mesmo padrão de inbound-plan.ts.
//   deno test --no-check supabase/functions/_shared/cold-outreach/approved-gate.test.ts

/** Motivo canônico gravado em skip_reason quando a barreira de SEND barra a linha. */
export const UNAPPROVED_SKIP_REASON = "lead_unapproved_at_send";

/** approved_at do lead no instante do disparo → ainda pode receber envio?
 * Fail-safe: null/undefined/"" (em tratamento ou des-aprovado) => NÃO envia. */
export function isApprovedForSend(approvedAt: string | null | undefined): boolean {
  return approvedAt != null && String(approvedAt).trim() !== "";
}

/** Linha de fila mínima que a barreira precisa reverificar. */
export interface QueueSendRef {
  extracted_lead_id?: string | null;
}

/** Dado o conjunto de `extracted_lead_id` ainda APROVADOS (approved_at != null),
 * particiona as linhas de fila em enviáveis vs a pular NO SEND.
 * Fail-safe: linha sem extracted_lead_id não é reverificável => vai pra `skip`. */
export function partitionByApproval<T extends QueueSendRef>(
  rows: T[],
  approvedLeadIds: Set<string>,
): { sendable: T[]; skip: T[] } {
  const sendable: T[] = [];
  const skip: T[] = [];
  for (const r of rows) {
    const id = r.extracted_lead_id;
    if (id && approvedLeadIds.has(id)) sendable.push(r);
    else skip.push(r);
  }
  return { sendable, skip };
}
