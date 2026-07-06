// renegociar — tool de cobrança (D5). Critérios §3.2(b)+(c):
//   (b) Renegocia a dívida de UMA fatura: cria 1 `billing_agreements` + N
//       faturas-parcela (`invoices` com `agreement_id` apontando de volta) e
//       marca a fatura original como 'substituida'.
//   (c) Se o desconto_pct pedido EXCEDE a alçada da IA (default 20%), NÃO
//       materializa nada: retorna handoff=true com 0 parcelas → o orquestrador
//       escala p/ humano.
//
// Alçada: a IA concede até `MAX_DESCONTO_ALCADA_PCT` sozinha. Acima é decisão
// humana (política de recebíveis). O handoff é sinalizado no retorno (o caller
// emite a tag [HANDOFF:financial]).
//
// O campo livre `observacao` passa pelo prompt-guard (Seção 11.3) ANTES de ser
// gravado. Anti-IDOR: tudo org-scoped. Ordem de escrita segura: acordo →
// parcelas → substitui original (a original só é substituída por último, então
// nunca há dois títulos cobráveis se algo falhar no meio).
//
// Molde: criar_deal.ts (insert+select single) + schema billing_agreements
// (204-220) e invoices (271-317).
import type { ToolDefinition, ToolResult } from '../types.ts';
import { guardPromptInput } from '../../prompt-guard.ts';

// Teto de desconto que a IA concede sozinha. Acima → handoff humano.
export const MAX_DESCONTO_ALCADA_PCT = 20;

function hojeUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// Vencimento da parcela `i` (0-based): +(i+1) meses a partir de hoje, no dia
// `diaVenc` (1-28, já validado). Constrói via UTC ano/mês/dia — sem overflow de
// dia porque diaVenc<=28 existe em todo mês.
function vencimentoParcela(i: number, diaVenc: number): string {
  const base = hojeUTC();
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i + 1, diaVenc));
  return d.toISOString().slice(0, 10);
}

