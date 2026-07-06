// consultar_fatura — tool de cobrança (D5). Consulta a fatura em aberto/mais
// recente de um pagador e devolve valor, vencimento, encargos e meios de
// pagamento (linha digitável / PIX copia-e-cola), para o agente responder ao
// devedor. READ-ONLY: nunca muta nada.
//
// Molde: impl/consultar_historico_cliente.ts (read-only + filtro org) e o
// contrato ToolDefinition de types.ts:24-34. Anti-IDOR: TODA query é filtrada
// por organization_id = ctx.organizationId (padrão require-caller-org.ts).
// O campo livre `pergunta` (quando presente) passa pelo prompt-guard antes de
// qualquer uso — Seção 11.3.
import type { ToolDefinition } from '../types.ts';
import { guardPromptInput } from '../../prompt-guard.ts';

export const consultarFaturaTool: ToolDefinition = {
  name: 'consultar_fatura',
  description:
    'Consulta a fatura de cobrança de um pagador (por payer_id) OU uma fatura específica (por invoice_id). Retorna valor, vencimento, status, encargos de atraso e meios de pagamento (linha digitável/PIX). Use quando o devedor perguntar "quanto devo", "qual meu boleto", "quando vence".',
  categories: ['finance'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      invoice_id: {
        type: 'string',
        description: 'UUID de uma fatura específica. Se omitido, usa payer_id para achar a fatura em aberto mais próxima do vencimento.',
      },
      payer_id: {
        type: 'string',
        description: 'UUID do pagador. Usado quando invoice_id não é informado.',
      },
      pergunta: {
        type: 'string',
        description: 'Pergunta em linguagem natural do devedor (opcional). Apenas para contexto; passa por filtro de segurança.',
      },
    },
    required: [],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.organizationId) {
      return { success: false, error: 'organizationId obrigatório no contexto' };
    }

    // Shield de injeção sobre o texto livre (Seção 11.3).
    if (typeof input.pergunta === 'string' && input.pergunta.length > 0) {
      const guard = await guardPromptInput(input.pergunta, { context: 'tool:consultar_fatura' });
      if (!guard.ok) {
        return {
          success: false,
          error: `Entrada bloqueada pelo shield de segurança (${guard.reason}${guard.category ? ':' + guard.category : ''}).`,
          data: { blocked: true, reason: guard.reason, correlation: guard.correlationHash.slice(0, 16) },
        };
      }
    }

    if (!input.invoice_id && !input.payer_id) {
      return { success: false, error: 'Informe invoice_id ou payer_id.' };
    }

    // Anti-IDOR: sempre org-scoped. Se invoice_id vier, exige que seja da org.
    let query = ctx.supabase
      .from('invoices')
      .select(
        'id, competencia, referencia, valor_original, valor_multa, valor_juros, valor_total, ' +
          'vencimento, status, c6_linha_digitavel, c6_pix_copia_cola, pdf_boleto_url, payer_id',
      )
      .eq('organization_id', ctx.organizationId);

    if (input.invoice_id) {
      query = query.eq('id', input.invoice_id).limit(1);
    } else {
      // Fatura ainda cobrável mais próxima do vencimento.
      query = query
        .eq('payer_id', input.payer_id)
        .not('status', 'in', '(paga,cancelada,substituida)')
        .order('vencimento', { ascending: true })
        .limit(1);
    }

    const { data: rows, error } = await query;
    if (error) return { success: false, error: error.message };

    const invoice = rows?.[0];
    if (!invoice) {
      return {
        success: true,
        data: { found: false },
        user_message: 'Não encontrei nenhuma fatura em aberto para este cadastro.',
      };
    }

    const venc = new Date(invoice.vencimento);
    const hoje = new Date();
    const vencida = invoice.status === 'vencida' || (venc < hoje && invoice.status !== 'paga');

    return {
      success: true,
      data: {
        found: true,
        invoice_id: invoice.id,
        competencia: invoice.competencia,
        status: invoice.status,
        vencida,
        valor_original: Number(invoice.valor_original),
        valor_multa: Number(invoice.valor_multa),
        valor_juros: Number(invoice.valor_juros),
        valor_total: Number(invoice.valor_total),
        vencimento: invoice.vencimento,
        linha_digitavel: invoice.c6_linha_digitavel ?? null,
        pix_copia_cola: invoice.c6_pix_copia_cola ?? null,
        boleto_url: invoice.pdf_boleto_url ?? null,
      },
      user_message:
        `Fatura ${invoice.competencia}: R$ ${Number(invoice.valor_total).toFixed(2)} ` +
        `(vence ${invoice.vencimento})${vencida ? ' — está vencida' : ''}.`,
    };
  },
};
