// _shared/billing-baixa.ts
//
// BAIXA MANUAL de fatura (NexvyPayments) — Entregável E1 / spec §3.2.
//
// Problema: nem toda liquidação chega por webhook do C6 (PIX/boleto). O gestor
// concilia o extrato bancário e dá baixa MANUAL numa fatura ("recebi por
// transferência / dinheiro / outro meio"). Isso precisa:
//   1) mudar `invoices.status -> 'paga'` (respeitando o trigger de imutabilidade
//      fiscal C3: só campos de baixa — status/pago_em/valor_pago/updated_at — são
//      tocados; NENHUM dado fiscal muda; 'paga' é destino permitido a partir de
//      'emitida'/'enviada'/'vencida'; ver 20260706103000_fiscal_imutabilidade.sql:66,154).
//   2) gravar a TRILHA append-only em `billing_events(tipo='paga', origem='manual')`
//      com o meio/observação/operador no payload (migration billing_model.sql:414-430).
//
// DOIS CAMINHOS (mesma semântica, para os dois consumidores):
//   * PRODUÇÃO server-side: a Edge `billing-baixa-manual` chama a RPC
//     `invoice_baixa_manual(...)` (migration 20260706104500_baixa_manual.sql), que
//     é SECURITY DEFINER + org-scope + atômica e passa pelo trigger C3. Preferir
//     SEMPRE a RPC em produção (transacional; o update e o evento numa unidade só).
//   * FALLBACK PostgREST (quando a RPC não está disponível/no mock de teste): a
//     função `darBaixaManual` abaixo faz o update + insert via client. NÃO é
//     transacional (o service-role client não abre BEGIN/COMMIT via PostgREST),
//     por isso a ORDEM é: grava o evento-trilha DEPOIS do update de status ter
//     sucesso — se o update falhar, nada de evento fantasma; se o insert do
//     evento falhar após o update, devolvemos erro parcial explícito (nunca
//     engolimos: a baixa aconteceu, mas a trilha não — o gestor precisa saber).
//
// Molde: segunda_via.ts (update+insert via builder, org-scoped, falha segura) e
// o schema/trigger de invoices. O `origem:'manual'` é o critério binário do E1.
//
// Injeção de dependência: recebe o client Supabase por parâmetro -> a suíte de
// testes injeta um mock e roda 100% offline (zero rede).

export type MeioPagamentoManual =
  | 'pix'
  | 'transferencia'
  | 'dinheiro'
  | 'boleto'
  | 'cartao'
  | 'outro';

// Estados a partir dos quais a baixa é permitida. Espelha o conjunto que o
// trigger C3 aceita transicionar para 'paga' sem tocar dado fiscal
// (fiscal_imutabilidade.sql:154 permite 'emitida'/'enviada'/'vencida' -> 'paga').
export const BAIXAVEL_DE: ReadonlySet<string> = new Set([
  'emitida',
  'enviada',
  'vencida',
]);

export interface BaixaManualInput {
  invoiceId: string;
  /** Valor efetivamente recebido. Default: valor_total da fatura. */
  valorPago?: number;
  /** Meio pelo qual o pagamento chegou (só rótulo/trilha). Default 'outro'. */
  meio?: MeioPagamentoManual;
  /** Observação livre do operador (ex.: id da transação bancária). */
  observacao?: string;
  /** Momento do pagamento (ISO). Default: agora. */
  pagoEm?: string;
  /** Quem deu a baixa (user id do operador). Vai para a trilha. */
  operadorId?: string | null;
}

export interface BaixaManualResult {
  success: boolean;
  error?: string;
  data?: {
    invoice_id: string;
    status: 'paga';
    valor_pago: number;
    pago_em: string;
    event_id: string | null;
  };
}

/**
 * Dá baixa manual numa fatura via client Supabase (caminho PostgREST/fallback e
 * testável). SEMPRE org-scoped (anti-IDOR). Grava `billing_events(tipo='paga',
 * origem='manual')` — o critério binário do E1.
 *
 * @param supabase  client (service_role em produção; mock nos testes).
 * @param organizationId  org REAL do caller (nunca do body — resolvido por require-caller-org).
 * @param input  dados da baixa.
 */
