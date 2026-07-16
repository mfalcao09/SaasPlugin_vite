// ─── Adapter cliente(sumido) → OpportunityCardData (Esteira E1.9) ───────────
// Espelho de `toOpportunityCard` (cockpit/types.ts) para a fonte da esteira: os
// itens que a edge `demo-evolution` action `report` devolve (nome + telefone +
// dealValue=ticket + "Sumiu há N dias"). Reusa o MESMO card da Home de Valor
// (OpportunityCard seed+CTA), sem fabricar dado: se o item não tem nome real, o
// card não é renderizado (a integridade do AHA é sagrada — ver §4 do blueprint:
// NUNCA seedOpportunities fake na tela do dinheiro).

import type { OpportunityCardData, OpportunityClass } from '@/cockpit/types';
import type { DemoReportItem } from './demoApi';

/** "Sumiu há 90 dias" → 90 (para classificar a temperatura). */
function parseDias(reason: string): number {
  const m = reason.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// Sumido é sempre "recuperável" no framing da esteira. A temperatura é só
// cosmética (tag do card): quem sumiu há menos tempo tende a voltar mais fácil.
function classify(dias: number): OpportunityClass {
  if (dias <= 75) return 'warm';
  return 'cold';
}

/** Mapeia UM item do report → dados que o OpportunityCard precisa. */
export function reportItemToCard(item: DemoReportItem, index: number): OpportunityCardData {
  const dias = parseDias(item.reason);
  return {
    id: item.phone ? `demo-${item.phone}` : `demo-idx-${index}`,
    leadId: null,
    name: item.name || 'Cliente',
    phone: item.phone,
    classification: classify(dias),
    dealValue: item.dealValue,
    // Sem LLM na demo (custo/escala — D8 do blueprint): mensagem personalizada
    // só no pós-venda. Aqui o card mostra só o FATO (nome + "sumiu há N dias").
    followupMessage: null,
    reason: item.reason,
  };
}

/** Só cards com nome real (integridade do AHA). */
export function reportItemsToCards(items: DemoReportItem[]): OpportunityCardData[] {
  return items
    .filter((it) => (it.name?.trim().length ?? 0) > 0)
    .map(reportItemToCard);
}
