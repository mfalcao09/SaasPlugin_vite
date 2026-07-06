// enviar_comprovante — tool de cobrança (D5). O devedor pede "me manda o
// boleto/PIX de novo" ou "comprovante da cobrança". A tool NÃO envia mensagem
// diretamente (isso é papel do dispatch-worker/régua): ela valida a fatura e
// ENFILEIRA um evento em billing_events (fila leve = tabela+claim, blueprint §7,
// migration linhas 400-430) para o worker reenviar os meios de pagamento pelo
// canal do lead. Devolve os dados para o agente confirmar ao devedor.
//
// Molde: gerar_link_pagamento.ts (busca + monta retorno) + o insert append-only
// segue billing_events (sem updated_at). Anti-IDOR: org-scoped em toda query.
import type { ToolDefinition } from '../types.ts';

export const enviarComprovanteTool: ToolDefinition = {
  name: 'enviar_comprovante',
  description:
    'Reenvia ao devedor os meios de pagamento de uma fatura (linha digitável do boleto, PIX copia-e-cola e link do PDF). Use quando o devedor disser que perdeu o boleto ou pedir o comprovante/cobrança novamente. Enfileira o reenvio pelo canal ativo.',
  categories: ['finance', 'communication'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      invoice_id: {
        type: 'string',
        description: 'UUID da fatura cujos meios de pagamento devem ser reenviados. Obrigatório.',
      },
      canal: {
        type: 'string',
        enum: ['whatsapp', 'email', 'sms'],
        description: 'Canal de reenvio preferido (opcional). Se omitido, usa o canal da conversa atual.',
      },
    },
    required: ['invoice_id'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.organizationId) {
      return { success: false, error: 'organizationId obrigatório no contexto' };
    }

    // Anti-IDOR: a fatura precisa ser da org do caller.
    const { data: invoice, error: fErr } = await ctx.supabase
      .from('invoices')
      .select('id, competencia, valor_total, vencimento, status, c6_linha_digitavel, c6_pix_copia_cola, pdf_boleto_url')
      .eq('organization_id', ctx.organizationId)
      .eq('id', input.invoice_id)
      .maybeSingle();

    if (fErr) return { success: false, error: fErr.message };
    if (!invoice) return { success: false, error: 'Fatura não encontrada para esta organização.' };

    if (invoice.status === 'paga') {
      return {
        success: false,
        error: 'Esta fatura já está paga — não há comprovante de cobrança a reenviar.',
      };
    }
    if (invoice.status === 'cancelada' || invoice.status === 'substituida') {
      return {
        success: false,
        error: 'Esta fatura foi cancelada/substituída. Emita a via atual antes de reenviar.',
      };
    }

    const semMeios =
      !invoice.c6_linha_digitavel && !invoice.c6_pix_copia_cola && !invoice.pdf_boleto_url;
    if (semMeios) {
      return {
        success: false,
        error: 'A fatura ainda não tem boleto/PIX emitido. Emita a cobrança antes de reenviar.',
      };
    }

    const canal = input.canal ?? ctx.channel ?? 'whatsapp';

    // Enfileira o reenvio (append-only; o dispatch-worker faz o claim).
    const { data: evt, error: eErr } = await ctx.supabase
      .from('billing_events')
      .insert({
        organization_id: ctx.organizationId,
        invoice_id: invoice.id,
        tipo: 'comprovante_reenviado',
        origem: 'agent-tool',
        payload: {
          canal,
          lead_id: ctx.leadId ?? null,
          conversation_id: ctx.conversationId ?? null,
          agent_id: ctx.agentId ?? null,
          linha_digitavel: invoice.c6_linha_digitavel ?? null,
          pix_copia_cola: invoice.c6_pix_copia_cola ?? null,
          boleto_url: invoice.pdf_boleto_url ?? null,
        },
      })
      .select('id')
      .single();

    if (eErr) return { success: false, error: eErr.message };

    return {
      success: true,
      data: {
        event_id: evt.id,
        invoice_id: invoice.id,
        canal,
        linha_digitavel: invoice.c6_linha_digitavel ?? null,
        pix_copia_cola: invoice.c6_pix_copia_cola ?? null,
        boleto_url: invoice.pdf_boleto_url ?? null,
      },
      user_message:
        `Prontinho! Vou te reenviar a cobrança da fatura ${invoice.competencia} ` +
        `(R$ ${Number(invoice.valor_total).toFixed(2)}) por ${canal}.`,
    };
  },
};