export const renegociarTool: ToolDefinition = {
  name: 'renegociar',
  description:
    'Renegocia a dívida de um devedor: aplica desconto (dentro da alçada), define entrada e parcela o saldo em N vezes, criando um acordo e as faturas-parcela. Substitui a fatura original. Se o desconto pedido exceder a alçada, encaminha para um humano decidir.',
  categories: ['finance'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      invoice_id: {
        type: 'string',
        description: 'UUID da fatura em atraso a renegociar. Obrigatório.',
      },
      desconto_pct: {
        type: 'number',
        description: 'Percentual de desconto sobre o valor da dívida (0 a 100). Acima da alçada da IA → handoff humano.',
      },
      entrada: {
        type: 'number',
        description: 'Valor de entrada em reais (opcional, default 0).',
      },
      num_parcelas: {
        type: 'number',
        description: 'Em quantas parcelas dividir o saldo (>=1). Default 1.',
      },
      dia_vencimento: {
        type: 'number',
        description: 'Dia do mês para o vencimento das parcelas (1-28). Default: dia de hoje limitado a 28.',
      },
      observacao: {
        type: 'string',
        description: 'Observação livre sobre o acordo (opcional). Passa por filtro de segurança.',
      },
    },
    required: ['invoice_id'],
    additionalProperties: false,
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    if (!ctx.organizationId) {
      return { success: false, error: 'organizationId obrigatório no contexto' };
    }

    // Shield sobre a observação livre (Seção 11.3).
    let obsSegura: string | null = null;
    if (typeof input.observacao === 'string' && input.observacao.length > 0) {
      const guard = await guardPromptInput(input.observacao, { context: 'tool:renegociar' });
      if (!guard.ok) {
        return {
          success: false,
          error: `Observação bloqueada pelo shield de segurança (${guard.reason}${guard.category ? ':' + guard.category : ''}).`,
          data: { blocked: true, reason: guard.reason, correlation: guard.correlationHash.slice(0, 16) },
        };
      }
      obsSegura = input.observacao;
    }

    const descontoPct = Number(input.desconto_pct ?? 0);
    if (Number.isNaN(descontoPct) || descontoPct < 0 || descontoPct > 100) {
      return { success: false, error: 'desconto_pct deve estar entre 0 e 100.' };
    }
    const numParcelas = Math.max(1, Math.floor(Number(input.num_parcelas ?? 1)));
    const entrada = Math.max(0, Number(input.entrada ?? 0));

    // 1) Original org-scoped.
    const { data: orig, error: oErr } = await ctx.supabase
      .from('invoices')
      .select('id, contract_id, payer_id, competencia, referencia, valor_total, valor_original, status, metadata')
      .eq('organization_id', ctx.organizationId)
      .eq('id', input.invoice_id)
      .maybeSingle();

    if (oErr) return { success: false, error: oErr.message };
    if (!orig) return { success: false, error: 'Fatura não encontrada para esta organização.' };
    if (orig.status === 'paga') {
      return { success: false, error: 'Fatura já está paga — não há o que renegociar.' };
    }
    if (orig.status === 'substituida' || orig.status === 'cancelada') {
      return { success: false, error: 'Esta fatura já foi substituída/cancelada.' };
    }

    const dividaBruta = Number(orig.valor_total);

    // (c) ALÇADA: desconto acima do teto → handoff, ZERO faturas criadas.
    if (descontoPct > MAX_DESCONTO_ALCADA_PCT) {
      return {
        success: true,
        data: {
          handoff: true,
          handoff_target: 'financial',
          reason: 'desconto_acima_alcada',
          desconto_pedido_pct: descontoPct,
          alcada_max_pct: MAX_DESCONTO_ALCADA_PCT,
          faturas_criadas: 0,
          agreement_id: null,
        },
        user_message:
          `Um desconto de ${descontoPct}% está acima da minha alçada (${MAX_DESCONTO_ALCADA_PCT}%). ` +
          'Vou encaminhar seu caso para um responsável avaliar. [HANDOFF:financial]',
      };
    }

    // 2) Cálculo do acordo.
    const valorAcordado = +(dividaBruta * (1 - descontoPct / 100)).toFixed(2);
    if (entrada > valorAcordado) {
      return { success: false, error: 'A entrada não pode ser maior que o valor acordado.' };
    }
    const saldoParcelar = +(valorAcordado - entrada).toFixed(2);
    // Divide em N parcelas; a última absorve o resíduo de arredondamento.
    const parcelaBase = +(saldoParcelar / numParcelas).toFixed(2);
    const parcelas: number[] = Array.from({ length: numParcelas }, (_, i) =>
      i === numParcelas - 1
        ? +(saldoParcelar - parcelaBase * (numParcelas - 1)).toFixed(2)
        : parcelaBase,
    );

    const diaVenc = Math.min(
      28,
      Math.max(1, Math.floor(Number(input.dia_vencimento ?? new Date().getUTCDate()))),
    );

    // 3) Cria o acordo.
    const { data: agreement, error: aErr } = await ctx.supabase
      .from('billing_agreements')
      .insert({
        organization_id: ctx.organizationId,
        payer_id: orig.payer_id,
        descricao: obsSegura ?? `Renegociação da fatura ${orig.competencia}`,
        valor_original: dividaBruta,
        valor_acordado: valorAcordado,
        desconto_pct: descontoPct,
        entrada,
        num_parcelas: numParcelas,
        condicoes: { dia_vencimento: diaVenc, substitui_invoice: orig.id, entrada },
        status: 'proposto',
        metadata: { origem: 'agent-tool:renegociar', agent_id: ctx.agentId ?? null },
      })
      .select('id')
      .single();

    if (aErr) return { success: false, error: `Falha ao criar acordo: ${aErr.message}` };

    // 4) Materializa N faturas-parcela (cada uma com agreement_id).
    const parcelaRows = parcelas.map((valor, i) => ({
      organization_id: ctx.organizationId,
      contract_id: orig.contract_id,
      payer_id: orig.payer_id,
      agreement_id: agreement.id,
      competencia: `${orig.competencia}-ACORDO-P${i + 1}`,
      referencia: `${orig.referencia}-ACORDO-${agreement.id.slice(0, 8)}-P${i + 1}`,
      valor_original: valor,
      multa_pct: 0,
      juros_pct: 0,
      valor_multa: 0,
      valor_juros: 0,
      valor_total: valor,
      vencimento: vencimentoParcela(i, diaVenc),
      status: 'rascunho',
      metadata: { acordo: true, parcela: i + 1, de: numParcelas, agreement_id: agreement.id },
    }));

    const { data: novasParcelas, error: pErr } = await ctx.supabase
      .from('invoices')
      .insert(parcelaRows)
      .select('id, vencimento, valor_total');

    if (pErr) {
      return {
        success: false,
        error: `Acordo ${agreement.id} criado mas falhou ao gerar parcelas: ${pErr.message}.`,
        data: { agreement_id: agreement.id, faturas_criadas: 0 },
      };
    }

    // 5) Substitui a original (por último = falha segura).
    const { error: uErr } = await ctx.supabase
      .from('invoices')
      .update({
        status: 'substituida',
        metadata: { ...(orig.metadata ?? {}), renegociada_em: agreement.id },
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', ctx.organizationId)
      .eq('id', orig.id);

    if (uErr) {
      return {
        success: false,
        error:
          `Acordo e ${novasParcelas.length} parcela(s) criados, mas falhou ao substituir a ` +
          `original: ${uErr.message}. Cancele a original manualmente.`,
        data: {
          agreement_id: agreement.id,
          faturas_criadas: novasParcelas.length,
          original_substituida: false,
        },
      };
    }

    // 6) Trilha.
    await ctx.supabase.from('billing_events').insert({
      organization_id: ctx.organizationId,
      invoice_id: orig.id,
      tipo: 'substituida',
      origem: 'agent-tool',
      payload: { motivo: 'renegociacao', agreement_id: agreement.id, parcelas: novasParcelas.length },
    });

    const maiorParcela = parcelas.length ? Math.max(...parcelas) : 0;
    return {
      success: true,
      data: {
        handoff: false,
        agreement_id: agreement.id,
        valor_acordado: valorAcordado,
        entrada,
        faturas_criadas: novasParcelas.length,
        parcelas: novasParcelas.map((p: any) => ({
          invoice_id: p.id,
          vencimento: p.vencimento,
          valor: Number(p.valor_total),
        })),
        original_substituida: true,
      },
      user_message:
        `Fechado! Renegociei sua dívida com ${descontoPct}% de desconto: ` +
        `${numParcelas}x de até R$ ${maiorParcela.toFixed(2)}` +
        `${entrada > 0 ? ` + entrada de R$ ${entrada.toFixed(2)}` : ''}. As parcelas já estão geradas.`,
    };
  },
};
