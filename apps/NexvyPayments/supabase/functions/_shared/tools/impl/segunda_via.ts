// segunda_via — tool de cobrança (D5). Critério §3.2(a): 2ª via de boleto
// VENCIDO NÃO é reimpressão do mesmo título — é uma NOVA emissão. Fluxo:
//   1) Valida a fatura original (org-scoped, anti-IDOR).
//   2) Cria uma NOVA `invoices` (nova `competencia` sufixada + nova `referencia`
//      — a chave de idempotência de emissão externa, migration linha 316), com
//      novo vencimento e encargos recalculados se aplicável. `c6_*`/`referencia`
//      novos = "novo nosso_numero" no trilho boleto (será registrado no C6 pelo
//      dispatch-worker). status='rascunho' (entra na máquina de estados §5).
//   3) Marca a ORIGINAL como 'substituida' (estado terminal fiscal) e liga as
//      duas via metadata (substituida_por / substitui).
//   4) Enfileira billing_events('substituida') para a trilha/worker.
//
// As duas gravações NÃO são uma transação SQL aqui (service-role client não
// abre BEGIN/COMMIT via PostgREST); a ordem é: cria a nova PRIMEIRO, e só então
// substitui a antiga — se o insert falhar, a original permanece cobrável (falha
// segura, nunca deixa o devedor sem título válido). O UNIQUE(org,referencia)
// garante idempotência: reexecutar com a mesma nova referência bate no conflito.
//
// Molde: criar_deal.ts (insert + select single) e o schema invoices (271-317).
import type { ToolDefinition, ToolResult } from '../types.ts';

// dias corridos de atraso entre vencimento e hoje (>=0).
function diasAtraso(vencISO: string): number {
  const venc = new Date(vencISO + 'T00:00:00Z').getTime();
  const hoje = Date.now();
  return Math.max(0, Math.floor((hoje - venc) / 86400000));
}

// Novo vencimento: N dias a partir de hoje (default 3), em 'YYYY-MM-DD' (UTC).
function novoVencimento(dias = 3): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const segundaViaTool: ToolDefinition = {
  name: 'segunda_via',
  description:
    'Emite a SEGUNDA VIA de uma fatura vencida. Gera uma NOVA cobrança (novo boleto/PIX, novo vencimento, com multa/juros já aplicados) e substitui a fatura original. Use quando o devedor pedir "novo boleto", "atualiza o vencimento", "boleto vencido".',
  categories: ['finance'],
  estimated_cost_cents: 0,
  parameters: {
    type: 'object',
    properties: {
      invoice_id: {
        type: 'string',
        description: 'UUID da fatura vencida para a qual gerar a 2ª via. Obrigatório.',
      },
      dias_para_vencer: {
        type: 'number',
        description: 'Quantos dias até o novo vencimento (default 3).',
      },
    },
    required: ['invoice_id'],
    additionalProperties: false,
  },
  handler: async (input, ctx): Promise<ToolResult> => {
    if (!ctx.organizationId) {
      return { success: false, error: 'organizationId obrigatório no contexto' };
    }

    // 1) Original, org-scoped.
    const { data: orig, error: oErr } = await ctx.supabase
      .from('invoices')
      .select(
        'id, contract_id, payer_id, competencia, referencia, valor_original, ' +
          'multa_pct, juros_pct, vencimento, status, iss_retido, retencoes, metadata',
      )
      .eq('organization_id', ctx.organizationId)
      .eq('id', input.invoice_id)
      .maybeSingle();

    if (oErr) return { success: false, error: oErr.message };
    if (!orig) return { success: false, error: 'Fatura não encontrada para esta organização.' };

    if (orig.status === 'paga') {
      return { success: false, error: 'Fatura já está paga — não há 2ª via a emitir.' };
    }
    if (orig.status === 'substituida' || orig.status === 'cancelada') {
      return {
        success: false,
        error: 'Esta fatura já foi substituída/cancelada. Consulte a via vigente.',
      };
    }

    // 2) Recalcula encargos sobre o valor_original (multa fixa + juros pró-dia).
    const dias = diasAtraso(orig.vencimento);
    const valorOriginal = Number(orig.valor_original);
    const multaPct = Number(orig.multa_pct ?? 0);
    const jurosPct = Number(orig.juros_pct ?? 0); // % ao mês (convenção do modelo)
    const valorMulta = dias > 0 ? +(valorOriginal * (multaPct / 100)).toFixed(2) : 0;
    const valorJuros = dias > 0 ? +(valorOriginal * (jurosPct / 100) * (dias / 30)).toFixed(2) : 0;
    const valorTotal = +(valorOriginal + valorMulta + valorJuros).toFixed(2);

    const novaCompetencia = `${orig.competencia}-2VIA`;
    // Nova referência de idempotência: determinística por original (reexecução
    // segura → bate no UNIQUE(org,referencia) em vez de duplicar).
    const novaReferencia = `${orig.referencia}-2VIA`;
    const venc = novoVencimento(input.dias_para_vencer ?? 3);

    const { data: nova, error: nErr } = await ctx.supabase
      .from('invoices')
      .insert({
        organization_id: ctx.organizationId,
        contract_id: orig.contract_id,
        payer_id: orig.payer_id,
        competencia: novaCompetencia,
        referencia: novaReferencia,
        valor_original: valorOriginal,
        multa_pct: multaPct,
        juros_pct: jurosPct,
        valor_multa: valorMulta,
        valor_juros: valorJuros,
        valor_total: valorTotal,
        vencimento: venc,
        status: 'rascunho',
        iss_retido: orig.iss_retido ?? false,
        retencoes: orig.retencoes ?? {},
        metadata: {
          ...(orig.metadata ?? {}),
          segunda_via: true,
          substitui: orig.id,
          origem: 'agent-tool:segunda_via',
          dias_atraso_na_emissao: dias,
        },
      })
      .select('id, referencia, valor_total, vencimento')
      .single();

    if (nErr) return { success: false, error: `Falha ao emitir 2ª via: ${nErr.message}` };

    // 3) Marca a original como 'substituida' (falha segura: a nova já existe).
    const { error: uErr } = await ctx.supabase
      .from('invoices')
      .update({
        status: 'substituida',
        metadata: { ...(orig.metadata ?? {}), substituida_por: nova.id },
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', ctx.organizationId)
      .eq('id', orig.id);

    if (uErr) {
      return {
        success: false,
        error:
          `2ª via criada (${nova.id}) mas falhou ao substituir a original: ${uErr.message}. ` +
          'Cancele a original manualmente para evitar cobrança dupla.',
        data: { nova_invoice_id: nova.id, original_id: orig.id, original_substituida: false },
      };
    }

    // 4) Trilha/fila.
    await ctx.supabase.from('billing_events').insert({
      organization_id: ctx.organizationId,
      invoice_id: nova.id,
      tipo: 'substituida',
      origem: 'agent-tool',
      payload: { motivo: 'segunda_via', substitui: orig.id, agent_id: ctx.agentId ?? null },
    });

    return {
      success: true,
      data: {
        nova_invoice_id: nova.id,
        nova_referencia: nova.referencia,
        original_id: orig.id,
        original_substituida: true,
        valor_total: Number(nova.valor_total),
        vencimento: nova.vencimento,
        valor_multa: valorMulta,
        valor_juros: valorJuros,
      },
      user_message:
        `Gerei um novo boleto no valor de R$ ${Number(nova.valor_total).toFixed(2)} ` +
        `com vencimento em ${nova.vencimento}. A cobrança anterior foi substituída.`,
    };
  },
};