export async function darBaixaManual(
  supabase: any,
  organizationId: string,
  input: BaixaManualInput,
): Promise<BaixaManualResult> {
  if (!organizationId) {
    return { success: false, error: 'organizationId obrigatório' };
  }
  if (!input?.invoiceId) {
    return { success: false, error: 'invoice_id obrigatório' };
  }

  // 1) Carrega a fatura, org-scoped (anti-IDOR: nunca cruza tenant).
  const { data: inv, error: fErr } = await supabase
    .from('invoices')
    .select('id, status, valor_total, valor_pago, pago_em')
    .eq('organization_id', organizationId)
    .eq('id', input.invoiceId)
    .maybeSingle();

  if (fErr) return { success: false, error: fErr.message };
  if (!inv) return { success: false, error: 'Fatura não encontrada para esta organização.' };

  // Idempotência de estado: já paga -> no-op (não regrava evento nem dá erro).
  if (inv.status === 'paga') {
    return {
      success: true,
      data: {
        invoice_id: inv.id,
        status: 'paga',
        valor_pago: Number(inv.valor_pago ?? inv.valor_total),
        pago_em: inv.pago_em ?? new Date().toISOString(),
        event_id: null,
      },
    };
  }

  // Estados não-baixáveis: rascunho/aprovada/emitindo (pré-fiscal, ainda não é
  // cobrança viva) e cancelada/substituida (terminais). O trigger C3 barraria a
  // transição de qualquer forma; aqui damos a mensagem de negócio clara ANTES.
  if (!BAIXAVEL_DE.has(inv.status)) {
    return {
      success: false,
      error:
        `Fatura em status '${inv.status}' não pode receber baixa manual. ` +
        `Só faturas emitidas/enviadas/vencidas são baixáveis.`,
    };
  }

  const pagoEm = input.pagoEm ?? new Date().toISOString();
  const valorPago =
    input.valorPago != null ? Number(input.valorPago) : Number(inv.valor_total);
  const meio: MeioPagamentoManual = input.meio ?? 'outro';

  // 2) Transição status -> 'paga'. SÓ campos de baixa (o trigger C3 permite —
  // nenhum dado fiscal é tocado). Reescopo por org no UPDATE (defesa em prof.).
  const { error: uErr } = await supabase
    .from('invoices')
    .update({
      status: 'paga',
      valor_pago: valorPago,
      pago_em: pagoEm,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('id', inv.id);

  if (uErr) {
    return { success: false, error: `Falha ao dar baixa: ${uErr.message}` };
  }

  // 3) Trilha append-only: billing_events(tipo='paga', origem='manual'). Este é
  // o critério binário do E1. Feito DEPOIS do update ter sucesso (nunca evento
  // fantasma). Falha aqui é reportada explicitamente (baixa ok, trilha não).
  const { data: evt, error: eErr } = await supabase
    .from('billing_events')
    .insert({
      organization_id: organizationId,
      invoice_id: inv.id,
      tipo: 'paga',
      origem: 'manual',
      payload: {
        meio,
        valor_pago: valorPago,
        pago_em: pagoEm,
        observacao: input.observacao ?? null,
        operador_id: input.operadorId ?? null,
        baixa: 'manual',
      },
    })
    .select('id')
    .single();

  if (eErr) {
    return {
      success: false,
      error:
        `Baixa aplicada na fatura ${inv.id}, mas falhou ao gravar a trilha: ${eErr.message}. ` +
        `Registre o evento manualmente para manter a auditoria consistente.`,
      data: {
        invoice_id: inv.id,
        status: 'paga',
        valor_pago: valorPago,
        pago_em: pagoEm,
        event_id: null,
      },
    };
  }

  return {
    success: true,
    data: {
      invoice_id: inv.id,
      status: 'paga',
      valor_pago: valorPago,
      pago_em: pagoEm,
      event_id: evt.id,
    },
  };
}
